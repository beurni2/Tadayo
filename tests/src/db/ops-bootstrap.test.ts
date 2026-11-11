// `tools/ops`' `bootstrap` against a real Postgres, with the real psql (docs/plans/B0.md, slice 10a;
// ADR-015; T56): it gives `tadayo_app` the password it is given, as a SCRAM verifier that Postgres
// stores as given and that is exactly the one Postgres would make, it can run again, and it puts
// the password in no argument and no message. The password is changed here and put back in a
// `finally`: the test files run one at a time (vitest.db.config.ts), so no other file is using it.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pgEnvOf, runBootstrap, scramVerifier, spawnProcess, type DevDatabaseUrl, type Spawn } from "@tadayo/ops";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, rolledBack } from "./harness.ts";

const FILE = join(import.meta.dirname, "..", "..", "..", "db", "bootstrap.sql");
const CI_PASSWORD = "tadayo-app-ci-only";
const NEW_PASSWORD = "a-new-password-of-more-than-32-characters-1";
const OTHER_PASSWORD = "yet-another-password-of-more-than-32-chars";

const adminUrl = process.env.DATABASE_ADMIN_URL ?? "";
const appUrl = process.env.DATABASE_URL ?? "";
// The local server has no TLS, and the pooler's string asks for it.
const pgEnv = { ...pgEnvOf(adminUrl as DevDatabaseUrl), PGSSLMODE: "disable" };

const admin = adminSql();
afterAll(async () => {
  await admin.end();
});

/** Connects as `tadayo_app` with `password`; true if the server lets it in. */
async function logsIn(password: string): Promise<boolean> {
  const url = new URL(appUrl);
  url.password = password;
  const sql = postgres(url.href, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
  try {
    const [row] = await sql<{ me: string }[]>`SELECT current_user AS me`;
    return row?.me === "tadayo_app";
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

async function putCiPasswordBack(): Promise<void> {
  await admin.unsafe(`ALTER ROLE tadayo_app WITH PASSWORD '${CI_PASSWORD}'`);
}

describe("bootstrap, through psql, against the test database", () => {
  it("gives tadayo_app the password it is given, and takes the old one away", async () => {
    expect(adminUrl, "set DATABASE_ADMIN_URL, as the ci step db-tests does").not.toBe("");
    try {
      await runBootstrap({ pgEnv, password: NEW_PASSWORD, file: FILE, spawn: spawnProcess });
      expect(await logsIn(NEW_PASSWORD)).toBe(true);
      expect(await logsIn(CI_PASSWORD)).toBe(false);
      expect(await logsIn(OTHER_PASSWORD)).toBe(false);
      // It can run again, and the password is set again.
      await runBootstrap({ pgEnv, password: OTHER_PASSWORD, file: FILE, spawn: spawnProcess });
      expect(await logsIn(OTHER_PASSWORD)).toBe(true);
      expect(await logsIn(NEW_PASSWORD)).toBe(false);
    } finally {
      await putCiPasswordBack();
    }
    expect(await logsIn(CI_PASSWORD)).toBe(true);
  }, 60_000);

  it("makes exactly the verifier Postgres makes for the same password, salt and count", async () => {
    await rolledBack(admin, async (tx) => {
      await tx`SET LOCAL password_encryption = 'scram-sha-256'`;
      await tx.unsafe(`CREATE ROLE tadayo_ops_scram_check LOGIN PASSWORD '${NEW_PASSWORD}'`);
      const [row] = await tx<{ stored: string }[]>`
        SELECT rolpassword AS stored FROM pg_catalog.pg_authid WHERE rolname = 'tadayo_ops_scram_check'`;
      const stored = row?.stored ?? "";
      const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$/.exec(stored);
      expect(match, "Postgres stores a SCRAM verifier").not.toBeNull();
      expect(scramVerifier(NEW_PASSWORD, Buffer.from(match?.[2] ?? "", "base64"), Number(match?.[1]))).toBe(stored);
    });
  });

  it("stores a verifier, never the password, when it gives tadayo_app one", async () => {
    try {
      await runBootstrap({ pgEnv, password: NEW_PASSWORD, file: FILE, spawn: spawnProcess });
      const [row] = await admin<
        { stored: string }[]
      >`SELECT rolpassword AS stored FROM pg_catalog.pg_authid WHERE rolname = 'tadayo_app'`;
      expect(row?.stored).toMatch(/^SCRAM-SHA-256\$4096:/);
      expect(row?.stored).not.toContain(NEW_PASSWORD);
    } finally {
      await putCiPasswordBack();
    }
  }, 60_000);

  it("leaves the role as the bootstrap's own checks demand, and the schema closed", async () => {
    try {
      await runBootstrap({ pgEnv, password: NEW_PASSWORD, file: FILE, spawn: spawnProcess });
      const [role] = await admin<{ login: boolean; super: boolean; bypass: boolean; owner: string }[]>`
        SELECT r.rolcanlogin AS login, r.rolsuper AS super, r.rolbypassrls AS bypass,
               (SELECT nspowner::regrole::text FROM pg_catalog.pg_namespace WHERE nspname = 'app') AS owner
          FROM pg_catalog.pg_roles r WHERE r.rolname = 'tadayo_app'`;
      expect(role).toEqual({ login: true, super: false, bypass: false, owner: "tadayo_app" });
    } finally {
      await putCiPasswordBack();
    }
  }, 60_000);

  it("puts the password in no argument and no environment variable psql is given, only the verifier in its input", async () => {
    const seen: string[] = [];
    const spy: Spawn = (command, args, options) => {
      seen.push(JSON.stringify([command, args, options?.env]));
      return spawnProcess(command, args, options);
    };
    try {
      await runBootstrap({ pgEnv, password: NEW_PASSWORD, file: FILE, spawn: spy });
    } finally {
      await putCiPasswordBack();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain(NEW_PASSWORD);
    expect(seen[0]).not.toContain("SCRAM-SHA-256");
  }, 60_000);

  it("fails with what psql says and nothing secret when the file fails, and keeps nothing of it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tadayo-bootstrap-"));
    const bad = join(dir, "bootstrap.sql");
    // The role is made and the password set (with the sent verifier, quoted), then the file fails.
    await writeFile(
      bad,
      "\\set ON_ERROR_STOP on\nBEGIN;\nCREATE ROLE tadayo_ops_must_not_stay LOGIN;\nALTER ROLE tadayo_app WITH PASSWORD :'app_password';\nSELECT 1/0;\nCOMMIT;\n",
    );
    let message = "";
    try {
      await runBootstrap({ pgEnv, password: NEW_PASSWORD, file: bad, spawn: spawnProcess });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toMatch(/division by zero/);
    expect(message).not.toContain(NEW_PASSWORD);
    expect(message).not.toContain("SCRAM-SHA-256");
    const [left] = await admin<
      { n: string }[]
    >`SELECT count(*)::text AS n FROM pg_catalog.pg_roles WHERE rolname = 'tadayo_ops_must_not_stay'`;
    expect(left?.n).toBe("0");
    expect(await logsIn(CI_PASSWORD)).toBe(true);
  }, 60_000);
});
