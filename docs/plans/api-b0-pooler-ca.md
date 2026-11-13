# api/b0-pooler-ca: check the session pooler's certificate

The api lane's plan for the PR that closes `docs/LIMITATIONS.md`'s row of 2026-11-11 on the database links being encrypted but not authenticated (`docs/JOURNAL.md` block 1.2, step 3). Written 2026-11-13, from `main` at `6912728`; sections 3 to 6 amended the same day after the first review round (PR #46; `docs/JOURNAL.md`, section 3.2).

## 1. Why

Every link to the database (the API's, the worker's, the `ops` scripts' and `bootstrap`'s `psql`) goes through Supabase's session pooler (TECH-DESIGN section 1's Database row) and asks for TLS with `ssl: "require"` (`packages/domain/src/db/ssl.ts` `transportOptions`, `tools/ops/src/database.ts` `connectionOptions`) or `PGSSLMODE=require` (`tools/ops/src/environment.ts` `pgEnvOf`). That encrypts but accepts any certificate. So whoever could answer in the pooler's place would be believed, and postgres.js answers a server's request for a cleartext password with the password (`postgres` 3.4.9, `src/connection.js`, `AuthenticationCleartextPassword`): `tadayo_app`'s password, and with it every club's data, would go to that party (T56). This PR makes each link check the pooler's chain and name against Supabase's root, and nothing else.

## 2. What was found (research of 2026-11-13, workflow `wf_9fc53fed-1b8`)

- **The root.** Supabase's dashboard (Database settings, SSL configuration, "Download certificate") links every project to one file, `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt` (supabase/supabase, `apps/studio/hooks/custom-content/custom-content.json`, `ssl:certificate_url`, templated with `prod`). Supabase's own CLI carries the same certificate byte for byte (supabase/cli, `prod-ca-2021`). It is one self-signed root: `CN=Supabase Root 2021 CA, O=Supabase Inc`, RSA 2048, valid 2021-04-28 to 2031-04-26, SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- **The pooler's chain.** Supabase's CLI (supabase/cli PR #7518, merged 2026-11-06) says the pooler certificates on `aws-0-us-east-1.pooler.supabase.com` and others chain to that root. Users report the chain as `*.pooler.supabase.com`, issued by `Supabase Intermediate 2021 CA`, issued by the root with this fingerprint, the intermediate sent by the pooler (supabase/supabase issue #50862, aws-0-us-east-1 on 5432 and 6543). Supabase's docs show `sslmode=verify-full` with this file against pooler hosts (`guides/platform/ssl-enforcement.mdx`, `guides/database/psql.mdx`). None of that is a reading of `dev`'s own host from Tadayo's own path: the first runs after the merge are (section 5).
- **The intermediate has no Key Usage** (issue #50862), which strict X.509 clients refuse; Node 26 with OpenSSL 3.5.9 accepts such a chain and still checks the name (a local chain made that way).
- **The client.** postgres.js 3.4.9 sends the SSLRequest before anything else, and with an `ssl` object calls `tls.connect({ socket, servername: <the host, unless it is an IP>, ...ssl })`; it falls back to plaintext only for `ssl: "prefer"`; an `ssl` option beats the string's `sslmode`. Node 26 checks the name with `checkServerIdentity` whenever the chain verifies, and a given `ca` replaces its whole root store (`NODE_EXTRA_CA_CERTS` and the system store included). Two traps: `ca: ""` is falsy and falls back to the default store, and `NODE_TLS_REJECT_UNAUTHORIZED=0` turns checking off unless `rejectUnauthorized: true` is given explicitly.
- **Risks to the pin.** The root expires on 2031-04-26; Supabase has a second root with the same name and another key (`prod-ca-2025`, for Snap Cloud); Supavisor can serve another certificate by SNI (supavisor PR #1244, merged 2026-10-22) and an ECDSA pair beside the RSA one (PR #898). A change to the pooler's CA makes every new link fail, before any user name or password is sent: the API doesn't start, a running process loses its links as postgres.js recycles them (30 to 60 minutes), and `ops` scripts fail with the TLS error.

## 3. The design

- `packages/domain/src/db/supabase-root-2021.crt`: the root, as the dashboard's link serves it. `packages/domain/src` is already copied into the image and allowed by `.dockerignore`, so the Dockerfile doesn't change.
- `packages/domain/src/db/ssl.ts`:
  - `SUPABASE_ROOT_CA_SHA256`, the fingerprint above, and `SUPABASE_ROOT_CA_PATH`, the file's path;
  - `checkPinnedRoot(pem)`, which refuses anything but exactly one certificate block whose SHA-256 is the pinned one (so an empty file, a second certificate, a key or another root never reaches `ca`);
  - `supabaseRootCa()`, the file read once and checked;
  - `tlsPinnedTo(root)`, `{ ca: [root], rejectUnauthorized: true }`, frozen, with no `servername`, `socket` or `checkServerIdentity` of its own, so postgres.js's servername (the host) is the name checked;
  - `poolerTls()`, `tlsPinnedTo(supabaseRootCa())`;
  - `transportOptions(url)`, `{ ssl: poolerTls() }` for every host but a plainly written loopback one, which keeps `{}` as now.
- `tools/ops/src/database.ts` `connectionOptions`: `ssl: poolerTls()`; `connectToDev`, the client `tools/ops/src/main.ts` gives every script, built from it; and `certificateRefusal`, so that an `ops` script whose link the pin refused says so, and that nothing was sent, instead of asking whether `bootstrap` ran and the password is right (`tools/ops/src/run.ts` `withDatabase`).
- `tools/ops/src/environment.ts` `pgEnvOf`: `PGSSLMODE=verify-full` and `PGSSLROOTCERT` set to the checked file's path, so `bootstrap`'s `psql` checks the chain and the name too (libpq takes a file, not a string).
- Root only, not the intermediate (which has no published copy and is the one likely to be reissued, #50862) nor the leaf. No public CA is added beside it, and no environment variable can loosen it, as `ssl.ts` already keeps TLS out of a pasted secret's hands.
- A string is plainly loopback only when postgres.js and `new URL` both read a loopback host there. postgres.js 3.4.9 (`src/index.js` `parseUrl`) reads the hosts up to the first `?` or `/`, past a `#` where `new URL` stops, and a comma there as a list it dials in turn: so `…@localhost:1#,elsewhere:5432/…` gets TLS, where it got none before (review round 1). `tools/ops/src/migrate-cli.ts`, the by-hand entry for a local Postgres, opens a fifth client and refuses any string `transportOptions` gives TLS, so it never reaches the pooler.
- A link to a host given as an IP address is checked against `localhost` by Node (postgres.js sends no servername then), so it fails: every connection string Tadayo uses names the pooler's host (`tools/ops/src/environment.ts` `devDatabaseUrl` for `ops`; Fly's `DATABASE_URL` for the API and the worker).

## 4. Tests, written first

- `packages/domain/src/db/ssl.test.ts`:
  - the committed file's SHA-256 is the pinned one, and the file is one certificate, a CA, named `Supabase Root 2021 CA`;
  - `checkPinnedRoot` refuses an empty string, whitespace, the root twice, the root with another certificate or a private key beside it, another certificate, and text that isn't PEM;
  - `transportOptions` gives the pinned object, unchanged in shape (`ca` holds exactly the file's text, `rejectUnauthorized` is `true`, no other key), for every remote case the file already lists, and `{}` for the loopback cases, as now;
  - `tlsPinnedTo` gives a frozen object and array.
- `services/api/src/connection-tls.test.ts`, with no network: a front end on loopback that answers postgres.js's SSLRequest and records whether a StartupMessage came, with certificates made by `openssl` in a temporary folder when the test starts (a root, an intermediate without Key Usage as the pooler's, leaves). Through postgres.js and `tlsPinnedTo(<the test's root>)`, dialling `localhost`:
  - the leaf and intermediate sent, the name right: the StartupMessage arrives inside TLS;
  - refused, with no StartupMessage: a leaf from another root with the same name; a leaf from another root with the same name and the same key identifier, which only the signature tells apart; the right root and a wrong name; the leaf sent without its intermediate; a server that answers `N` (no plaintext); and each of those again with `NODE_TLS_REJECT_UNAUTHORIZED=0` set.
- `services/api/src/connection.test.ts` and `services/worker/src/connection.test.ts`: the client's `ssl` option is the pinned object for the pooler's string, as they now check `"require"`.
- `tools/ops/src/database.test.ts` and `environment.test.ts`: `ssl` is the pinned object, in `connectionOptions` and in the client `connectToDev` builds; `pgEnvOf` gives `verify-full` and the checked file's path; `certificateRefusal` names Node's codes for a refused certificate and nothing else. `run.test.ts`: `bootstrap` gives psql `verify-full` and the file, and a refused certificate is said as one. `main.test.ts`: `main.ts` gives the scripts `connectToDev` and makes no client of its own.
- `ssl.test.ts`, and the API's and the worker's `connection.test.ts` through postgres.js: a string with `#,` or `#%2C` after a loopback host gets TLS; and, for strings written to make the two readings differ, no TLS only when every host the driver would dial is a loopback one.
- `tools/ops/src/deploy-files.test.ts`: the root reaches the image (`packages/domain/src` is copied and not excluded by `.dockerignore`).

## 5. On `dev`, before and after the merge (each run on the founder's yes, asked once with the PR's approval; `dev` claimed through the coordinator first and released after)

Before the merge, each started from `main` with the branch as `deploy-branch`'s input, so that `main` takes the pin only once the deployed links have met it (review round 1, d-1):
1. `deploy-branch` with `api/b0-pooler-ca`: the API on Fly under the pin. The API listens only once its database answers, and the run fails when no API Machine is started on the image (`tools/ops/src/deploy-branch.ts`). The worker connects as it starts too: if its Machine is started before the run (it was after run 43160591767), a crash under the pin fails flyctl's smoke check and so the run, and the run's last line, "the API and the worker run" the image, shows its link; if that line says the worker's Machine is stopped, the run doesn't show the worker's link, which is then the API's code (`transportOptions`) with the same Fly secret, `DATABASE_URL`, until `worker-scale` starts it.
2. `supabase-probe`: its Machine half runs the deployed image's `ops` code, so the Machine's own link under the pin, and the probe passing as before.

If either fails, nothing is merged. `deploy-branch` with `main` puts `main`'s image back. A Machine that crashed is restarted a few times and then left stopped, and a deploy leaves a stopped Machine stopped (`tools/ops/src/on-machine.ts` `onMachine`; `docs/plans/api-b0-deploy.md`, section 2), so if that run says no API Machine is started, the founder starts the API's Machine in Fly's dashboard (the app `tadayo-api-dev`, Machines, the one in the `api` group, Start), and `deploy-branch` with `main` runs once more to show the API started, before `dev` is released. Fly's log of the app shows Node's certificate error; its hint to try the system's store doesn't apply, since the pin replaces Node's whole store. The next step is then a run that reads the chain the pooler sends, before anything is widened.

After the merge, squash-merged only when both passed, from `main`:
3. `migrate` (it applies nothing new): the runner's postgres.js under the pin.
4. `bootstrap` (it can run again): `psql` with `verify-full`.
5. `deploy-branch` with `main`: `dev` back on `main`'s image, which holds the same code as the branch's.

If step 3 or 4 fails, the deployed API isn't touched (it met the pin in step 1), but no runner script reaches the database until the PR is reverted: the revert is a PR of its own, opened at once, and the coordinator is told. A failure is closed: no user name or password leaves. Then the founder's step: "Enforce SSL on incoming connections" on `tadayo-dev` (Database settings), which refuses clients that ask for no TLS, on both legs through the pooler, and restarts the database for a few minutes; then `migrate` once more.

## 6. Records

`docs/LIMITATIONS.md`: the row on authenticating the database link closed in code and then by the runs; a new row on what would make the pin fail (the root's expiry, the same-named 2025 root, Supavisor's certificates by SNI and by key type) and what to do then: once Supabase publishes a successor, a PR of its own that widens the pin on purpose, reviewed as such, since the check takes exactly one certificate with one fingerprint (`checkPinnedRoot`, `ONE_CERTIFICATE`, `SUPABASE_ROOT_CA_SHA256`): a fixed set of pinned fingerprints, or a second pinned file checked the same way, with `ca` holding both and `ssl.test.ts`'s refusals of a second certificate changed with it; never a public CA, and no setting that loosens it. `docs/JOURNAL.md`: blocks 1.1 and 1.2, section 0's line on `packages/domain/`, the audit map's T56 row, the log and table 4.1. `docs/PROGRESS.md`.

## 7. Review

A security change: full depth (the founder's rule of 2026-11-11 keeps the cap of two rounds for lower-risk PRs only). Fresh reviewers by lens (the TLS client and its traps; the tests and their fixtures; the records), each finding put to a refuter, until a round finds nothing of medium or higher; and deliberate breakages of the pin (`docs/JOURNAL.md` section 4.4), each to be caught by a test.
