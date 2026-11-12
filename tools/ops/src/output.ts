// What an `ops` script may print (T52, T56). The scripts never print a secret on purpose. This is
// the second lock, for the one they print by accident: a driver's error, a child process's
// output, a response's body. Every line goes through `redactor(env)`, which holds back the value
// of each secret variable (and a connection string's password, as it was written and decoded),
// and the shape of the secrets the environment might not hold: tokens, keys, a SCRAM verifier and
// the user and password of any connection string.

export const REDACTED = "[redacted]";

/** The variables whose values are secrets, as the scripts read them (docs/plans/B0.md, section 1.3). */
export const SECRET_VARIABLES = [
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "DATABASE_APP_PASSWORD",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "FLY_API_TOKEN",
  "GITHUB_TOKEN",
] as const;

// A value shorter than this is no secret anyone would set, and a hole where it appears would blank
// ordinary words.
const SHORTEST = 8;

const PATTERNS: readonly [RegExp, string][] = [
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, REDACTED], // a JWT: a user's token, a legacy key
  [/\bsb_secret_[\w-]+/g, REDACTED], // a Supabase secret key
  [/\bsbp_[0-9a-f]{20,}/g, REDACTED], // a Supabase access token
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED], // a GitHub token
  [/\bgithub_pat_\w{20,}/g, REDACTED],
  [/FlyV1 [\w+/=,-]+/g, REDACTED], // a Fly token
  [/\bfm[12]_[\w+/=-]{16,}/g, REDACTED],
  [/SCRAM-SHA-256\$[\w+/=:$-]+/g, REDACTED], // a role's password as Postgres stores it
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s'"@]*@/gi, `$1${REDACTED}@`], // a connection string's user and password
];

/** A connection string's password as it is written in the string and as it is decoded. */
function passwordForms(value: string): string[] {
  let password: string;
  try {
    password = new URL(value).password;
  } catch {
    return [];
  }
  const forms = [password];
  try {
    forms.push(decodeURIComponent(password));
  } catch {
    // not percent-encoded
  }
  return forms;
}

/** What a failure prints, before the redactor: its message and never its stack, and plain words for anything that isn't an error. */
export function failureText(error: unknown): string {
  return error instanceof Error ? error.message : "ops: the script failed";
}

/**
 * What Postgres's own notice prints, or nothing for the routine ones (`NOTICE`, `DEBUG`, `LOG`:
 * "relation already exists, skipping"). A warning, or anything worse, is said with its severity.
 */
export function noticeLine(notice: Readonly<Record<string, unknown>>): string | undefined {
  const severity = String(notice["severity"]);
  if (severity === "NOTICE" || severity === "DEBUG" || severity === "LOG") return undefined;
  return `ops: ${severity}: ${String(notice["message"])}`;
}

/** A function that takes a line and gives it back with every secret held back. */
export function redactor(env: Readonly<Record<string, string | undefined>>): (line: string) => string {
  const values = new Set<string>();
  for (const name of SECRET_VARIABLES) {
    const value = env[name];
    if (value === undefined || value.length < SHORTEST) continue;
    values.add(value);
    // A connection string's password is held back on its own, written as it is in the string and
    // decoded, since a driver's message quotes either. Its user stays: it names no secret.
    for (const form of passwordForms(value)) {
      if (form.length >= SHORTEST) values.add(form);
    }
  }
  // The longest first, so a value inside another is held back whole.
  const exact = [...values].sort((a, b) => b.length - a.length);
  return (line) => {
    let out = line;
    for (const value of exact) out = out.split(value).join(REDACTED);
    for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
    return out;
  };
}
