// The database link's TLS, made for real: postgres.js, given what every link to the pooler is given
// (`tlsPinnedTo`, packages/domain/src/db/ssl.ts), against a front end on loopback that answers its
// SSLRequest as Supabase's pooler does and records whether a StartupMessage (the user name, then
// the password) ever reached it. No network and no database: the certificates are made by openssl
// in a temporary folder when the file starts, shaped like the pooler's (a root, an intermediate
// without Key Usage, as supabase/supabase issue #50862 reports of Supabase's, and a leaf), and the
// test's root stands in for Supabase's (docs/plans/api-b0-pooler-ca.md, section 4).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TLSSocket } from "node:tls";
import { tlsPinnedTo } from "@tadayo/domain";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Postgres's SSLRequest: a length of 8, then this code (the protocol's "Message Formats").
const SSL_REQUEST_CODE = 80877103;

let dir = "";
const file = (name: string) => readFileSync(join(dir, name), "utf8");

/** A certificate and its key, by openssl: self-signed unless an issuer is named. */
function make(name: string, subject: string, extensions: readonly string[], issuer?: string): void {
  const signed = issuer === undefined ? [] : ["-CA", join(dir, `${issuer}.crt`), "-CAkey", join(dir, `${issuer}.key`)];
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-config",
      join(dir, "openssl.cnf"),
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
      "-nodes",
      "-keyout",
      join(dir, `${name}.key`),
      "-out",
      join(dir, `${name}.crt`),
      "-days",
      "2",
      "-subj",
      `/CN=${subject}`,
      ...signed,
      ...extensions.flatMap((extension) => ["-addext", extension]),
    ],
    { stdio: "ignore" },
  );
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tadayo-tls-"));
  // No configuration's own extensions: each certificate has only the ones named here.
  writeFileSync(join(dir, "openssl.cnf"), "[req]\ndistinguished_name = dn\n[dn]\n");
  const ca = ["basicConstraints=critical,CA:TRUE", "keyUsage=keyCertSign,cRLSign"];
  const leaf = (name: string) => [`subjectAltName=DNS:${name}`, "basicConstraints=CA:FALSE"];
  make("root", "Test Root", ca);
  make("intermediate", "Test Intermediate", ["basicConstraints=critical,CA:TRUE"], "root");
  make("leaf", "localhost", leaf("localhost"), "intermediate");
  make("elsewhere", "aws-0-us-east-1.pooler.supabase.com", leaf("aws-0-us-east-1.pooler.supabase.com"), "intermediate");
  make("other-root", "Test Root", ca);
  make("impostor", "localhost", leaf("localhost"), "other-root");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface Heard {
  /** "tls" when a StartupMessage came inside TLS; "plain" when one came in the clear. */
  startup?: "tls" | "plain";
}

/** What a socket's `data` gives, as bytes. */
const bytes = (data: string | Buffer): Buffer => (typeof data === "string" ? Buffer.from(data) : data);

/**
 * A front end on loopback. Given a certificate, it answers the SSLRequest with `S` and serves that
 * chain; given none, it answers `N`, as a server that offers no TLS does, and listens for what
 * the client sends next.
 */
async function frontEnd(chain?: { readonly cert: string; readonly key: string }): Promise<{
  readonly port: number;
  readonly heard: Heard;
  /** Settles once a StartupMessage has come: the server never answers it, so a client would wait. */
  readonly started: Promise<void>;
  readonly close: () => void;
}> {
  const heard: Heard = {};
  const started = Promise.withResolvers<undefined>();
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.once("data", (data) => {
      const first = bytes(data);
      if (first.length < 8 || first.readInt32BE(4) !== SSL_REQUEST_CODE) {
        heard.startup = "plain";
        started.resolve(undefined);
        socket.destroy();
        return;
      }
      if (chain === undefined) {
        socket.write("N");
        // A StartupMessage names its `user`; a TLS ClientHello starts 0x16 and names none.
        socket.once("data", (next) => {
          if (bytes(next).includes(Buffer.from("user\0"))) {
            heard.startup = "plain";
            started.resolve(undefined);
          }
          socket.destroy();
        });
        return;
      }
      socket.write("S");
      const secure = new TLSSocket(socket, { isServer: true, cert: chain.cert, key: chain.key });
      secure.on("error", () => undefined);
      secure.once("data", () => {
        heard.startup = "tls";
        started.resolve(undefined);
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the front end has no port");
  return {
    port: address.port,
    heard,
    started: started.promise,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

/**
 * Connects as the pooler's clients do, trusting `root` alone, and says how it ended: the driver's
 * error code, or "started" once the server has heard a StartupMessage (which it never answers).
 */
async function connectTo(
  server: { readonly port: number; readonly started: Promise<void> },
  root: string,
): Promise<string> {
  const sql = postgres({
    host: "localhost",
    port: server.port,
    username: "tadayo_app",
    password: "a-password-that-must-not-leave",
    database: "postgres",
    ssl: tlsPinnedTo(root),
    max: 1,
    connect_timeout: 5,
    onnotice: () => undefined,
  });
  try {
    return await Promise.race([sql`select 1`.then(() => "answered"), server.started.then(() => "started")]);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    return error instanceof Error ? error.message : "an error that isn't one";
  } finally {
    await sql.end({ timeout: 0 });
  }
}

const served = (...names: readonly string[]) => ({
  cert: names.map((name) => file(`${name}.crt`)).join(""),
  key: file(`${names[0] ?? ""}.key`),
});

describe("a link pinned to a root, made through postgres.js", { timeout: 30_000 }, () => {
  it("sends its StartupMessage, inside TLS, to a server whose chain ends at the root and whose name is the host", async () => {
    const server = await frontEnd(served("leaf", "intermediate"));
    try {
      expect(await connectTo(server, file("root.crt"))).toBe("started");
      expect(server.heard.startup).toBe("tls");
    } finally {
      server.close();
    }
  });

  for (const [what, chain, refusal] of [
    ["a chain from another root of the same name", ["impostor"], /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED/],
    ["the right root, and a name that isn't the host", ["elsewhere", "intermediate"], /ERR_TLS_CERT_ALTNAME_INVALID/],
    ["the leaf alone, without the intermediate it hangs from", ["leaf"], /UNABLE_TO_VERIFY_LEAF_SIGNATURE/],
  ] as const) {
    it(`refuses ${what}, before any user name or password leaves`, async () => {
      for (const loosened of [false, true]) {
        // The check is set, not left to the environment: Node's NODE_TLS_REJECT_UNAUTHORIZED=0
        // would turn off a check that `rejectUnauthorized` doesn't insist on.
        if (loosened) vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
        const server = await frontEnd(served(...chain));
        try {
          expect(
            await connectTo(server, file("root.crt")),
            `NODE_TLS_REJECT_UNAUTHORIZED=0: ${String(loosened)}`,
          ).toMatch(refusal);
          expect(server.heard.startup).toBeUndefined();
        } finally {
          server.close();
        }
      }
    });
  }

  it("never falls back to the clear when the server offers no TLS", async () => {
    const server = await frontEnd();
    try {
      expect(await connectTo(server, file("root.crt"))).not.toMatch(/answered|started/);
      expect(server.heard.startup).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
