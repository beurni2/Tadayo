// The failure alert with a fake store and a fake GitHub (the outside audit's B7; ./failure-alert.ts;
// docs/plans/api-b2-failure-alerts.md, section 1.4): nothing new asks GitHub nothing; new counts go as a comment on
// the open issue the alert opened, or as a new issue that names the founder's account once; the counts are marked
// only once GitHub has answered; and every word it writes, to GitHub or to the run's log, is fixed text, a source, a
// code or a number. The store's reads and writes on Postgres are tests/src/db/ops-failure-alert.test.ts.

import { describe, expect, it } from "vitest";
import { GITHUB_REPOSITORY } from "./environment.ts";
import {
  ALERT_MARKER,
  ALERT_TITLE,
  BOT,
  FOUNDER_ACCOUNT,
  failureAlert,
  type FailureCount,
  type FailureStore,
} from "./failure-alert.ts";
import { OpsError } from "./ops-error.ts";

const API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;

const COUNTS: FailureCount[] = [
  { source: "api", code: "Fault:propose_roster_6", total: 5n, reported: 3n },
  { source: "api", code: "PostgresError:57014", total: 1n, reported: 0n },
  { source: "worker", code: "upload.prepare:lease_lapsed", total: 12n, reported: 2n },
];

const TABLE = [
  "| Source | Code | New | In all |",
  "| --- | --- | --- | --- |",
  "| api | Fault:propose_roster_6 | 2 | 5 |",
  "| api | PostgresError:57014 | 1 | 1 |",
  "| worker | upload.prepare:lease_lapsed | 10 | 12 |",
];

/** A store that hands out `counts` and keeps each mark it is asked for. */
function store(counts: readonly FailureCount[], mark: () => Promise<void> = () => Promise.resolve()) {
  const marks: FailureCount[][] = [];
  const events: string[] = [];
  const fake: FailureStore = {
    unreported: () => Promise.resolve(counts.map((count) => ({ ...count }))),
    markReported: async (marked) => {
      events.push("mark");
      marks.push(marked.map((count) => ({ ...count })));
      await mark();
    },
  };
  return { fake, marks, events };
}

interface Asked {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** An issue as GitHub lists it. */
const issue = (number: number, user: string, body: string | null, extra: Record<string, unknown> = {}) => ({
  number,
  user: { login: user, type: user.endsWith("[bot]") ? "Bot" : "User" },
  body,
  ...extra,
});

/** A GitHub that answers `pages` to the list of open issues, and `answer` to each write. */
function github(
  pages: readonly unknown[][],
  answer: (asked: Asked) => { status: number; body?: unknown } = (asked) =>
    asked.url.endsWith("/comments") ? { status: 201, body: { id: 1 } } : { status: 201, body: { number: 41 } },
  events: string[] = [],
) {
  const asked: Asked[] = [];
  const fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    asked.push({ method, url, body, headers });
    events.push(`${method} ${url.replace(API, "")}`);
    if (method === "GET") {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return Promise.resolve(new Response(JSON.stringify(pages[page - 1] ?? []), { status: 200 }));
    }
    const { status, body: answered } = answer({ method, url, body, headers });
    return Promise.resolve(new Response(answered === undefined ? "" : JSON.stringify(answered), { status }));
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

async function run(counts: readonly FailureCount[], pages: readonly unknown[][]) {
  const said: string[] = [];
  const { fake, marks, events } = store(counts);
  const { fetch, asked } = github(pages, undefined, events);
  await failureAlert({ store: fake, fetch, githubToken: "a-token-never-printed", say: (line) => said.push(line) });
  return { said, marks, asked, events };
}

describe("failureAlert", () => {
  it("says there is nothing new, and asks GitHub nothing, when every count is reported", async () => {
    const { said, marks, asked } = await run([], [[issue(7, BOT, ALERT_MARKER)]]);
    expect(said).toEqual(["failure-alert: nothing new"]);
    expect(asked).toEqual([]);
    expect(marks).toEqual([]);
  });

  it("comments on the open issue it opened, with exactly the new counts, then marks the totals it read", async () => {
    const pages = [
      [
        // A pull request carrying the marker, an issue of the founder's carrying it, and one of the bot's without it.
        issue(9, BOT, ALERT_MARKER, { pull_request: { url: "x" } }),
        issue(8, FOUNDER_ACCOUNT, `${ALERT_MARKER}\nquoted`),
        issue(6, BOT, "another bot's issue"),
        issue(7, BOT, `${ALERT_MARKER}\n@${FOUNDER_ACCOUNT}: an earlier alert`),
      ],
    ];
    const { said, marks, asked, events } = await run(COUNTS, pages);
    const writes = asked.filter((one) => one.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.url).toBe(`${API}/issues/7/comments`);
    expect(writes[0]?.body).toEqual({ body: ["New failures since the last check:", "", ...TABLE, ""].join("\n") });
    expect(marks).toEqual([COUNTS]);
    expect(events.at(-1)).toBe("mark");
    expect(events.indexOf("mark")).toBeGreaterThan(events.indexOf("POST /issues/7/comments"));
    expect(said).toEqual([
      "failure-alert: api Fault:propose_roster_6: 2 new, 5 in all",
      "failure-alert: api PostgresError:57014: 1 new, 1 in all",
      "failure-alert: worker upload.prepare:lease_lapsed: 10 new, 12 in all",
      "failure-alert: added them to issue #7",
      "failure-alert: marked 3 counts reported",
    ]);
  });

  it("asks GitHub with the run's token, its API version, and nothing it doesn't need", async () => {
    const { asked } = await run(COUNTS, [[issue(7, BOT, ALERT_MARKER)]]);
    expect(asked[0]?.url).toBe(`${API}/issues?state=open&per_page=100&page=1`);
    for (const one of asked) {
      expect(one.headers).toMatchObject({
        accept: "application/vnd.github+json",
        authorization: "Bearer a-token-never-printed",
        "x-github-api-version": "2022-11-28",
      });
    }
  });

  it("opens a new issue, naming the founder's account once, when no open issue of the bot's carries the marker", async () => {
    for (const [name, pages] of [
      ["none open", [[]]],
      ["only one without the marker", [[issue(6, BOT, "another bot's issue")]]],
      ["only a pull request with it", [[issue(9, BOT, ALERT_MARKER, { pull_request: { url: "x" } })]]],
      ["only one of a person's with it", [[issue(8, FOUNDER_ACCOUNT, ALERT_MARKER)]]],
      ["only one with no body", [[issue(5, BOT, null)]]],
    ] as const) {
      const { said, marks, asked } = await run(COUNTS, pages as unknown as unknown[][]);
      const writes = asked.filter((one) => one.method !== "GET");
      expect(
        writes.map((one) => one.url),
        name,
      ).toEqual([`${API}/issues`]);
      const { title, body } = writes[0]?.body as { title: string; body: string };
      expect(title, name).toBe(ALERT_TITLE);
      expect(body, name).toBe(
        [
          ALERT_MARKER,
          `@${FOUNDER_ACCOUNT}: tadayo-dev's API or worker failed since the last check.`,
          "",
          ...TABLE,
          "",
          "Each row is a failure's source, its code, how many times it happened since the last alert, and how many in all. A code names the line it came from: search the repository for it. Sections 1.2 and 1.3 of docs/plans/api-b2-failure-alerts.md say how the codes are made. The counts hold codes and numbers only: no id, name, date or message.",
          "",
          "A check every 15 minutes adds new failures here as a comment while this issue is open. Close it once they are looked at, and the next failure opens a new one. A row that comes again with the same number in all means a check stopped after GitHub took its comment and before it marked the counts.",
          "",
        ].join("\n"),
      );
      expect(body.split(`@${FOUNDER_ACCOUNT}`), name).toHaveLength(2);
      expect(body.split("@"), name).toHaveLength(2);
      expect(marks, name).toEqual([COUNTS]);
      expect(said.at(-2), name).toBe("failure-alert: opened issue #41");
    }
  });

  it("names the repository's owner, the founder's account, and finds the bot by its login and its type", () => {
    expect(FOUNDER_ACCOUNT).toBe(GITHUB_REPOSITORY.split("/")[0]);
    expect(BOT).toBe("github-actions[bot]");
    expect(ALERT_MARKER).toBe("<!-- tadayo-failure-alert: dev -->");
    expect(ALERT_TITLE).toBe("dev: failures to look at");
  });

  it("finds the marked issue on a later page of open issues", async () => {
    const full = Array.from({ length: 100 }, (_, n) =>
      issue(1000 + n, FOUNDER_ACCOUNT, "a pull request", { pull_request: {} }),
    );
    const { asked } = await run(COUNTS, [full, [issue(7, BOT, ALERT_MARKER)]]);
    expect(asked.filter((one) => one.method === "GET").map((one) => new URL(one.url).searchParams.get("page"))).toEqual(
      ["1", "2"],
    );
    expect(asked.filter((one) => one.method !== "GET").map((one) => one.url)).toEqual([`${API}/issues/7/comments`]);
  });

  it("refuses a bot that only says it is one: a login that isn't the Actions bot's, or a user that isn't a bot", async () => {
    const lookalike = { ...issue(7, BOT, ALERT_MARKER), user: { login: BOT, type: "User" } };
    const { asked } = await run(COUNTS, [[lookalike, issue(4, "someone[bot]", ALERT_MARKER)]]);
    expect(asked.filter((one) => one.method !== "GET").map((one) => one.url)).toEqual([`${API}/issues`]);
  });

  it("marks nothing when GitHub refuses or doesn't answer, and never prints its words", async () => {
    const cases: [string, typeof globalThis.fetch][] = [
      [
        "the list refused",
        () => Promise.resolve(new Response('{"message":"Bad credentials: secret words"}', { status: 401 })),
      ],
      [
        "the comment refused",
        github([[issue(7, BOT, ALERT_MARKER)]], () => ({ status: 403, body: { message: "secret words" } })).fetch,
      ],
      ["the issue refused", github([[]], () => ({ status: 422, body: { message: "secret words" } })).fetch],
      ["no answer", () => Promise.reject(new TypeError("fetch failed: secret words"))],
      ["a list that isn't one", () => Promise.resolve(new Response('{"secret":"words"}', { status: 200 }))],
    ];
    for (const [name, fetch] of cases) {
      const { fake, marks } = store(COUNTS);
      const said: string[] = [];
      const error: unknown = await failureAlert({
        store: fake,
        fetch,
        githubToken: "t",
        say: (line) => said.push(line),
      }).catch((caught: unknown) => caught);
      expect(error, name).toBeInstanceOf(OpsError);
      expect((error as Error).message, name).toMatch(/^failure-alert: /);
      expect(`${(error as Error).message}\n${said.join("\n")}`, name).not.toContain("secret words");
      expect(marks, name).toEqual([]);
    }
  });

  it("says so, and fails the run, when GitHub has the alert but the counts couldn't be marked", async () => {
    const { fake } = store(COUNTS, () => Promise.reject(new Error("connection lost")));
    const { fetch } = github([[issue(7, BOT, ALERT_MARKER)]]);
    await expect(failureAlert({ store: fake, fetch, githubToken: "t", say: () => undefined })).rejects.toThrow(
      "failure-alert: issue #7 has the alert, but its counts couldn't be marked reported, so the next alert repeats them",
    );
  });

  it("refuses a count it can't show as a source, a code and numbers, before asking GitHub, and never prints it", async () => {
    const bad: FailureCount[] = [
      { source: "api", code: "a|b ana@example.invalid", total: 2n, reported: 0n },
      { source: "web" as "api", code: "Fault:home_3", total: 2n, reported: 0n },
      { source: "api", code: "Fault:home_3", total: 2n, reported: 2n },
      { source: "api", code: "Fault:home_3", total: 2n, reported: -1n },
    ];
    for (const count of bad) {
      const { fake, marks } = store([count]);
      const { fetch, asked } = github([[issue(7, BOT, ALERT_MARKER)]]);
      const said: string[] = [];
      const error: unknown = await failureAlert({
        store: fake,
        fetch,
        githubToken: "t",
        say: (line) => said.push(line),
      }).catch((caught: unknown) => caught);
      expect(error, count.code).toBeInstanceOf(OpsError);
      expect(`${(error as Error).message}\n${said.join("\n")}`, count.code).not.toContain("ana@example.invalid");
      expect(asked, count.code).toEqual([]);
      expect(marks, count.code).toEqual([]);
    }
  });

  it("writes nothing but fixed words, sources, codes and numbers, to GitHub and to the run's log", async () => {
    const { said, asked } = await run(COUNTS, [[]]);
    const text = [...said, ...asked.map((one) => JSON.stringify(one.body ?? ""))].join("\n");
    // No id of a row, a club, an account or a drop; no date; no address.
    expect(text).not.toMatch(/\b(?:acct|club|drp|evt|upl)_/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/a-token-never-printed/);
    const rows = (asked[1]?.body as { body: string }).body.split("\n").filter((line) => line.startsWith("| "));
    for (const row of rows.slice(2))
      expect(row).toMatch(/^\| (?:api|worker) \| [A-Za-z0-9_.:-]+ \| [0-9]+ \| [0-9]+ \|$/);
  });
});
