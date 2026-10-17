package com.lovesite.user;

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

    public UserSeeder(SeedProperties properties, AppUserRepository repository, PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        requireComplete();
        seed(properties.user1());
        seed(properties.user2());
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

    private void seed(SeedProperties.Seed seed) {
        String email = seed.email().trim().toLowerCase(Locale.ROOT);
        if (repository.findByEmailIgnoreCase(email).isPresent()) {
            log.info("Seed user {} already exists, skipping", email);
            return;
        }
        repository.save(new AppUser(email, seed.name().trim(), passwordEncoder.encode(seed.password())));
        log.info("Seeded user {}", email);
    }
}
