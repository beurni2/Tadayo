// db/bootstrap.sql's work, as the migrations and the API find it (ADR-015, ADR-026): the role
// `tadayo_app`, the schema `app` it owns, and pg_trgm, which only it may use.

import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql } from "./harness.ts";

const app = appSql();
const admin = adminSql();
afterAll(async () => {
  await Promise.all([app.end(), admin.end()]);
});

describe("the bootstrap (ADR-015, ADR-026)", () => {
  it("connects the tests as tadayo_app, which logs in and holds no other attribute", async () => {
    const [role] = await app<Record<string, unknown>[]>`
      SELECT current_user AS name, r.rolcanlogin AS login, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
             r.rolcreaterole AS createrole, r.rolcreatedb AS createdb, r.rolreplication AS replication,
             (SELECT count(*)::int FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) AS member_of
        FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
    `;
    expect(role).toEqual({
      name: "tadayo_app",
      login: true,
      superuser: false,
      bypassrls: false,
      createrole: false,
      createdb: false,
      replication: false,
      member_of: 0,
    });
  });

  it("gives the schema app to tadayo_app", async () => {
    const [schema] = await app<{ owner: string }[]>`
      SELECT nspowner::regrole::text AS owner FROM pg_catalog.pg_namespace WHERE nspname = 'app'
    `;
    expect(schema?.owner).toBe("tadayo_app");
  });

  it("puts pg_trgm in app_extensions, which tadayo_app may use and the API roles and PUBLIC may not", async () => {
    const [found] = await admin<
      { schema: string; app: boolean; anon: boolean; authenticated: boolean; service: boolean; public: number }[]
    >`
      SELECT (SELECT extnamespace::regnamespace::text FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm') AS schema,
             pg_catalog.has_schema_privilege('tadayo_app', 'app_extensions', 'USAGE') AS app,
             pg_catalog.has_schema_privilege('anon', 'app_extensions', 'USAGE') AS anon,
             pg_catalog.has_schema_privilege('authenticated', 'app_extensions', 'USAGE') AS authenticated,
             pg_catalog.has_schema_privilege('service_role', 'app_extensions', 'USAGE') AS service,
             (SELECT count(*)::int FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(n.nspacl) a
               WHERE n.nspname = 'app_extensions' AND a.grantee = 0) AS public
    `;
    expect(found).toEqual({
      schema: "app_extensions",
      app: true,
      anon: false,
      authenticated: false,
      service: false,
      public: 0,
    });
    const [similar] = await app<{ score: number }[]>`SELECT app_extensions.similarity('Debby', 'Debby') AS score`;
    expect(similar?.score).toBe(1);
  });
});
