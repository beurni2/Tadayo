// How the API's and the worker's Storage clients read Supabase Storage (services/api/src/media/storage.ts,
// services/worker/src/storage.ts; TECH-DESIGN section 6; T12, T53, T56): one reading of the project's URL, the
// service key and Storage's answers, so the two clients can't come to differ on them. Neither logs a value.

/**
 * The project's URL, which must be `https://<twenty letters>.supabase.co`, as the sign-in verifier requires, without
 * its trailing slash; else an error that names the setting, never its value. `who` names the process.
 */
export function storageProject(value: string, who: string): string {
  const match = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(value);
  if (!match) throw new Error(`${who}: SUPABASE_URL isn't a project's URL, https://<its 20 letters>.supabase.co`);
  return `https://${match[1] ?? ""}.supabase.co`;
}

/** The service key as it is, or an error that names the setting, never its value. `who` names the process. */
export function storageServiceKey(value: string, who: string): string {
  if (typeof value !== "string" || value === "" || /\s/.test(value)) {
    throw new Error(`${who}: SUPABASE_SERVICE_KEY isn't a key`);
  }
  return value;
}

/**
 * Storage's own status for an answer: the body's `statusCode` when it has one, else the HTTP status. Storage answers
 * most errors with HTTP 400 and the real status in the body (tools/ops/src/supabase.ts; a 429, a 500 and its
 * database's 544 keep their own), so a client that read the HTTP status alone would take a refused key or a missing
 * object for a bad request.
 */
export function storageStatus(status: number, json: unknown): number {
  if (typeof json === "object" && json !== null) {
    const code = (json as Record<string, unknown>)["statusCode"];
    if (typeof code === "string" && /^[0-9]{3}$/.test(code)) return Number(code);
    if (typeof code === "number" && Number.isInteger(code)) return code;
  }
  return status;
}

/** The body's own status, or 0 when it gives none: never the HTTP status. */
function bodyStatus(json: unknown): number {
  return storageStatus(0, json);
}

/** The body's `code`, when it is Storage's own error body: an object with a `code` of letters. */
function bodyCode(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const code = (json as Record<string, unknown>)["code"];
  return typeof code === "string" && /^[A-Za-z]{1,64}$/.test(code) ? code : undefined;
}

/**
 * Whether an answer is Storage's own not-found of an object, `ERRORS.NoSuchKey` in Storage's sources
 * (`supabase/storage`, `src/internal/errors/codes.ts`): the body's status 404 and its code NoSuchKey, whatever the
 * HTTP status. The worker takes it alone for an original gone (services/worker/src/storage.ts), and the Supabase
 * probe checks that `dev` answers it (tools/ops/src/supabase-probe.ts), so the two can't come to differ.
 */
export function storageNoSuchKey(json: unknown): boolean {
  return bodyStatus(json) === 404 && bodyCode(json) === "NoSuchKey";
}

/**
 * Whether an answer is Storage refusing the request itself: its own error body, a `code` and a 4xx status in the
 * body, but 408 and 429, which ask to be tried again, and its backend's failure (`S3Error`, which carries the
 * backend's status). What a refusal names (a key, a bucket, a type, a size) is the request's or the project's
 * settings', which no wait mends; anything else that isn't the answer asked for (no answer, a 5xx, a 408 or 429,
 * the backend failing, a body that isn't Storage's) is Storage away.
 */
export function storageRefusal(json: unknown): boolean {
  const status = bodyStatus(json);
  const code = bodyCode(json);
  return code !== undefined && code !== "S3Error" && status >= 400 && status <= 499 && status !== 408 && status !== 429;
}
