// The transport of the database link (TECH-DESIGN sections 5 and 7): what the API and the worker
// give postgres.js besides the connection string. postgres.js asks for TLS only when the string
// says `?sslmode=…` or the process has `PGSSL…` set, and nothing here may depend on a secret that
// somebody pasted into Fly carrying the right query. So TLS is decided in code: required for every
// host but a plainly written loopback one (CI's service and a developer's own Postgres, which have
// none to offer). A loopback string keeps its own say (`?sslmode=require` still asks for TLS).
//
// `require` means encrypted, not authenticated: postgres.js then accepts any certificate. Checking
// Supabase's pooler's certificate needs its chain, which a first run on `dev` will show (a row in
// docs/LIMITATIONS.md).

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
 * What to add to postgres.js's options for `url`: `{ ssl: "require" }` unless the host is a plainly
 * written loopback one. An option given to postgres.js beats the string's own `sslmode`, so a remote
 * string can't switch TLS off (`?sslmode=disable`).
 */
export function transportOptions(url: string): { readonly ssl?: "require" } {
  return isPlainLoopback(url) ? {} : { ssl: "require" };
}
