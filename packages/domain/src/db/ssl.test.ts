// The transport of the database link: TLS for every host but a plainly written loopback one, decided
// in code and not by what a pasted secret says (TECH-DESIGN sections 5 and 7). That the driver reads
// the same host these cases do is checked where the driver is, in the API's and the worker's
// connection.test.ts.

import { describe, expect, it } from "vitest";
import { transportOptions } from "./ssl.ts";

const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const REF = "abcdefghijklmnopqrst";
const TLS = { ssl: "require" };

describe("transportOptions", () => {
  it("asks for TLS for Supabase's pooler, and for any other host that isn't loopback", () => {
    for (const url of [
      `postgresql://tadayo_app.${REF}:a-password@${POOLER}:5432/postgres`,
      `postgres://tadayo_app.${REF}:a-password@${POOLER}/postgres`,
      "postgres://someone:a-password@db.example.test:5432/postgres",
      "postgres://someone:a-password@10.0.0.7:5432/postgres",
      "postgres://someone:a-password@[2001:db8::1]:5432/postgres",
      "postgres://someone:a-password@localhost.example.test/postgres",
      "postgres://someone:a-password@127.0.0.1.example.test/postgres",
      "postgres://someone:a-password@0.0.0.0:5432/postgres",
      "postgres://someone:a-password@[::ffff:127.0.0.1]:5432/postgres",
    ]) {
      expect(transportOptions(url), url).toEqual(TLS);
    }
  });

  it("asks for nothing for a plainly written loopback host, which is CI's service and a developer's own", () => {
    for (const url of [
      "postgresql://tadayo_app:a-password@localhost:5432/postgres",
      "postgres://tadayo_app:a-password@127.0.0.1:5432/postgres",
      "postgres://tadayo_app:a-password@127.0.0.1:1/tadayo",
      "postgres://tadayo_app:a-password@[::1]:5432/postgres",
      "postgres://tadayo_app:a-password@LOCALHOST/postgres",
      "postgres://tadayo_app@localhost/postgres",
      "postgres://localhost/postgres",
      "postgres://localhost:5432",
      // A percent sign in the password is before the one `@`, so the host is still plain.
      "postgres://tadayo_app:p%40ss%2Cword@localhost:5432/postgres",
      // The string's own query stays its own business for a loopback host.
      "postgres://tadayo_app:a-password@localhost:5432/postgres?sslmode=require",
    ]) {
      expect(transportOptions(url), url).toEqual({});
    }
  });

  it("treats a string that postgres.js and `new URL` could read differently as remote", () => {
    // postgres.js takes the host after the first `@` and decodes it, `new URL` after the last: the
    // first of these dials `evil.example`, though `new URL` says `localhost`.
    for (const url of [
      "postgres://tadayo_app:x@evil.example%2C@localhost:5432/postgres",
      "postgres://tadayo_app:x@localhost%2Cevil.example/postgres",
      "postgres://tadayo_app:x@localhost,evil.example/postgres",
      "postgres://tadayo_app:x@evil.example,localhost/postgres",
      "postgres://tadayo_app:x@evil.example@localhost:5432/postgres",
      "postgres://tadayo_app:x@localhost@evil.example:5432/postgres",
      "postgres://localhost%2Cevil.example/postgres",
      "postgres://localhost%2C/postgres",
    ]) {
      expect(transportOptions(url), url).toEqual(TLS);
    }
  });

  it("treats a string it can't read, or with no host, as remote", () => {
    for (const url of [
      "",
      "not a url",
      "localhost",
      "//localhost/postgres",
      "postgres://",
      "postgres:///postgres",
      "postgres:///postgres?host=/var/run/postgresql",
      "postgres://tadayo_app:a-password@[::1/postgres",
      "postgres://tadayo_app:a-password@127.0.0.1:notaport/postgres",
    ]) {
      expect(transportOptions(url), url).toEqual(TLS);
    }
  });
});
