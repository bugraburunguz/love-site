-- Accounts deleted by their owner (Apple 5.1.1(v) / Google Play). Only the SHA-256 of the lower-cased e-mail is kept, so the
-- startup seeder (USER1_* / USER2_*) never brings a deleted account back on the next deploy.
CREATE TABLE deleted_account (
    email_sha256 VARCHAR(64) PRIMARY KEY,
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
