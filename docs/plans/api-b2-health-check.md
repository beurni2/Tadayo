# api/b2-health-check: the outside audit's A7, part 2: a health check that asks the database

The outside audit of 2026-11-24, finding A7 (Medium, proven), ends its fix with: "Add a health check that makes one
database round trip; it needs a route, which then belongs in the contract and the matrix." Its impact names the gap:
while one held row stalled every request, "Fly keeps reporting the Machine healthy", because `fly.toml`'s check is on
the TCP port only. A7's first part (`api/b2-db-limits`, PR #126: the role's time limits, the timeouts answered with the
bare 503, the pools sized on purpose) is its own PR; this is the second.

Re-checked against `main` at `dd0154d` before the change: `fly.toml` has `[[services.tcp_checks]]` (grace 20 s,
interval 15 s, timeout 3 s) and no HTTP check; `tools/ops/src/deploy-files.test.ts` requires exactly that ("expects
no `http_checks`"); no operation of the contract (`packages/contracts/src/operations.ts`, `operations-clubs.ts`) asks
the database for nothing but its health; and `docs/LIMITATIONS.md` (2026-11-11) records the TCP check as accepted
because an HTTP check needs a path, and a path outside the contract would be a route the privacy matrix has no row for
(T58).

Sources: the audit's A7; spec 34 (prefer disabling the affected part over serving uncertain content); spec 35 (the
API's p95); T14 (one answer whatever the caller), T52 (logs carry an error's class and code), T58 (every route has a
row of the matrix); TECH-DESIGN sections 1 (Fly, Supabase's session pooler), 7 and 9 (the deploy).

## 0. Readings

0.1. **The route.** `GET /v1/health`, `getHealth`, public: Fly's check carries no session. It sends one `SELECT 1`
through the API's own pool (`deps.sql`), outside a transaction, and answers 204 with `Cache-Control: private,
no-store` and no body when it comes back; when it fails, or hasn't come back within `HEALTH_MS` (2 s), it answers the
bare 503 (`answers.ts` `unavailable`) and logs one warning, "database unreachable", with the error's class and code
alone, or "database slow" with none (T52). It reads no table and writes nothing, so every caller, signed in or not, in
any state of any club, gets the same answer from the same database (T14). Through the API's pool, so a pool whose
connections are all taken (ten, postgres.js's default, on `main`; six once A7's first part merges), the stall A7 proved,
fails the check too: the query waits for a connection and the bound ends the wait. The app never calls it.

0.2. **The bound, 2 s.** Under Fly's 3 s check timeout, so the API answers the check itself rather than letting Fly's
timeout speak for it; a `SELECT 1` takes about a millisecond on a free connection. The handler's own timer bounds it
(`setTimeout`, cleared on every path), since the role's statement limit (A7's first part) bounds only a running
statement, not the wait for a connection, and isn't on `main` yet. The query the timer gave up on stays queued for a
connection and runs when one is free; it takes no lock and holds its connection for one round trip.

0.3. **The contract.** A new operation in `packages/contracts/src/operations.ts`:
- `ok: { status: 204 }`, documented as every 204 is ("Done.").
- Its 503 documented, with no body (the ios lane, 2026-11-24: a documented 503 stays bodiless). A new optional flag on
  `Operation`, `unavailable?: true`, renders a "503" response with `Cache-Control` and no content
  (`packages/contracts/src/document.ts`); only `getHealth` sets it. The other operations' 503 stays undocumented, as
  A7's first part left it.
- No `NOT_FOUND`. `standardErrors` gives every public operation `NOT_FOUND` because the two so far name something by a
  token or a secret in their body; a public operation with no body and no path parameter names nothing that could be
  missing. The rule becomes: a path parameter, or public with a body. Neither existing public operation's document
  changes (both have a body).
- `INVALID_REQUEST` and `RATE_LIMITED` stay, as on every operation.
- The generated Swift client gains a `getHealth` method the app doesn't call; the ios lane is told before the push.
- The Swift client keeps its own list of the public operations (`BearerMiddleware.publicOperations` in
  `packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`), which its test
  `thePublicOperationsAreTheContracts` holds to the contract's `security: []` exactly, so `ci`'s `swift` job fails on
  this branch until the list has `getHealth`. `packages/swift` is the ios lane's (`docs/MILESTONES.md`, "Lanes"), so
  the ios lane adds it, in a commit of its own on `ios/b1-health-public-op` (from `main` at `dd0154d`, never a PR of
  its own), which this branch merges, so the contract and the client land in one merge.

0.4. **Fly's check.** `fly.toml`'s `[[services.tcp_checks]]` becomes `[[services.http_checks]]` with the same
`grace_period` (20 s), `interval` (15 s) and `timeout` (3 s), and `method = "GET"`, `path = "/v1/health"`,
`protocol = "http"` (the fields flyctl 0.5.8's own source reads, `docs/LIMITATIONS.md` 2026-11-24: fly.io's
documentation can't be read from the session). The method in capitals, as flyctl's own example writes it: Node's
parser refuses a method in lower case (`HPE_INVALID_METHOD`, tried on 2026-11-24), so a check that sent `get` as
written would get a 400 from every Machine. It goes to the Machine's `internal_port` over plain HTTP, so no TLS setting is needed.
What the check changes on `dev`: a rolling deploy waits for a new Machine's checks to pass before it goes on, so an API
that started but can't reach the database no longer passes the deploy; and Fly marks a Machine whose check fails as
critical. What Fly's proxy then does with the only Machine `dev` has isn't settled by flyctl's source; it is seen on
`dev` after the merge (section 4).

0.5. **Who can call it.** Anyone, like the two other public routes, and each call costs one round trip on one of the
API's pool's connections, or a wait of at most 2 s for one. No route has a rate limit yet (`RATE_LIMITED` is in the contract, not built); the closed trial's
callers are the founder's friends and Fly's check. Recorded beside the other public routes' limits, to revisit with the
rate limits before Gate D.

0.6. **What closes.** `docs/LIMITATIONS.md`'s row of 2026-11-11 (the TCP check says the port is open, not that a request
is answered): its status becomes closed by this PR, with the route in the contract and the matrix. The row stays.

## 1. The change

1. `packages/contracts/src/operation.ts`: `unavailable?: true` on `Operation`; `standardErrors` adds `NOT_FOUND` for a
   path parameter, or a public operation with a body.
2. `packages/contracts/src/document.ts`: the bodiless 503 for an operation with `unavailable`.
3. `packages/contracts/src/operations.ts`: `getHealth`; `packages/contracts/openapi.yaml` written again
   (`pnpm --filter @tadayo/contracts openapi:write`).
4. `services/api/src/health.ts`: `HEALTH_MS` and `getHealthHandler(deps)`; `services/api/src/app.ts` registers it, and
   `services/api/src/index.ts` exports `HEALTH_MS` for the Postgres test.
5. `fly.toml`: the HTTP check in place of the TCP one, and its comment.
6. `docs/LIMITATIONS.md`: the 2026-11-11 row closed; a row for the check's fields, read from flyctl's source; a row
   for the public route's cost until the rate limits.
7. The privacy matrix: `tests/src/privacy/health.ts` (the judge: removeDevice's 204, `device.ts` `noContentProblems`),
   its row in `rows.ts`, `getHealth` in `account.ts`'s `PUBLIC`, and `harness.ts`'s `signedOutStep` taking a judge
   as well as a pinned answer, since a 204 has none of the neutral not-found's headers.
8. The tests whose counts follow the contract: `app.test.ts` (69 routes, `getHealth` built), `harness.test.ts` (68
   operations), `matrix.test.ts` (73 requests a world), `account.test.ts` (three public), `session.test.ts` (the public routes: a body-less one answers its
   204 rather than a refused field).

## 2. Tests first

2.1. `packages/contracts/src/contract.test.ts`: exactly `getHealth`, `previewInvitationWeb` and `removeDevice` need no
session; `getHealth`'s document has a 204, a 503 with no content and `Cache-Control`, and no 404; the two others keep
their 404; no other operation documents a 503.

2.2. `services/api/src/health.test.ts`, the app on a fake connection (no database): 204, empty, `private, no-store`,
with no `Authorization`; the same with a bad token (the gate passes a public route by); the bare 503 when the query
rejects, with one warning by class and code and nothing of its message; the bare 503 within the bound when the query
never answers (fake timers); the query is `SELECT 1` and nothing else.

2.3. `tests/src/db/health.test.ts`, on Postgres through `buildApp` on `connect`: 204; with every one of the API's
connections held by a transaction that waits, the check answers 503 within the bound and a margin; once they are let
go, 204 again.

2.4. The privacy matrix (`tests/src/privacy/`): `getHealth`'s row: to every role, in every state and phase, with its
session and with none (every signed-out caller and every token that isn't a session), 204 with nothing in it and
`private, no-store`, the same answer whoever asks. That it changes nothing rests on 2.2's statement check (`SELECT 1`
and nothing else, no transaction): the matrix doesn't take a snapshot of the whole database around each request.

2.5. `tools/ops/src/deploy-files.test.ts`: the API's service has one HTTP check, on `/v1/health` with `GET` and
`http`, grace 20 s, interval 15 s, timeout 3 s, and no TCP check.

Each seen failing on `main` first.

## 3. Breakages

At the PR's last head, each caught by the test it names:
- B1: the handler answers 204 without asking the database (health.test.ts's rejecting query; the Postgres test);
- B2: no bound: the handler awaits the query alone (health.test.ts's query that never answers; the Postgres test);
- B3: a failed query answered with the 500 (health.test.ts);
- B4: the 503 with a body (health.test.ts);
- B5: the warning carries the error's message (health.test.ts: T52);
- B6: the bound longer than Fly's timeout, 5 s (health.test.ts);
- B7: `getHealth` behind the gate, not public (contract.test.ts; the matrix row);
- B8: `getHealth`'s 503 left out of the document (contract.test.ts);
- B9: `NOT_FOUND` back on every public operation (contract.test.ts);
- B10: the handler queries a table (`SELECT 1 FROM app.users LIMIT 1`) (health.test.ts's query check);
- B11: `fly.toml` keeps the TCP check (deploy-files.test.ts);
- B12: `fly.toml`'s check on another path (deploy-files.test.ts);
- B13: `fly.toml`'s method in lower case, `get` (deploy-files.test.ts);
- B14: the handler races the query itself, with no handler for its rejection, so a query that fails after the bound is
  an unhandled rejection (health.test.ts's late failure);
- B15: the timer left running after a 204 (health.test.ts's timer count);
- B16: the matrix's row judging `getHealth` as the neutral not-found, as the other public routes are (the matrix;
  a run over every role).

## 4. After the merge

`deploy-dev` deploys with the HTTP check; its run shows the check passing on the new Machine before the deploy ends.
Then `curl -sS -o /dev/null -w '%{http_code}' https://api-dev.tadayo.app/v1/health` answers 204. What Fly's proxy does
when the only Machine's check fails is not provoked on `dev` (it would mean stopping the database or filling the pool on
purpose); it is recorded as not verified.
