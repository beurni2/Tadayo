// The API's startup: the configuration, the database and the server's clock, before anything
// listens. The environment's value goes to the time module as it is, so a missing or mistyped one
// stops the API instead of picking a clock (ADR-013); a missing or mistyped SUPABASE_URL stops it too,
// so it never runs believing no token or the wrong project's (identity/token.ts), and so does a missing
// SUPABASE_SERVICE_KEY, which only Storage's calls carry (media/storage.ts; T56). In the image (NODE_ENV=production,
// the Dockerfile's, or the marker the Dockerfile writes, which no setting can take away), a start as root stops it
// before it reads anything: the image has no USER, and fly.toml's command, like the image's own, drops to `node` before
// any Node code runs (ADR-038), so a start that skipped the drop would run the API, and a parser it reaches, as root
// (the audit's A6).

import { existsSync } from "node:fs";
import { prepareClock } from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { connect, type ApiSql } from "./connection.ts";
import { supabaseVerifier } from "./identity/token.ts";
import { supabaseStorage } from "./media/storage.ts";
import { sessions } from "./session.ts";

export interface Started {
  app: FastifyInstance;
  sql: ApiSql;
  port: number;
  host: string;
}

/**
 * The port in PORT: 8080 when it isn't set, else a whole number to 65535 in digits, 0 asking the
 * system for a free one (the tests). An empty or other value stops the API, so a blank setting
 * never leaves it listening where nothing reaches it.
 */
function portOf(value: string | undefined): number {
  if (value === undefined) return 8080;
  if (!/^[0-9]{1,5}$/.test(value) || Number(value) > 65_535) throw new Error("api: PORT isn't a port");
  return Number(value);
}

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

/** The level in LOG_LEVEL: `info` when it isn't set, else one of pino's, so a typo never silences the logs. */
function logLevelOf(value: string | undefined): string {
  if (value === undefined) return "info";
  if (!LOG_LEVELS.includes(value)) throw new Error("api: LOG_LEVEL isn't a log level");
  return value;
}

/** A process's real and effective user. */
export interface UserIds {
  readonly uid: number;
  readonly euid: number;
}

/** This process's real and effective user, or -1 for each on a platform without user ids. */
function ownIds(): UserIds {
  return { uid: process.getuid?.() ?? -1, euid: process.geteuid?.() ?? -1 };
}

/** The file the Dockerfile writes, which says this is Tadayo's image (the worker's privileges.ts, IMAGE_MARKER). */
export const IMAGE_MARKER = "/etc/tadayo-built-image";

/**
 * Throws in the image when the API runs as root, by its real user or its effective one (the header). `marked` says
 * whether the image's marker is there.
 */
export function refuseRoot(
  env: Readonly<Record<string, string | undefined>>,
  ids: UserIds,
  marked: () => boolean = () => existsSync(IMAGE_MARKER),
): void {
  if ((env.NODE_ENV === "production" || marked()) && (ids.uid === 0 || ids.euid === 0)) {
    throw new Error(
      "api: in production it runs only as fly.toml's command starts it, turned to its own user, never as root",
    );
  }
}

/**
 * Refuses root in the image, then connects, prepares the clock of `TADAYO_ENVIRONMENT`, reads the Supabase project's
 * keys from `SUPABASE_URL`, takes Storage's key from `SUPABASE_SERVICE_KEY` and builds the app, or throws.
 */
export async function startApi(env: Readonly<Record<string, string | undefined>>): Promise<Started> {
  refuseRoot(env, ownIds());
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("api: DATABASE_URL isn't set");
  const supabase = env.SUPABASE_URL;
  if (supabase === undefined || supabase === "") throw new Error("api: SUPABASE_URL isn't set");
  const verifier = supabaseVerifier(supabase);
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (serviceKey === undefined || serviceKey === "") throw new Error("api: SUPABASE_SERVICE_KEY isn't set");
  const storage = supabaseStorage({ projectUrl: supabase, serviceKey });
  const port = portOf(env.PORT);
  const log = { level: logLevelOf(env.LOG_LEVEL) };
  const sql = connect(url);
  try {
    const clock = await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql);
    const authenticate = sessions({ verifier, sql, clock });
    return { app: buildApp({ sql, clock, authenticate, storage, log }), sql, port, host: env.HOST ?? "0.0.0.0" };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
