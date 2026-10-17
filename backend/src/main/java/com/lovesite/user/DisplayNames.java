package com.lovesite.user;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.LoadingCache;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/** Display names of users by id, for "added by ...". Names change rarely, so they are cached for a few minutes. */
@Component
public class DisplayNames {

    private final LoadingCache<UUID, String> names;

    public DisplayNames(JdbcTemplate jdbc) {
        this.names = Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(5)).maximumSize(5_000).build(id -> {
            List<String> found = jdbc.query("SELECT display_name FROM app_user WHERE id = ?", (rs, i) -> rs.getString(1), id);
            return found.isEmpty() ? "" : found.get(0);
        });
    }

    public String of(UUID userId) {
        return userId == null ? null : names.get(userId);
    }
}
