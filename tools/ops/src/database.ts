// The `ops` scripts' connection to the database (docs/plans/api-b0-deploy.md, section 4; T52, T56).
// The driver is given the parts the guard checked (`databaseOf`, which `psql` is given too), not
// the string: postgres.js reads a string its own way (it takes the host after the first `@`, takes a
// missing port from `PGPORT`, and reads `?host=`-style parameters), so a string the guard accepted
// could still send the driver somewhere else. With every part named, nothing in the environment
// or in the string picks a host or a port.
//
// TLS is required, as Supabase's session pooler asks, and it checks the pooler: its chain must end at
// Supabase's root and its name must be the host dialled (`poolerTls`, packages/domain/src/db/ssl.ts;
// docs/plans/api-b0-pooler-ca.md).

import { poolerTls } from "@tadayo/domain";
import postgres from "postgres";
import { databaseOf, type DevDatabaseUrl } from "./environment.ts";
import { noticeLine } from "./output.ts";

/**
 * postgres.js's options for a database `devDatabaseUrl` has let through. Postgres's warnings go to
 * `write`, through `redact`, and its routine notices go nowhere.
 */
export function connectionOptions(
  url: DevDatabaseUrl,
  redact: (line: string) => string,
  write: (line: string) => void,
): postgres.Options<Record<string, never>> {
  const { host, port, user, password, database } = databaseOf(url);
  return {
    host,
    port,
    username: user,
    password,
    database,
    max: 1,
    ssl: poolerTls(),
    connect_timeout: 20,
    onnotice: (notice) => {
      const line = noticeLine(notice);
      if (line !== undefined) write(redact(line));
    },
  };
}

/**
 * The client every script is given (`main.ts`): postgres.js with `connectionOptions`, which connects
 * when it is first asked something.
 */
export function connectToDev(
  url: DevDatabaseUrl,
  redact: (line: string) => string,
  write: (line: string) => void,
): postgres.Sql {
  return postgres(connectionOptions(url, redact, write));
}

/**
 * Node's codes for a server certificate that the check refused: its TLS documentation's "X509
 * certificate error codes"; `UNSPECIFIED`, which Node gives any other verify error OpenSSL reports
 * (a weak signature or key, a Key Usage without certificate signing, an unknown critical extension);
 * and the name check's own. postgres.js passes Node's error on, code and all.
 */
const REFUSED_CERTIFICATE: ReadonlySet<string> = new Set([
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_CRL",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "UNABLE_TO_DECRYPT_CRL_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
  "CERT_SIGNATURE_FAILURE",
  "CRL_SIGNATURE_FAILURE",
  "CERT_NOT_YET_VALID",
  "CERT_HAS_EXPIRED",
  "CRL_NOT_YET_VALID",
  "CRL_HAS_EXPIRED",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_CHAIN_TOO_LONG",
  "CERT_REVOKED",
  "INVALID_CA",
  "PATH_LENGTH_EXCEEDED",
  "INVALID_PURPOSE",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "HOSTNAME_MISMATCH",
  "UNSPECIFIED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/**
 * What to say when `error` is the pin refusing the server's certificate, in place of Node's words
 * (whose hint to try the system's store would change nothing, and point the wrong way), or undefined
 * for any other failure.
 */
export function certificateRefusal(error: unknown): string | undefined {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (typeof code !== "string" || !REFUSED_CERTIFICATE.has(code)) return undefined;
  return `the server's certificate didn't check out against Supabase's root (${code}), so no user name or password was sent. docs/LIMITATIONS.md's row on what would break the pin says what to do`;
}
