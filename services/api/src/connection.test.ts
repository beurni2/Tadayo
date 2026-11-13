/// <reference lib="esnext.temporal" />
// The API's connection to Postgres: what postgres.js would do with the URL the configuration gives,
// asked of the client it builds and never connected (nothing here needs a database; the database
// side is tests/src/db/connection.test.ts). TLS is required for every host but a plainly written
// loopback one, whatever the string or the environment says (TECH-DESIGN sections 5 and 7): the
// Fly secret is the pooler's string with no `sslmode`, and nothing may depend on one. That TLS checks
// the pooler's chain against Supabase's root and its name (docs/plans/api-b0-pooler-ca.md); that the
// driver then does so is connection-tls.test.ts.

import { readFileSync } from "node:fs";
import { SUPABASE_ROOT_CA_PATH } from "@tadayo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect } from "./connection.ts";

const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const REF = "abcdefghijklmnopqrst";
const POOLER_URL = `postgresql://tadayo_app.${REF}:a-password-of-the-made-up-string@${POOLER}:5432/postgres`;

// What every link to the pooler gives the driver: Supabase's root alone, and the check insisted on.
const PINNED = { ca: [readFileSync(SUPABASE_ROOT_CA_PATH, "utf8")], rejectUnauthorized: true };

/** What the client built for `url` would ask of the driver, read without connecting. */
async function optionsOf(url: string) {
  const sql = connect(url);
  const { ssl, host, port } = sql.options;
  await sql.end();
  return { ssl, host, port };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("connect", () => {
  it("requires TLS checked against Supabase's root for the pooler, though the string says nothing of it", async () => {
    expect(await optionsOf(POOLER_URL)).toEqual({ ssl: PINNED, host: [POOLER], port: [5432] });
  });

  it("requires TLS for any other host that isn't loopback, and the string can't switch it off", async () => {
    for (const url of [
      "postgres://someone:a-password@db.example.test:5432/postgres",
      `${POOLER_URL}?sslmode=disable`,
      `${POOLER_URL}?ssl=false`,
      `${POOLER_URL}?sslmode=false`,
    ]) {
      expect((await optionsOf(url)).ssl, url).toEqual(PINNED);
    }
  });

  it("requires TLS whatever the environment says, which postgres.js reads for the options it isn't given", async () => {
    vi.stubEnv("PGSSL", "false");
    vi.stubEnv("PGSSLMODE", "disable");
    expect((await optionsOf(POOLER_URL)).ssl).toEqual(PINNED);
  });

  it("asks for no TLS of a plainly written loopback host, as CI's service and a developer's Postgres have none", async () => {
    for (const url of [
      "postgresql://tadayo_app:a-password@localhost:5432/postgres",
      "postgres://tadayo_app:a-password@127.0.0.1:5432/postgres",
      "postgres://tadayo_app:a-password@[::1]:5432/postgres",
    ]) {
      expect((await optionsOf(url)).ssl, url).toBe(false);
    }
  });

  it("leaves a loopback string its own say: it can still ask for TLS itself", async () => {
    expect((await optionsOf("postgres://tadayo_app:a-password@localhost:5432/postgres?sslmode=require")).ssl).toBe(
      "require",
    );
  });

  it("requires TLS of a string whose host postgres.js and `new URL` read differently, which dials the first host", async () => {
    // postgres.js dials `evil.example` here, though `new URL` says the host is `localhost`: a string
    // the two can read differently is never plain loopback.
    const tricky = await optionsOf("postgres://tadayo_app:x@evil.example%2C@localhost:5432/postgres");
    expect(tricky.host).toEqual(["evil.example", "@localhost"]);
    expect(tricky.ssl).toEqual(PINNED);
  });
});
