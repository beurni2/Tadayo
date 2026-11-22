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
 * every error with HTTP 400 and the real status in the body (tools/ops/src/supabase.ts), so a client that read the
 * HTTP status alone would take a refused key or a missing object for a bad request.
 */
export function storageStatus(status: number, json: unknown): number {
  if (typeof json === "object" && json !== null) {
    const code = (json as Record<string, unknown>)["statusCode"];
    if (typeof code === "string" && /^[0-9]{3}$/.test(code)) return Number(code);
    if (typeof code === "number" && Number.isInteger(code)) return code;
  }
  return status;
}
