/// <reference lib="esnext.temporal" />
// The worker's connection to Postgres, made as the API's is (services/api/src/connection.test.ts,
// which has the longer table): TLS for every host but a plainly written loopback one, whatever the
// string says, since the Fly secret is the pooler's string with no `sslmode` and nothing may depend
// on one (TECH-DESIGN sections 5 and 7), checked against Supabase's root (docs/plans/api-b0-pooler-ca.md).
// Asked of the client it builds, never connected.

import { readFileSync } from "node:fs";
import { SUPABASE_ROOT_CA_PATH } from "@tadayo/domain";
import { describe, expect, it, vi } from "vitest";
import { connect, WORKER_POOL } from "./connection.ts";

const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const POOLER_URL = `postgresql://tadayo_app.abcdefghijklmnopqrst:a-password-of-the-made-up-string@${POOLER}:5432/postgres`;

// What every link to the pooler gives the driver: Supabase's root alone, and the check insisted on.
const PINNED = { ca: [readFileSync(SUPABASE_ROOT_CA_PATH, "utf8")], rejectUnauthorized: true };

async function optionsOf(url: string) {
  const sql = connect(url);
  const { ssl, host, port } = sql.options;
  await sql.end();
  return { ssl, host, port };
}

describe("connect", () => {
  it("opens at most two connections, one for each of its loops, a size set on purpose for the session pooler (the outside audit's A7)", async () => {
    // Generation and the outbox each run one transaction at a time (main.ts; docs/plans/api-b2-db-limits.md, section 0.5).
    expect(WORKER_POOL).toBe(2);
    const sql = connect(POOLER_URL);
    expect(sql.options.max).toBe(2);
    await sql.end();
  });

  it("prints no notice Postgres sends: a notice can quote a row's values (T52)", async () => {
    const sql = connect("postgres://tadayo_app:a-password@127.0.0.1:5432/postgres");
    const printed = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(sql.options.onnotice).not.toBe(console.log);
      sql.options.onnotice({ severity: "NOTICE", message: "mem_secret's day" });
      expect(printed).not.toHaveBeenCalled();
    } finally {
      printed.mockRestore();
      await sql.end();
    }
  });

  it("requires TLS checked against Supabase's root for the pooler, though the string says nothing of it, and the string can't switch it off", async () => {
    expect(await optionsOf(POOLER_URL)).toEqual({ ssl: PINNED, host: [POOLER], port: [5432] });
    expect((await optionsOf(`${POOLER_URL}?sslmode=disable`)).ssl).toEqual(PINNED);
  });

  it("asks for no TLS of a plainly written loopback host, and requires it of one the driver reads differently", async () => {
    expect((await optionsOf("postgres://tadayo_app:a-password@127.0.0.1:5432/postgres")).ssl).toBe(false);
    expect((await optionsOf("postgres://tadayo_app:x@evil.example%2C@localhost:5432/postgres")).ssl).toEqual(PINNED);
    expect((await optionsOf("postgres://tadayo_app:x@localhost:1#,evil.example:5432/postgres")).ssl).toEqual(PINNED);
  });
});
