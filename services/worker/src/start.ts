// The worker's startup: the configuration, Storage, the database and the server's clock. The environment's value
// goes to the time module as it is, so a missing or mistyped one stops the worker instead of picking a clock
// (ADR-013). A missing or mistyped SUPABASE_URL or SUPABASE_SERVICE_KEY stops it too, before it connects: its
// preparation reads originals and writes renditions with the service key (./storage.ts; T56), which Fly's secrets
// give both process groups. Its jobs run in the loops main.ts starts (loop.ts): the days each club's week makes
// (generation.ts), and the outbox's events (outbox.ts), of which the first is a photo's preparation (prepare.ts).
// Before it reads anything else it reads whether each photo is prepared under a user of its own (./privileges.ts): with
// TADAYO_PHOTO_USER and the start fly.toml gives it, or neither; either alone stops it, and in the image
// (NODE_ENV=production) so does neither, so a start as root alone never reads a setting (the audit's A6). With one, it
// sweeps that user once before anything else, so nothing a photo left before a restart is alive beside the first photo
// it prepares; a sweep that fails stops it.
// It reads TADAYO_SAFETY_PROVIDER too, before it sweeps or connects: each environment names the provider that screens
// its photos (./safety.ts; the outside audit's B7), and one left unset or unknown stops it. Then TADAYO_PUSH, whether it
// sends the reveal push (./push.ts): `none` sends nothing and reads no key; `apns` reads the founder's APNs key from
// APNS_KEY_ID, APPLE_TEAM_ID and APNS_KEY_P8 (./apns.ts), and a key that isn't one stops it, naming no value. Unset or
// unknown stops it too.

import { prepareClock, type Clock } from "@tadayo/domain";
import { apnsKeyFrom, apnsSender, type ApnsSender } from "./apns.ts";
import { connect, type WorkerSql } from "./connection.ts";
import { pushSettingFor } from "./push.ts";
import { idsOf, photoUserFor, sweep, SweepFailed, type PhotoUser } from "./privileges.ts";
import { safetyProviderFor, type SafetyProvider } from "./safety.ts";
import { workerStorage, type WorkerStorage } from "./storage.ts";
import { Fault } from "@tadayo/domain/fault";

export interface Started {
  sql: WorkerSql;
  clock: Clock;
  storage: WorkerStorage;
  /** The user each photo's process runs as, or undefined when photos are prepared in the worker's own. */
  photoUser: PhotoUser | undefined;
  /** The provider that screens each photo, as TADAYO_SAFETY_PROVIDER names it. */
  safety: SafetyProvider;
  /** The reveal push's sender when TADAYO_PUSH is `apns`, or undefined when it is `none`. */
  push: ApnsSender | undefined;
}

/**
 * Reads the photo user and Storage's settings, sweeps the photo user if there is one, connects and prepares the clock of
 * `TADAYO_ENVIRONMENT`, or throws. `passwd` is /etc/passwd's text but in the root harness, whose photo user has no name.
 */
export async function startWorker(
  env: Readonly<Record<string, string | undefined>>,
  passwd?: () => string,
): Promise<Started> {
  const photoUser = photoUserFor(env, idsOf(), passwd);
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Fault("worker_start_1", "worker: DATABASE_URL isn't set");
  const project = env.SUPABASE_URL;
  if (project === undefined || project === "") throw new Fault("worker_start_2", "worker: SUPABASE_URL isn't set");
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (serviceKey === undefined || serviceKey === "")
    throw new Fault("worker_start_3", "worker: SUPABASE_SERVICE_KEY isn't set");
  const storage = workerStorage({ projectUrl: project, serviceKey });
  const safety = safetyProviderFor(env.TADAYO_SAFETY_PROVIDER);
  // The key is read and checked here, before anything is swept or connected; the sender opens no connection until its
  // first push.
  const pushKey = pushSettingFor(env.TADAYO_PUSH) === "apns" ? apnsKeyFrom(env) : undefined;
  if (photoUser !== undefined) {
    try {
      await sweep(photoUser);
    } catch (error) {
      throw new Fault(
        "worker_start_4",
        error instanceof SweepFailed && error.why === "left"
          ? "worker: what the photo user left couldn't all be removed as it started"
          : "worker: the photo user's processes couldn't all be ended as it started",
        { cause: error },
      );
    }
  }
  const sql = connect(url);
  try {
    const clock = await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql);
    return { sql, clock, storage, photoUser, safety, push: pushKey === undefined ? undefined : apnsSender(pushKey) };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
