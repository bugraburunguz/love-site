package com.lovesite.media;

/**
 * Stored as a string. Upload: PENDING_UPLOAD -> UPLOADED (REJECTED if the file failed validation).
 * Processing: UPLOADED -> PROCESSING -> READY, or FAILED after the last attempt. A failed attempt that may be retried
 * goes back to UPLOADED with next_attempt_at in the future.
 */
public enum MediaStatus {
    PENDING_UPLOAD,
    UPLOADED,
    PROCESSING,
    READY,
    FAILED,
    REJECTED
}
