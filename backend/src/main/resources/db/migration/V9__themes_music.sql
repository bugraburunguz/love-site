-- Themes, page appearance and per-album music.
ALTER TABLE album ADD COLUMN theme_id VARCHAR(40) NOT NULL DEFAULT 'romantik';

-- the song of an album (uploaded straight to the bucket with a presigned PUT, confirmed by "complete")
ALTER TABLE album ADD COLUMN music_key VARCHAR(512);
ALTER TABLE album ADD COLUMN music_content_type VARCHAR(100);
ALTER TABLE album ADD COLUMN music_size_bytes BIGINT;
ALTER TABLE album ADD COLUMN music_original_filename VARCHAR(255);
-- an upload that was requested but not confirmed yet (counts against the quota meanwhile)
ALTER TABLE album ADD COLUMN music_pending_key VARCHAR(512);
ALTER TABLE album ADD COLUMN music_pending_content_type VARCHAR(100);
ALTER TABLE album ADD COLUMN music_pending_size_bytes BIGINT;
ALTER TABLE album ADD COLUMN music_pending_filename VARCHAR(255);

-- semantic page colour / paper slots; NULL = the theme's default
ALTER TABLE page ADD COLUMN swatch VARCHAR(20);
ALTER TABLE page ADD COLUMN paper VARCHAR(20);
