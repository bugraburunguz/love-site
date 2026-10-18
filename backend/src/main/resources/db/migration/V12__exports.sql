-- Phase 7: exports (polaroid download, Instagram formats, WhatsApp sticker pack) rendered by the worker.
CREATE TABLE export_job (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id     UUID         NOT NULL REFERENCES space (id),
    requested_by UUID         NOT NULL REFERENCES app_user (id),
    album_id     UUID         REFERENCES album (id) ON DELETE CASCADE,  -- the album the export belongs to (for the album's list)
    type         VARCHAR(20)  NOT NULL,                                  -- POLAROID / STORY / POST / CAROUSEL / REELS / STICKER_PACK
    params       JSONB        NOT NULL,                                  -- what the user asked for (normalised)
    payload      JSONB        NOT NULL,                                  -- snapshot of everything the render needs (storage keys, no URLs)
    fingerprint  VARCHAR(64)  NOT NULL,                                  -- sha256 of type + payload: same content = same result
    status       VARCHAR(10)  NOT NULL,                                  -- QUEUED / RUNNING / READY / FAILED
    result_keys  JSONB,                                                  -- [{key, name, contentType, size}] once READY
    notes        JSONB,                                                  -- e.g. animated stickers that fell back to static
    meta         JSONB,                                                  -- render geometry per scene (polaroid position, caption overflow)
    attempts     INT          NOT NULL DEFAULT 0,
    last_error   VARCHAR(300),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ  NOT NULL                                   -- results (and the row) are deleted after this
);

CREATE INDEX export_job_queue_idx ON export_job (created_at) WHERE status = 'QUEUED';
CREATE INDEX export_job_running_idx ON export_job (started_at) WHERE status = 'RUNNING';
CREATE INDEX export_job_space_idx ON export_job (space_id, created_at DESC);
CREATE INDEX export_job_album_idx ON export_job (album_id, created_at DESC);
CREATE INDEX export_job_fingerprint_idx ON export_job (space_id, fingerprint);
CREATE INDEX export_job_expiry_idx ON export_job (expires_at);

-- fair export queue between spaces (separate from the media queue's last_served_at)
ALTER TABLE space ADD COLUMN export_served_at TIMESTAMPTZ;

-- Work the web service asks the worker to do (it runs no jobs itself), e.g. the admin's "back up now".
CREATE TABLE ops_request (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         VARCHAR(20) NOT NULL,          -- BACKUP
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
