// `bootstrap`: runs `db/bootstrap.sql` once against `tadayo-dev` as its admin role (ADR-015; docs/
// plans/B0.md, slice 10a). The file makes the role `tadayo_app`, the schema `app` it owns, and
// `pg_trgm`, and can run again. psql runs it: the file uses its meta-commands. Two things keep the
// password off every command line and out of the server's log (T56):
//   - the connection is psql's own environment variables (environment.ts, `pgEnvOf`), never a URL
//     in an argument;
//   - the password is sent as a SCRAM verifier (scram.ts), which Postgres stores as given, and the
//     verifier goes in on psql's standard input, as the first line of a script that then runs the
//     file, so no argument holds it either.

import { OpsError } from "./ops-error.ts";
import { REDACTED } from "./output.ts";
import { scramVerifier } from "./scram.ts";
import type { Spawn } from "./spawn.ts";

export interface BootstrapInput {
  /** The admin connection, as psql's environment variables. */
  readonly pgEnv: Readonly<Record<string, string>>;
  /** The password `tadayo_app` is to have: 32 characters or more of printable ASCII. */
  readonly password: string;
  /** The absolute path of `db/bootstrap.sql`. */
  readonly file: string;
  readonly spawn: Spawn;
}

/** The shortest password the founder's plan asks for (docs/plans/B0.md, section 1.3). */
export const SHORTEST_PASSWORD = 32;

const MESSAGE_LINES = 12;

/** Runs the file, or throws an OpsError whose message holds neither the password nor its verifier. */
export async function runBootstrap(input: BootstrapInput): Promise<void> {
  if (input.password.length < SHORTEST_PASSWORD) {
    throw new OpsError(`bootstrap: DATABASE_APP_PASSWORD must have ${String(SHORTEST_PASSWORD)} characters or more`);
  }
  if (!/^[\x20-\x7e]+$/.test(input.password)) {
    throw new OpsError("bootstrap: DATABASE_APP_PASSWORD must be printable ASCII");
  }
  if (!/^\/[\w./-]+$/.test(input.file))
    throw new OpsError("bootstrap: the path of db/bootstrap.sql isn't a plain path");
  const verifier = scramVerifier(input.password);
  const script = `\\set app_password '${verifier}'\n\\i '${input.file}'\n`;
  const result = await input.spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    env: input.pgEnv,
    input: script,
    timeoutMs: 120_000,
  });
  const scrub = (text: string) => text.split(verifier).join(REDACTED).split(input.password).join(REDACTED);
  if (result.code === 127) throw new OpsError("bootstrap: psql isn't installed here");
  if (result.timedOut) throw new OpsError("bootstrap: psql didn't finish in two minutes");
  if (result.code !== 0) {
    const lines = scrub(result.stderr)
      .split("\n")
      .filter((line) => line.trim() !== "");
    throw new OpsError(
      `bootstrap: psql failed (exit ${String(result.code)}), nothing of the file is kept:\n${lines.slice(0, MESSAGE_LINES).join("\n")}`,
    );
  }
}
