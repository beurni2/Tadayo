// A role's password as Postgres stores it: `SCRAM-SHA-256$<iterations>:<salt>$<stored key>:<server
// key>` (RFC 5802 and 7677; Postgres's `scram-sha-256`). `db/bootstrap.sql` takes it in place of the
// password, which Postgres stores as given, so the password never reaches the server's log, where
// `ALTER ROLE … PASSWORD 'secret'` would otherwise be written (T56).

import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/** Postgres's default for `scram_iterations`. */
const ITERATIONS = 4096;

/**
 * The verifier of `password`. Postgres runs a password through SASLprep before it keys it, which
 * leaves printable ASCII as it is and changes anything else, so only printable ASCII is taken.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16), iterations = ITERATIONS): string {
  if (!/^[\x20-\x7e]+$/.test(password)) throw new Error("the password must be printable ASCII");
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${String(iterations)}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
