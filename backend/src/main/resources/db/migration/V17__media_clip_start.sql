-- LS-22: where the 3-second living-photo clip of a video starts (ms). NULL = the beginning, as before.
-- Give up rather than queue behind a long transaction holding the table (the deploy fails and is retried).
SET LOCAL lock_timeout = '5s';
-- a nullable column without a default only changes the catalog; the check below scans media once under the same
-- short lock (thousands of rows here; splitting it into NOT VALID + VALIDATE would not help inside Flyway's single
-- transaction, where the first lock is held until commit anyway)
ALTER TABLE media ADD COLUMN clip_start_ms BIGINT;
ALTER TABLE media ADD CONSTRAINT media_clip_start_non_negative CHECK (clip_start_ms IS NULL OR clip_start_ms >= 0);
