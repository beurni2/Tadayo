# api/b0-pooler-ca: check the session pooler's certificate

The api lane's plan for the PR that closes `docs/LIMITATIONS.md`'s row of 2026-11-11 on the database links being encrypted but not authenticated (`docs/JOURNAL.md` block 1.2, step 3). Written 2026-11-13, from `main` at `6912728`.

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
- `tools/ops/src/database.ts` `connectionOptions`: `ssl: poolerTls()`.
- `tools/ops/src/environment.ts` `pgEnvOf`: `PGSSLMODE=verify-full` and `PGSSLROOTCERT` set to the checked file's path, so `bootstrap`'s `psql` checks the chain and the name too (libpq takes a file, not a string).
- Root only, not the intermediate (which has no published copy and is the one likely to be reissued, #50862) nor the leaf. No public CA is added beside it, and no environment variable can loosen it, as `ssl.ts` already keeps TLS out of a pasted secret's hands.
- A link to a host given as an IP address is checked against `localhost` by Node (postgres.js sends no servername then), so it fails: every connection string Tadayo uses names the pooler's host (`tools/ops/src/environment.ts` `devDatabaseUrl` for `ops`; Fly's `DATABASE_URL` for the API and the worker).

## 4. Tests, written first

- `packages/domain/src/db/ssl.test.ts`:
  - the committed file's SHA-256 is the pinned one, and the file is one certificate, a CA, named `Supabase Root 2021 CA`;
  - `checkPinnedRoot` refuses an empty string, whitespace, the root twice, the root with another certificate or a private key beside it, another certificate, and text that isn't PEM;
  - `transportOptions` gives the pinned object, unchanged in shape (`ca` holds exactly the file's text, `rejectUnauthorized` is `true`, no other key), for every remote case the file already lists, and `{}` for the loopback cases, as now;
  - `tlsPinnedTo` gives a frozen object and array.
- `services/api/src/connection-tls.test.ts`, with no network: a front end on loopback that answers postgres.js's SSLRequest and records whether a StartupMessage came, with certificates made by `openssl` in a temporary folder when the test starts (a root, an intermediate without Key Usage as the pooler's, leaves). Through postgres.js and `tlsPinnedTo(<the test's root>)`, dialling `localhost`:
  - the leaf and intermediate sent, the name right: the StartupMessage arrives inside TLS;
  - refused, with no StartupMessage: a leaf from another root with the same name; the right root and a wrong name; the leaf sent without its intermediate; a server that answers `N` (no plaintext); and each of those again with `NODE_TLS_REJECT_UNAUTHORIZED=0` set.
- `services/api/src/connection.test.ts` and `services/worker/src/connection.test.ts`: the client's `ssl` option is the pinned object for the pooler's string, as they now check `"require"`.
- `tools/ops/src/database.test.ts` and `environment.test.ts`: `ssl` is the pinned object; `pgEnvOf` gives `verify-full` and the checked file's path.
- `tools/ops/src/deploy-files.test.ts`: the root reaches the image (`packages/domain/src` is copied and not excluded by `.dockerignore`).

## 5. After the merge, on `dev` (each run on the founder's yes, `dev` claimed through the coordinator first and released after)

In order of reach, each from `main`:
1. `migrate` (it applies nothing new): the runner's link through `connectionOptions` under the pin.
2. `bootstrap` (it can run again): `psql` with `verify-full`.
3. `deploy-branch` with `main`: the API and the worker on Fly under the pin; the API listens only once its database answers.
4. `supabase-probe`: the Machine's own link under the pin, and the probe passing as before.

A failure is closed: no user name or password leaves. Rolling back is reverting the PR and running `deploy-branch` again. If the chain doesn't verify, the run's error names the TLS failure, and the next step is a run that reads the chain the pooler sends, before anything is widened. Then the founder's step, asked once with this PR's approval: "Enforce SSL on incoming connections" on `tadayo-dev` (Database settings), which refuses clients that ask for no TLS, on both legs through the pooler, and restarts the database for a few minutes; then `migrate` once more.

## 6. Records

`docs/LIMITATIONS.md`: the row on authenticating the database link closed in code and then by the runs; a new row on what would make the pin fail (the root's expiry, the same-named 2025 root, Supavisor's certificates by SNI and by key type) and what to do then (add the successor beside the old root, never a public CA, once Supabase publishes it). `docs/JOURNAL.md`: blocks 1.1 and 1.2, section 0's line on `packages/domain/`, the audit map's T56 row, the log and table 4.1. `docs/PROGRESS.md`.

## 7. Review

A security change: full depth (the founder's rule of 2026-11-11 keeps the cap of two rounds for lower-risk PRs only). Fresh reviewers by lens (the TLS client and its traps; the tests and their fixtures; the records), each finding put to a refuter, until a round finds nothing of medium or higher; and deliberate breakages of the pin (`docs/JOURNAL.md` section 4.4), each to be caught by a test.
