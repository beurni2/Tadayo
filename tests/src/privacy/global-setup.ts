// The privacy matrix's own database (the outside audit's B8). The matrix commits its worlds, and the
// database tests expect a database that holds none: run after the matrix on the same database, 15 of
// them in 11 files failed (a committed day, which dev's clock won't move past, among them; the audit
// counted 10 files), and ci passed only because it runs them first. So the matrix runs in a database of
// its own, made afresh for each run: once the database tests' setup has migrated the database ci gives
// (../db/global-setup.ts), it is copied whole, schemas, extension and rows, with the same owner, and
// `tadayo_app` given CONNECT on the copy as db/bootstrap.sql gives it on the original.
//
// A copy doesn't keep what Postgres holds about a database rather than in it: who may connect, create
// or make temporary tables there, and the settings `ALTER DATABASE … SET` and `ALTER ROLE … IN DATABASE
// … SET` give. So the setup refuses an original with settings of its own, since a role's settings
// (0018's time limits) are the role's in every database only while none is the database's, and checks
// that `tadayo_app` and PUBLIC may do the same on the copy as on the original, so the matrix never runs
// with more rights or fewer limits than the database it stands for (T59). It refuses two URLs that
// name different servers, since the copy is made on the admin's and the app connects to the app's.
// The copy of an earlier run is dropped first, so two runs on one server at once would end each other's
// connections; the last copy is left for a look, and the database ci gives never holds a world of the
// matrix's.

import postgres from "postgres";
import { setup as migrate } from "../db/global-setup.ts";

/** The database the privacy matrix runs in. */
export const MATRIX_DATABASE = "tadayo_privacy";

/** Where the setup leaves the name of the database the matrix's is a copy of, for own-database.test.ts. */
export const SOURCE_VARIABLE = "TADAYO_PRIVACY_SOURCE";

/** Stops the run. Vitest fails while printing an error a global setup throws, so the reason never reached
 * the log (docs/LIMITATIONS.md); it goes to stderr first. */
function refuse(reason: string): never {
  process.stderr.write(`the privacy matrix's setup refused: ${reason}\n`);
  throw new Error(reason);
}

function required(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (!value) refuse(`set ${name}, as the ci step privacy does (tools/ci/ci_steps.py)`);
  return value;
}

/** The same server and role, on another database. */
export function onDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

/** The server a URL names: its host and port, and a socket directory given as `?host=`. */
function server(url: string): string {
  const parsed = new URL(url);
  return JSON.stringify([parsed.hostname, parsed.port, parsed.searchParams.get("host")]);
}

/** What PUBLIC and `tadayo_app` may do at a database's level, as "role privilege yes|no" lines in one order. */
export async function rightsOn(sql: postgres.Sql, database: string): Promise<string[]> {
  const rows = await sql<{ role: string; privilege: string; granted: boolean }[]>`
    SELECT r.role, p.privilege, pg_catalog.has_database_privilege(r.role, ${database}, p.privilege) AS granted
      FROM (VALUES ('public'), ('tadayo_app')) AS r(role)
     CROSS JOIN (VALUES ('CONNECT'), ('CREATE'), ('TEMPORARY')) AS p(privilege)
     ORDER BY r.role, p.privilege`;
  return rows.map((row) => `${row.role} ${row.privilege} ${row.granted ? "yes" : "no"}`);
}

export async function setup(): Promise<void> {
  await migrate();
  const appUrl = required("DATABASE_URL");
  const adminUrl = required("DATABASE_ADMIN_URL");
  if (server(appUrl) !== server(adminUrl)) refuse("DATABASE_URL and DATABASE_ADMIN_URL name different servers");
  const source = decodeURIComponent(new URL(appUrl).pathname.slice(1));
  if (source === MATRIX_DATABASE) refuse(`the database ci gives is already ${MATRIX_DATABASE}`);
  // Postgres copies a database only while nobody is connected to it, so the admin works from template1.
  const admin = postgres(onDatabase(adminUrl, "template1"), { max: 1, onnotice: () => undefined });
  try {
    const [found] = await admin<{ owner: string; settings: number }[]>`
      SELECT pg_catalog.pg_get_userbyid(d.datdba) AS owner,
             (SELECT pg_catalog.count(*)::int FROM pg_catalog.pg_db_role_setting s WHERE s.setdatabase = d.oid) AS settings
        FROM pg_catalog.pg_database d WHERE d.datname = ${source}`;
    if (found === undefined) refuse(`the server has no database ${source}`);
    if (found.settings > 0)
      refuse(
        `${source} has settings of its own (ALTER DATABASE or ALTER ROLE … IN DATABASE), which a copy wouldn't keep`,
      );
    await admin`DROP DATABASE IF EXISTS ${admin(MATRIX_DATABASE)} WITH (FORCE)`;
    await admin`CREATE DATABASE ${admin(MATRIX_DATABASE)} TEMPLATE ${admin(source)} OWNER ${admin(found.owner)}`;
    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;
    const original = await rightsOn(admin, source);
    const copy = await rightsOn(admin, MATRIX_DATABASE);
    if (JSON.stringify(copy) !== JSON.stringify(original))
      refuse(`${MATRIX_DATABASE} gives other rights than ${source}: ${copy.join(", ")} against ${original.join(", ")}`);
  } finally {
    await admin.end();
  }
  // Each test file's worker starts from this process's environment.
  process.env.DATABASE_URL = onDatabase(appUrl, MATRIX_DATABASE);
  process.env.DATABASE_ADMIN_URL = onDatabase(adminUrl, MATRIX_DATABASE);
  process.env[SOURCE_VARIABLE] = source;
}
