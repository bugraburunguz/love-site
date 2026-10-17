package com.lovesite.media;

/**
 * Stored as a string, so later phases can add PROCESSING, READY and FAILED without a migration.
 * REJECTED is a terminal state for uploads that failed the post-upload size or type check.
 */
public enum MediaStatus {
    PENDING_UPLOAD,
    UPLOADED,
    REJECTED
}
