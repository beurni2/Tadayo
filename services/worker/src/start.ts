// The worker's startup: the configuration, Storage, the database and the server's clock. The environment's value
// goes to the time module as it is, so a missing or mistyped one stops the worker instead of picking a clock
// (ADR-013). A missing or mistyped SUPABASE_URL or SUPABASE_SERVICE_KEY stops it too, before it connects: its
// preparation reads originals and writes renditions with the service key (./storage.ts; T56), which Fly's secrets
// give both process groups. Its jobs run in the loops main.ts starts (loop.ts): the days each club's week makes
// (generation.ts), and the outbox's events (outbox.ts), of which the first is a photo's preparation (prepare.ts).
// Before it connects it reads, too, whether each photo is prepared under a user of its own (./privileges.ts): with
// TADAYO_PHOTO_USER and the start fly.toml gives it, or neither; either alone stops it. With one, it sweeps that user
// once before anything else, so nothing a photo left before a restart is alive beside the first photo it prepares; a
// sweep that fails stops it.

import { prepareClock, type Clock } from "@tadayo/domain";
import { connect, type WorkerSql } from "./connection.ts";
import { idsOf, photoUserFor, sweep, SweepFailed, type PhotoUser } from "./privileges.ts";
import { workerStorage, type WorkerStorage } from "./storage.ts";

export interface Started {
  sql: WorkerSql;
  clock: Clock;
  storage: WorkerStorage;
  /** The user each photo's process runs as, or undefined when photos are prepared in the worker's own. */
  photoUser: PhotoUser | undefined;
}

/**
 * Reads Storage's settings, sweeps the photo user if there is one, connects and prepares the clock of
 * `TADAYO_ENVIRONMENT`, or throws. `passwd` is /etc/passwd's text but in the root harness, whose photo user has no name.
 */
export async function startWorker(
  env: Readonly<Record<string, string | undefined>>,
  passwd?: () => string,
): Promise<Started> {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("worker: DATABASE_URL isn't set");
  const project = env.SUPABASE_URL;
  if (project === undefined || project === "") throw new Error("worker: SUPABASE_URL isn't set");
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (serviceKey === undefined || serviceKey === "") throw new Error("worker: SUPABASE_SERVICE_KEY isn't set");
  const storage = workerStorage({ projectUrl: project, serviceKey });
  const photoUser = photoUserFor(env, idsOf(), passwd);
  if (photoUser !== undefined) {
    try {
      await sweep(photoUser);
    } catch (error) {
      throw new Error(
        error instanceof SweepFailed && error.why === "left"
          ? "worker: what the photo user left couldn't all be removed as it started"
          : "worker: the photo user's processes couldn't all be ended as it started",
        { cause: error },
      );
    }
  }
  const sql = connect(url);
  try {
    return { sql, clock: await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql), storage, photoUser };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
