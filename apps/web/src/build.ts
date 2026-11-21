// The site's build (docs/plans/api-b0-deploy.md, section 7; TECH-DESIGN sections 1 and 9): `public/`
// copied whole into `dist/`, which is what Cloudflare Pages is given (`wrangler pages deploy dist`,
// by 10c's `deploy-dev`). Nothing is compiled, since the site is static; what the build is for is
// what it refuses to copy.
//
// `apple-app-site-association` is the file iOS asks `tadayo.app` for when a universal link is opened
// (TECH-DESIGN sections 1 and 4). Apple's CDN fetches exactly `/.well-known/apple-app-site-association`: no
// extension, no redirect, JSON, 128 KB at most, so the build checks the file and the `_headers` rule
// that serves it as JSON (Pages would guess a type for a file with no extension). And a Pages site
// with no `404.html` answers every missing path with `index.html` and a 200, which would hide a
// missing association file from Apple behind a web page, so the build wants a `404.html` too.

import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export const SOURCE = join(import.meta.dirname, "..", "public");
export const OUT = join(import.meta.dirname, "..", "dist");
export const ASSOCIATION = ".well-known/apple-app-site-association";

const ASSOCIATION_PATH = `/${ASSOCIATION}`;
const MOST_BYTES = 128 * 1024;
// A team ID is ten capitals and digits; a bundle ID follows its dot.
const APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * What is wrong with the association file by Tadayo's own rules, which are STRICTER than Apple's
 * format; nothing when it is right. Apple marks every key of `applinks`, of a detail and of a
 * component optional, takes `appID` beside `appIDs`, reads a component with no `/` key as matching
 * every path, and shows `webcredentials` and `appclips` beside `applinks` in its sample file. Here
 * the file is the iOS 13 form (`applinks.details`, each with `appIDs` and `components`), has no key
 * but `applinks` (nothing is decided about the other grants), and every component names its path
 * with a `/` key that starts with a slash, so that a mistyped key can't claim the whole site
 * without a word. A later slice that needs more loosens a rule here, with its test.
 */
export function checkAssociation(text: string): string[] {
  if (Buffer.byteLength(text) > MOST_BYTES) return ["is larger than 128 KB, which Apple's CDN refuses"];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return ["isn't JSON"];
  }
  const file = record(parsed);
  if (file === undefined) return ["isn't an object"];
  const problems: string[] = [];
  const stray = Object.keys(file).filter((key) => key !== "applinks");
  if (stray.length > 0) problems.push(`has a key other than applinks: ${stray.join(", ")}`);
  const applinks = record(file["applinks"]);
  if (applinks === undefined) return [...problems, "has no applinks"];
  const details = applinks["details"];
  if (!Array.isArray(details)) return [...problems, "applinks.details isn't a list"];
  (details as unknown[]).forEach((detail, index) => {
    const where = `detail ${String(index + 1)}`;
    const entry = record(detail);
    const ids = entry?.["appIDs"];
    if (!Array.isArray(ids) || ids.length === 0) problems.push(`${where} has no appIDs`);
    else {
      for (const id of ids as unknown[]) {
        if (typeof id !== "string" || !APP_ID.test(id)) {
          problems.push(
            `${where}: ${typeof id === "string" ? id : "an app ID that isn't text"} isn't a team ID and a bundle ID`,
          );
        }
      }
    }
    const components = entry?.["components"];
    if (!Array.isArray(components)) problems.push(`${where}: components isn't a list`);
    else {
      (components as unknown[]).forEach((component, at) => {
        const place = `${where}, component ${String(at + 1)}`;
        const path = record(component)?.["/"];
        if (typeof path !== "string") problems.push(`${place} has no path: a / key`);
        else if (!path.startsWith("/")) problems.push(`${place}: the path ${path} doesn't start with a slash`);
      });
    }
  });
  return problems;
}

/**
 * What is wrong with the `_headers` file: the association file has to be served as JSON. Pages
 * applies EVERY rule whose path matches a request, in file order, and joins a header that more than
 * one of them sets (`text/plain, application/json`), or removes it (`! Content-Type`). So this
 * reads the whole file as Pages does (a line is trimmed, and is a path when it starts with a slash
 * or with `scheme://`; the lines under it are its headers), wants exactly one rule for the
 * association's path (what Pages makes of one path written twice isn't something to lean on), and
 * refuses a Content-Type set or removed under any other path, since it can't tell which of those
 * patterns would match.
 */
export function checkHeaders(text: string): string[] {
  const rules: { path: string; headers: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (/^(\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(line)) rules.push({ path: line, headers: [] });
    else rules.at(-1)?.headers.push(line);
  }
  const ours = rules.filter((rule) => rule.path === ASSOCIATION_PATH);
  const [rule] = ours;
  if (rule === undefined) return [`has no rule for ${ASSOCIATION_PATH}`];
  if (ours.length > 1) {
    return [
      `has ${String(ours.length)} rules for ${ASSOCIATION_PATH}: it wants one, so that the type served doesn't depend on how Pages treats a path written twice`,
    ];
  }
  const settingType = (headers: readonly string[]) =>
    headers.filter((line) => /^(!\s*)?content-type\s*(:|$)/i.test(line));
  const elsewhere = rules.filter((other) => other !== rule && settingType(other.headers).length > 0);
  if (elsewhere.length > 0) {
    return [
      `sets or removes Content-Type for ${elsewhere.map((other) => other.path).join(", ")}, and Pages applies every rule that matches, so it could change the type of ${ASSOCIATION_PATH}`,
    ];
  }
  const set = rule.headers.filter((line) => /^content-type\s*:/i.test(line));
  if (settingType(rule.headers).length > set.length) return [`removes the Content-Type of ${ASSOCIATION_PATH}`];
  const types = set.map((line) => line.slice(line.indexOf(":") + 1).trim());
  if (types.length === 0) return [`has no Content-Type for ${ASSOCIATION_PATH}`];
  if (types.length !== 1 || types[0] !== "application/json") {
    return [`serves ${ASSOCIATION_PATH} as ${types.join(", ")}, and not as application/json`];
  }
  return [];
}

export interface BuildInput {
  readonly source: string;
  readonly out: string;
  readonly say: (line: string) => void;
}

/** Checks the site in `source` and, only if it is right, makes `out` a copy of it. Throws with every problem. */
export function buildSite(input: BuildInput): void {
  const source = resolve(input.source);
  const out = resolve(input.out);
  // `out` is erased before it is filled, so it is never the site itself or a folder around it.
  if (source === out) throw new Error("web: the source and the output are the same folder");
  if (out.startsWith(`${source}${sep}`))
    throw new Error("web: the output is inside the source, and would be copied into itself");
  if (source.startsWith(`${out}${sep}`))
    throw new Error("web: the output contains the source, which the build would erase");

  const problems: string[] = [];
  const found = (path: string): boolean => {
    const there = existsSync(join(source, path));
    if (!there) problems.push(`the site has no ${path}`);
    return there;
  };
  if (found(ASSOCIATION)) {
    for (const problem of checkAssociation(readFileSync(join(source, ASSOCIATION), "utf8"))) {
      problems.push(`${ASSOCIATION} ${problem}`);
    }
  }
  if (found("_headers")) {
    for (const problem of checkHeaders(readFileSync(join(source, "_headers"), "utf8")))
      problems.push(`_headers ${problem}`);
  }
  found("404.html");
  if (problems.some((problem) => problem.startsWith(`${ASSOCIATION} `))) {
    problems.push(
      `the rules for ${ASSOCIATION} are Tadayo's own, stricter than Apple's format: checkAssociation in apps/web/src/build.ts says which`,
    );
  }
  if (problems.length > 0) throw new Error(problems.map((problem) => `web: ${problem}`).join("\n"));

  rmSync(out, { recursive: true, force: true });
  cpSync(source, out, { recursive: true });
  const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  input.say(`web: ${String(files.length)} files copied`);
}

if (import.meta.main) {
  try {
    buildSite({
      source: SOURCE,
      out: OUT,
      say: (line) => {
        console.log(line);
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "web: the build failed");
    process.exitCode = 1;
  }
}
