// `supabase-probe`: proves that a Supabase project is closed (docs/plans/B0.md, slice 10a; TECH-DESIGN
// sections 1 and 8; T12, T53; ADR-015). Three layers, each a list of named checks, and a run passes
// only if every check passes:
//   - `databaseChecks`: the project's Postgres as the API's role reads it: nothing in `app` is open
//     to `anon`, `authenticated`, `service_role` or PUBLIC (the migrations' own `closedProblems`),
//     Storage's two tables have row-level security on and no policy, and the role the Data API
//     connects as has no setting of its own that names a schema (it would win over the project's
//     list, which is what `dataApiChecks` reads).
//   - `apiChecks`: Supabase's three public doors, REST, GraphQL and Storage, asked as the public key
//     alone and as a signed-in user's token: every call is refused or comes back empty. And the Data
//     API's root, asked as the service key, the one caller the gateway lets read it: a root that
//     describes a schema is the Data API on, whatever its settings say.
//   - `dataApiChecks`: the project's own settings, through the Management API: no schema is exposed.
//
// What a refusal is worth. A project that refuses everything, the privileged key included, proves
// nothing, and neither does a request the probe got wrong, so `apiChecks` first shows that it could
// have seen what it is refused. The service key makes a probe user, the user signs in without an
// email (the admin API's generated code), and the service key puts one test object in each bucket,
// reads it back, finds its details, lists it and signs it. It signs the upload URL as the API does
// (services/api/src/media/storage.ts: a body of `{}` and no `x-upsert`), and its token must carry the lifetime
// the API reads from it, `iat` to `exp`, a minute to a day, or the API's createUpload would answer 503 on this
// project; and it asks for an object's details as the API's completeUpload does, which must find the object put
// and Storage's own not-found for one never put. If any of that fails, the run stops there and says so; no
// refusal is run. Then every refusal asks for those same objects, and Storage's own refusal is the
// only one that counts: a body naming status 403 (a policy refuses) or 404 (what the caller can't
// see, as missing). A gateway's 401, a malformed request's 400 and a server error are failures,
// since none of them says that a policy refused. Lists and batches that answer with nothing count as
// closed only because their controls listed and signed the same object. REST and GraphQL are asked
// for every table of `app` and for the root; an error, or no rows, is closed (T53's own words).
//
// What it leaves behind: nothing. Everything it makes is named `probe/<run>/…` (the user's address
// is `probe-<run>@probe.invalid`, which nothing can deliver to), and a `finally` deletes each object
// a call may have written, each bucket a call may have made, and then the user, whatever failed
// before. A clean-up that fails is a failed check that names what is left. The run is limited in
// time, since the runner gives up on the Machine's command 300 seconds after it starts, at the
// earliest (on-machine.ts, `COMMAND_SECONDS`), and no `finally` can count on what Fly does to the
// command then: the checks stop asking at `BUDGET_MS`, the clean-up stops at `DEADLINE_MS`, and a
// call in flight at either time is ended. Each check or clean-up that wasn't asked is a failure that says so, and the
// clean-up's names what is left. No check names, and no note, holds a key, a token or a word of a
// response body: statuses, codes and counts only.

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { closedProblems } from "./migrate.ts";
import { OpsError } from "./ops-error.ts";
import { BUCKETS } from "./storage-setup.ts";
import { describe, projectUrl, send, type Caller, type Reply, type Send } from "./supabase.ts";

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** What the project answered, or what is left, in words that carry no key, token or body. */
  readonly note?: string;
}

/** One line of the report for a check: what it was, and why it failed. */
export function reportLine(check: Check): string {
  if (check.ok) return `ok    ${check.name}`;
  return `FAIL  ${check.name}${check.note === undefined ? "" : `: ${check.note}`}`;
}

const NO_ANSWER = "no answer from the project";
const OUT_OF_TIME = "the run's time ran out";

/**
 * When the checks stop asking, in milliseconds from the start of the Machine's half (run.ts starts
 * both limits before the database's checks, so that they count too); the clean-up goes on.
 */
export const BUDGET_MS = 150_000;
/**
 * When the clean-up stops too: a minute before the runner may give up on the Machine's command
 * (on-machine.ts, `COMMAND_SECONDS`), after which no `finally` can be counted on.
 */
export const DEADLINE_MS = 240_000;

/** A 1×1 transparent PNG, the probe's one test object: Storage looks at its type and its size. */
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=", "base64"),
);
const OBJECT = "seen.png";

/** What a call answered, as a phrase that carries no body: "answered HTTP 200". */
const answered = (reply: Reply) => `answered ${describe(reply)}`;

/** The string at `key` of a JSON object, when it is one. */
function text(json: unknown, key: string): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** The boolean at `key` of a JSON object, when it is one. */
function flag(json: unknown, key: string): boolean | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

const itemsOf = (json: unknown): unknown[] | undefined => (Array.isArray(json) ? (json as unknown[]) : undefined);

/** A signed read URL, however the body spells it. */
const signedUrl = (json: unknown) => text(json, "signedURL") ?? text(json, "signedUrl");

function tokenIn(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url, "https://probe.invalid").searchParams.get("token") ?? undefined;
  } catch {
    // A URL that isn't one has no token, and the control that wanted one fails, as it should.
    return undefined;
  }
}

/**
 * Storage's own status, as the API reads it before it hands an upload to preparation (services/api/src/media/
 * storage.ts, `objectThere`): the body's `statusCode` when it has one, else the HTTP status. Unlike a reply's
 * `logical` (supabase.ts), it takes a whole number there too, since the API does.
 */
function storageStatus(reply: Reply): number {
  const json = reply.json;
  const code = typeof json === "object" && json !== null ? (json as Record<string, unknown>)["statusCode"] : undefined;
  if (typeof code === "string" && /^[0-9]{3}$/.test(code)) return Number(code);
  if (typeof code === "number" && Number.isInteger(code)) return code;
  return reply.status;
}

/** The lifetime the API believes in a signed upload's token: a minute to a day (services/api/src/media/storage.ts). */
const UPLOAD_LIFETIME = { least: 60, most: 86_400 } as const;

/**
 * Whether a signed upload's token says it lives a minute to a day, from its own `iat` and `exp` read as the API
 * reads them: a JWT's payload, unverified, with both whole numbers.
 */
function believedLifetime(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof payload !== "object" || payload === null) return false;
  const { iat, exp } = payload as Record<string, unknown>;
  if (typeof iat !== "number" || typeof exp !== "number" || !Number.isInteger(iat) || !Number.isInteger(exp))
    return false;
  return exp - iat >= UPLOAD_LIFETIME.least && exp - iat <= UPLOAD_LIFETIME.most;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** A path as a URL carries it, each segment on its own. */
const urlPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// ---- What counts as a refusal, door by door.

type Verdict = (reply: Reply) => string | undefined;

/**
 * Storage's own refusal: its body names the status, 403 where a policy refuses a write and 404 for
 * what the caller can't see. Storage answers every error with HTTP 400, so its body is the proof
 * that this answer came from Storage and not from the gateway, or from a request it couldn't read.
 */
function refusedByStorage(reply: Reply): boolean {
  return text(reply.json, "statusCode") !== undefined && (reply.logical === 403 || reply.logical === 404);
}

function refusal(whenOpen: string): Verdict {
  return (reply) => {
    if (refusedByStorage(reply)) return undefined;
    return reply.status === 200 ? whenOpen : answered(reply);
  };
}

const toRead = refusal("it gave the object");
const toWrite = refusal("it wrote the object");
const toMakeBucket = refusal("it made a bucket");

function toSign(reply: Reply): string | undefined {
  if (refusedByStorage(reply)) return undefined;
  return reply.status === 200 && signedUrl(reply.json) !== undefined ? "it gave a signed URL" : answered(reply);
}

function toSignUpload(reply: Reply): string | undefined {
  if (refusedByStorage(reply)) return undefined;
  const given = text(reply.json, "token") ?? text(reply.json, "url");
  return reply.status === 200 && given !== undefined ? "it gave an upload URL" : answered(reply);
}

/** A list that comes back empty is closed: its control listed the same object. */
function toList(reply: Reply): string | undefined {
  if (refusedByStorage(reply)) return undefined;
  const items = reply.status === 200 ? itemsOf(reply.json) : undefined;
  if (items === undefined) return answered(reply);
  return items.length === 0 ? undefined : `it listed ${String(items.length)} ${items.length === 1 ? "item" : "items"}`;
}

/**
 * T53: every bucket of the project is private (a public one serves its objects with no key and no
 * policy), and none is there but the two `storage-setup` makes (a third is someone's, or a probe's
 * left over). The note counts, and names no bucket.
 */
function toBuckets(reply: Reply): string | undefined {
  const items = reply.status === 200 ? itemsOf(reply.json) : undefined;
  if (items === undefined) return answered(reply);
  // A bucket that doesn't say `public: false` isn't shown to be private.
  const open = items.filter((item) => flag(item, "public") !== false).length;
  const strangers = items.filter((item) => !BUCKETS.some((name) => name === text(item, "name"))).length;
  const notes: string[] = [];
  if (open > 0) notes.push(`${String(open)} ${open === 1 ? "bucket isn't" : "buckets aren't"} shown to be private`);
  if (strangers > 0) {
    notes.push(`${String(strangers)} ${strangers === 1 ? "bucket isn't" : "buckets aren't"} one storage-setup makes`);
  }
  return notes.length === 0 ? undefined : notes.join("; ");
}

/** A batch answers each path, with no URL for the ones it won't sign. */
function toSignBatch(reply: Reply): string | undefined {
  if (refusedByStorage(reply)) return undefined;
  const items = reply.status === 200 ? itemsOf(reply.json) : undefined;
  if (items === undefined) return answered(reply);
  return items.some((item) => signedUrl(item) !== undefined) ? "it gave a signed URL" : undefined;
}

/** The Data API's tables: an error, or no rows (T53). */
function restTable(reply: Reply): string | undefined {
  if (reply.status >= 400) return undefined;
  const rows = reply.status === 200 ? itemsOf(reply.json) : undefined;
  if (rows === undefined) return answered(reply);
  return rows.length === 0 ? undefined : "it returned rows";
}

/**
 * The Data API's root describes the project's schema when it is on, so any answer but an error is
 * open. Since April 2026 the gateway refuses the root to the public key and to a user's token
 * whatever the Data API's state (supabase discussion 42949), so for those two callers this line
 * only shows the refusal; the service key's root is what shows the API on (`servedSchema`).
 */
const restRoot: Verdict = (reply) => (reply.status >= 400 ? undefined : answered(reply));

/** The root as the service key asks for it: an error is no API, and an answer that describes paths is the API on. */
const servedSchema: Verdict = (reply) => {
  if (reply.status >= 400) return undefined;
  const paths =
    typeof reply.json === "object" && reply.json !== null
      ? (reply.json as Record<string, unknown>)["paths"]
      : undefined;
  if (typeof paths !== "object" || paths === null) return answered(reply);
  const count = Object.keys(paths).length;
  return `${answered(reply)}, with ${String(count)} ${count === 1 ? "path" : "paths"}`;
};

function graphql(reply: Reply): string | undefined {
  if (reply.status >= 400) return undefined;
  const data =
    typeof reply.json === "object" && reply.json !== null ? (reply.json as Record<string, unknown>)["data"] : undefined;
  return typeof data === "object" && data !== null ? "it answered with data" : undefined;
}

/** A delete that finds nothing left to delete has done its job. */
function gone(reply: Reply): string | undefined {
  return reply.status === 200 || reply.status === 204 || reply.logical === 404 ? undefined : answered(reply);
}

// ---- The API layer.

export interface ApiInput {
  readonly fetch: typeof fetch;
  /** The project's URL (`SUPABASE_URL`). */
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceKey: string;
  /** The tables of the schema `app`, from `databaseChecks`: REST is asked for each. */
  readonly tables: readonly string[];
  /** A fresh id for this run's names; a UUID unless a test gives its own. */
  readonly id?: () => string;
  /** Ends the checks' asking: the Machine's half gives `BUDGET_MS` from its start; alone, from this call's. */
  readonly budget?: AbortSignal;
  /** Ends the clean-up's asking too: `DEADLINE_MS`, likewise. */
  readonly deadline?: AbortSignal;
}

interface Leftovers {
  readonly objects: { bucket: string; path: string; label: string }[];
  readonly buckets: { name: string; label: string }[];
  user: string | undefined;
}

/** The refusals of every public door, with the controls that give them meaning, and the clean-up. */
export async function apiChecks(input: ApiInput): Promise<Check[]> {
  const base = projectUrl(input.url);
  const run = (input.id ?? randomUUID)();
  const folder = `probe/${run}`;
  const service: Caller = { kind: "service", key: input.serviceKey };
  const anon: Caller = { kind: "anon", key: input.publishableKey };
  const checks: Check[] = [];
  const left: Leftovers = { objects: [], buckets: [], user: undefined };

  const deadline = input.deadline ?? AbortSignal.timeout(DEADLINE_MS);
  /** What ends the checks' asking: the budget, or the deadline if that comes first. */
  const checking = AbortSignal.any([input.budget ?? AbortSignal.timeout(BUDGET_MS), deadline]);
  /** True once the clean-up has begun: it isn't cut short by the budget, only by the deadline. */
  let cleaning = false;
  const limit = () => (cleaning ? deadline : checking);

  /**
   * One call; a network failure or a timeout is no answer, which is a failed check and not a failed
   * run. Once the time is spent no call is made, and one in flight is ended.
   */
  async function ask(path: string, options: Send): Promise<Reply | undefined> {
    const within = limit();
    if (within.aborted) return undefined;
    try {
      return await send(input.fetch, base, path, { ...options, within });
    } catch (error) {
      if (error instanceof OpsError) return undefined;
      throw error;
    }
  }

  /** Why a call has no answer: the run's time is out, or the project didn't answer. */
  const silence = () => (limit().aborted ? OUT_OF_TIME : NO_ANSWER);

  /** Records a check: `problem` is why it failed, or nothing. */
  function record(name: string, problem: string | undefined): boolean {
    checks.push(problem === undefined ? { name, ok: true } : { name, ok: false, note: problem });
    return problem === undefined;
  }

  const settle = (reply: Reply | undefined, good: (reply: Reply) => boolean): string | undefined =>
    reply === undefined ? silence() : good(reply) ? undefined : answered(reply);

  const listBody = { prefix: folder, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } };
  const signBody = { expiresIn: 60 };
  const batchBody = { expiresIn: 60, paths: [`${folder}/${OBJECT}`] };

  /** True when everything the refusals need is shown to work; the first thing that isn't stops the run. */
  async function controls(): Promise<Caller | undefined> {
    const email = `probe-${run}@probe.invalid`;
    const made = await ask("/auth/v1/admin/users", {
      method: "POST",
      caller: service,
      json: { email, email_confirm: true },
    });
    const userId = made?.status === 200 ? text(made.json, "id") : undefined;
    if (userId !== undefined) left.user = userId;
    if (
      !record(
        "control: the service key makes a user",
        settle(made, () => userId !== undefined),
      ) ||
      userId === undefined
    ) {
      return undefined;
    }

    // The user signs in with the code the admin API generates, so no email is sent. Then Auth takes
    // the token, so a refusal of it by Storage is a policy's, and not an invalid token's.
    const link = await ask("/auth/v1/admin/generate_link", {
      method: "POST",
      caller: service,
      json: { type: "magiclink", email },
    });
    const hashed = link?.status === 200 ? text(link.json, "hashed_token") : undefined;
    let signIn: string | undefined =
      link === undefined ? silence() : hashed === undefined ? `no sign-in code: ${describe(link)}` : undefined;
    let user: Caller | undefined;
    if (signIn === undefined && hashed !== undefined) {
      const verified = await ask("/auth/v1/verify", {
        method: "POST",
        caller: anon,
        json: { type: "magiclink", token_hash: hashed },
      });
      const token = verified?.status === 200 ? text(verified.json, "access_token") : undefined;
      if (verified === undefined) signIn = silence();
      else if (token === undefined) signIn = `the code wasn't taken: ${describe(verified)}`;
      else {
        user = { kind: "user", key: input.publishableKey, token };
        const me = await ask("/auth/v1/user", { caller: user });
        if (me === undefined) signIn = silence();
        else if (me.status !== 200 || text(me.json, "id") !== userId)
          signIn = `the token wasn't taken: ${describe(me)}`;
      }
    }
    if (!record("control: the user signs in without an email", signIn) || user === undefined) return undefined;

    for (const bucket of BUCKETS) {
      const path = `${folder}/${OBJECT}`;
      const at = `${bucket}/${urlPath(path)}`;

      const signed = await ask(`/storage/v1/object/upload/sign/${at}`, { method: "POST", caller: service, json: {} });
      const token =
        signed?.status === 200 ? (text(signed.json, "token") ?? tokenIn(text(signed.json, "url"))) : undefined;
      const signing =
        settle(signed, () => token !== undefined) ??
        (token !== undefined && believedLifetime(token)
          ? undefined
          : "its token's lifetime isn't a minute to a day, as the API reads it");
      if (!record(`control: the service key signs an upload URL for ${bucket}`, signing) || token === undefined) {
        return undefined;
      }

      // Tracked before the call: a put whose answer is lost may have stored the object.
      left.objects.push({ bucket, path, label: `the probe object in ${bucket}` });
      const put = await ask(`/storage/v1/object/upload/sign/${at}?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        body: PNG,
        contentType: "image/png",
      });
      if (
        !record(
          `control: the signed URL puts the object in ${bucket}`,
          settle(put, (reply) => reply.status === 200),
        )
      )
        return undefined;

      const read = await ask(`/storage/v1/object/authenticated/${at}`, { caller: service });
      if (
        !record(
          `control: the service key reads the object back from ${bucket}`,
          settle(read, (reply) => reply.status === 200 && sameBytes(reply.bytes, PNG)),
        )
      ) {
        return undefined;
      }

      // As the API asks before it hands an upload to preparation (storage.ts, `objectThere`): the object put
      // is there, and one never put is Storage's own not-found, so a completed upload isn't answered 503 here.
      const info = await ask(`/storage/v1/object/info/${at}`, { caller: service });
      const never = await ask(`/storage/v1/object/info/${bucket}/${urlPath(`${folder}/never-${OBJECT}`)}`, {
        caller: service,
      });
      if (
        !record(
          `control: the service key finds the object's details in ${bucket}, and none for an object never put`,
          settle(info, (reply) => reply.status === 200 && storageStatus(reply) === 200) ??
            settle(never, (reply) => storageStatus(reply) === 404),
        )
      ) {
        return undefined;
      }

      const listed = await ask(`/storage/v1/object/list/${bucket}`, {
        method: "POST",
        caller: service,
        json: listBody,
      });
      const listing = (reply: Reply) => itemsOf(reply.json)?.some((item) => text(item, "name") === OBJECT) === true;
      if (
        !record(
          `control: the service key lists the object in ${bucket}`,
          settle(listed, (reply) => reply.status === 200 && listing(reply)),
        )
      ) {
        return undefined;
      }

      const batch = await ask(`/storage/v1/object/sign/${bucket}`, {
        method: "POST",
        caller: service,
        json: batchBody,
      });
      const signedPath = (reply: Reply) =>
        itemsOf(reply.json)?.some((item) => text(item, "path") === path && signedUrl(item) !== undefined) === true;
      if (
        !record(
          `control: the service key signs a read URL for ${bucket} in a batch`,
          settle(batch, (reply) => reply.status === 200 && signedPath(reply)),
        )
      ) {
        return undefined;
      }
    }

    // T53: every bucket is private, not only the two shown to work above. This isn't a control (no
    // refusal needs it), so a failure is recorded and the run goes on.
    const everyBucket = await ask("/storage/v1/bucket", { caller: service });
    record(
      "storage: every bucket is private, and only storage-setup's two exist",
      everyBucket === undefined ? silence() : toBuckets(everyBucket),
    );
    return user;
  }

  /** One refusal: asks, judges, and keeps what a call that wasn't cleanly refused may have written. */
  async function refuse(name: string, path: string, options: Send, verdict: Verdict, kept?: () => void): Promise<void> {
    // A call that wasn't made wrote nothing, so there is nothing of it to keep.
    const asked = !checking.aborted;
    const reply = await ask(path, options);
    const problem = reply === undefined ? silence() : verdict(reply);
    record(name, problem);
    if (problem !== undefined && asked) kept?.();
  }

  async function refusals(who: string, caller: Caller): Promise<void> {
    const profile = { "accept-profile": "app" };
    for (const table of input.tables) {
      await refuse(
        `${who}: REST ${table}`,
        `/rest/v1/${encodeURIComponent(table)}`,
        { caller, headers: profile },
        restTable,
      );
    }
    await refuse(`${who}: REST root`, "/rest/v1/", { caller }, restRoot);
    await refuse(
      `${who}: GraphQL`,
      "/graphql/v1",
      { method: "POST", caller, json: { query: "{ __typename }" } },
      graphql,
    );

    await refuse(`${who}: list the buckets`, "/storage/v1/bucket", { caller }, toList);
    const bucketName = `probe-${run}-${who}`;
    await refuse(
      `${who}: create a bucket`,
      "/storage/v1/bucket",
      { method: "POST", caller, json: { id: bucketName, name: bucketName, public: false } },
      toMakeBucket,
      () => left.buckets.push({ name: bucketName, label: `the bucket ${who} made` }),
    );

    for (const bucket of BUCKETS) {
      const path = `${folder}/${OBJECT}`;
      const at = `${bucket}/${urlPath(path)}`;
      await refuse(
        `${who}: list the objects of ${bucket}`,
        `/storage/v1/object/list/${bucket}`,
        { method: "POST", caller, json: listBody },
        toList,
      );
      await refuse(`${who}: download from ${bucket}`, `/storage/v1/object/authenticated/${at}`, { caller }, toRead);
      await refuse(
        `${who}: download from the public route of ${bucket}`,
        `/storage/v1/object/public/${at}`,
        { caller },
        toRead,
      );
      await refuse(
        `${who}: sign a read URL for ${bucket}`,
        `/storage/v1/object/sign/${at}`,
        { method: "POST", caller, json: signBody },
        toSign,
      );
      await refuse(
        `${who}: sign read URLs for ${bucket} in a batch`,
        `/storage/v1/object/sign/${bucket}`,
        { method: "POST", caller, json: batchBody },
        toSignBatch,
      );
      await refuse(
        `${who}: overwrite the object in ${bucket}`,
        `/storage/v1/object/${at}`,
        { method: "PUT", caller, body: PNG, contentType: "image/png" },
        toWrite,
      );
      const added = `${folder}/added-${who}.png`;
      await refuse(
        `${who}: add an object to ${bucket}`,
        `/storage/v1/object/${bucket}/${urlPath(added)}`,
        { method: "POST", caller, body: PNG, contentType: "image/png" },
        toWrite,
        () => left.objects.push({ bucket, path: added, label: `the object ${who} added to ${bucket}` }),
      );
      await refuse(
        `${who}: sign an upload URL in ${bucket}`,
        `/storage/v1/object/upload/sign/${bucket}/${urlPath(`${folder}/upload-${who}.png`)}`,
        { method: "POST", caller },
        toSignUpload,
      );
    }
  }

  async function cleanup(): Promise<void> {
    for (const object of left.objects) {
      const reply = await ask(`/storage/v1/object/${object.bucket}/${urlPath(object.path)}`, {
        method: "DELETE",
        caller: service,
      });
      record(`cleanup: delete ${object.label}`, reply === undefined ? silence() : gone(reply));
    }
    for (const bucket of left.buckets) {
      const reply = await ask(`/storage/v1/bucket/${encodeURIComponent(bucket.name)}`, {
        method: "DELETE",
        caller: service,
      });
      record(`cleanup: delete ${bucket.label}`, reply === undefined ? silence() : gone(reply));
    }
    if (left.user !== undefined) {
      const reply = await ask(`/auth/v1/admin/users/${encodeURIComponent(left.user)}`, {
        method: "DELETE",
        caller: service,
      });
      record("cleanup: delete the probe user", reply === undefined ? silence() : gone(reply));
    }
  }

  try {
    const user = await controls();
    if (user !== undefined) {
      await refusals("anon", anon);
      await refusals("user", user);
      await refuse(
        "service: the Data API serves no schema at its root",
        "/rest/v1/",
        { caller: service },
        servedSchema,
      );
    }
  } finally {
    cleaning = true;
    await cleanup();
  }
  return checks;
}

// ---- The project's own settings.

const DATA_API = "the Data API's settings expose no schema";

/** The schemas a PostgREST list names: `pg_pgrst_no_exposed_schemas` is the platform's stand-in for none. */
function schemasOf(list: string): string[] {
  return list
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "pg_pgrst_no_exposed_schemas");
}

/**
 * Asks the Management API which schemas the project's Data API exposes. There is no switch for it
 * there: it is off when the list is empty or the platform's own stand-in for none. The answer
 * carries the project's JWT secret, so it is read for `db_schema` and for nothing else, and never
 * printed (T56).
 */
export async function dataApiChecks(fetcher: typeof fetch, ref: string, accessToken: string): Promise<Check[]> {
  if (!/^[a-z]{20}$/.test(ref)) throw new OpsError("the project's reference is twenty letters");
  let reply: Reply;
  try {
    reply = await send(fetcher, "https://api.supabase.com", `/v1/projects/${ref}/postgrest`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    if (!(error instanceof OpsError)) throw error;
    return [{ name: DATA_API, ok: false, note: NO_ANSWER }];
  }
  if (reply.status !== 200) return [{ name: DATA_API, ok: false, note: `the Management API ${answered(reply)}` }];
  const schemas = text(reply.json, "db_schema");
  if (schemas === undefined)
    return [{ name: DATA_API, ok: false, note: "the Management API's answer names no db_schema" }];
  const exposed = schemasOf(schemas);
  if (exposed.length === 0) return [{ name: DATA_API, ok: true }];
  const plain = (name: string) => (/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(name) ? name : "a schema with an odd name");
  return [{ name: DATA_API, ok: false, note: `it exposes ${exposed.map(plain).join(", ")}` }];
}

// ---- The database layer.

export interface DatabaseReport {
  readonly checks: Check[];
  /** The tables of the schema `app`, which REST is asked for. */
  readonly tables: string[];
}

const SOME = 3;

/**
 * What the project's Postgres says, as the API's role reads it: nothing in `app` is open to the API
 * roles (`closedProblems`, the check the migrations run), and Storage's `buckets` and `objects`
 * have row-level security on and no policy, so only the service key reaches an object (T12, T53).
 */
export async function databaseChecks(sql: postgres.Sql | postgres.TransactionSql): Promise<DatabaseReport> {
  const checks: Check[] = [];

  const problems = await closedProblems(sql);
  const closed = "database: nothing in app is open to anon, authenticated, service_role or PUBLIC";
  checks.push(
    problems.length === 0
      ? { name: closed, ok: true }
      : {
          name: closed,
          ok: false,
          note:
            problems.slice(0, SOME).join("; ") +
            (problems.length > SOME ? `; and ${String(problems.length - SOME)} more` : ""),
        },
  );

  const tableRows = await sql<{ name: string }[]>`
    SELECT c.relname AS name
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
     ORDER BY c.relname`;
  const tables = tableRows.map((row) => row.name);
  checks.push(
    tables.length > 0
      ? { name: "database: app has tables for REST to be asked for", ok: true }
      : { name: "database: app has tables for REST to be asked for", ok: false, note: "it has none" },
  );

  const storage = await sql<{ name: string; rls: boolean; policies: string }[]>`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
           (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid)::pg_catalog.text AS policies
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relname IN ('buckets', 'objects') AND c.relkind IN ('r', 'p')
     ORDER BY c.relname`;
  const found: string[] = [];
  for (const wanted of ["buckets", "objects"]) {
    const row = storage.find((candidate) => candidate.name === wanted);
    if (row === undefined) found.push(`storage.${wanted} isn't there`);
    else {
      if (!row.rls) found.push(`storage.${wanted} has no row-level security`);
      if (row.policies !== "0")
        found.push(`storage.${wanted} has ${row.policies} ${row.policies === "1" ? "policy" : "policies"}`);
    }
  }
  const sealed = "database: Storage's buckets and objects have row-level security and no policy";
  checks.push(found.length === 0 ? { name: sealed, ok: true } : { name: sealed, ok: false, note: found.join("; ") });

  // The Data API reads its list of schemas from the settings of the role `authenticator` when that
  // has one, and they win over the project's own list (the Dashboard warns of it). `pg_roles` shows
  // only the cluster-wide row, and a setting for this database alone wins over that, so the catalog
  // is read. A role that isn't there (CI's Postgres) has nothing to read. Counts only: no setting's
  // value is printed (T56).
  const override = await sql<{ setting: string }[]>`
    SELECT s.setting
      FROM pg_catalog.pg_db_role_setting r
     CROSS JOIN LATERAL pg_catalog.unnest(r.setconfig) AS s(setting)
     WHERE r.setrole = pg_catalog.to_regrole('authenticator')
       AND r.setdatabase IN (0, (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database()))
       AND pg_catalog.starts_with(s.setting, 'pgrst.db_schemas=')
     ORDER BY s.setting`;
  const exposed = override.flatMap((row) => schemasOf(row.setting.slice("pgrst.db_schemas=".length)));
  const role = "database: the role the Data API connects as has no setting of its own that exposes a schema";
  checks.push(
    exposed.length === 0
      ? { name: role, ok: true }
      : {
          name: role,
          ok: false,
          note: `authenticator's own setting exposes ${String(exposed.length)} ${exposed.length === 1 ? "schema" : "schemas"}, whatever the project's list says`,
        },
  );

  return { checks, tables };
}
