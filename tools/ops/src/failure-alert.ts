// `failure-alert`: tells the founder of the failures counted on `tadayo-dev` since the last alert, as a GitHub issue,
// which GitHub emails (the outside audit's B7; FQ150, the founder's answer of 2026-11-27; db/migrations/
// 0020_failure_counts.sql; docs/plans/api-b2-failure-alerts.md, section 1.4). A scheduled workflow runs it every
// 15 minutes (`.github/workflows/alerts.yml`, its own CI-configuration PR).
//
// On the runner, as `dev-clock` runs: the database through Supabase's session pooler with `DATABASE_URL`, checked to
// be dev's (environment.ts), and GitHub's REST API with the run's own `GITHUB_TOKEN`. No new secret, service or address.
//   1. It reads every count with failures it hasn't reported (`total > reported`). With none, it says so and ends,
//      asking GitHub nothing.
//   2. It looks for the open issue it opened: one of the Actions bot's (login and type), not a pull request, whose body
//      carries ALERT_MARKER. It comments there with a table of each count's source, code, failures since the last
//      alert and failures in all. With none open (none yet, or the founder closed the last one), it opens one, titled
//      ALERT_TITLE, whose body names the founder's account once, so GitHub notifies the founder, and says how to read
//      the table. The founder, named in the issue, is subscribed to it, so each later comment notifies them too.
//   3. Only once GitHub has taken the comment or the issue, it marks each count reported up to the total it read
//      (`markReported`), never the total there is by then, so a failure counted while it ran stays for the next alert.
//      GitHub refusing, or not answering, leaves every count for the next run. A run that stops between GitHub's answer
//      and its mark repeats those counts in the next alert, where they come again with the same number in all; none is
//      ever lost.
//
// The repository is public, and so is the issue: every word it writes, there and to the run's log, is fixed text, a
// source, a code (0020's pattern: letters, digits and `_ . : -`) or a number, never an id, a name, a date or a
// message (T52). GitHub's answers are read for the fields it needs, and its words are never printed.

import { FAILURE_CODE, FAILURE_SOURCES, type FailureSource } from "@tadayo/domain";
import type postgres from "postgres";
import { GITHUB_REPOSITORY } from "./environment.ts";
import { OpsError } from "./ops-error.ts";

/** What marks the alert's issue as the alert's: an HTML comment, which GitHub doesn't show. */
export const ALERT_MARKER = "<!-- tadayo-failure-alert: dev -->";
export const ALERT_TITLE = "dev: failures to look at";
/** The account the run's own token acts as. */
export const BOT = "github-actions[bot]";
/** The founder's account: the repository's owner. */
export const FOUNDER_ACCOUNT = GITHUB_REPOSITORY.slice(0, GITHUB_REPOSITORY.indexOf("/"));

const GITHUB = "https://api.github.com";
const GITHUB_MS = 30_000;
/** Open issues read at most: 1,000, ten pages of GitHub's largest. */
const PAGES = 10;
const PAGE_SIZE = 100;

/** A count as `app.failure_counts` holds it. */
export interface FailureCount {
  readonly source: FailureSource;
  readonly code: string;
  readonly total: bigint;
  readonly reported: bigint;
}

/** Where the counts are: Postgres (`unreportedCounts`, `markReported`), or a test's fake. */
export interface FailureStore {
  unreported(): Promise<FailureCount[]>;
  markReported(counts: readonly FailureCount[]): Promise<void>;
}

/** Every count with failures not yet reported, in source and code order. */
export async function unreportedCounts(db: postgres.Sql | postgres.TransactionSql): Promise<FailureCount[]> {
  const rows = await db<{ source: string; code: string; total: string; reported: string }[]>`
    SELECT source, code, total::pg_catalog.text AS total, reported::pg_catalog.text AS reported
      FROM app.failure_counts
     WHERE total > reported
     ORDER BY source COLLATE "C", code COLLATE "C"`;
  return rows.map((row) => ({
    source: row.source as FailureSource,
    code: row.code,
    total: BigInt(row.total),
    reported: BigInt(row.reported),
  }));
}

/**
 * Marks each of `counts` reported up to the total it was read with, never lowering a mark already made, in one
 * transaction, a row at a time in source and code order: the order `countFailures` locks rows in (0020's header).
 */
export async function markReported(db: postgres.Sql, counts: readonly FailureCount[]): Promise<void> {
  if (counts.length === 0) return;
  const ordered = [...counts].sort((a, b) => compare(a.source, b.source) || compare(a.code, b.code));
  await db.begin(async (tx) => {
    for (const count of ordered) {
      await tx`
        UPDATE app.failure_counts SET reported = GREATEST(reported, ${count.total.toString()}::pg_catalog.int8)
         WHERE source = ${count.source} AND code = ${count.code}`;
    }
  });
}

/** Postgres's "C" order, which is JavaScript's for the ASCII a code is made of. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface FailureAlertInput {
  readonly store: FailureStore;
  readonly fetch: typeof fetch;
  /** The run's own `GITHUB_TOKEN`, with `issues: write` and `contents: read` alone. */
  readonly githubToken: string;
  readonly say: (line: string) => void;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** A count as a row of the table, refused unless every part of it is a source, a code or a number. */
function checked(count: FailureCount): FailureCount {
  const fine =
    (FAILURE_SOURCES as readonly string[]).includes(count.source) &&
    FAILURE_CODE.test(count.code) &&
    typeof count.total === "bigint" &&
    typeof count.reported === "bigint" &&
    count.reported >= 0n &&
    count.total > count.reported;
  // Nothing of the count is quoted: a code that isn't one could be anything.
  if (!fine) throw new OpsError("failure-alert: a count came back that isn't a source, a code and two numbers");
  return count;
}

const TABLE_HEAD = ["| Source | Code | New | In all |", "| --- | --- | --- | --- |"];

const tableOf = (counts: readonly FailureCount[]): string[] => [
  ...TABLE_HEAD,
  ...counts.map(
    (count) =>
      `| ${count.source} | ${count.code} | ${(count.total - count.reported).toString()} | ${count.total.toString()} |`,
  ),
];

/** The new issue's body: the marker, the founder's account once, the table, and how to read it. */
function issueBody(counts: readonly FailureCount[]): string {
  return [
    ALERT_MARKER,
    `@${FOUNDER_ACCOUNT}: tadayo-dev's API or worker failed since the last check.`,
    "",
    ...tableOf(counts),
    "",
    "Each row is a failure's source, its code, how many times it happened since the last alert, and how many in all. A code names the line it came from: search the repository for it. Sections 1.2 and 1.3 of docs/plans/api-b2-failure-alerts.md say how the codes are made. The counts hold codes and numbers only: no id, name, date or message.",
    "",
    "A check every 15 minutes adds new failures here as a comment while this issue is open. Close it once they are looked at, and the next failure opens a new one. A row that comes again with the same number in all means a check stopped after GitHub took its comment and before it marked the counts.",
    "",
  ].join("\n");
}

const commentBody = (counts: readonly FailureCount[]): string =>
  ["New failures since the last check:", "", ...tableOf(counts), ""].join("\n");

export async function failureAlert(input: FailureAlertInput): Promise<void> {
  const { say } = input;
  const counts = (await input.store.unreported()).map(checked);
  if (counts.length === 0) {
    say("failure-alert: nothing new");
    return;
  }
  for (const count of counts) {
    say(
      `failure-alert: ${count.source} ${count.code}: ${(count.total - count.reported).toString()} new, ${count.total.toString()} in all`,
    );
  }

  const github = async (method: "GET" | "POST", path: string, what: string, body?: unknown) => {
    let response: Response;
    try {
      response = await input.fetch(`${GITHUB}/repos/${GITHUB_REPOSITORY}${path}`, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${input.githubToken}`,
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(GITHUB_MS),
      });
    } catch {
      throw new OpsError(`failure-alert: no answer from GitHub to ${what}, so every count waits for the next run`);
    }
    const expected = method === "GET" ? 200 : 201;
    if (response.status !== expected) {
      throw new OpsError(
        `failure-alert: GitHub answered HTTP ${String(response.status)} to ${what}, so every count waits for the next run`,
      );
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  };

  // 2. The open issue the alert opened, if there is one: the lowest number, should there be more.
  let open: number | undefined;
  for (let page = 1; page <= PAGES && open === undefined; page += 1) {
    const listed = await github(
      "GET",
      `/issues?state=open&per_page=${String(PAGE_SIZE)}&page=${String(page)}`,
      "the list of open issues",
    );
    if (!Array.isArray(listed)) {
      throw new OpsError(
        "failure-alert: GitHub's list of open issues isn't a list, so every count waits for the next run",
      );
    }
    for (const entry of listed as unknown[]) {
      const issue = record(entry);
      const user = record(issue?.["user"]);
      const number = issue?.["number"];
      const body = issue?.["body"];
      if (
        issue === undefined ||
        issue["pull_request"] !== undefined ||
        user?.["login"] !== BOT ||
        user["type"] !== "Bot" ||
        typeof number !== "number" ||
        !Number.isSafeInteger(number) ||
        typeof body !== "string" ||
        !body.includes(ALERT_MARKER)
      ) {
        continue;
      }
      if (open === undefined || number < open) open = number;
    }
    if (listed.length < PAGE_SIZE) break;
  }

  let where: string;
  if (open !== undefined) {
    await github("POST", `/issues/${String(open)}/comments`, `the comment on issue #${String(open)}`, {
      body: commentBody(counts),
    });
    where = `issue #${String(open)}`;
    say(`failure-alert: added them to ${where}`);
  } else {
    const made = record(
      await github("POST", "/issues", "the new issue", { title: ALERT_TITLE, body: issueBody(counts) }),
    );
    const number = made?.["number"];
    where = typeof number === "number" && Number.isSafeInteger(number) ? `issue #${String(number)}` : "the new issue";
    say(`failure-alert: opened ${where}`);
  }

  // 3. GitHub has the alert: only now are its counts marked.
  try {
    await input.store.markReported(counts);
  } catch {
    throw new OpsError(
      `failure-alert: ${where} has the alert, but its counts couldn't be marked reported, so the next alert repeats them`,
    );
  }
  say(`failure-alert: marked ${String(counts.length)} counts reported`);
}
