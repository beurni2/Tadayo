// What an `ops` script may print (T52, T56): every line goes through the redactor, which holds
// each secret the environment gives and the shapes of the ones it doesn't. The scripts never print
// a value on purpose; this catches a message that quotes one by accident, such as a driver's error
// or a child process's output.

import { describe, expect, it } from "vitest";
import { failureText, noticeLine, redactor, SECRET_VARIABLES } from "./output.ts";

// The made-up secrets are built from pieces, so that a secret scanner reading this file never sees one whole.
const part = (...pieces: string[]) => pieces.join("");
const JWT = part(
  "eyJhbGciOiJFUzI1NiIsImtpZCI6IjEyMzQ1NiJ9",
  ".",
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ",
  ".",
  "c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmU",
);
const ENV = {
  DATABASE_URL:
    "postgresql://tadayo_app.rhsycmycocbzakrydahi:p%40ss%2Fw0rd-of-many-characters@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
  DATABASE_ADMIN_URL:
    "postgresql://postgres.rhsycmycocbzakrydahi:admin-password-of-many-chars@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
  DATABASE_APP_PASSWORD: "app-password-of-more-than-thirty-two-chars",
  SUPABASE_SERVICE_KEY: part("sb_", "secret_", "abcdefghijklmnopqrstuvwxyz0123456789"),
  SUPABASE_ACCESS_TOKEN: part("sb", "p_", "0123456789abcdef0123456789abcdef01234567"),
  FLY_API_TOKEN: part("Fly", "V1 fm2_", "lJPECAAAAAAAB0Wxabcdef0123456789abcdef0123456789", ",fm2_other"),
  GITHUB_TOKEN: part("gh", "s_", "0123456789abcdefghijklmnopqrstuvwxyz"),
  // Public values stay: the project's URL and the publishable key are public by design (T53).
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_5kJcQ8JCyWiHHMGjucf00w_8ehpABvL",
  SUPABASE_URL: "https://rhsycmycocbzakrydahi.supabase.co",
};

describe("redactor", () => {
  const redact = redactor(ENV);

  it("holds back the value of every secret variable, wherever a line has it", () => {
    for (const name of SECRET_VARIABLES) {
      const value = (ENV as Record<string, string | undefined>)[name];
      if (value === undefined) continue;
      for (const line of [value, `before ${value} after`, `"${value}"`, `${name}=${value}`, `x${value}x`]) {
        const out = redact(line);
        expect(out, `${name}: ${line}`).not.toContain(value);
        expect(out).toContain("[redacted]");
      }
    }
  });

  it("holds back the value of each of the seven secret variables on its own, whatever it looks like", () => {
    // The names are written out here, not read from the list that is under test, so that a name taken
    // out of it is seen. The values are shaped like nothing the patterns know, so only the variable holds them back.
    for (const name of [
      "DATABASE_URL",
      "DATABASE_ADMIN_URL",
      "DATABASE_APP_PASSWORD",
      "SUPABASE_SERVICE_KEY",
      "SUPABASE_ACCESS_TOKEN",
      "FLY_API_TOKEN",
      "GITHUB_TOKEN",
    ]) {
      const value = `unshaped-${name.toLowerCase()}-value-0123456789`;
      expect(redactor({ [name]: value })(`before ${value} after`), name).toBe("before [redacted] after");
    }
  });

  it("holds back a value of eight characters and leaves a value of seven alone", () => {
    expect(redactor({ FLY_API_TOKEN: "abcdefgh" })("the abcdefgh is out")).toBe("the [redacted] is out");
    expect(redactor({ FLY_API_TOKEN: "abcdefg" })("the abcdefg is out")).toBe("the abcdefg is out");
  });

  it("holds back a longer value whole when a shorter one is inside it", () => {
    // Taken in the order of the variables, the shorter would go first and leave eight of the longer's characters showing.
    const redact = redactor({ DATABASE_APP_PASSWORD: "bbbbbbbb", FLY_API_TOKEN: "aaaaaaaabbbbbbbb" });
    expect(redact("the token aaaaaaaabbbbbbbb and the password bbbbbbbb")).toBe(
      "the token [redacted] and the password [redacted]",
    );
  });

  it("holds back a connection string's password, as it is written in the string and decoded", () => {
    for (const [line, expected] of [
      [
        "password authentication failed for user tadayo_app, with p%40ss%2Fw0rd-of-many-characters",
        "password authentication failed for user tadayo_app, with [redacted]",
      ],
      ["the password was p@ss/w0rd-of-many-characters", "the password was [redacted]"],
      ["admin-password-of-many-chars", "[redacted]"],
    ] as const) {
      expect(redact(line), line).toBe(expected);
    }
  });

  it("holds back what looks like a token whether or not the environment gave it: a JWT, a Supabase secret key, a SCRAM verifier, a Fly token", () => {
    // Base64 as Postgres writes it: with + and / in it.
    const verifier = "SCRAM-SHA-256$4096:c2FsdHNhbHRzYWx0c2FsdA==$c3Rv+mVka2V5c3RvcmVkaw==:c2Vy/mVya2V5c2VydmVyaw==";
    const redact = redactor({});
    for (const [line, expected] of [
      [`Authorization: Bearer ${JWT}`, "Authorization: Bearer [redacted]"],
      [part("apikey sb_", "secret_", "zzzzzzzzzzzzzzzzzzzzzzzz was refused"), "apikey [redacted] was refused"],
      [
        `ALTER ROLE tadayo_app WITH LOGIN PASSWORD '${verifier}'`,
        "ALTER ROLE tadayo_app WITH LOGIN PASSWORD '[redacted]'",
      ],
      [part("token Fly", "V1 fm2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,fm2_bbbbbbbb failed"), "token [redacted] failed"],
      [part("token sb", "p_ffffffffffffffffffffffffffffffffffffffff"), "token [redacted]"],
      [part("token gh", "s_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"), "token [redacted]"],
      // Each one in a line, not only the first.
      [`first '${verifier}' and then '${verifier}'`, "first '[redacted]' and then '[redacted]'"],
    ] as const) {
      expect(redact(line), line).toBe(expected);
    }
  });

  it("holds back a JWT whose parts have the dashes and underscores of base64url", () => {
    const jwt = part("eyJhbGciOiJF", "-_", ".", "eyJzdWIiOiJ4", "-_", ".", "c2lnbmF0dXJl", "-_");
    expect(redactor({})(`Bearer ${jwt} was refused`)).toBe("Bearer [redacted] was refused");
  });

  it("holds back a token of each shape the patterns know, with an empty environment", () => {
    const redact = redactor({});
    const tokens = [
      // GitHub's: ghp_ (personal), gho_ (OAuth), ghu_ (user), ghs_ (server), ghr_ (refresh), and the fine-grained one.
      ...["p", "o", "u", "s", "r"].map((kind) => part("gh", kind, "_", "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789")),
      part("github", "_pat_", "11ABCDEFG0abcdefghij_klmnopqrstuvwxyz0123456789"),
      // Fly's: whole, and the pieces it is made of, with and without the word before them.
      part("Fly", "V1 opaquetokenwithnofm", "twopiecesinit+/=,-"),
      part("fm", "1_", "abcdefghijklmnop+/=-abcdefgh"),
      part("fm", "2_", "abcdefghijklmnop+/=-abcdefgh"),
      // Supabase's.
      part("sb_", "secret_", "abcdefghijklmnop-qrstuvwxyz_0123456789"),
      part("sb", "p_", "0123456789abcdef0123456789abcdef01234567"),
      JWT,
    ];
    for (const token of tokens) {
      // Every one in the line, not only the first.
      expect(redact(`error: ${token}: refused, and ${token}.`), token).toBe(
        "error: [redacted]: refused, and [redacted].",
      );
    }
  });

  it("holds back a Fly token's whole string, however the pieces after the word are joined", () => {
    const line = part("Authorization: Fly", "V1 fm2_aaaaaaaaaaaaaaaaaaaaaaaa,fm2_bbbbbbbb,x+y/z=-w was refused");
    expect(redactor({})(line)).toBe("Authorization: [redacted] was refused");
  });

  it("holds back the user and password of any connection string in a line, even one the environment never held", () => {
    const redact = redactor({});
    expect(redact("could not connect to postgresql://someone:hunter2-hunter2@db.example:5432/postgres: refused")).toBe(
      "could not connect to postgresql://[redacted]@db.example:5432/postgres: refused",
    );
    // A scheme is any letters; capitals are the same ones.
    expect(redact("POSTGRES://someone:hunter2-hunter2@db.example/postgres")).toBe(
      "POSTGRES://[redacted]@db.example/postgres",
    );
    expect(redact("a URL with no user in it, https://db.example/postgres, stays")).toBe(
      "a URL with no user in it, https://db.example/postgres, stays",
    );
    // Each one in a line, not only the first.
    expect(redact("postgresql://a:b1b1b1b1@h1.example/x and then postgresql://c:d2d2d2d2@h2.example/y")).toBe(
      "postgresql://[redacted]@h1.example/x and then postgresql://[redacted]@h2.example/y",
    );
  });

  it("holds back a connection string's password that isn't percent-encoded properly, as it is written", () => {
    // %zz isn't an escape, so decoding the password fails: the written form is still held back.
    const redact = redactor({ DATABASE_URL: "postgresql://someone:100%25%zz-password@db.example.test:5432/postgres" });
    expect(redact("psql: FATAL: password 100%25%zz-password failed")).toBe("psql: FATAL: password [redacted] failed");
  });

  it("leaves the public values and ordinary words alone", () => {
    for (const line of [
      ENV.SUPABASE_URL,
      ENV.SUPABASE_PUBLISHABLE_KEY,
      "migrate: applied 0001_close_data_api.sql",
      "the table app.users has no row-level security",
      "dev clock reads 2026-11-12T06:59:50Z",
    ]) {
      expect(redact(line)).toBe(line);
    }
  });

  it("does not blank ordinary text because a short or empty value is set", () => {
    const small = redactor({ DATABASE_APP_PASSWORD: "", FLY_API_TOKEN: "abc", GITHUB_TOKEN: undefined });
    expect(small("abc is not a secret worth a hole in every line, nor is the empty string")).toBe(
      "abc is not a secret worth a hole in every line, nor is the empty string",
    );
  });

  it("does not blank ordinary text because a connection string has no password, or one too short to be one", () => {
    // The strings are long enough to be held back whole; the password inside them is empty, or three characters.
    const redact = redactor({
      DATABASE_URL: "postgresql://someone@db.example.test:5432/postgres",
      DATABASE_ADMIN_URL: "postgresql://someone:abc@db.example.test:5432/postgres",
    });
    expect(redact("abc and ordinary words, and a line with nothing in it")).toBe(
      "abc and ordinary words, and a line with nothing in it",
    );
    expect(redact("could not connect to postgresql://someone:abc@db.example.test:5432/postgres")).toBe(
      "could not connect to [redacted]",
    );
  });
});

describe("failureText", () => {
  it("is an error's message and never its stack", () => {
    const error = new Error("couldn't list tadayo-api-dev's Machines");
    expect(error.stack).toContain("\n    at ");
    expect(failureText(error)).toBe("couldn't list tadayo-api-dev's Machines");
  });

  it("is plain words for anything that isn't an error, and none of what was thrown", () => {
    for (const thrown of ["a string with a secret in it", undefined, null, 42, { message: "looks like one" }]) {
      expect(failureText(thrown)).toBe("ops: the script failed");
    }
  });
});

describe("noticeLine", () => {
  it("says nothing of Postgres's routine notices: NOTICE, DEBUG and LOG", () => {
    for (const severity of ["NOTICE", "DEBUG", "LOG"]) {
      expect(noticeLine({ severity, message: 'relation "x" already exists, skipping' }), severity).toBeUndefined();
    }
  });

  it("says a warning, and anything worse, with its severity and its words", () => {
    for (const severity of ["WARNING", "INFO", "ERROR", "FATAL", "PANIC"]) {
      expect(noticeLine({ severity, message: "something to look at" }), severity).toBe(
        `ops: ${severity}: something to look at`,
      );
    }
  });
});
