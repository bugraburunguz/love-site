package com.lovesite;

import com.lovesite.space.FreeSpaceCleanupJob;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** A free space nobody put anything into within 30 days gives its room in the free pool back, accounts included. */
@SpringBootTest
class FreeSpaceCleanupTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired FreeSpaceCleanupJob job;

    record Fixture(UUID space, UUID owner, String email) {
    }

    Fixture space(String kind, int ageDays) {
        String email = "clean-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        UUID space = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, name, storage_limit_bytes, kind, created_at) VALUES (?, 'C', ?, ?, ?)",
                space, 50L * 1024 * 1024, kind, Timestamp.from(Instant.now().minus(ageDays, ChronoUnit.DAYS)));
        UUID owner = TenantFixtures.user(jdbc, email, "C", false);
        TenantFixtures.member(jdbc, space, owner, "OWNER");
        return new Fixture(space, owner, email);
    }

    UUID album(Fixture f) {
        UUID album = UUID.randomUUID();
        jdbc.update("INSERT INTO album (id, title, created_by, space_id) VALUES (?, 'A', ?, ?)", album, f.owner(), f.space());
        return album;
    }

    boolean exists(UUID space) {
        return jdbc.queryForObject("SELECT count(*) FROM space WHERE id = ?", Integer.class, space) > 0;
    }

    int users(String email) {
        return jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, email);
    }

    @Test
    void anOldEmptyFreeSpaceGoesWithItsAccountsAndSessions() {
        Fixture empty = space("FREE", 31);
        album(empty); // an album without anything in it does not count as content
        UUID partner = TenantFixtures.user(jdbc, "partner-" + empty.email(), "P", false);
        TenantFixtures.member(jdbc, empty.space(), partner, "MEMBER");
        jdbc.update("INSERT INTO invitation (token_hash, space_id, role, created_by, expires_at, used_at, used_by) "
                + "VALUES (?, ?, 'MEMBER', ?, now(), now(), ?)", UUID.randomUUID().toString().replace("-", ""), empty.space(), empty.owner(), partner);
        jdbc.update("INSERT INTO spring_session (primary_id, session_id, creation_time, last_access_time, max_inactive_interval, expiry_time, principal_name) "
                + "VALUES (?, ?, 0, 0, 1800, 0, ?)", UUID.randomUUID().toString(), UUID.randomUUID().toString(), empty.email());

        assertThat(job.cleanup(Instant.now())).isGreaterThanOrEqualTo(1);

        assertThat(exists(empty.space())).isFalse();
        assertThat(users(empty.email())).isZero();
        assertThat(users("partner-" + empty.email())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE principal_name = ?", Integer.class, empty.email())).isZero();
    }

    @Test
    void spacesWithContentRecentSpacesAndInvitedSpacesStay() {
        Fixture young = space("FREE", 5);
        Fixture invited = space("INVITED", 90);

        Fixture withPhoto = space("FREE", 60);
        UUID album = album(withPhoto);
        jdbc.update("INSERT INTO media (id, album_id, space_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes) "
                + "VALUES (?, ?, ?, ?, 'IMAGE', 'READY', ?, 'f.jpg', 'image/jpeg', 10)",
                UUID.randomUUID(), album, withPhoto.space(), withPhoto.owner(), "spaces/" + withPhoto.space() + "/x");

        Fixture withNote = space("FREE", 60);
        jdbc.update("INSERT INTO day_note (space_id, author_id, day, body) VALUES (?, ?, current_date, 'not')", withNote.space(), withNote.owner());

        Fixture withSong = space("FREE", 60);
        jdbc.update("UPDATE album SET music_size_bytes = 100 WHERE id = ?", album(withSong));

        job.cleanup(Instant.now());

        for (Fixture f : new Fixture[] {young, invited, withPhoto, withNote, withSong}) {
            assertThat(exists(f.space())).as(f.email()).isTrue();
            assertThat(users(f.email())).as(f.email()).isOne();
        }
    }
}
