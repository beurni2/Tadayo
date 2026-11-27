// The privacy matrix's own database (the outside audit's B8). The matrix commits its worlds, and the
// database tests expect a database that holds none: run after the matrix on the same database, 15 of
// them in 10 files failed (a committed day, which dev's clock won't move past, among them), and ci passed
// only because it runs them first. So the matrix runs in a database of its own, made afresh for each run:
// once the database tests' setup has migrated the database ci gives (../db/global-setup.ts), it is copied
// whole, schemas, extension and rows, with the same owner, and `tadayo_app` given CONNECT on the copy as
// db/bootstrap.sql gives it on the original. A role's settings (0018's time limits) are the role's in
// every database. The copy of an earlier run is dropped first and the last one is left for a look, so
// the database ci gives never holds a world of the matrix's.

import postgres from "postgres";
import { setup as migrate } from "../db/global-setup.ts";

/** The database the privacy matrix runs in. */
export const MATRIX_DATABASE = "tadayo_privacy";

function required(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name}, as the ci step privacy does (tools/ci/ci_steps.py)`);
  return value;
}

/** The same server and role, on another database. */
function onDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

export async function setup(): Promise<void> {
  await migrate();
  const appUrl = required("DATABASE_URL");
  const adminUrl = required("DATABASE_ADMIN_URL");
  const source = decodeURIComponent(new URL(appUrl).pathname.slice(1));
  if (source === MATRIX_DATABASE) throw new Error(`the database ci gives is already ${MATRIX_DATABASE}`);
  // Postgres copies a database only while nobody is connected to it, so the admin works from template1.
  const admin = postgres(onDatabase(adminUrl, "template1"), { max: 1, onnotice: () => undefined });
  try {
    const [found] = await admin<{ owner: string }[]>`
      SELECT pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname = ${source}`;
    if (found === undefined) throw new Error(`the server has no database ${source}`);
    await admin`DROP DATABASE IF EXISTS ${admin(MATRIX_DATABASE)} WITH (FORCE)`;
    await admin`CREATE DATABASE ${admin(MATRIX_DATABASE)} TEMPLATE ${admin(source)} OWNER ${admin(found.owner)}`;
    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;
  } finally {
    await admin.end();
  }
  // Each test file's worker starts from this process's environment.
  process.env.DATABASE_URL = onDatabase(appUrl, MATRIX_DATABASE);
  process.env.DATABASE_ADMIN_URL = onDatabase(adminUrl, MATRIX_DATABASE);
}
