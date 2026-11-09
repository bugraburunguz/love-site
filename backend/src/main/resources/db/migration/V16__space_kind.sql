-- How a space came to be: INVITED (the admin created it and invited its owner) or FREE (someone signed up on their own).
-- Free spaces get a small allowance, and all of them together may only promise a fixed amount of disk (app.signup.*).
ALTER TABLE space ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'INVITED' CHECK (kind IN ('INVITED', 'FREE'));

CREATE INDEX space_free_idx ON space (kind) WHERE kind = 'FREE';
