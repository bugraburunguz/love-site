-- Login and the per-request user lookup compare lower(email); this lets them use an index (and keeps addresses unique
-- regardless of case). Fails if two existing accounts differ only in case; check before deploying:
--   SELECT lower(email), count(*) FROM app_user GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX app_user_email_lower_uq ON app_user (lower(email));

-- Quota sums (QuotaService) read only these columns of a space's media, soft-deleted rows included (no partial index).
CREATE INDEX media_space_quota_idx ON media (space_id) INCLUDE (size_bytes, variants_bytes, status);
