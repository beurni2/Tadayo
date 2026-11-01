# Decisions

Record every technical choice the specs leave to you, and every ADR that proposes changing `docs/TECH-DESIGN.md`. An ADR changes the design only after the founder approves it. Decisions are numbered ADR-001 onwards, because the spec already uses D02 to D11 for its implementation defaults.

Format:

```
## ADR-001 · <short title> · <date> · <status: decided | proposed | approved | rejected>
Context: what needed deciding and why.
Decision: what you chose.
Alternatives: what else you considered, and why not.
Consequences: what this commits us to; how to undo it.
Links: PR, spec sections, invariants.
```

## ADR-001 · iPhone first, built on macOS CI · 2026-11-01 · decided
Context: Spec 30 proposes native SwiftUI on iOS and Kotlin with Compose on Android, with widgets and share extensions on both. Every member of a club must be able to install the app, so the first platform depends on the trial members' phones. The founder has no Mac, and Claude Code works from Linux cloud sessions.
Decision: The founder chose iPhone first (FQ1).
- Swift 6 and SwiftUI, with iOS 17 as the minimum until the founder confirms the phones (FQ4), built with the newest SDK so that newer iPhones get the current system look.
- Logic lives in Swift packages that compile and test on Linux.
- Views, the share extension and the snapshot tests are built on GitHub's `macos-26` runners.
- TestFlight uploads go from CI with an App Store Connect API key.
- Android follows the trial as a native Kotlin app against the same OpenAPI contract.
Alternatives: Android first, which is cheaper on CI and lets Claude Code screenshot screens in its own session, but the founder's own phone is an iPhone. Both before the trial, which roughly doubles the app work before the first club starts. A cross-platform framework, which still needs native extensions and would imitate the native controls the book asks for.
Consequences:
- Each `ios` run costs about 15 macOS minutes. About 300 a month are free on GitHub Pro; beyond that, about $0.06 a minute.
- Screens are judged from snapshots, not a simulator.
- The trial is for iPhone owners only, on phones that run the minimum iOS.
Links: `docs/TECH-DESIGN.md` sections 1, 2, 9; spec 30; FQ4.

## ADR-002 · No outside code reviewer · 2026-11-01 · decided
Context: The founder's rule from his earlier projects: no CodeRabbit.
Decision: Every PR gets an independent review from a fresh Claude Code subagent. A change that touches authorization, the database, time, idempotency, media, caches, tokens, notifications or the video viewer also gets a privacy and security review (`docs/GITHUB.md`). The founder merges.
Alternatives: CodeRabbit's GitHub App with a required approval check, which the founder dropped.
Consequences: Review quality rests on the reviewer brief in `docs/GITHUB.md`, the privacy matrix and the leak scanner. Adding an outside reviewer later is a CI-configuration PR.
Links: T58.

## ADR-003 · Supabase, Fly.io, Resend, APNs and Cloudflare · 2026-11-01 · decided
Context: Spec 30 asks for a modular TypeScript service on PostgreSQL, private object storage, durable workers and push.
Decision:
- **Supabase:** Postgres, Auth (email codes) and Storage (private buckets).
- **Fly.io:** the API and the worker, as two process groups of one image.
- **Resend:** sign-in emails.
- **APNs:** push, sent directly.
- **Cloudflare:** Pages for the invitation and policy pages, DNS, and one R2 bucket for the deletion log (ADR-010).
The app calls Supabase only to sign in and to put its own pending upload at the one-object signed upload URL the API gives it (ADR-009); everything else goes through the Tadayo API with the session token. Supabase's own data API stays closed (ADR-015). The API, the worker and the workflows reach Postgres through Supabase's session pooler, because the direct database host is IPv6-only and GitHub's runners have no IPv6.
Alternatives: Neon with Clerk and S3, which means more vendors. Supabase Edge Functions as the API, which have no long-running worker. Cloudflare R2 for media, which has zero egress fees but adds a second media store; revisit it if egress grows.
Consequences:
- Small bills at trial size: Supabase on its Pro plan from B0, because free projects pause after about a week without activity and the founder's TestFlight builds point at `dev`; Fly; a domain.
- Authorization lives in the API, not in row-level security; row-level security is on only as a closed backstop (ADR-015).
Links: `docs/TECH-DESIGN.md` sections 1, 7, 10.

## ADR-004 · dev and prod only until the public launch · 2026-11-01 · decided
Context: The trial has one operator.
Decision: `dev` serves every session and the founder's builds until Gate D. `prod` is created at Gate D for the trial. The restore drill runs on a temporary Supabase project.
Alternatives: A staging environment from day one: a third set of secrets and bills for no trial benefit.
Consequences: `deploy-prod` is run by hand after a gate. Staging comes before the public launch.
Links: `docs/TECH-DESIGN.md` section 7.

## ADR-005 · Plain SQL and generated contracts · 2026-11-01 · decided
Context: The cutoff, the six-and-two limits and the immutable audience all depend on row locks, the clock sampled after locking, and database uniqueness. The app must not drift from the server.
Decision: The `postgres` driver with tagged-template SQL, and numbered SQL migrations. Zod schemas generate `openapi.yaml`, and the Swift client is generated from it on every build.
Alternatives: An ORM, which hides lock order and clock sampling. Hand-written Swift models, which drift.
Consequences: SQL is reviewed as SQL. A contract change is visible as a diff in `openapi.yaml`, in its own PR.
Links: `docs/TECH-DESIGN.md` sections 1, 5; spec 11, 31, 32.

## ADR-006 · Design: revision 2.1, then Claude Design · 2026-11-01 · decided
Context: The founder designs in Claude Design, inside his Claude app. Claude Code can't open it, and Claude Design reads the repository only when the founder links it. Design revision 2.1 already renders 53 states.
Decision: The founder chose to keep 2.1 and add the brand (FQ2).
- The 53 renders in `design/reference/2.1/` are the reference for the states they show.
- Claude Design, driven by the founder, makes the brand first (Design handoff 0 in the founder's guide): wordmark, app icon, final colour tokens and the six cover colours.
- Claude Design then designs every state 2.1 doesn't show, from Claude Code's handoffs (`docs/DESIGN-HANDOFF.md`).
- Claude Design works inside Claude: its standalone site closes on 14 December 2026. It exports a .zip, a PDF, PPTX, Google Slides or standalone HTML, or sends the design to Claude Code on the web; it has no PNG export.
- The brand lives in the repository, in `design/reference/brand/`, and every later handoff names those files as its source. A saved design system in Claude helps if the founder has one, but nothing depends on it.
- Claude Code turns each delivery into the named files: it renders frames to PNG, rasterizes a provided vector at a required size, and reads token values from the export. That is conversion, not design; it never changes what a frame shows.
- Claude Code never designs (T46).
Alternatives: Redrawing every screen in Claude Design first, which would hold every screen until its render arrives. Claude Code designing the missing states from the book's contracts, which the founder rules out.
Consequences: The brand's tokens replace 2.1's colours everywhere through `TadayoDesign`, so the 2.1 renders stay layout references after the brand arrives. Each stage's design handoff is on the founder's path.
Links: `docs/DESIGN-HANDOFF.md`; book p40; T44 to T46.

## ADR-007 · What the closed trial includes · 2026-11-01 · decided
Context: Spec 02 defines M0 as the instrumented closed trial and M1 as the first production release. Spec 38's build sequence lists widgets and push before the trial. Apple reviews a build before external TestFlight testers get it, and its rules ask apps with user content and accounts for report, block, a contact and in-app account deletion. Spec 02 puts moderation operations and account deletion in M1.
Decision: The trial (stages B0 to B9 in `docs/MILESTONES.md`) includes everything in spec 02's M0, plus these:
- roster revisions and approvals, which club formation needs anyway;
- push notifications with the budget and quiet hours;
- basic report, hide, withdraw, pictured removal, leave, block and account deletion;
- the operator scripts.
It leaves for M1: widgets (FQ9), Sign in with Apple and Google (FQ12), resumable uploads, Live Photo motion (FQ10), embedded Instagram (FQ11), the full accessibility audit, data export (FQ18) and an operator console (FQ27). Remember this and the paid experiments stay in M1.5, and external sharing after the trial (FQ14).
Alternatives: Spec 02 to the letter, with no deletion or reporting in the trial, which risks Apple's beta review and the trial's own safety. Spec 38 to the letter, with widgets before the trial, which delays the trial for an optional surface.
Consequences: The trial is safe and reviewable without widgets.
Links: spec 02, 38; `docs/MILESTONES.md`.

## ADR-008 · Reveal and close instants computed in TypeScript · 2026-11-01 · decided
Context: Spec 05 resolves 07:00 and 01:00 independently in the club's zone: an ambiguous time takes its first occurrence, and a nonexistent time takes the next valid instant. PostgreSQL's `AT TIME ZONE` gives an ambiguous local time the offset in force after the transition (the later instant), so it would get the autumn case wrong. The UK and Ireland change their clocks at 01:00, so a London club's `close_at` is nonexistent one night a year and ambiguous another.
Decision: One `time` module in `packages/domain` resolves civil times with the Temporal API, which Node 26 ships, with explicit code for both rules. No built-in disambiguation option returns "the next valid instant" for every gap, so that rule is written out. Occurrence rows store the resolved UTC instants. Postgres only compares instants.
Alternatives: `AT TIME ZONE` in SQL, which is wrong for the ambiguous case. Adding 18 hours to `reveal_at`, which the spec forbids.
Consequences: Tests cover Europe/London, America/New_York, Australia/Lord_Howe (a 30-minute shift), Antarctica/Troll (a 2-hour shift), America/Santiago and Africa/Ouagadougou (no DST).
Links: spec 05; T2; Q03.

## ADR-009 · Media only through the API · 2026-11-01 · decided
Context: D10 allows signed media URLs that live at most five minutes. Spec 33 says to consider an authenticated byte proxy if stronger online revocation is needed. Supabase's Smart CDN, on by default on its paid plans, caches signed-URL responses at the edge "for as long as possible", and revoking or expiring a token doesn't purge that cache. A signed URL would keep working for someone who left, was blocked or lost access, for as long as the edge holds the file.
Decision: No signed read URL or media token ever reaches a client.
- `GET /v1/drops/{id}/media?rendition=…` runs the read predicate on every request and streams the bytes from private storage with `Cache-Control: private, no-store`.
- The author's preview has its own endpoint, with the same headers.
- Uploads still go straight to storage through a signed upload URL: one object, for the client's own pending upload, with overwriting off. It is the only storage URL a client ever receives, and it reveals nothing.
Alternatives: Signed URLs that live five minutes, which the CDN turns into links that last indefinitely. Deleting objects on every loss of access, which can't work, because other members still need them.
Consequences:
- A removed photo stops loading at once; a copy already on someone's phone goes at the next reconciliation, and the privacy copy says so (T24).
- Every image's bandwidth passes through Fly: a few dollars a month at trial size.
- The app caches decoded images per account and content version.
Links: spec 33; D10; T12, T24.

## ADR-010 · Deletion tombstones kept outside the database · 2026-11-01 · decided
Context: Spec 23 says a backup restore replays deletion tombstones before serving content. If the tombstones live in the same database, a restore rolls them back with everything else. Supabase Storage's object list also lives in that database.
Decision: Every deletion writes a tombstone row and appends the same record to an append-only log in a Cloudflare R2 bucket used for nothing else. The restore procedure replays the R2 log, then purges orphaned storage objects, before any traffic reaches the restored service.
Alternatives: Tombstones in Postgres only, which is wrong after a restore. A second database, which is another bill and another secret.
Consequences: One more secret (R2 keys, in Fly secrets) and one more drill step.
Links: spec 23, 34; T28; Q28.

## ADR-011 · Email codes instead of magic links for the trial · 2026-11-01 · decided
Context: D06 proposes an email magic link with Sign in with Apple and Google. A magic link fails when the email is opened on another device or in a mail app's own browser.
Decision: Supabase Auth's six-digit email code for the trial. Sign in with Apple and Google come in M1, together, as Apple's rules ask once Google sign-in is offered.
Alternatives: The magic link as D06 proposes, which is fragile on phones.
Consequences: The sign-in screen has a code field. Account settings list one method until M1.
Links: D06; FQ12.

## ADR-012 · First-party analytics · 2026-11-01 · decided
Context: Spec 36 lists the events the research needs and forbids sending content to general analytics.
Decision: The events are written to an `analytics_events` table in Postgres, with pseudonymous ids (an HMAC of the user id under a secret key). A weekly trial report script runs in the `ops` workflow. No third-party analytics SDK.
Alternatives: An analytics vendor, which means another processor of personal data for a trial of a few clubs.
Consequences: The founder reads the trial through the weekly report.
Links: spec 36; T51.

## ADR-013 · A clock that only `dev` can move · 2026-11-01 · decided
Context: Gates need the 7 AM reveal, the 1 AM close and the cutoff races shown on demand, not by waiting a day.
Decision: The server's clock is `clock_timestamp() + offset`, read after the locks are taken (Postgres's `now()` is the start of the transaction, before any lock). The offset comes from a `dev_clock` table that exists only in `dev`. In `prod` the offset is a compile-time zero, and a test proves that the `prod` configuration refuses any offset. The app always follows `server_now`, so the countdown moves with it.
Alternatives: Waiting for real reveals, which is too slow. Per-request time headers, which could leak into `prod`.
Consequences: Demonstrations are scripts in `tools/ops/`. A test holds a commit on the occurrence lock across 07:00 and proves that the cutoff uses the time after the lock.
Links: T1, T3; `docs/TECH-DESIGN.md` section 5.

## ADR-014 · Photos prepared on the device · 2026-11-01 · decided
Context: iPhone photos are HEIC by default, and the server's image library, `sharp`, doesn't decode HEIC in its prebuilt form. The share extension has a small memory limit. Spec 23 removes location data from delivered photos.
Decision:
- The app and the share extension upload JPEG made with ImageIO, at up to 4096 pixels on the long edge, without decoding the full image, and without GPS metadata. In the app this goes through the system photo picker's compatible representation.
- Screenshots stay PNG.
- The server accepts only JPEG, PNG and WebP. It still checks the real bytes against 20 MiB and 64 megapixels (D09) and strips metadata from every rendition.
Alternatives: Uploading HEIC originals and building libvips with HEIF support, which means a heavier image and patent questions. Full-resolution originals, which are slow on weak networks and risky in the extension.
Consequences: Originals are at most about 12 megapixels for a 4:3 photo. Change the cap with a new ADR.
Links: D09; spec 23, 33; FQ10.

## ADR-015 · Supabase's own data API stays closed · 2026-11-01 · decided
Context: The app ships Supabase's project URL and public key so people can sign in. Supabase exposes tables in its default `public` schema through its REST and GraphQL endpoints, and grants its public roles access by default. Without row-level security, anyone holding the public key could read every club's captions and storage keys, bypassing the Tadayo API and the reveal.
Decision:
- The data API (REST and GraphQL) is turned off in both projects.
- The app's tables live in a schema the data API doesn't expose (`app`).
- The `anon`, `authenticated` and `service_role` roles get no grants on it. `service_role` bypasses row-level security by Supabase's design, so for it the missing grants are the lock.
- Row-level security is enabled on every table with no policies, as a closed backstop for `anon` and `authenticated`.
- The API and the worker connect as their own database role, `tadayo_app`, which owns the `app` schema and its tables. A bootstrap script creates the role, the schema and the extensions the schema needs (`pg_trgm`, which `tadayo_app` can't create) once per database, as its admin role (`postgres` on Supabase); every migration then runs as `tadayo_app`, so everything it creates belongs to it. A table's owner isn't held by row-level security unless it's forced, so the API reads and writes normally, while `anon` and `authenticated` would see nothing even if a grant slipped in. No role Tadayo creates gets `BYPASSRLS`, and no table is set to `FORCE ROW LEVEL SECURITY`.
- `ci` does the same: the bootstrap as the Postgres service's superuser, then every migration and test as `tadayo_app`. Never the superuser, which bypasses row-level security and would hide a mistake that `dev` would show. The CI bootstrap also creates `anon`, `authenticated` and `service_role` as roles without login, as Supabase has them, so the migrations' revokes run and a test can prove those roles read nothing.
- Storage's buckets are private and its objects get no policies; the API reads them with the service key, and clients get only the upload URL of ADR-009.
- The Supabase probe (`docs/TECH-DESIGN.md` section 8) checks each real project with the public key and with a signed-in user's token, and fails on anything but a refusal or an empty answer.
Alternatives: Row-level security policies as the authorization layer, which would duplicate the read predicate in a second place and drift from it. Granting the API's role `BYPASSRLS`, which works but makes the backstop depend on one attribute nobody sees.
Consequences: B0's bootstrap creates `tadayo_app`, the `app` schema and `pg_trgm`; its first migration sets the grants and row-level security. The founder turns the data API off in each project's settings. The probe runs after every deploy, and its results on `dev` and `prod` are part of Gate 0 and Gate D.
Links: T53; spec 30, 33.

## ADR-016 · `dev` in US East, near the founder · 2026-11-01 · decided
Context: FQ3 puts `dev` in the region nearest the founder, who runs every device check, and the pack assumed that was Paris. On 1 November 2026 the founder said they are in Virginia, US, while creating `tadayo-dev`.
Decision: `dev` is in US East: the Supabase project `tadayo-dev` in `us-east-1` and the Fly app `tadayo-api-dev` in `iad`, the same place as the database. `prod`'s region stays open under FQ3, confirmed before Gate D.
Alternatives: Paris (Supabase `eu-west-3`, Fly `cdg`), the pack's assumption: farther from the founder for every device check, with no gain for `dev`'s synthetic data.
Consequences: A Supabase project can't move region, only be recreated; for `dev`, which holds only test data, that's about an hour's work. The Fly app's `primary_region` is `iad`.
Links: FQ3; ADR-003; `docs/TECH-DESIGN.md` section 7.

## ADR-017 · The domain `tadayo.app` · 2026-11-01 · decided
Context: FQ5 used `tadayo.app` as a placeholder until the founder bought a domain. On 1 November 2026 the founder registered `tadayo.app` on Cloudflare.
Decision: `tadayo.app` is Tadayo's domain, registered on Cloudflare, with its DNS there. The universal links, the invitation page, the API host and the policy pages use it (`docs/TECH-DESIGN.md` section 10), and Resend sends the sign-in codes from it. The bundle id, the app group and the name stay FQ5's defaults until the founder confirms them.
Alternatives: None: the founder chose it. It matches the bundle id's prefix, `app.tadayo`.
Consequences: Every DNS record the build needs (Pages, the API host, Resend's sending records) goes in Cloudflare. `.app` is on browsers' HSTS preload list, so every host on it must serve HTTPS. Moving to another domain later would change every universal link and the `apple-app-site-association` file.
Links: FQ5; ADR-003; `docs/TECH-DESIGN.md` sections 1, 4 and 10.

## ADR-018 · iOS 17 stays the minimum; the founder's iPhone runs iOS 18 · 2026-11-01 · decided
Context: FQ4 asked for the founder's and the trial members' iPhones, because the minimum iOS decides who can install the app. On 1 November 2026 the founder said their iPhone is an iPhone 13 on iOS 18.3.2. The trial members' phones are still unknown.
Decision: The minimum stays iOS 17, FQ4's default (ADR-001). The founder's phone runs it, and the lower minimum lets in more of the members' phones.
Alternatives: iOS 18 as the minimum: the app needs nothing from it (Observation needs iOS 17), and it would shut out any member still on iOS 17.
Consequences: The founder's phone draws iOS 18's system look, not the newest SDK's look that the snapshots show (`docs/LIMITATIONS.md`). So before each gate the UI tests also run on an iOS 18 simulator, the founder's version, when the runner offers one (`docs/TECH-DESIGN.md` section 8). If a member's iPhone can't run iOS 17, FQ4's fallback to iOS 16 applies.
Links: FQ4; ADR-001; `docs/TECH-DESIGN.md` sections 1 and 8.
