-- Per-page theme. NULL = the page follows the album's theme (and keeps following it when the album theme changes);
-- a value pins the page to that theme. swatch / paper stay semantic slots, so "dark" stays dark under any theme.
ALTER TABLE page ADD COLUMN theme_id VARCHAR(40);
