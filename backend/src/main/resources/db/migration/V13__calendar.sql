-- Calendar: a date set by hand (wins over the EXIF / device / upload date; NULL = no correction, the original stays in
-- taken_at / client_modified_at) and the couple's special days.
ALTER TABLE media ADD COLUMN date_override TIMESTAMPTZ;

-- the calendar asks "media of this space between two instants" by the shown date
CREATE INDEX media_shown_date_idx ON media (space_id, (coalesce(date_override, taken_at, client_modified_at, created_at)))
    WHERE deleted_at IS NULL;

CREATE TABLE special_day (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID         NOT NULL REFERENCES space (id),
    title      VARCHAR(80)  NOT NULL,
    day        DATE         NOT NULL,           -- the first (or only) occurrence
    icon       VARCHAR(20)  NOT NULL,           -- heart / ring / cake / plane / star / home
    yearly     BOOLEAN      NOT NULL,           -- repeats every year on the same month and day
    created_by UUID         NOT NULL REFERENCES app_user (id),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX special_day_space_idx ON special_day (space_id);
