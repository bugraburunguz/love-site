-- Tenancy: every couple gets a "space"; albums and media belong to exactly one space.
CREATE TABLE space (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    storage_limit_bytes BIGINT       NOT NULL CHECK (storage_limit_bytes >= 0),
    -- when the processing queue last took a job of this space (fair scheduling between spaces)
    last_served_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE space_member (
    space_id  UUID        NOT NULL REFERENCES space (id),
    user_id   UUID        NOT NULL UNIQUE REFERENCES app_user (id), -- a user belongs to a single space
    role      VARCHAR(20) NOT NULL,                                 -- OWNER / MEMBER
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id)
);

CREATE INDEX space_member_space_idx ON space_member (space_id);

ALTER TABLE app_user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- NOT NULL is added by the next (Java) migration, after existing rows were attached to the initial space.
ALTER TABLE album ADD COLUMN space_id UUID REFERENCES space (id);
ALTER TABLE media ADD COLUMN space_id UUID REFERENCES space (id);
-- total size of the generated variants (written by the processing worker)
ALTER TABLE media ADD COLUMN variants_bytes BIGINT;

CREATE INDEX album_space_idx ON album (space_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_space_idx ON media (space_id);
CREATE INDEX media_deleted_idx ON media (deleted_at) WHERE deleted_at IS NOT NULL;

-- Invitation links. Only the SHA-256 of the token is stored; the plain token exists once, in the link that was handed out.
CREATE TABLE invitation (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    space_id   UUID        NOT NULL REFERENCES space (id),
    role       VARCHAR(20) NOT NULL,
    created_by UUID        NOT NULL REFERENCES app_user (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    used_by    UUID REFERENCES app_user (id)
);

CREATE INDEX invitation_space_idx ON invitation (space_id);
