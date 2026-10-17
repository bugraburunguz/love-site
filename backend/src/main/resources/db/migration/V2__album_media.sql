CREATE TABLE album (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title      VARCHAR(200) NOT NULL,
    created_by UUID         NOT NULL REFERENCES app_user (id),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX album_created_at_idx ON album (created_at DESC) WHERE deleted_at IS NULL;

-- type and status are plain strings (not DB enums) so later phases can add values
-- (PROCESSING / READY / FAILED) without a type migration.
CREATE TABLE media (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id          UUID         NOT NULL REFERENCES album (id),
    uploaded_by       UUID         NOT NULL REFERENCES app_user (id),
    type              VARCHAR(20)  NOT NULL,
    status            VARCHAR(30)  NOT NULL,
    original_key      VARCHAR(512) NOT NULL,
    original_filename VARCHAR(512) NOT NULL,
    content_type      VARCHAR(100) NOT NULL,
    size_bytes        BIGINT       NOT NULL,
    sha256            VARCHAR(64),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX media_album_idx ON media (album_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX media_pending_idx ON media (created_at) WHERE status = 'PENDING_UPLOAD';

CREATE UNIQUE INDEX media_album_sha256_uq ON media (album_id, sha256)
    WHERE deleted_at IS NULL AND sha256 IS NOT NULL;
