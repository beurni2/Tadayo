# api/b2-contract-5xx: the contract says any operation may answer a bare 500 or 503

B2 · api lane. The contract's half of the outside audit's B8 fourth gap ("5xx not declared"). The rest of B8 is
`api/b2-test-gaps` (`docs/plans/api-b2-test-gaps.md`); this part is its own PR because a contract change is
(`docs/GITHUB.md`: "A contract change (`packages/contracts/openapi.yaml`) is its own PR from the api lane, with the
generated diff visible").

Sources: T19 (one commit per key, a retry under the same key); T14 and T55 (answers carry only what the contract
names); spec 32 (the API); A7's agreement with the ios lane (`docs/plans/api-b2-db-limits.md`: the contract declares no
503 but `getHealth`'s, and the app reads every 5xx as `.unavailable`, keeping its key); the health check's plan
(`docs/plans/api-b2-health-check.md` section 0.3).

## 0. The gap, re-checked on `main` at `bbd2291`

Every operation can answer a bare 500 (`services/api/src/app.ts` `failed`: no body, `Cache-Control: private,
no-store`) and a bare 503 (`services/api/src/answers.ts` `unavailable`: sign-in's keys out of reach, Storage, or the
database out of time on a lock or a statement). `packages/contracts/openapi.yaml` lists neither, but `getHealth`'s 503,
and its rules (`info.description`) say nothing of them, so a reader of the contract alone, or a client generated from
it, can't know a 5xx may come or what it holds. Holds.

## 1. The change

One rule line in the document's description (`packages/contracts/src/document.ts` `DESCRIPTION`), after the
Cache-Control rule, with `openapi.yaml` written again (`pnpm --filter @tadayo/contracts openapi:write`):

> Any operation may also answer 500 when the server fails, or 503 when something it depends on is out of reach for now
> (sign-in's keys, Storage, or the database out of time on a lock or a statement). Either comes with no body and with
> Cache-Control: private, no-store, and no operation lists either but getHealth, whose 503 is its answer. An app sends
> a retry under the same Idempotency-Key (T19).

No operation gains a response: listing a 500 and a 503 on every operation would change every generated Swift response
enum, which A7's agreement left as it is, and add nothing the rule doesn't say. The generated diff is that one line.

The test, `packages/contracts/src/contract.test.ts` "says in its rules that any operation may answer a bare 500 or 503,
which no operation lists but the health check (the outside audit's B8)": the line, word for word, once; no operation
lists a 500; only `getHealth` lists a 503.

## 2. Tests first

On `main`'s `document.ts` (at `bbd2291`, with this slice's test and `openapi.yaml`), the new test fails (`expected [] to deeply
equal [ Array(1) ]`: no such line), and so does "is what the zod schemas generate", since the YAML here was written with the
line. With the change, the contract's 252 tests pass (`main`'s 251 and this one).

## 3. What it leaves to others

The app's half: a test that `TadayoAPI`'s generated client reads an undeclared 500 and 503 as `.unavailable`
(`packages/swift/TadayoAPI`), the ios lane's, told to it with this PR.
