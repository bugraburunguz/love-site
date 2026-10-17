-- Backup bookkeeping: what the last runs did (shown on the admin screen) and which originals were purged for good.
CREATE TABLE backup_run (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         VARCHAR(10) NOT NULL,            -- MEDIA / DB
    status       VARCHAR(10) NOT NULL,            -- RUNNING / OK / FAILED
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    object_count BIGINT,                          -- objects at the backup target after the run
    total_bytes  BIGINT,
    copied_count BIGINT,                          -- objects written by this run
    message      VARCHAR(400)
);
CREATE INDEX backup_run_kind_idx ON backup_run (kind, started_at DESC);

-- A purged original (or a replaced / removed album song) stays at the backup target for 30 more days; this is the record
-- the nightly run uses to delete it at the target when that time is over.
CREATE TABLE purged_object (
    object_key VARCHAR(512) PRIMARY KEY,
    purged_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
