-- File.lastModified from the uploader's device; Phase 3 uses it as the fallback date when a photo has no EXIF date.
ALTER TABLE media ADD COLUMN client_modified_at TIMESTAMPTZ;
