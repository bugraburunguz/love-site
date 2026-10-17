package com.lovesite.user;

import com.lovesite.space.SpaceProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Seeds the two users from environment variables on startup.
 * Existing users are never touched, so passwords are not overwritten on redeploy.
 */
@Component
public class UserSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserSeeder.class);

    private final SeedProperties properties;
    private final AppUserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbc;
    private final SpaceProperties spaceProperties;
    private final String admin;

    public UserSeeder(SeedProperties properties, AppUserRepository repository, PasswordEncoder passwordEncoder,
                      JdbcTemplate jdbc, SpaceProperties spaceProperties, @Value("${app.admin-email:}") String admin) {
        this.properties = properties;
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
        this.spaceProperties = spaceProperties;
        this.admin = admin;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        requireComplete();
        AppUser first = seed(properties.user1());
        AppUser second = seed(properties.user2());
        createInitialSpaceIfMissing(first, second);
        markAdmin();
    }

    /**
     * First install only: the two env users share the initial space (USER1 owner). On an existing database the
     * V7 migration already did this; later spaces come from invitations, never from the environment.
     */
    private void createInitialSpaceIfMissing(AppUser owner, AppUser member) {
        Integer spaces = jdbc.queryForObject("SELECT count(*) FROM space", Integer.class);
        if (spaces != null && spaces > 0) return;
        UUID spaceId = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, name, storage_limit_bytes) VALUES (?, ?, ?)", spaceId,
                spaceProperties.initialName(), spaceProperties.initialLimitBytes());
        jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, owner.getId());
        jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, member.getId());
        log.info("Created initial space {}", spaceId);
    }

    private void markAdmin() {
        String adminEmail = admin == null ? "" : admin.trim();
        if (adminEmail.isEmpty()) return;
        jdbc.update("UPDATE app_user SET is_admin = true WHERE lower(email) = lower(?)", adminEmail);
    }

    private void requireComplete() {
        List<String> missing = new ArrayList<>();
        check(missing, "USER1", properties.user1());
        check(missing, "USER2", properties.user2());
        if (!missing.isEmpty()) {
            throw new IllegalStateException(
                    "Missing required environment variables for user seeding: " + String.join(", ", missing));
        }
    }

    private static void check(List<String> missing, String prefix, SeedProperties.Seed seed) {
        if (seed == null || isBlank(seed.email())) missing.add(prefix + "_EMAIL");
        if (seed == null || isBlank(seed.name())) missing.add(prefix + "_NAME");
        if (seed == null || isBlank(seed.password())) missing.add(prefix + "_PASSWORD");
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private AppUser seed(SeedProperties.Seed seed) {
        String email = seed.email().trim().toLowerCase(Locale.ROOT);
        var existing = repository.findByEmailIgnoreCase(email);
        if (existing.isPresent()) {
            log.info("Seed user {} already exists, skipping", email);
            return existing.get();
        }
        AppUser saved = repository.saveAndFlush(new AppUser(email, seed.name().trim(), passwordEncoder.encode(seed.password())));
        log.info("Seeded user {}", email);
        return saved;
    }
}
