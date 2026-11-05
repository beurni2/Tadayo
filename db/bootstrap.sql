-- Tadayo's database bootstrap (ADR-015, ADR-026; docs/plans/B0.md, slice 4).
--
-- Run once per database by its admin role, which isn't a superuser: Supabase's `postgres` on
-- `dev` and `prod` (through the `ops` workflow), and the `postgres` that `ci` makes like it.
--
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v app_password=<password> -f db/bootstrap.sql
--
-- It makes what the migrations, which run as `tadayo_app`, can't make for themselves:
--   - the role `tadayo_app`, which the API and the worker connect as, with the password given;
--   - the schema `app`, owned by `tadayo_app`, which owns every table the migrations make in it;
--   - the schema `app_extensions`, holding `pg_trgm` for memory search (spec 18), which
--     `tadayo_app` may use and nobody else.
-- Supabase's `anon`, `authenticated` and `service_role` get nothing here, and migration 0001 takes
-- from them anything a default might give (T53).
--
-- It can run again: what exists is kept, the password is set again, and the checks at the end
-- fail the whole file if anything isn't as this file makes it. `app_password` may be a SCRAM
-- verifier instead of the password itself, which Postgres stores as given, so the password never
-- has to reach the server's log.

\set ON_ERROR_STOP on

BEGIN;

-- The API's role: it logs in, and has no other attribute, so nothing hides a mistake (ADR-015:
-- no BYPASSRLS, and never a superuser). A role made without naming them has none, and only a
-- superuser may name some of them, so they're checked at the end instead.
SELECT NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tadayo_app') AS make_app_role \gset
\if :make_app_role
CREATE ROLE tadayo_app LOGIN;
\endif
ALTER ROLE tadayo_app WITH LOGIN PASSWORD :'app_password';

-- On Postgres 16 and later, a role that isn't a superuser and made `tadayo_app` holds only the
-- ADMIN option on it, and `CREATE SCHEMA ... AUTHORIZATION tadayo_app` needs it to be able to SET
-- ROLE to it (ADR-026). Membership without inheritance gives exactly that, and none of
-- `tadayo_app`'s privileges.
GRANT tadayo_app TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

SELECT pg_catalog.format('GRANT CONNECT ON DATABASE %I TO tadayo_app', pg_catalog.current_database())
  AS grant_connect \gset
:grant_connect;

-- A new schema grants nothing to anyone but its owner; migration 0001 says so explicitly.
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION tadayo_app;

-- pg_trgm is a trusted extension, so a role with CREATE on the database may make it. It lives in
-- its own schema, which only `tadayo_app` may use, so its functions are nobody else's to call.
CREATE SCHEMA IF NOT EXISTS app_extensions;
REVOKE ALL ON SCHEMA app_extensions FROM PUBLIC;
GRANT USAGE ON SCHEMA app_extensions TO tadayo_app;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA app_extensions;

-- The checks. Each fails the file, and so rolls all of it back, unless what it names holds.
DO $checks$
DECLARE
  app_role pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT app_role FROM pg_catalog.pg_roles WHERE rolname = 'tadayo_app';
  IF app_role.rolsuper OR app_role.rolbypassrls OR app_role.rolcreaterole OR app_role.rolcreatedb
     OR app_role.rolreplication OR NOT app_role.rolcanlogin THEN
    RAISE EXCEPTION 'bootstrap: tadayo_app must log in and hold no other attribute (ADR-015)';
  END IF;
  IF EXISTS (SELECT FROM pg_catalog.pg_auth_members WHERE member = 'tadayo_app'::regrole) THEN
    RAISE EXCEPTION 'bootstrap: tadayo_app must belong to no role (ADR-015)';
  END IF;
  IF (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname = 'app') <> 'tadayo_app'::regrole THEN
    RAISE EXCEPTION 'bootstrap: the schema app must belong to tadayo_app (ADR-015)';
  END IF;
  IF (SELECT n.nspname FROM pg_catalog.pg_extension e
        JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
       WHERE e.extname = 'pg_trgm') IS DISTINCT FROM 'app_extensions' THEN
    RAISE EXCEPTION 'bootstrap: pg_trgm must live in app_extensions';
  END IF;
  -- Supabase's API roles, where they exist, and PUBLIC may use neither schema (T53).
  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles r
     WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
       AND (pg_catalog.has_schema_privilege(r.oid, 'app', 'USAGE, CREATE')
            OR pg_catalog.has_schema_privilege(r.oid, 'app_extensions', 'USAGE, CREATE'))
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(n.nspacl) a
     WHERE n.nspname IN ('app', 'app_extensions') AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'bootstrap: anon, authenticated, service_role and PUBLIC may use neither app nor app_extensions (T53)';
  END IF;
END
$checks$;

COMMIT;
