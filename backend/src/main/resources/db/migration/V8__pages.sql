-- Persistent album pages. Which media sits on which page (and in which order / at which position) is stored here;
-- the frontend computes the exact positions of AUTO and FEATURED pages at render time.
CREATE TABLE page (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id   UUID        NOT NULL REFERENCES album (id) ON DELETE CASCADE,
    space_id   UUID        NOT NULL REFERENCES space (id),
    page_index INT         NOT NULL,
    template   VARCHAR(20) NOT NULL,          -- AUTO / FEATURED / FREE
    version    INT         NOT NULL DEFAULT 0, -- optimistic lock for structural changes
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- deferred so a whole range of pages can be shifted by one inside a transaction
    CONSTRAINT page_album_index_uq UNIQUE (album_id, page_index) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX page_space_idx ON page (space_id);

CREATE TABLE page_item (
    id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id    UUID             NOT NULL REFERENCES page (id) ON DELETE CASCADE,
    space_id   UUID             NOT NULL REFERENCES space (id),
    kind       VARCHAR(20)      NOT NULL,      -- MEDIA / STICKER / TAPE / TEXT (only MEDIA is written for now)
    media_id   UUID             REFERENCES media (id) ON DELETE CASCADE,
    slot_index INT,                            -- order on AUTO / FEATURED pages
    x          DOUBLE PRECISION,               -- FREE pages: page units (page is 1000 x 1400), centre of the item
    y          DOUBLE PRECISION,
    width      DOUBLE PRECISION,
    rotation   DOUBLE PRECISION,
    z_index    INT,
    variant    VARCHAR(100),
    version    INT              NOT NULL DEFAULT 0
);

CREATE INDEX page_item_page_idx ON page_item (page_id);
-- a media item is placed at most once per album (media belongs to exactly one album)
CREATE UNIQUE INDEX page_item_media_uq ON page_item (media_id) WHERE media_id IS NOT NULL;

-- "single page" choice made at upload time, applied when the upload completes
ALTER TABLE media ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
