package com.lovesite;

import com.lovesite.space.V7__InitialSpace;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The migration that introduces spaces, run against a database that looks like production before tenancy: two users,
 * albums and media with the old "albums/..." storage keys.
 */
class SpaceMigrationTest {

    static int counter = 0;

    static DriverManagerDataSource freshDatabase() {
        String name = "migration_" + System.nanoTime() + "_" + (counter++);
        var admin = new DriverManagerDataSource(TestInfrastructure.POSTGRES.getJdbcUrl(), TestInfrastructure.POSTGRES.getUsername(),
                TestInfrastructure.POSTGRES.getPassword());
        new JdbcTemplate(admin).execute("CREATE DATABASE " + name);
        String url = "jdbc:postgresql://" + TestInfrastructure.POSTGRES.getHost() + ":" + TestInfrastructure.POSTGRES.getMappedPort(5432) + "/" + name;
        return new DriverManagerDataSource(url, TestInfrastructure.POSTGRES.getUsername(), TestInfrastructure.POSTGRES.getPassword());
    }

    static Flyway flyway(DriverManagerDataSource ds, String target, MockEnvironment env) {
        var config = Flyway.configure().dataSource(ds).locations("classpath:db/migration");
        if (target != null) config.target(MigrationVersion.fromVersion(target));
        if (env != null) config.javaMigrations(new V7__InitialSpace(env));
        return config.load();
    }

    /** users, albums and media exactly as the old layout stored them */
    record Legacy(UUID user1, UUID user2, UUID albumId, UUID mediaId, UUID softDeletedMediaId) {
    }

    static Legacy seedLegacyData(JdbcTemplate jdbc) {
        UUID u1 = UUID.randomUUID();
        UUID u2 = UUID.randomUUID();
        jdbc.update("INSERT INTO app_user (id, email, display_name, password_hash, created_at) VALUES (?, 'ali@old.io', 'Ali', 'x', now() - interval '2 day')", u1);
        jdbc.update("INSERT INTO app_user (id, email, display_name, password_hash, created_at) VALUES (?, 'ayse@old.io', 'Ayşe', 'x', now() - interval '1 day')", u2);
        UUID album = UUID.randomUUID();
        jdbc.update("INSERT INTO album (id, title, created_by) VALUES (?, 'Tatil', ?)", album, u1);
        UUID media = UUID.randomUUID();
        UUID deleted = UUID.randomUUID();
        for (UUID id : List.of(media, deleted)) {
            jdbc.update("INSERT INTO media (id, album_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes) "
                    + "VALUES (?, ?, ?, 'IMAGE', 'READY', ?, 'a.jpg', 'image/jpeg', 1000)", id, album, u1, "albums/" + album + "/media/" + id + "/original");
        }
        jdbc.update("UPDATE media SET deleted_at = now() WHERE id = ?", deleted);
        return new Legacy(u1, u2, album, media, deleted);
    }

    @Test
    void existingDataMovesIntoOneInitialSpaceWithoutChangingStorageKeys() {
        DriverManagerDataSource ds = freshDatabase();
        flyway(ds, "5", null).migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        Legacy data = seedLegacyData(jdbc);
        String oldKey = jdbc.queryForObject("SELECT original_key FROM media WHERE id = ?", String.class, data.mediaId());

        MockEnvironment env = new MockEnvironment()
                .withProperty("app.space.initial-name", "Ali & Ayşe")
                .withProperty("app.space.initial-limit-gb", "400")
                .withProperty("app.seed.user1.email", "AYSE@old.io") // case-insensitive match; USER1 becomes the owner
                .withProperty("app.seed.user2.email", "ali@old.io")
                .withProperty("app.admin-email", "ali@old.io");
        flyway(ds, null, env).migrate();

        // one space with the configured name and limit
        List<Map<String, Object>> spaces = jdbc.queryForList("SELECT * FROM space");
        assertThat(spaces).hasSize(1);
        UUID space = (UUID) spaces.get(0).get("id");
        assertThat(spaces.get(0).get("name")).isEqualTo("Ali & Ayşe");
        assertThat(spaces.get(0).get("storage_limit_bytes")).isEqualTo(400L * 1024 * 1024 * 1024);

        // USER1 owner, USER2 member
        assertThat(jdbc.queryForObject("SELECT role FROM space_member WHERE user_id = ?", String.class, data.user2())).isEqualTo("OWNER");
        assertThat(jdbc.queryForObject("SELECT role FROM space_member WHERE user_id = ?", String.class, data.user1())).isEqualTo("MEMBER");

        // everything that existed now belongs to that space, deleted rows included
        assertThat(jdbc.queryForObject("SELECT count(*) FROM album WHERE space_id = ?", Integer.class, space)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE space_id = ?", Integer.class, space)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE space_id IS NULL", Integer.class)).isZero();

        // old keys are untouched (the worker and the purge derive everything from the stored key)
        assertThat(jdbc.queryForObject("SELECT original_key FROM media WHERE id = ?", String.class, data.mediaId())).isEqualTo(oldKey);
        assertThat(oldKey).startsWith("albums/");

        // only the configured account is admin
        assertThat(jdbc.queryForObject("SELECT is_admin FROM app_user WHERE id = ?", Boolean.class, data.user1())).isTrue();
        assertThat(jdbc.queryForObject("SELECT is_admin FROM app_user WHERE id = ?", Boolean.class, data.user2())).isFalse();

        // space_id is mandatory from now on
        assertThatThrownBy(() -> jdbc.update("INSERT INTO album (id, title, created_by) VALUES (?, 'x', ?)", UUID.randomUUID(), data.user1()))
                .isInstanceOf(DataIntegrityViolationException.class);
        // a user belongs to one space only
        UUID other = jdbc.queryForObject("INSERT INTO space (name, storage_limit_bytes) VALUES ('Other', 1) RETURNING id", UUID.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", other, data.user1()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void withoutSeedVariablesTheTwoOldestAccountsAreUsed() {
        DriverManagerDataSource ds = freshDatabase();
        flyway(ds, "5", null).migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        Legacy data = seedLegacyData(jdbc);

        flyway(ds, null, new MockEnvironment()).migrate();

        assertThat(jdbc.queryForObject("SELECT role FROM space_member WHERE user_id = ?", String.class, data.user1())).isEqualTo("OWNER");
        assertThat(jdbc.queryForObject("SELECT role FROM space_member WHERE user_id = ?", String.class, data.user2())).isEqualTo("MEMBER");
        assertThat(jdbc.queryForObject("SELECT name FROM space", String.class)).isEqualTo("Bizim Alanımız");
        assertThat(jdbc.queryForObject("SELECT storage_limit_bytes FROM space", Long.class)).isEqualTo(400L * 1024 * 1024 * 1024);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE is_admin", Integer.class)).isZero();
    }

    @Test
    void aFreshInstallCreatesNoSpaceHereAndStillEnforcesTheConstraints() {
        DriverManagerDataSource ds = freshDatabase();

        flyway(ds, null, new MockEnvironment().withProperty("app.admin-email", "someone@new.io")).migrate();

        JdbcTemplate jdbc = new JdbcTemplate(ds);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space", Integer.class)).isZero(); // the startup seeder creates it
        assertThat(jdbc.queryForObject("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'media' AND column_name = 'space_id'", String.class))
                .isEqualTo("NO");
        assertThat(jdbc.queryForObject("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'album' AND column_name = 'space_id'", String.class))
                .isEqualTo("NO");
    }
}
