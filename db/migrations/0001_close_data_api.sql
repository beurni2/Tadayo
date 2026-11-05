-- 0001: the schema `app` is closed to everyone but its owner (T53; ADR-015; docs/plans/B0.md,
-- slice 4).
--
-- Supabase's data API (REST and GraphQL) is off in each project's settings, and it can serve only
-- what its roles may read: `anon`, `authenticated` and `service_role`, which bypasses row-level
-- security. So none of them, nor PUBLIC, gets anything on `app`: not the schema, not a table, not
-- a function. Every table the later migrations make has row-level security on with no policy, as
-- a closed backstop, and isn't forced, so `tadayo_app`, which owns it, reads and writes it as
-- usual. The runner (tools/ops/src/migrate.ts, `closedProblems`) refuses to commit any migration
-- that leaves the schema otherwise.

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM anon, authenticated, service_role;

-- A function is executable by PUBLIC by default, and a type usable by it; neither is, for what
-- `tadayo_app` makes from here on. (Only the role-wide default can take a privilege from PUBLIC:
-- a schema's default can only add to it.)
ALTER DEFAULT PRIVILEGES FOR ROLE tadayo_app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE tadayo_app REVOKE USAGE ON TYPES FROM PUBLIC;
