-- A diary line per day and per person: each partner writes their own note for a calendar day and reads the other's.
CREATE TABLE day_note (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID          NOT NULL REFERENCES space (id),
    author_id  UUID          NOT NULL REFERENCES app_user (id),
    day        DATE          NOT NULL,
    body       VARCHAR(5000) NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT day_note_author_day_uq UNIQUE (space_id, author_id, day)
);

CREATE INDEX day_note_space_day_idx ON day_note (space_id, day);
