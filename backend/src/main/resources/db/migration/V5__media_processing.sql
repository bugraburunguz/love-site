-- Media processing pipeline: queue bookkeeping, extracted metadata and the keys of the generated variants.
ALTER TABLE media
    ADD COLUMN attempts              INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN last_error            VARCHAR(300),
    ADD COLUMN next_attempt_at       TIMESTAMPTZ,
    ADD COLUMN processing_started_at TIMESTAMPTZ,
    ADD COLUMN processing_version    INTEGER      NOT NULL DEFAULT 0,
    -- display size of the generated variant (EXIF / rotation already applied)
    ADD COLUMN width                 INTEGER,
    ADD COLUMN height                INTEGER,
    ADD COLUMN duration_ms           BIGINT,
    ADD COLUMN taken_at              TIMESTAMPTZ,
    ADD COLUMN thumb_key             VARCHAR(512),
    ADD COLUMN display_key           VARCHAR(512),
    ADD COLUMN loop_key              VARCHAR(512),
    ADD COLUMN poster_key            VARCHAR(512);

-- Existing UPLOADED rows are picked up by the queue as they are (status UPLOADED, attempts 0).
CREATE INDEX media_queue_idx ON media (created_at)
    WHERE status = 'UPLOADED' AND deleted_at IS NULL;
CREATE INDEX media_processing_idx ON media (processing_started_at)
    WHERE status = 'PROCESSING';
