// The transport of the database link (TECH-DESIGN sections 5 and 7): what the API and the worker
// give postgres.js besides the connection string, and what the `ops` scripts give it and psql
// (tools/ops/src/database.ts, environment.ts). postgres.js asks for TLS only when the string says
// `?sslmode=…` or the process has `PGSSL…` set, and nothing here may depend on a secret that
// somebody pasted into Fly carrying the right query. So TLS is decided in code: required for every
// host but a plainly written loopback one (CI's service and a developer's own Postgres, which have
// none to offer). A loopback string keeps its own say (`?sslmode=require` still asks for TLS).
//
// The TLS checks the server: its chain must end at Supabase's root, the one certificate in
// supabase-root-2021.crt, and its name must be the host dialled (docs/plans/api-b0-pooler-ca.md).
// Encryption alone wouldn't do: whoever answered in the pooler's place would be believed, and
// postgres.js gives its password to a server that asks for it in clear (T56). The root is the file
// Supabase's dashboard links every project to ("Download certificate"); nothing in the environment
// can widen or loosen it, since a `ca` given to Node replaces its whole root store and
// `rejectUnauthorized` is set, not left to NODE_TLS_REJECT_UNAUTHORIZED.

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Supabase's root, as a file: psql takes it so (`PGSSLROOTCERT`), the driver as text. */
export const SUPABASE_ROOT_CA_PATH = fileURLToPath(new URL("./supabase-root-2021.crt", import.meta.url));

/**
 * The SHA-256 of the root's DER, as Node writes it (`X509Certificate.fingerprint256`): Supabase Root
 * 2021 CA, valid to 2031-04-26. Pinned by its content, not its name: Supabase has a second root
 * with the same name and another key (docs/LIMITATIONS.md).
 */
export const SUPABASE_ROOT_CA_SHA256 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

/**
 * Throws unless `pem` is exactly one certificate, and that certificate is the pinned root. So an
 * empty file (which Node would read as "no `ca`" and trust its whole store), a second certificate
 * beside the root, a key, or another root never reaches the driver.
 */
export function checkPinnedRoot(pem: string): void {
  const refused = (why: string) => new Error(`supabase-root-2021.crt isn't Supabase's root: ${why}`);
  const blocks = pem.match(/-----BEGIN [^-]*-----/g) ?? [];
  if (
    blocks.length !== 1 ||
    blocks[0] !== "-----BEGIN CERTIFICATE-----" ||
    !pem.includes("-----END CERTIFICATE-----")
  ) {
    throw refused(`it holds ${String(blocks.length)} PEM blocks, where it must hold one certificate`);
  }
  let fingerprint: string;
  try {
    fingerprint = new X509Certificate(pem).fingerprint256;
  } catch {
    throw refused("it doesn't read as a certificate");
  }
  if (fingerprint !== SUPABASE_ROOT_CA_SHA256) throw refused(`its SHA-256 is ${fingerprint}`);
}

let root: string | undefined;

/** Supabase's root as text, read once from the file beside this one, and checked (checkPinnedRoot). */
export function supabaseRootCa(): string {
  if (root === undefined) {
    const pem = readFileSync(SUPABASE_ROOT_CA_PATH, "utf8");
    checkPinnedRoot(pem);
    root = pem;
  }
  return root;
}

/** What postgres.js's `ssl` takes to trust only `pem` and refuse a server it doesn't vouch for. */
export interface PinnedTls {
  readonly ca: readonly string[];
  readonly rejectUnauthorized: true;
}

/**
 * The TLS options that trust `pem` alone. Nothing else is set: postgres.js copies these over its own
 * `{ socket, servername }`, where servername is the host dialled, so a `servername`, `socket` or
 * `checkServerIdentity` here would replace what it sets and what Node checks the name against.
 */
export function tlsPinnedTo(pem: string): PinnedTls {
  return Object.freeze({ ca: Object.freeze([pem]), rejectUnauthorized: true });
}

/** The TLS of every link to Supabase's pooler: its chain to Supabase's root, and its name. */
export function poolerTls(): PinnedTls {
  return tlsPinnedTo(supabaseRootCa());
}

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/**
 * True only for a connection string whose host, as `new URL` reads it, is exactly one of the
 * loopback names, and which has at most one `@`. postgres.js takes the host after the FIRST `@` and
 * decodes it (so `%2C` becomes a comma and a second host), while `new URL` takes it after the LAST:
 * with two `@` the two could read different hosts, so such a string is never plain, and gets TLS.
 * With one `@` they read the same segment, and a host with a `%` or a `,` in it is no loopback
 * name, so it gets TLS too.
 */
function isPlainLoopback(url: string): boolean {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1];
  if (authority === undefined) return false;
  const at = authority.indexOf("@");
  if (at !== authority.lastIndexOf("@")) return false;
  try {
    return LOOPBACK_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * What to add to postgres.js's options for `url`: `{ ssl: poolerTls() }` unless the host is a plainly
 * written loopback one. An option given to postgres.js beats the string's own `sslmode`, so a remote
 * string can't switch TLS off (`?sslmode=disable`) or loosen it.
 */
export function transportOptions(url: string): { readonly ssl?: PinnedTls } {
  return isPlainLoopback(url) ? {} : { ssl: poolerTls() };
}
