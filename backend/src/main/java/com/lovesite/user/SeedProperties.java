package com.lovesite.user;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.seed")
public record SeedProperties(Seed user1, Seed user2) {

    public record Seed(String email, String name, String password) {
    }
}
