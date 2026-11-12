/// <reference lib="esnext.temporal" />
// The worker's connection to Postgres, made as the API's is (services/api/src/connection.test.ts,
// which has the longer table): TLS for every host but a plainly written loopback one, whatever the
// string says, since the Fly secret is the pooler's string with no `sslmode` and nothing may depend
// on one (TECH-DESIGN sections 5 and 7). Asked of the client it builds, never connected.

import { describe, expect, it } from "vitest";
import { connect } from "./connection.ts";

const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const POOLER_URL = `postgresql://tadayo_app.abcdefghijklmnopqrst:a-password-of-the-made-up-string@${POOLER}:5432/postgres`;

async function optionsOf(url: string) {
  const sql = connect(url);
  const { ssl, host, port } = sql.options;
  await sql.end();
  return { ssl, host, port };
}

describe("connect", () => {
  it("requires TLS for Supabase's pooler, though the string says nothing of it, and the string can't switch it off", async () => {
    expect(await optionsOf(POOLER_URL)).toEqual({ ssl: "require", host: [POOLER], port: [5432] });
    expect((await optionsOf(`${POOLER_URL}?sslmode=disable`)).ssl).toBe("require");
  });

  it("asks for no TLS of a plainly written loopback host, and requires it of one the driver reads differently", async () => {
    expect((await optionsOf("postgres://tadayo_app:a-password@127.0.0.1:5432/postgres")).ssl).toBe(false);
    expect((await optionsOf("postgres://tadayo_app:x@evil.example%2C@localhost:5432/postgres")).ssl).toBe("require");
  });
});
