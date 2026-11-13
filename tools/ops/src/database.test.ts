// The `ops` scripts' connection to the database: the driver is given the parts the guard checked,
// not the string (docs/plans/api-b0-deploy.md, section 4; T52, T56). The client is built and never
// connected, and its parsed options are read, so what is checked is what postgres.js would do. No
// test here reaches a database.

import { readFileSync } from "node:fs";
import { SUPABASE_ROOT_CA_PATH } from "@tadayo/domain";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAKE_FLY_TOKEN } from "../test/fake-fly.ts";
import { certificateRefusal, connectionOptions, connectToDev } from "./database.ts";
import { devDatabaseUrl, pgEnvOf, type DevDatabaseUrl } from "./environment.ts";
import { REDACTED, redactor } from "./output.ts";

const DEV = "rhsycmycocbzakrydahi";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const WRITTEN = "p%40ss%2Fword-with-32-characters-or-more";
const DECODED = "p@ss/word-with-32-characters-or-more";

const dev = (port = ":5432"): DevDatabaseUrl =>
  devDatabaseUrl(`postgresql://tadayo_app.${DEV}:${WRITTEN}@${POOLER}${port}/postgres`, DEV);

const nowhere = () => undefined;

// What every link to the pooler gives the driver: Supabase's root alone, and the check insisted on.
const PINNED = { ca: [readFileSync(SUPABASE_ROOT_CA_PATH, "utf8")], rejectUnauthorized: true };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("connectionOptions", () => {
  it("names every part of the connection, decoded, with TLS checked against Supabase's root, one connection and a time limit", () => {
    const options = connectionOptions(dev(), (line) => line, nowhere);
    expect(options).toMatchObject({
      host: POOLER,
      port: 5432,
      username: `tadayo_app.${DEV}`,
      password: DECODED,
      database: "postgres",
      ssl: PINNED,
      max: 1,
      connect_timeout: 20,
    });
  });

  it("gives the driver the same host, port, user, password and database as psql is given", () => {
    for (const url of [dev(), dev("")]) {
      const options = connectionOptions(url, (line) => line, nowhere);
      const psql = pgEnvOf(url);
      expect(psql["PGHOST"]).toBe(options.host);
      expect(psql["PGPORT"]).toBe(String(options.port));
      expect(psql["PGUSER"]).toBe(options.username);
      expect(psql["PGPASSWORD"]).toBe(options.password);
      expect(psql["PGDATABASE"]).toBe(options.database);
    }
  });

  it("makes a port-less string the session pooler's port, 5432, and the driver reads no variable for it", async () => {
    // postgres.js takes a missing port from PGPORT, and its host, user and database from the string
    // or the environment; every one is named here, so none is read from the environment.
    vi.stubEnv("PGPORT", "6543");
    vi.stubEnv("PGHOST", "evil.example");
    vi.stubEnv("PGUSER", "postgres");
    vi.stubEnv("PGDATABASE", "other");
    vi.stubEnv("PGSSLMODE", "disable");
    vi.stubEnv("PGSSL", "false");
    const sql = postgres(connectionOptions(dev(""), (line) => line, nowhere));
    const { host, port, user, database, ssl } = sql.options;
    await sql.end();
    expect({ host, port, user, database, ssl }).toEqual({
      host: [POOLER],
      port: [5432],
      user: `tadayo_app.${DEV}`,
      database: "postgres",
      ssl: PINNED,
    });
  });

  it("is given a string whose password holds an `@` and a comma, and still dials the pooler and nowhere else", async () => {
    // postgres.js, given this string, would take the host after the first `@` and decode it into a list.
    const given = `postgresql://tadayo_app.${DEV}:x@other.example%2C@${POOLER}:5432/postgres`;
    const sql = postgres(connectionOptions(devDatabaseUrl(given, DEV), (line) => line, nowhere));
    const { host, port } = sql.options;
    await sql.end();
    expect(host).toEqual([POOLER]);
    expect(port).toEqual([5432]);
  });

  it("says Postgres's warnings through the redactor, and its routine notices not at all", () => {
    const written: string[] = [];
    const redact = redactor({ FLY_API_TOKEN: FAKE_FLY_TOKEN });
    const { onnotice } = connectionOptions(dev(), redact, (line) => written.push(line));
    if (onnotice === undefined) throw new Error("no notice handler");
    onnotice({ severity: "WARNING", message: `the setting ${FAKE_FLY_TOKEN} isn't allowed` });
    onnotice({ severity: "NOTICE", message: "relation already exists, skipping" });
    onnotice({ severity: "LOG", message: "a routine line" });
    onnotice({ severity: "DEBUG", message: "another" });
    expect(written).toEqual([`ops: WARNING: the setting ${REDACTED} isn't allowed`]);
  });
});

describe("connectToDev", () => {
  it("builds the client every script is given from connectionOptions, with TLS checked against Supabase's root", async () => {
    // main.ts gives the scripts this client: read without connecting.
    vi.stubEnv("PGSSLMODE", "disable");
    const sql = connectToDev(dev(), (line) => line, nowhere);
    const { host, port, user, database, ssl, max } = sql.options;
    await sql.end();
    expect({ host, port, user, database, ssl, max }).toEqual({
      host: [POOLER],
      port: [5432],
      user: `tadayo_app.${DEV}`,
      database: "postgres",
      ssl: PINNED,
      max: 1,
    });
  });
});

describe("certificateRefusal", () => {
  it("names the pin's refusal of a certificate by Node's code, and says nothing was sent", () => {
    for (const code of [
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "CERT_HAS_EXPIRED",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ]) {
      expect(certificateRefusal(Object.assign(new Error("Node's words"), { code })), code).toBe(
        `the server's certificate didn't check out against Supabase's root (${code}), so no user name or password was sent. docs/LIMITATIONS.md's row on what would break the pin says what to do`,
      );
    }
  });

  it("leaves any other failure to the driver's own words", () => {
    for (const thrown of [
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("password authentication failed"), { code: "28P01" }),
      new Error("no code"),
      { code: 42 },
      "SELF_SIGNED_CERT_IN_CHAIN",
      undefined,
    ]) {
      expect(certificateRefusal(thrown), typeof thrown).toBeUndefined();
    }
  });
});
