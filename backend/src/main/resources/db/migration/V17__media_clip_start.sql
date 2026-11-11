-- LS-22: where the 3-second living-photo clip of a video starts (ms). NULL = the beginning, as before.
ALTER TABLE media ADD COLUMN clip_start_ms BIGINT;
ALTER TABLE media ADD CONSTRAINT media_clip_start_non_negative CHECK (clip_start_ms IS NULL OR clip_start_ms >= 0);
