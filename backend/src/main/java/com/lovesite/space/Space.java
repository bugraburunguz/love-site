package com.lovesite.space;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** One couple's private area: its members, albums, media and storage allowance. */
@Entity
@Table(name = "space")
public class Space {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "storage_limit_bytes", nullable = false)
    private long storageLimitBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Space() {
    }

    public Space(String name, long storageLimitBytes) {
        this.name = name;
        this.storageLimitBytes = storageLimitBytes;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public long getStorageLimitBytes() {
        return storageLimitBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setStorageLimitBytes(long storageLimitBytes) {
        this.storageLimitBytes = storageLimitBytes;
    }
}
