# Spike S6, the server-log check: `api/b0-spike-links`

B0 · api · spike S6 (`docs/plans/B0.md`, section 4, order 3). S6's row ends with "a check that the token reaches no server log", and `docs/MILESTONES.md` says "The token never reaches a server log." The rest of S6 is built:

- the association file (PR #91, `4e6d36e`);
- the invitation page and the API's CORS rule for it (PR #94, `8324de9`), which the founder opened on their iPhone at 13:28 UTC on 2026-11-21 and saw "This invitation isn’t available." for a made-up token;
- the ios lane's build that opens the link in the app (PR #97, `3893a409`), with the founder's steps in `docs/plans/ios-b0-spike-links.md`, section 4.

What is left is this check, its run on `dev`, and the spike's report. No `ops` script reads `dev`'s logs today, so the check is a new one, `spike-links`. This plan is written before the code and pasted into the PR's Plan section.

## Sources

- **The rule.** T52: logs carry no token. `services/api/src/logging.ts` holds it in three layers: Fastify's own request lines are off; each request gets one line of ours (a random id, the operation, the status, the milliseconds, and for the preflight `preflight` in place of the operation); anything else goes through `redact`. TECH-DESIGN section 1: the page reads the token from the link's fragment and sends it in a POST's body. The fragment never leaves the browser.
- **What PR #94 already showed, off `dev`.** `services/api/src/web-origin.test.ts` reads the app's log after the page's requests and finds no token. The real-browser check (`api/b0-spike-links-web/b51a0d4/web/` on `evidence`) found the token in none of the app's 20 request lines.
- **`flyctl` 0.5.8's `logs`** (`internal/command/logs/logs.go`, `logs/polling.go`, `internal/render/logs.go`, read from its source, as fly.ts' header says of every call):
    - `logs -a <app> --no-tail` asks Fly's API for one page of the app's log buffer (`GetAppLogs` with an empty next token; which entries that page holds is the server's choice), making at most 10 calls when one fails with a passing error and none more after a refused token or a missing app (`logs/polling.go`), and returns. It uses no agent and no NATS.
    - `--json` prints each entry with the fields fly-go's `LogEntry` decodes (`resource_logs.go`, `types.go`): its timestamp, message, instance, region and level, and Fly's own fields (the instance, the region, the provider, the HTTP request's id, method and version, the answer's status, an error's code and message, and a URL), as indented JSON, one object after another. Any other field Fly's API returns is dropped before it is printed.
    - The text form drops the message of an entry that has an error's message. That is why the check reads the JSON form.

## 1. What the check shows, and what it can't

The token could reach a log in five places once the page has sent it:

1. **Cloudflare Pages, which serves `tadayo.app/i`.** It never gets the token: a fragment isn't sent in a request. PR #94's browser check saw the page's one request, a POST to the API with the token in its body only.
2. **The API's own lines.** These are the Machine's standard output in Fly's log buffer, with provider `app`. The check reads them.
3. **Fly's own lines for the app** (the proxy's and the Machine's) in the same buffer. The check reads them too. To see whether anything there or in the API's lines would hold a URL, the check also puts the token in a request's URL, where no client puts it. Fly's proxy writes lines about its own errors, not one for each request the app answers, so for a request the app answers this mostly re-tests the API's own logging, on `dev`'s deployed build and settings rather than the tests'; the run shows what the buffer holds.
4. **Supabase's Postgres.** It gets only the token's SHA-256, in hex (`packages/domain/src/clubs/invitation-facts.ts`, `tokenHash`). Its logs are Supabase's, and the check doesn't read them. It does count that hash in Fly's buffer.
5. **The runner's own output.** The script prints counts and statuses, never a log line or the token.

What it can't show:

- logs Fly keeps but doesn't serve in the buffer's latest page;
- fields of an entry that flyctl doesn't decode: the check shows flyctl's view of the buffer, so the report says that view holds no token, not that Fly holds none;
- Supabase's logs, beyond point 4.

The check waits for the three lines its requests make: two preflight lines and the POST's line, which only a request to the page's one path makes, each told from every other by the API's random request id. A request to another path, a scanner's among them, can't make them. The invitation page itself does, from any browser that opens a link without the app, since in the closed trial the page calls `dev` (`apps/web/public/i.html`). So the check fails if the new entries hold fewer of those lines than it sent, and also if they hold more: another client then used the path during the run, and its lines can't be told from the run's. It never passes on logs that show no line of its requests, nor on logs where another client's lines could stand in for them.

## 2. The script (`tools/ops/src/spike-links.ts`)

It runs on the runner, with `FLY_API_TOKEN` alone, and acts on `dev` only: `flyctl` through `flyOf`, whose `forDevApp` lets no call name another app, and requests to `https://api-dev.tadayo.app` (`DEV_HOST`).

1. **A made-up token.** 32 random bytes as base64url, 43 characters, the shortest `InvitationToken`. It names no invitation, and it is never printed or written anywhere but the three requests.
2. **The buffer before.** `flyctl logs -a tadayo-api-dev --no-tail --json`. Each entry is kept by its timestamp, instance and message, so that later reads can tell which entries are new.
3. **The page's two requests, and one more**, each with its own 15-second limit:
    - the preflight, exactly as the browser sends it: `OPTIONS /v1/invitations/web-preview` with `Origin: https://tadayo.app`, `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type`. It must answer 204, allowing `https://tadayo.app`, the method `POST` and the header `content-type`, and no credentials;
    - the page's POST: the same path, `Origin: https://tadayo.app`, `Content-Type: application/json` and the body `{"token":"<token>"}`. It must answer 404 with the body's code `NOT_FOUND`, `Access-Control-Allow-Origin: https://tadayo.app`, `Vary: Origin` and no credentials;
    - the token in a URL: the same preflight again, at `/v1/invitations/web-preview?token=<token>`, with the same answer. (Until review round 1 this was a GET, whose line, a 404 of no operation, any request to a path the API doesn't have makes too.)
4. **The buffer after.** The same `flyctl` call, up to 12 times, 5 seconds apart, until the new entries hold the three lines those requests make, each entry counted once however many reads print it:
    - two preflight lines, `"preflight":"previewInvitationWeb"` with status 204;
    - one line of the operation, `"op":"previewInvitationWeb"` with status 404.

    Each line is told from every other by its request id (`reqId`), never by Fly's timestamp. If they never come, it fails and says how many came. After one read more, if the new entries hold more of those lines than the run sent, it fails too: another client used the page's path meanwhile (section 1). The `dev` claim keeps other threads off `dev`, and the run goes while nobody opens an invitation page (section 5), so that it doesn't fail that way. Each read has a 45-second limit, so the run's longest, 14 reads, 13 waits and 3 requests, is under 13 minutes, inside the `ops` job's 20, and ends with the script's own message.
5. **The count.** In every read's whole output after the requests, standard output and standard error, it counts the lines that hold, each line once however many reads print it:
    - the token;
    - its first 16 characters;
    - its last 16 characters;
    - its SHA-256 in hex.

    Every count must be 0.
6. **What it says.** Each answer's status and whether its headers were right, never a value the server sent (not even a wrong code, which a fault could make an echo of the token); the entries the first read and the last held; the read in which its lines came, or how many came; the four counts, with the reads and the entries they held; and `spike-links: every check passed`.

`flyctl` failing (an exit code that isn't 0, or its time limit) or printing what isn't JSON fails the run, with its exit code and its error lines that hold none of the token's forms (`failure`). So does an answer that isn't the one expected. The script reads no clock (T1, `packages/domain/src/time/one-clock.test.ts`): it waits with `ctx.sleep`, limits each request with `AbortSignal.timeout` and each read with flyctl's call limit.

`run.ts` registers it as `spike-links`, with no options.

## 3. Tests first (`tools/ops/src/spike-links.test.ts`)

Written before the code, with the fake `flyctl` (`test/fake-fly.ts`) and a fake `fetch`, each seen failing first:

- clean logs whose later read holds the three lines: it passes, and its lines are exactly the expected ones;
- a planted token in a later read, as the whole token, its first 16, its last 16 or its hash, in standard output or standard error: it fails, saying which count, and never the token;
- the three lines never come, or only some of them: it fails after 12 reads, saying how many came;
- lines that were already in the first read, a 404 of no operation (a scanner's request elsewhere), one line printed by two reads, even under another timestamp, and a request line without its id don't count as the run's; two requests' lines under one timestamp count as two;
- more of those lines than the run sent, from a page opened during the run, fail it, whether they come with the run's or in the read after; the token, if also found, is said first;
- a token line printed by two reads is counted once, and two lines as two;
- either preflight with another status, no allowance, no `POST` or no `content-type`, or the POST with another status, code, allowance or no `Vary`, or either with credentials allowed: it fails, and never says a code the server sent;
- each read's 45-second limit, each request's 15-second limit, and the longest run inside 15 minutes;
- `flyctl` exiting with an error, or printing what isn't JSON: it fails, and its error lines that hold the token or any of its forms are left out;
- the token isn't in anything the script says, in any test;
- every `flyctl` call is `logs -a tadayo-api-dev --no-tail --json`, and every request goes to `https://api-dev.tadayo.app`;
- `run.ts`: `spike-links` is listed, and refuses an option.

## 4. The `ops` entry (its own CI-configuration PR: `api/b0-spike-links-ops`)

`ops.yml` offers only its listed scripts, so `spike-links` needs:

- its choice in `inputs.script`;
- its job, like `worker-scale`'s: the checkout, `ops_steps.py check`, Node, pnpm, the install, `setup-flyctl`, then `ops_steps.py run` with `FLY_API_TOKEN` alone and `permissions: contents: read`;
- its entry in `tools/ci/ops_steps.py`, `Script(("FLY_API_TOKEN",), flyctl=True)`, and in `tools/ci/ops_steps_test.py`.

This is CI configuration (T58), so it goes in its own PR, made from `main` beside this one and merged right after it, so that no run can name a script `run.ts` doesn't have. It needs a freeze the coordinator carries, asked for before its push. It is linted with `actionlint`, `zizmor` and `yamllint -c .yamllint.yaml`.

## 5. The merges and the run, in order

1. **This PR.** Reviewed at full depth by a fresh reviewer, since it reads `dev`'s logs with the Fly token. Then the founder's approval in this thread. Before the merge, a `dev` claim from the coordinator and no `ops` or `deploy-dev` run under way. Then the squash-merge at the approved head, `deploy-dev` watched, and `dev` released.
2. **The `ops` PR**, the same way, under its freeze, merged right after this one; its merge deploys `dev` too, so it has its own `dev` claim and `deploy-dev` watched. The founder is asked to approve both at once. Both write the journal, so `main` merged into the `ops` PR after this one merges will conflict there; its new head needs the founder's word again before it merges, as PR #52 did after #51. It goes up beside this PR and the ios lane's PR #98, which departs from `docs/GITHUB.md`, "Merge timing", on the coordinator's word, so the founder is asked about that with the approval, as with #52.
3. **The run**, on the founder's yes, under a `dev` claim, while nobody opens an invitation page (the founder's device run comes at another time):
    - `gh api -X POST repos/beurni2/tadayo/actions/workflows/ops.yml/dispatches -f ref=main -f inputs[script]=spike-links`;
    - the run's log read, and the claim released.

    The run moves no clock, writes no row and starts or stops nothing. It sends three requests and reads the buffer. A failure says where. A fix goes in its own PR, and a second run needs a new yes.
4. **The device run.** The founder's steps on the ios lane's TestFlight build (`docs/plans/ios-b0-spike-links.md`, section 4): the link opens Tadayo from a running and a closed app, and Safari shows the page without the app. The ios lane gives the founder those steps with its build; the report records what the founder saw.

## 6. The report (`docs/spikes/S6-links.md`)

One page, in its own PR after the run, with the evidence:

- the association file served (the founder's check at 01:41 UTC on 2026-11-21);
- the page on the founder's iPhone (13:28 UTC, Chrome on iPhone, which is WebKit), and Safari in the device run;
- the CORS answers and the request lines from PR #94's browser check;
- this run's counts and its run id;
- the device run's results.

It is a part of Gate 0's PDF, the api lane's half (`docs/plans/B0.md`, section 6).

## 7. Records

The journal:

- blocks 1.1 and 1.2;
- block 1.2's step 11;
- the audit row for T52 (the check, where it runs, its test names);
- a log entry;
- the PR's row in table 4.1.

Also `docs/PROGRESS.md`'s api section. No ADR and no FQ: S6's row already asks for this check, and ADR-034 has `ops` call `flyctl`.

## 8. Risks

- **The buffer's page may not hold the run's lines**, if Fly serves older entries first or the page is short. Then the run fails, saying the lines never came, and the check needs another way to read: `--machine` for the API's Machine, or more reads. It never passes without them.
- **`flyctl logs` has never run in a cloud session or on the runner.** Its JSON keys were read from its source, as fly.ts says of every call. The run is the first real one, and a key that differs fails it.
- **Fly's lines may carry the request's URL** (`meta.url.full`). If they did, the third request's token would be counted and the run would fail. That would be a finding about Fly's logs, not about the page, which never puts the token in a URL. The report would say so, and the request would stay, since a client that ever did put it there would leak through it.
