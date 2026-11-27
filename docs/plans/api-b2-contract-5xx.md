# api/b2-contract-5xx: the contract says any operation may answer a 500 or a 503

B2 · api lane. The contract's half of the outside audit's B8 fourth gap ("5xx not declared"). The rest of B8 is
`api/b2-test-gaps` (`docs/plans/api-b2-test-gaps.md`, on that branch); this part is its own PR because a contract change is
(`docs/GITHUB.md`: "A contract change (`packages/contracts/openapi.yaml`) is its own PR from the api lane, with the
generated diff visible").

Sources: T19 (one commit per key, a retry under the same key); T14 and T55 (answers carry only what the contract
names); spec 32 (the API); A7's agreement with the ios lane (`docs/plans/api-b2-db-limits.md`: the contract declares no
503 but `getHealth`'s, and the app reads every 5xx as `.unavailable`, keeping its key); the health check's plan
(`docs/plans/api-b2-health-check.md` section 0.3).

## 0. The gap, re-checked on `main` at `bbd2291`

Every operation can answer a bare 500 (`services/api/src/app.ts` `failed`: no body, `Cache-Control: private,
no-store`) and a bare 503 (`services/api/src/answers.ts` `unavailable`: sign-in's keys out of reach, Storage, or the
database out of time on a lock or a statement). A server that is stopping answers a request on a connection still in
use with Fastify's own 503 (`return503OnClosing`, on by default): a short JSON body in Fastify's words and no
Cache-Control, as the header comment of `services/api/src/app.ts` says (round 1 found the first rule missed it).
`packages/contracts/openapi.yaml` lists none of them except `getHealth`'s 503, and its rules (`info.description`) say
nothing of them, so a reader of the contract alone, or a client generated from it, can't know a 5xx may come or what it
holds. Holds.

## 1. The change

One rule line in the document's description (`packages/contracts/src/document.ts` `DESCRIPTION`), after the
Cache-Control rule, with `openapi.yaml` written again (`pnpm --filter @tadayo/contracts openapi:write`):

> Any operation may also answer 500 when the server fails, or 503 when something it depends on is out of reach for now
> (sign-in's keys, Storage, or the database out of time on a lock or a statement) or the server is stopping. Each
> comes with no body and with Cache-Control: private, no-store, except the stopping server's 503, which has a short
> JSON body in Fastify's own words and no Cache-Control. No operation lists them except getHealth, which lists its own
> 503. An app reads any 5xx, listed or not, as the service out of reach for now, and reads no 5xx's body.

No operation gains a response: listing a 500 and a 503 on every operation would change every generated Swift response
enum, which A7's agreement left as it is, and add nothing the rule doesn't say. The generated diff is that one line.

The rule's last sentence is what the generated client does (`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`:
an undocumented status of 500 or more is `.unavailable`, its payload unread), and it keeps the rule true for a 5xx the
server doesn't send, from anything in front of it, without naming each code. The rule says nothing of retries: the
Idempotency-Key rule above it already says a key is reused on every retry, and most operations take none.

The test, `packages/contracts/src/contract.test.ts` "says in its rules that any operation may answer a 500 or a 503,
and lists no 5xx but the health check's own 503 (the outside audit's B8)": the line, word for word, once; `getHealth`
is an operation; and each operation's response keys that start with 5, with `default`, are `["503"]` for `getHealth`
and none for any other, so a `default`, a `5XX` range or another 5xx code fails it as a 500 does (each would change the
generated Swift response enums).

## 2. Tests first

On `main`'s `document.ts` (at `bbd2291`, with this slice's test and `openapi.yaml`), the new test fails (`expected [] to deeply
equal [ Array(1) ]`: no such line), and so does "is what the zod schemas generate", since the YAML here was written with the
line. With the change, the contract's 252 tests pass (`main`'s 251 and this one).

After round 1, three breakages, each planted alone in `document.ts` (the responses `buildDocument` gives an
operation), run, restored from its copy and compared after: K1 a `default` response on `getMe`, K2 a 502 on
`createClub`, K3 a `5XX` on `updateMe`. Each fails the new test and "is what the zod schemas generate" (the YAML not
written again). Under the first commit's `document.ts` and test, the same three fail only "is what the zod schemas
generate", which `openapi:write` makes pass.

## 3. What it leaves to others

The app's half: a test that `TadayoAPI`'s generated client reads an undeclared 500, and a 503 with a body, as
`.unavailable` (`packages/swift/TadayoAPI`), the ios lane's, told to it with this PR. An undeclared 503 with no body is
tested already (`TadayoAPIClientTests.swift`, `ClubCallsTests.swift`).

## 4. Review

Round 1, a fresh subagent that hadn't seen the work, on the first commit (`4c55aacd`), as a lower-risk PR (at most two
rounds). Six findings, each fixed in the second commit:

- **C1 (blocker):** the rule said every 500 and 503 comes with no body and `Cache-Control: private, no-store`, but a
  stopping server's 503 is Fastify's own, with a JSON body and no Cache-Control (the reviewer saw it with the installed
  Fastify: two pipelined requests, `close()` between). The rule names it; making shutdown answer `unavailable` would be
  a change to the server, in its own PR with a test.
- **C2:** "An app sends a retry under the same Idempotency-Key (T19)" read as if every operation takes a key. Dropped.
- **C3:** the test compared only the keys "500" and "503". It compares every 5xx key and `default` now, with
  `getHealth` present (K1 to K3 above).
- **C4:** the ios lane's ask narrowed to an undeclared 500 and a 503 with a body (section 3).
- **C5:** B8's plan cited as on its branch.
- **C6:** copy: "No operation lists them except getHealth, which lists its own 503"; section 0's double "but".

No second round: round 1 found nothing wrong in the server or the generated client, and each fix is checked above.
