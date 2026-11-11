// The guard that keeps every `ops` script on `dev` (docs/plans/B0.md, slice 10a; ADR-013, ADR-025;
// T56): a database is `tadayo-dev`'s only if its connection string says so, by the project's
// reference at Supabase's session pooler, and never by a name the caller gives. No test here
// reaches a database.

import { describe, expect, it } from "vitest";
import { DEV_APP, devDatabaseUrl, devProjectRef, pgEnvOf, readVariables } from "./environment.ts";
import { OpsError } from "./ops-error.ts";

const DEV = "rhsycmycocbzakrydahi";
const PROD = "abcdefghijklmnopqrst";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const PASSWORD = "p%40ss%2Fword-with-32-characters-or-more";

function url(parts: { user?: string; host?: string; port?: string; path?: string; rest?: string } = {}): string {
  const { user = `tadayo_app.${DEV}`, host = POOLER, port = ":5432", path = "/postgres", rest = "" } = parts;
  return `postgresql://${user}:${PASSWORD}@${host}${port}${path}${rest}`;
}

describe("devDatabaseUrl: only tadayo-dev's database, by the reference in the connection", () => {
  it("takes the session pooler's string with dev's reference after the user, as Supabase gives it", () => {
    for (const given of [
      url(),
      url({ user: `postgres.${DEV}` }),
      url({ host: "aws-1-us-east-1.pooler.supabase.com" }),
      url({ port: "" }),
      url().replace("postgresql:", "postgres:"),
    ]) {
      expect(devDatabaseUrl(given, DEV)).toBe(given);
    }
  });

  it("refuses another project's reference: prod's string, or dev's reference given as the other's", () => {
    expect(() => devDatabaseUrl(url({ user: `tadayo_app.${PROD}` }), DEV)).toThrow(OpsError);
    expect(() => devDatabaseUrl(url(), PROD)).toThrow(OpsError);
    expect(() => devDatabaseUrl(url({ user: `tadayo_app.${DEV}x` }), DEV)).toThrow(OpsError);
    expect(() => devDatabaseUrl(url({ user: `tadayo_app.x${DEV}` }), DEV)).toThrow(OpsError);
    expect(() => devDatabaseUrl(url({ user: `tadayo_app.${DEV.toUpperCase()}` }), DEV)).toThrow(OpsError);
  });

  it("refuses a connection with no reference to read: a plain role, a local server, any other host", () => {
    for (const given of [
      url({ user: "tadayo_app" }),
      url({ user: "tadayo_app." }),
      url({ user: `.${DEV}` }),
      // The reference must follow a dot: a user that only ends with it isn't routed by it.
      url({ user: `tadayo_app${DEV}` }),
      url({ user: `x${DEV}` }),
      url({ host: "localhost" }),
      url({ host: "127.0.0.1" }),
      url({ host: "evil.example" }),
      // The reference in the user means nothing at a host that isn't Supabase's pooler.
      url({ host: "pooler.supabase.com.evil.example" }),
      url({ host: "evil-pooler.supabase.com" }),
      url({ host: "db.rhsycmycocbzakrydahi.supabase.co" }),
      url({ host: `db.${DEV}.supabase.co`, user: "postgres" }),
      url({ host: `aws-0-us-east-1.pooler.supabase.com.` }),
      url({ host: `aws-0-us-east-1%2Epooler.supabase.com` }),
    ]) {
      expect(() => devDatabaseUrl(given, DEV), given.replace(PASSWORD, "…")).toThrow(OpsError);
    }
  });

  it("refuses the transaction pooler's port, another database, and anything after the path", () => {
    for (const given of [
      url({ port: ":6543" }),
      url({ port: ":5433" }),
      url({ path: "/other" }),
      url({ path: "/" }),
      url({ path: "" }),
      url({ path: "/postgres/extra" }),
      // Query parameters can name another host, user or database (libpq reads them, so does the driver).
      url({ rest: "?host=localhost" }),
      url({ rest: "?user=postgres" }),
      url({ rest: "?options=-c%20search_path%3Dx" }),
      url({ rest: "?sslmode=disable" }),
      url({ rest: "#x" }),
    ]) {
      expect(() => devDatabaseUrl(given, DEV), given.replace(PASSWORD, "…")).toThrow(OpsError);
    }
  });

  it("refuses a second host, another scheme, and text that isn't a URL", () => {
    for (const given of [
      `postgresql://tadayo_app.${DEV}:pw@${POOLER}:5432,localhost:5432/postgres`,
      `postgresql://tadayo_app.${DEV}:pw@localhost,${POOLER}/postgres`,
      `http://tadayo_app.${DEV}:pw@${POOLER}:5432/postgres`,
      `mysql://tadayo_app.${DEV}:pw@${POOLER}:5432/postgres`,
      "",
      "tadayo_app",
      DEV,
      "postgresql://",
    ]) {
      expect(() => devDatabaseUrl(given, DEV), given).toThrow(OpsError);
    }
  });

  it("says it names more than one host, as the string says it, before any parser reads it", () => {
    for (const given of [
      `postgresql://tadayo_app.${DEV}:pw@${POOLER}:5432,localhost:5432/postgres`,
      `postgresql://tadayo_app.${DEV}:pw@localhost,${POOLER}/postgres`,
      `postgres://tadayo_app.${DEV}:pw@${POOLER},${POOLER}/postgres`,
    ]) {
      expect(() => devDatabaseUrl(given, DEV), given).toThrow(/it names more than one host$/);
    }
  });

  it("refuses a reference that isn't a project's: it must be twenty lowercase letters, and it says that", () => {
    for (const bad of ["", "short", `${DEV}0`, DEV.toUpperCase(), `${DEV}.`, " " + DEV, "a".repeat(21)]) {
      expect(() => devDatabaseUrl(url(), bad), bad).toThrow(
        /^SUPABASE_DEV_PROJECT_REF isn't a Supabase project reference/,
      );
    }
  });

  it("never says the string or the reference when it refuses: its messages name variables, not values (T56)", () => {
    for (const [given, ref] of [
      [url({ user: `tadayo_app.${PROD}` }), DEV],
      [url({ host: "evil.example" }), DEV],
      [url(), "bad"],
      ["not a url at all with a secret-looking-token-12345", DEV],
    ] as const) {
      let message = "";
      try {
        devDatabaseUrl(given, ref);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).not.toBe("");
      for (const secret of [PASSWORD, "secret-looking-token-12345", DEV, PROD, "p@ss", "evil.example"]) {
        expect(message).not.toContain(secret);
      }
      expect(message).toMatch(/DATABASE|SUPABASE_DEV_PROJECT_REF/);
    }
  });
});

describe("devProjectRef: a Supabase project's reference is twenty lowercase letters", () => {
  it("takes dev's reference and prod's, as they are", () => {
    expect(devProjectRef(DEV)).toBe(DEV);
    expect(devProjectRef(PROD)).toBe(PROD);
  });

  it("refuses anything shorter, longer or not lowercase letters, by the variable's name and never the value", () => {
    for (const bad of [
      "",
      "short",
      "a",
      `${DEV}0`,
      `${DEV}a`,
      DEV.slice(1),
      DEV.toUpperCase(),
      `${DEV.slice(1)}A`,
      "a-".repeat(10),
      `${DEV}\n`,
      "1".repeat(20),
    ]) {
      let message = "";
      try {
        devProjectRef(bad);
      } catch (error) {
        message = error instanceof OpsError ? error.message : "not an OpsError";
      }
      expect(message, JSON.stringify(bad)).toBe(
        "SUPABASE_DEV_PROJECT_REF isn't a Supabase project reference: twenty lowercase letters",
      );
    }
  });
});

describe("pgEnvOf: the connection as the environment variables psql reads, so no password is on a command line", () => {
  it("decodes the user and the password, and asks for TLS", () => {
    expect(pgEnvOf(devDatabaseUrl(url({ user: `postgres.${DEV}` }), DEV))).toEqual({
      PGHOST: POOLER,
      PGPORT: "5432",
      PGUSER: `postgres.${DEV}`,
      PGPASSWORD: "p@ss/word-with-32-characters-or-more",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
      PGCONNECT_TIMEOUT: "20",
    });
  });

  it("decodes a user that is written with escapes, as the password is", () => {
    const encoded = url({ user: `tadayo%5Fapp.${DEV}` });
    expect(pgEnvOf(devDatabaseUrl(encoded, DEV)).PGUSER).toBe(`tadayo_app.${DEV}`);
  });

  it("gives port 5432 when the string has none", () => {
    expect(pgEnvOf(devDatabaseUrl(url({ port: "" }), DEV)).PGPORT).toBe("5432");
  });
});

describe("readVariables: what a script reads from the environment, by name", () => {
  it("returns the values it asked for", () => {
    expect(readVariables({ A: "1", B: "two", C: "unused" }, ["A", "B"])).toEqual({ A: "1", B: "two" });
  });

  it("names every variable that is missing or empty, and none of the values", () => {
    let message = "";
    try {
      readVariables({ A: "secret-a", B: "", D: "   " }, ["A", "B", "C", "D"]);
    } catch (error) {
      expect(error).toBeInstanceOf(OpsError);
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("B");
    expect(message).toContain("C");
    expect(message).toContain("D");
    expect(message).not.toContain("secret-a");
  });

  it("refuses a value with a space or a line break at either end, as a pasted secret has, by name", () => {
    for (const value of [" x", "x ", "x\n", "\nx", "x\r\n", "\tx"]) {
      let message = "";
      try {
        readVariables({ TOKEN: value }, ["TOKEN"]);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message, JSON.stringify(value)).toMatch(/TOKEN/);
      expect(message).toMatch(/space|line break/);
    }
  });
});

describe("the dev app", () => {
  it("is the one app the scripts act on", () => {
    expect(DEV_APP).toBe("tadayo-api-dev");
  });
});
