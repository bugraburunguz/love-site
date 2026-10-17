package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.backup.BackupProperties;
import com.lovesite.backup.BackupService;
import com.lovesite.backup.BackupTarget;
import com.lovesite.media.processing.ProcessRunner;
import com.lovesite.space.TrashPurgeJob;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Nightly backup against two buckets of the test S3 server. Runs in a database of its own so that rows left behind by other
 * test classes (whose objects do not exist) cannot make a run fail.
 */
@SpringBootTest
@AutoConfigureMockMvc
class BackupTest {

    static final String BACKUP_BUCKET = "backup-bucket";
    static final String DATABASE = "backuptest";

    static {
        try (Connection c = DriverManager.getConnection(TestInfrastructure.POSTGRES.getJdbcUrl(),
                TestInfrastructure.POSTGRES.getUsername(), TestInfrastructure.POSTGRES.getPassword());
             var st = c.createStatement()) {
            st.execute("CREATE DATABASE " + DATABASE);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        TestInfrastructure.ADMIN.createBucket(CreateBucketRequest.builder().bucket(BACKUP_BUCKET).build());
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("spring.datasource.url", () -> TestInfrastructure.POSTGRES.getJdbcUrl().replace("/" + TestInfrastructure.POSTGRES.getDatabaseName(), "/" + DATABASE));
        r.add("app.backup.endpoint", TestInfrastructure::s3Url);
        r.add("app.backup.bucket", () -> BACKUP_BUCKET);
        r.add("app.backup.access-key-id", () -> TestInfrastructure.S3_USER);
        r.add("app.backup.secret-access-key", () -> TestInfrastructure.S3_SECRET);
        r.add("app.backup.region", () -> "us-east-1");
        r.add("app.backup.path-style", () -> "true");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired BackupService backup;
    @Autowired TrashPurgeJob purge;
    @Autowired MockMvc mvc;

    UUID space;
    UUID owner;
    UUID album;
    String tag;

    @BeforeEach
    void setUp() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        space = TenantFixtures.space(jdbc, "Yedek " + tag, TenantFixtures.GIB);
        owner = TenantFixtures.user(jdbc, "owner-" + tag + "@x.io", "Owner", false);
        TenantFixtures.member(jdbc, space, owner, "OWNER");
        album = UUID.randomUUID();
        jdbc.update("INSERT INTO album (id, title, created_by, space_id) VALUES (?, 'A', ?, ?)", album, owner, space);
        // only this test's rows count: start every test from an empty media table and empty target
        jdbc.update("DELETE FROM media WHERE album_id <> ?", album);
        jdbc.update("UPDATE album SET music_key = NULL, music_size_bytes = NULL, music_content_type = NULL WHERE id <> ?", album);
        jdbc.update("DELETE FROM purged_object");
        for (String key : targetKeys("")) {
            TestInfrastructure.ADMIN.deleteObject(b -> b.bucket(BACKUP_BUCKET).key(key));
        }
    }

    // ---- helpers

    List<String> targetKeys(String prefix) {
        return TestInfrastructure.ADMIN.listObjectsV2(b -> b.bucket(BACKUP_BUCKET).prefix(prefix)).contents().stream()
                .map(o -> o.key()).toList();
    }

    byte[] targetBytes(String key) {
        return TestInfrastructure.ADMIN.getObjectAsBytes(GetObjectRequest.builder().bucket(BACKUP_BUCKET).key(key).build()).asByteArray();
    }

    boolean inTarget(String key) {
        try {
            TestInfrastructure.ADMIN.headObject(b -> b.bucket(BACKUP_BUCKET).key(key));
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    void putMain(String key, byte[] data) {
        TestInfrastructure.ADMIN.putObject(PutObjectRequest.builder().bucket(TestInfrastructure.BUCKET).key(key).build(), RequestBody.fromBytes(data));
    }

    /** a media row with its original in the main bucket */
    String media(String status, byte[] data) {
        UUID id = UUID.randomUUID();
        String key = "spaces/" + space + "/albums/" + album + "/media/" + id + "/original";
        if (data != null) putMain(key, data);
        jdbc.update("INSERT INTO media (id, album_id, space_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes) "
                + "VALUES (?, ?, ?, ?, 'IMAGE', ?, ?, 'f.jpg', 'image/jpeg', ?)", id, album, space, owner, status, key, data == null ? 10 : data.length);
        return key;
    }

    static byte[] bytes(int n, int seed) {
        byte[] b = new byte[n];
        for (int i = 0; i < n; i++) b[i] = (byte) (i * 31 + seed);
        return b;
    }

    // ---- media

    @Test
    void copiesOriginalsAndSongsOnlyAndIsIncremental() {
        String a = media("READY", bytes(100, 1));
        String b = media("UPLOADED", bytes(200, 2));
        media("PENDING_UPLOAD", null);     // never uploaded
        media("REJECTED", bytes(20, 3));   // not an accepted file
        // a processed variant sits next to the original in the main bucket and must not be backed up
        String variant = a.replace("/original", "/v1/thumb.webp");
        putMain(variant, bytes(30, 4));
        jdbc.update("UPDATE media SET thumb_key = ? WHERE original_key = ?", variant, a);
        String song = "spaces/" + space + "/albums/" + album + "/music/" + UUID.randomUUID();
        putMain(song, bytes(50, 5));
        jdbc.update("UPDATE album SET music_key = ?, music_content_type = 'audio/mpeg', music_size_bytes = 50, music_original_filename = 's.mp3' WHERE id = ?", song, album);

        BackupService.Run first = backup.runMedia(Instant.now());

        assertThat(first.status()).isEqualTo("OK");
        assertThat(first.copiedCount()).isEqualTo(3);
        assertThat(first.objectCount()).isEqualTo(3);
        assertThat(first.totalBytes()).isEqualTo(350);
        assertThat(targetKeys("spaces/")).containsExactlyInAnyOrder(a, b, song);
        assertThat(targetBytes(a)).isEqualTo(bytes(100, 1));
        assertThat(targetBytes(song)).isEqualTo(bytes(50, 5));
        assertThat(inTarget(variant)).isFalse();

        // nothing changed: nothing is copied
        BackupService.Run second = backup.runMedia(Instant.now());
        assertThat(second.copiedCount()).isZero();
        assertThat(second.objectCount()).isEqualTo(3);

        // a new original is copied, one whose size changed is copied again, the rest is left alone
        String c = media("READY", bytes(60, 6));
        putMain(a, bytes(150, 7));
        jdbc.update("UPDATE media SET size_bytes = 150 WHERE original_key = ?", a);
        BackupService.Run third = backup.runMedia(Instant.now());
        assertThat(third.copiedCount()).isEqualTo(2);
        assertThat(targetBytes(a)).isEqualTo(bytes(150, 7));
        assertThat(targetBytes(c)).isEqualTo(bytes(60, 6));
        assertThat(third.totalBytes()).isEqualTo(150 + 200 + 50 + 60);
    }

    @Test
    void oneMissingOriginalFailsTheRunButNotTheRest() {
        String good = media("READY", bytes(40, 1));
        String lost = media("READY", null); // row exists, object does not
        media("READY", bytes(10, 2));
        BackupService.Run run = backup.runMedia(Instant.now());
        assertThat(run.status()).isEqualTo("FAILED");
        assertThat(run.message()).contains("1 object");
        assertThat(run.copiedCount()).isEqualTo(2);
        assertThat(inTarget(good)).isTrue();
        assertThat(inTarget(lost)).isFalse();
        // the admin screen reads this
        assertThat(backup.status().media().status()).isEqualTo("FAILED");
    }

    @Test
    void aPurgedOriginalStaysAtTheTargetForThirtyMoreDays() {
        String kept = media("READY", bytes(30, 1));
        String trashed = media("READY", bytes(40, 2));
        jdbc.update("UPDATE media SET deleted_at = ? WHERE original_key = ?", Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), trashed);

        // the trash still counts as data: it is backed up
        backup.runMedia(Instant.now());
        assertThat(inTarget(trashed)).isTrue();

        // 31 days in the trash: the purge removes it from the main bucket for good and leaves a record
        jdbc.update("UPDATE media SET deleted_at = ? WHERE original_key = ?", Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), trashed);
        Instant purgedAt = Instant.now();
        assertThat(purge.purge(purgedAt).media()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM purged_object WHERE object_key = ?", Integer.class, trashed)).isEqualTo(1);

        backup.runMedia(purgedAt.plus(1, ChronoUnit.DAYS));
        backup.runMedia(purgedAt.plus(29, ChronoUnit.DAYS));
        assertThat(inTarget(trashed)).as("still there 29 days after the purge").isTrue();

        BackupService.Run last = backup.runMedia(purgedAt.plus(31, ChronoUnit.DAYS));
        assertThat(inTarget(trashed)).as("gone after the retention").isFalse();
        assertThat(inTarget(kept)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM purged_object", Integer.class)).isZero();
        assertThat(last.objectCount()).isEqualTo(1);
    }

    @Test
    void aReplacedSongIsKeptAtTheTargetToo() {
        String song = "spaces/" + space + "/albums/" + album + "/music/" + UUID.randomUUID();
        putMain(song, bytes(20, 1));
        jdbc.update("UPDATE album SET music_key = ?, music_content_type = 'audio/mpeg', music_size_bytes = 20 WHERE id = ?", song, album);
        backup.runMedia(Instant.now());
        assertThat(inTarget(song)).isTrue();
        // the album is trashed 31 days ago and purged: its song goes from the main bucket, the copy stays
        jdbc.update("UPDATE album SET deleted_at = ? WHERE id = ?", Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), album);
        Instant now = Instant.now();
        purge.purge(now);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM purged_object WHERE object_key = ?", Integer.class, song)).isEqualTo(1);
        backup.runMedia(now.plus(5, ChronoUnit.DAYS));
        assertThat(inTarget(song)).isTrue();
        backup.runMedia(now.plus(31, ChronoUnit.DAYS));
        assertThat(inTarget(song)).isFalse();
    }

    // ---- database

    @Test
    void createsAValidDumpAndKeepsOnlyTheLastFourteenDays() throws Exception {
        LocalDate today = LocalDate.of(2030, 1, 20);
        for (int day = 1; day <= 19; day++) {
            TestInfrastructure.ADMIN.putObject(PutObjectRequest.builder().bucket(BACKUP_BUCKET).key(String.format("db/2030-01-%02d.dump", day)).build(),
                    RequestBody.fromBytes("old".getBytes(StandardCharsets.UTF_8)));
        }
        TestInfrastructure.ADMIN.putObject(PutObjectRequest.builder().bucket(BACKUP_BUCKET).key("db/notes.txt").build(),
                RequestBody.fromBytes("x".getBytes(StandardCharsets.UTF_8)));

        BackupService.Run run = backup.runDb(today);

        assertThat(run.message()).isNull();
        assertThat(run.status()).isEqualTo("OK");
        List<String> dumps = targetKeys("db/").stream().filter(k -> k.endsWith(".dump")).sorted().toList();
        assertThat(dumps).hasSize(14);
        assertThat(dumps.get(0)).isEqualTo("db/2030-01-07.dump");
        assertThat(dumps.get(13)).isEqualTo("db/2030-01-20.dump");
        assertThat(inTarget("db/notes.txt")).as("only dated dumps are rotated").isTrue();
        assertThat(run.objectCount()).isEqualTo(15);

        // the dump is a real pg_dump custom-format archive that pg_restore can read
        byte[] dump = targetBytes("db/2030-01-20.dump");
        assertThat(new String(dump, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("PGDMP");
        Path file = Files.createTempFile("check-", ".dump");
        try {
            Files.write(file, dump);
            var listing = ProcessRunner.runChecked(List.of("pg_restore", "--list", file.toString()), Duration.ofSeconds(30));
            assertThat(listing.stdout()).contains("TABLE public media").contains("TABLE public backup_run");
        } finally {
            Files.deleteIfExists(file);
        }
        // running twice on the same day replaces that day's dump
        assertThat(backup.runDb(today).status()).isEqualTo("OK");
        assertThat(targetKeys("db/").stream().filter(k -> k.endsWith(".dump")).count()).isEqualTo(14);
    }

    // ---- configuration

    @Test
    void backupIsOffWhenTheVariablesAreMissing() {
        BackupProperties none = new BackupProperties(null, "", null, "  ", null, false, null, 0, null);
        assertThat(none.enabled()).isFalse();
        assertThat(none.missing()).containsExactly("BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY");
        assertThat(none.partiallyConfigured()).isFalse();
        assertThat(new BackupTarget(none).enabled()).isFalse();
        BackupProperties some = new BackupProperties("https://x.test", "b", null, null, null, false, null, 0, null);
        assertThat(some.partiallyConfigured()).isTrue();
        assertThat(some.missing()).containsExactly("BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY");
    }

    // ---- admin API

    @Test
    void adminSeesBackupStatusAndCanRequeueEverything() throws Exception {
        String adminEmail = "admin-" + tag + "@x.io";
        TenantFixtures.user(jdbc, adminEmail, "Admin", true);
        backup.runMedia(Instant.now());

        var res = mvc.perform(get("/api/admin/backup").with(user(adminEmail))).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(JsonPath.<Boolean>read(res.getContentAsString(), "$.enabled")).isTrue();
        assertThat(JsonPath.<String>read(res.getContentAsString(), "$.media.status")).isEqualTo("OK");
        assertThat(JsonPath.<Object>read(res.getContentAsString(), "$.media.objectCount")).isNotNull();

        // not for members
        assertThat(mvc.perform(get("/api/admin/backup").with(user("owner-" + tag + "@x.io"))).andReturn().getResponse().getStatus()).isGreaterThanOrEqualTo(400);
        assertThat(mvc.perform(post("/api/admin/reprocess-all").with(user("owner-" + tag + "@x.io")).with(csrf())).andReturn().getResponse().getStatus()).isGreaterThanOrEqualTo(400);

        // reprocess-all: processed and failed items go back to the queue; the trash and rejected items do not
        String ready = media("READY", bytes(5, 1));
        String failed = media("FAILED", bytes(5, 2));
        String trashed = media("READY", bytes(5, 3));
        String rejected = media("REJECTED", bytes(5, 4));
        jdbc.update("UPDATE media SET attempts = 3, last_error = 'x' WHERE original_key = ?", failed);
        jdbc.update("UPDATE media SET deleted_at = now() WHERE original_key = ?", trashed);
        var queued = mvc.perform(post("/api/admin/reprocess-all").with(user(adminEmail)).with(csrf())).andReturn().getResponse();
        assertThat(queued.getStatus()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(queued.getContentAsString(), "$.queued")).isEqualTo(2);
        assertThat(status(ready)).isEqualTo("UPLOADED");
        assertThat(status(failed)).isEqualTo("UPLOADED");
        assertThat(jdbc.queryForObject("SELECT attempts FROM media WHERE original_key = ?", Integer.class, failed)).isZero();
        assertThat(status(trashed)).isEqualTo("READY");
        assertThat(status(rejected)).isEqualTo("REJECTED");
    }

    String status(String key) {
        return jdbc.queryForObject("SELECT status FROM media WHERE original_key = ?", String.class, key);
    }
}
