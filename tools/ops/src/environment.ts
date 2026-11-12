// What the `ops` scripts take from the environment, and the one guard that keeps them on `dev`
// (docs/plans/B0.md, slice 10a; ADR-013, ADR-025; T56).
//
// A script acts on `tadayo-dev` and nothing else. A database is `tadayo-dev`'s only by what its
// connection string says: Supabase's session pooler (`<region>.pooler.supabase.com`, port 5432),
// which routes by the project reference after the role's name (`tadayo_app.<reference>`), where
// the reference is `SUPABASE_DEV_PROJECT_REF`. No script takes an environment's name from its
// caller, so a name can't make it act on another. The Fly app is the one constant `DEV_APP`.

import { OpsError } from "./ops-error.ts";

/** The one Fly app the scripts act on (TECH-DESIGN section 7). */
export const DEV_APP = "tadayo-api-dev";
/** The dev API's host, a CNAME to `DEV_APP`'s `fly.dev` name with the proxy off (ADR-023). */
export const DEV_HOST = "api-dev.tadayo.app";
/** Where the image keeps this entry (its `WORKDIR` is `/app`): the runner starts a script there with `--here`. */
export const MACHINE_MAIN = "/app/tools/ops/src/main.ts";
/** The one repository `deploy-branch` asks GitHub about: a branch of it is the only thing it deploys. */
export const GITHUB_REPOSITORY = "beurni2/tadayo";

declare const DEV: unique symbol;

/** A connection string `devDatabaseUrl` has checked: only it makes one. */
export type DevDatabaseUrl = string & { readonly [DEV]: true };

const PROJECT_REF = /^[a-z]{20}$/;

/** `value`, which must be a Supabase project reference: twenty lowercase letters. */
export function devProjectRef(value: string): string {
  if (!PROJECT_REF.test(value)) {
    throw new OpsError("SUPABASE_DEV_PROJECT_REF isn't a Supabase project reference: twenty lowercase letters");
  }
  return value;
}
// Supabase's session pooler: `aws-0-us-east-1.pooler.supabase.com` and its siblings.
const POOLER_HOST = /^[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/;
const POOLER_USER = /^[a-z_][a-z0-9_]*\.([a-z]{20})$/;

/**
 * `url` if it is a connection to `devRef`'s database through Supabase's session pooler, else it
 * throws. Nothing but the scheme, the user, the password, the host, the port and the database is
 * allowed, since a query parameter can name another host, user or database; the port is the
 * session pooler's, 5432, since the transaction pooler's would break the sessions' locks; the
 * database is `postgres`; and the password isn't empty. The messages name `name`, the variable the
 * string came from, never the string or the reference.
 */
export function devDatabaseUrl(url: string, devRef: string, name = "DATABASE_URL"): DevDatabaseUrl {
  devProjectRef(devRef);
  const refused = (why: string) =>
    new OpsError(`${name} isn't a connection to tadayo-dev's database through Supabase's session pooler: ${why}`);
  // A second host (libpq's `host1,host2`) would let the first one be the pooler and the second not.
  // Only the part after the last `@` is the host: a comma in a password is the password's.
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1] ?? "";
  if (authority.slice(authority.lastIndexOf("@") + 1).includes(",")) throw refused("it names more than one host");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A # / or ? in a password ends the user-info part, and the rest then reads as a bad host or port.
    throw refused("it isn't a connection string (a # / or ? in the password has to be written as %23, %2F or %3F)");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw refused("it isn't a postgresql: URL");
  if (parsed.search !== "" || parsed.hash !== "") throw refused("it has a query or a fragment");
  if (!POOLER_HOST.test(parsed.hostname.toLowerCase())) throw refused("its host isn't a Supabase session pooler's");
  if (parsed.port !== "" && parsed.port !== "5432") throw refused("its port isn't the session pooler's, 5432");
  if (parsed.pathname !== "/postgres") throw refused("its database isn't postgres");
  let user: string;
  try {
    user = decodeURIComponent(parsed.username);
  } catch {
    throw refused("its user isn't valid");
  }
  const reference = POOLER_USER.exec(user)?.[1];
  if (reference !== devRef) throw refused("its user doesn't carry dev's project reference");
  // Nothing may ask for one: psql would prompt on a terminal, and a driver would try without.
  if (parsed.password === "") throw refused("it has no password");
  try {
    decodeURIComponent(parsed.password);
  } catch {
    throw refused("its password isn't valid percent-encoding: a % in it has to be written as %25");
  }
  return url as DevDatabaseUrl;
}

/** The parts of a checked connection string, read once: `psql` and the driver are both given these. */
export interface DatabaseParts {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

/**
 * The parts of `url`, which only `devDatabaseUrl` makes, read the way that guard read them (`new
 * URL`: the host after the last `@`). The port is a number, 5432 when the string names none, so
 * neither `psql` nor the driver reads it from the environment (`PGPORT`). Both consumers are given
 * these parts and never the string, so no other reader (postgres.js's, libpq's) can read it
 * differently from the guard.
 */
export function databaseOf(url: DevDatabaseUrl): DatabaseParts {
  const parsed = new URL(url);
  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port === "" ? 5432 : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
  };
}

/**
 * A connection as the environment variables `psql` reads, so that no password is ever on a command
 * line, where the process list shows it. TLS is required, as Supabase's pooler asks.
 */
export function pgEnvOf(url: DevDatabaseUrl): Record<string, string> {
  const { host, port, user, password, database } = databaseOf(url);
  return {
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: user,
    PGPASSWORD: password,
    PGDATABASE: database,
    PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "20",
  };
}

/**
 * The variables a script reads: each must be set, not empty, and without a space or a line break at
 * either end (a pasted secret often has one). The message names variables only, never a value.
 */
export function readVariables<Name extends string>(
  env: Readonly<Record<string, string | undefined>>,
  names: readonly Name[],
): Record<Name, string> {
  const missing: string[] = [];
  const padded: string[] = [];
  const values = {} as Record<Name, string>;
  for (const name of names) {
    const value = env[name];
    if (value === undefined || value.trim() === "") missing.push(name);
    else if (value !== value.trim()) padded.push(name);
    else values[name] = value;
  }
  if (missing.length > 0) throw new OpsError(`set ${missing.join(", ")}`);
  if (padded.length > 0) {
    throw new OpsError(`${padded.join(", ")} has a space or a line break at an end: set it again without`);
  }
  return values;
}
