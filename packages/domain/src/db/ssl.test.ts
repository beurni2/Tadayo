// The transport of the database link: TLS for every host but a plainly written loopback one, decided
// in code and not by what a pasted secret says (TECH-DESIGN sections 5 and 7), and checked against
// Supabase's root alone (docs/plans/api-b0-pooler-ca.md). That the driver reads the same host these
// cases do, and that the object below makes it check the chain and the name, is checked where the
// driver is: the API's and the worker's connection.test.ts, and services/api/src/connection-tls.test.ts.

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  checkPinnedRoot,
  poolerTls,
  SUPABASE_ROOT_CA_PATH,
  SUPABASE_ROOT_CA_SHA256,
  supabaseRootCa,
  tlsPinnedTo,
  transportOptions,
} from "./ssl.ts";

const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const REF = "abcdefghijklmnopqrst";
// The fingerprint of the root Supabase's dashboard links every project to ("Download certificate":
// supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), written out here
// as well as in ssl.ts, so that changing the pin takes both.
const SUPABASE_ROOT_2021 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";
const ROOT_PEM = readFileSync(new URL("./supabase-root-2021.crt", import.meta.url), "utf8");
const TLS = { ssl: { ca: [ROOT_PEM], rejectUnauthorized: true } };

// Another root, made with openssl for this test (a throwaway: its key wasn't kept).
const OTHER_ROOT = `-----BEGIN CERTIFICATE-----
MIIBmjCCAUCgAwIBAgIUIdhwxkO0qunH41dnN5W4s9m9JOcwCgYIKoZIzj0EAwIw
HDEaMBgGA1UEAwwRTm90IFN1cGFiYXNlJ3MgQ0EwHhcNMjYxMTEzMDE1NDQ5WhcN
MzYxMTEwMDE1NDQ5WjAcMRowGAYDVQQDDBFOb3QgU3VwYWJhc2UncyBDQTBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABBONhqQP+qvdqvFMsyfc9rkzg0jAz9rMiEUr
g9JKlOcak6i4vVHV9ok/pJ/zaxlhLmUJLtaQ61Nn1x8JrkuXhQGjYDBeMB0GA1Ud
DgQWBBRExLHikNGzNvzNKr+x2Tv2bFdUjTAfBgNVHSMEGDAWgBRExLHikNGzNvzN
Kr+x2Tv2bFdUjTAPBgNVHRMBAf8EBTADAQH/MAsGA1UdDwQEAwIBBjAKBggqhkjO
PQQDAgNIADBFAiB+NAZDh7p+3ojEUA0rFnbo/Ah4yLmI3gH2pWdvmlbCDwIhAIBD
YLiGtoQ6xHt1tjw9j6e436pNWUSOjw/Ddz8Ygx3I
-----END CERTIFICATE-----
`;

/** The root with one letter of its signature changed: still a certificate, but not the one pinned. */
function withOneLetterChanged(pem: string): string {
  const lines = pem.split("\n");
  const at = lines.length - 4;
  const line = lines[at] ?? "";
  lines[at] = `${line.slice(0, 10)}${line[10] === "A" ? "B" : "A"}${line.slice(11)}`;
  return lines.join("\n");
}

describe("the pinned root", () => {
  it("is the root Supabase's dashboard gives every project, one certificate, a CA, and the file the pin names", () => {
    expect(SUPABASE_ROOT_CA_SHA256).toBe(SUPABASE_ROOT_2021);
    expect(readFileSync(SUPABASE_ROOT_CA_PATH, "utf8")).toBe(ROOT_PEM);
    expect(ROOT_PEM.match(/-----BEGIN /g)).toHaveLength(1);
    const root = new X509Certificate(ROOT_PEM);
    expect(root.fingerprint256).toBe(SUPABASE_ROOT_2021);
    expect(root.ca).toBe(true);
    expect(root.subject).toContain("CN=Supabase Root 2021 CA");
    expect(root.issuer).toBe(root.subject);
    expect(root.verify(root.publicKey)).toBe(true);
  });

  it("is read once and checked: supabaseRootCa gives the file's text", () => {
    expect(supabaseRootCa()).toBe(ROOT_PEM);
    expect(supabaseRootCa()).toBe(supabaseRootCa());
  });

  it("is checked when it is read, so a file that isn't the root reaches no link", async () => {
    // A fresh copy of the module, which reads another root where the file is.
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => {
      const fs = await importOriginal<typeof import("node:fs")>();
      const readFileSync = ((path: Parameters<typeof fs.readFileSync>[0], options: BufferEncoding) =>
        path === SUPABASE_ROOT_CA_PATH ? OTHER_ROOT : fs.readFileSync(path, options)) as typeof fs.readFileSync;
      return { ...fs, default: { ...fs, readFileSync }, readFileSync };
    });
    try {
      const fresh = await import("./ssl.ts");
      expect(() => fresh.supabaseRootCa()).toThrow(/Supabase's root/);
      expect(() => fresh.poolerTls()).toThrow(/Supabase's root/);
      expect(() => fresh.transportOptions(`postgresql://tadayo_app.${REF}:x@${POOLER}:5432/postgres`)).toThrow(
        /Supabase's root/,
      );
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("refuses anything but exactly that one certificate, so no empty, doubled, widened or other root reaches `ca`", () => {
    expect(() => {
      checkPinnedRoot(ROOT_PEM);
    }).not.toThrow();
    for (const [what, pem] of [
      ["nothing", ""],
      ["only space", " \n\t\n"],
      ["text that isn't PEM", "Supabase Root 2021 CA"],
      ["the root twice", ROOT_PEM + ROOT_PEM],
      ["the root and another", ROOT_PEM + OTHER_ROOT],
      ["another and the root", OTHER_ROOT + ROOT_PEM],
      ["another root", OTHER_ROOT],
      ["the root and a key", `${ROOT_PEM}-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`],
      ["the root cut short", ROOT_PEM.slice(0, 600)],
      ["the root with a letter changed", withOneLetterChanged(ROOT_PEM)],
      ["a line of text before the root", `Supabase Root 2021 CA\n${ROOT_PEM}`],
      [
        "the root under another label, which OpenSSL reads as the same certificate",
        ROOT_PEM.replace("BEGIN CERTIFICATE", "BEGIN TRUSTED CERTIFICATE").replace(
          "END CERTIFICATE",
          "END TRUSTED CERTIFICATE",
        ),
      ],
      ["a certificate's lines around what isn't one", "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n"],
    ] as const) {
      expect(() => {
        checkPinnedRoot(pem);
      }, what).toThrow(/Supabase's root/);
    }
  });
});

describe("tlsPinnedTo and poolerTls", () => {
  it("trusts only the root given, insists on the check, and leaves the name to the driver", () => {
    const tls = tlsPinnedTo(OTHER_ROOT);
    expect(tls).toEqual({ ca: [OTHER_ROOT], rejectUnauthorized: true });
    // postgres.js copies the object over its own `{ socket, servername }`: a key of ours with either
    // name, or a `checkServerIdentity`, would replace what it sets and what Node checks.
    expect(Object.keys(tls).sort()).toEqual(["ca", "rejectUnauthorized"]);
    expect(Object.isFrozen(tls)).toBe(true);
    expect(Object.isFrozen(tls.ca)).toBe(true);
  });

  it("pins Supabase's root for the pooler", () => {
    expect(poolerTls()).toEqual({ ca: [ROOT_PEM], rejectUnauthorized: true });
  });
});

describe("transportOptions", () => {
  it("asks for TLS checked against Supabase's root for the pooler, and for any other host that isn't loopback", () => {
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
    // postgres.js takes the hosts after the first `@`, up to the first `?` or `/`, and decodes them;
    // `new URL` takes the host after the last `@` and stops at a `#`: the first of these dials
    // `evil.example`, though `new URL` says `localhost`.
    for (const url of [
      "postgres://tadayo_app:x@evil.example%2C@localhost:5432/postgres",
      "postgres://tadayo_app:x@localhost%2Cevil.example/postgres",
      "postgres://tadayo_app:x@localhost,evil.example/postgres",
      "postgres://tadayo_app:x@evil.example,localhost/postgres",
      "postgres://tadayo_app:x@evil.example@localhost:5432/postgres",
      "postgres://tadayo_app:x@localhost@evil.example:5432/postgres",
      "postgres://localhost%2Cevil.example/postgres",
      "postgres://localhost%2C/postgres",
      // postgres.js reads the hosts past a `#`, where `new URL` stops: these dial `evil.example` second.
      "postgresql://tadayo_app:x@localhost:1#,evil.example:5432/postgres",
      "postgres://tadayo_app:x@localhost#,evil.example/postgres",
      "postgres://tadayo_app:x@localhost#%2Cevil.example/postgres",
      "postgres://tadayo_app:x@localhost:1#x,evil.example?sslmode=disable",
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
