#!/bin/sh
# Runs once, when the data directory is empty: one role and one database per app. The passwords come from the
# container environment and reach psql as variables, never as part of the SQL text.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
  -v love_pw="$LOVE_DB_PASSWORD" -v fc_pw="$FC_DB_PASSWORD" <<'SQL'
CREATE ROLE love LOGIN PASSWORD :'love_pw';
CREATE DATABASE love OWNER love;
CREATE ROLE fcassist LOGIN PASSWORD :'fc_pw';
CREATE DATABASE fcassist OWNER fcassist;
SQL
