package com.lovesite.media.processing;

import com.lovesite.TenantFixtures;
import com.lovesite.TestInfrastructure;
import com.lovesite.album.Album;
import com.lovesite.album.AlbumRepository;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The queue is shared by all spaces. A couple that uploads hundreds of videos must not make everybody else wait for the
 * whole backlog: the space that was served least recently goes next, and inside a space the oldest job.
 */
@SpringBootTest
class QueueFairnessTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository media;
    @Autowired AlbumRepository albums;
    @Autowired MediaProcessingService service;

    long clock = 0;

    @BeforeEach
    void isolate() {
        // other test classes share the database: park their queued rows so only this test's jobs are claimable
        jdbc.update("UPDATE media SET deleted_at = now() WHERE status IN ('UPLOADED', 'PROCESSING') AND deleted_at IS NULL");
    }

    record Tenant(UUID space, UUID album, UUID user) {
    }

    Tenant tenant() {
        String email = "fair-" + UUID.randomUUID() + "@x.io";
        UUID space = TenantFixtures.spaceWithOwner(jdbc, "Fair " + email, TenantFixtures.GIB, email);
        UUID user = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        UUID album = albums.save(new Album(space, "Q", user)).getId();
        return new Tenant(space, album, user);
    }

    /** `count` queued jobs; later calls are always newer than earlier ones. */
    List<UUID> queue(Tenant t, int count) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Media m = new Media(UUID.randomUUID(), t.space(), t.album(), t.user(), MediaKind.IMAGE, "f" + i + ".jpg", "image/jpeg", 1, null, null);
            m.markUploaded(1);
            media.saveAndFlush(m);
            jdbc.update("UPDATE media SET created_at = ? WHERE id = ?", Timestamp.from(Instant.parse("2024-01-01T00:00:00Z").plusSeconds(clock++)), m.getId());
            ids.add(m.getId());
        }
        return ids;
    }

    UUID spaceOf(UUID mediaId) {
        return jdbc.queryForObject("SELECT space_id FROM media WHERE id = ?", UUID.class, mediaId);
    }

    List<UUID> claimAll(boolean finishEach) {
        List<UUID> claimedSpaces = new ArrayList<>();
        for (var id = service.claimNext(); id.isPresent(); id = service.claimNext()) {
            claimedSpaces.add(spaceOf(id.get()));
            if (finishEach) jdbc.update("UPDATE media SET status = 'READY' WHERE id = ?", id.get());
        }
        return claimedSpaces;
    }

    @Test
    void aSmallSpaceDoesNotWaitBehindABigBacklog() {
        Tenant big = tenant();
        Tenant small = tenant();
        queue(big, 50);   // older
        queue(small, 1);  // newer: with plain FIFO it would be job number 51

        List<UUID> order = claimAll(true);

        assertThat(order).hasSize(51);
        assertThat(order.get(0)).isEqualTo(big.space());
        assertThat(order.get(1)).isEqualTo(small.space()); // second, not last
        assertThat(order.subList(2, 51)).containsOnly(big.space());
    }

    @Test
    void spacesAreServedRoundRobinAndEveryJobIsEventuallyClaimed() {
        Tenant a = tenant();
        Tenant b = tenant();
        Tenant c = tenant();
        queue(a, 4);
        queue(b, 2);
        queue(c, 2);

        List<UUID> order = claimAll(true);

        assertThat(order).containsExactly(a.space(), b.space(), c.space(), a.space(), b.space(), c.space(), a.space(), a.space());
    }

    @Test
    void whileOneSpaceIsBusyAnIdleSpaceGoesFirst() {
        // two parallel workers: the second one must not pile onto the space that is already being processed
        Tenant busy = tenant();
        Tenant idle = tenant();
        queue(busy, 3);
        queue(idle, 1);

        UUID first = service.claimNext().orElseThrow();   // not finished: still PROCESSING
        UUID second = service.claimNext().orElseThrow();

        assertThat(spaceOf(first)).isEqualTo(busy.space());
        assertThat(spaceOf(second)).isEqualTo(idle.space());
    }

    @Test
    void insideASpaceTheOldestJobGoesFirstAndWaitingJobsAreSkipped() {
        Tenant t = tenant();
        List<UUID> ids = queue(t, 3);
        jdbc.update("UPDATE media SET next_attempt_at = now() + interval '10 minutes' WHERE id = ?", ids.get(0)); // in backoff

        assertThat(service.claimNext()).contains(ids.get(1));
        assertThat(service.claimNext()).contains(ids.get(2));
        assertThat(service.claimNext()).isEmpty();
    }

    @Test
    void claimingMarksTheSpaceAsServed() {
        Tenant t = tenant();
        queue(t, 1);
        assertThat(jdbc.queryForObject("SELECT last_served_at FROM space WHERE id = ?", Timestamp.class, t.space())).isNull();

        service.claimNext().orElseThrow();

        assertThat(jdbc.queryForObject("SELECT last_served_at FROM space WHERE id = ?", Timestamp.class, t.space())).isNotNull();
    }
}
