package com.lovesite;

import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

/** Direct database setup for tests that need several spaces (the application itself only creates them through invitations). */
public final class TenantFixtures {

    public static final long GIB = 1024L * 1024L * 1024L;

    private TenantFixtures() {
    }

    public static UUID space(JdbcTemplate jdbc, String name, long limitBytes) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, name, storage_limit_bytes) VALUES (?, ?, ?)", id, name, limitBytes);
        return id;
    }

    /** A user without password login (tests authenticate with a mock principal). */
    public static UUID user(JdbcTemplate jdbc, String email, String name, boolean admin) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_user (id, email, display_name, password_hash, is_admin) VALUES (?, ?, ?, 'x', ?)", id, email, name, admin);
        return id;
    }

    public static void member(JdbcTemplate jdbc, UUID spaceId, UUID userId, String role) {
        jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
    }

    /** space + owner in one call; returns the space id. */
    public static UUID spaceWithOwner(JdbcTemplate jdbc, String spaceName, long limitBytes, String ownerEmail) {
        UUID space = space(jdbc, spaceName, limitBytes);
        member(jdbc, space, user(jdbc, ownerEmail, ownerEmail, false), "OWNER");
        return space;
    }

    public static UUID spaceOf(JdbcTemplate jdbc, String email) {
        return jdbc.queryForObject("SELECT m.space_id FROM space_member m JOIN app_user u ON u.id = m.user_id WHERE u.email = ?", UUID.class, email);
    }
}
