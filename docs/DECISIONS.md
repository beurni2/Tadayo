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
Context: FQ3 puts `dev` in the region nearest the founder, who runs every device check, and the pack assumed that was Paris. On 1 November 2026 the founder said they are in US East, while creating `tadayo-dev`.
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
Context: FQ4 asked for the founder's and the trial members' iPhones, because the minimum iOS decides who can install the app. On 1 November 2026 the founder said their iPhone runs iOS 18. The trial members' phones are still unknown.
Decision: The minimum stays iOS 17, FQ4's default (ADR-001). The founder's phone runs it, and the lower minimum lets in more of the members' phones.
Alternatives: iOS 18 as the minimum: the app needs nothing from it (Observation needs iOS 17), and it would shut out any member still on iOS 17.
Consequences: The founder's phone draws iOS 18's system look, not the newest SDK's look that the snapshots show (`docs/LIMITATIONS.md`). So before each gate the UI tests also run on an iOS 18 simulator, the founder's version, when the runner offers one (`docs/TECH-DESIGN.md` section 8). If a member's iPhone can't run iOS 17, FQ4's fallback to iOS 16 applies.
Links: FQ4; ADR-001; `docs/TECH-DESIGN.md` sections 1 and 8.

## ADR-019 · The identifiers `app.tadayo` · 2026-11-02 · decided
Context: FQ5 proposed the app's identifiers, and ADR-017 kept them as defaults until the founder confirmed them. The bundle id can't change once the App Store record exists. On 2 November 2026 the founder confirmed them.
Decision: The bundle id is `app.tadayo`, the share extension's `app.tadayo.share`, the widget extension's `app.tadayo.widgets`, and the app group `group.app.tadayo` (`docs/TECH-DESIGN.md` section 4).
Alternatives: None: the founder chose FQ5's default, which matches the domain `tadayo.app` (ADR-017).
Consequences: The App Store Connect record, the provisioning profiles and `apps/ios/project.yml` use these ids. Changing the bundle id after the record exists means a new App Store record. The name stays FQ5's default, Tadayo, with trademark clearance a prelaunch task.
Links: FQ5; ADR-017; `docs/TECH-DESIGN.md` section 4.

## ADR-020 · `INVENTORY.md` is kept current · 2026-11-02 · decided
Context: `CLAUDE.md` ("Repository layout") and `design/reference/README.md` forbade editing anything in `design/reference/`, `INVENTORY.md` included, while `CLAUDE.md`, the inventory itself, `docs/DESIGN-HANDOFF.md` and the definition of done require keeping the inventory current (FQ31). On 2 November 2026 the founder answered that Claude Code may edit `INVENTORY.md` to keep it current, never deleting a row.
Decision: Claude Code edits `design/reference/INVENTORY.md` to keep each state's render and status current, never deleting a row. Nothing else in `design/reference/` is edited, moved or renamed, apart from the export move `CLAUDE.md` already allows. `CLAUDE.md`'s "Repository layout" says so; `design/reference/README.md`, which the answer doesn't cover, is read with this exception.
Alternatives: FQ31's default, no edits until answered, which would have stopped design handoff 0's rows going to `requested 0`.
Consequences: Handoff 0's rows can go to `requested 0`, and every slice that builds a state updates its row in the same PR. A row is never deleted; a state that goes away is marked, not removed.
Links: FQ31; `CLAUDE.md`; `docs/DESIGN-HANDOFF.md`; `design/reference/INVENTORY.md`.

## ADR-021 · FQ32 to FQ37 keep their defaults · 2026-11-02 · decided
Context: FQ32 to FQ37 are places where two sources disagree and the fix would loosen one of them. On 2 November 2026 the founder chose each default.
Decision: Each default stands as `docs/QUESTIONS.md` states it in full:
- FQ32: T9 as written. No route serves a drop's content to the operator; the `ops` moderation scripts (FQ27) hold or remove a drop by its id and write an audit row. If a report can't be handled without seeing the content, Claude Code asks the founder first.
- FQ33: T62 as written: every dismissal is durable.
- FQ34: the weekly trial report runs on `dev`'s seeded data; running it against `prod` needs a new answer.
- FQ35: build from the PDF, as FQ25 says. If the founder attaches 2.1's pack, Claude Code asks before committing it.
- FQ36: `dev` stays synthetic apart from the founder's and the internal tester's sign-in addresses. They add only test content there: photos with no people in them, and captions and comments written as tests. Their addresses, and everything their accounts add, test content included, are treated as personal data: they never go into logs, PRs, the journal or evidence (T52), and scripts and seeds never read or change their accounts.
- FQ37: one deletion-log bucket per environment. Before `prod` exists, `prod`'s deletion log gets a bucket of its own, used for nothing else, and no key in `dev`'s app reaches it.
Alternatives: None: the founder chose each default.
Consequences: `docs/JOURNAL.md` section 0.8 lists FQ32's and FQ33's departures from spec 07 and spec 19. ADR-003's and `docs/TECH-DESIGN.md` section 1's one R2 bucket for the deletion log is read as one per environment, and section 7's synthetic `dev` as holding the two sign-in addresses.
Links: FQ32 to FQ37; T9, T52, T62; ADR-003, ADR-004, ADR-010, ADR-012, ADR-013; spec 07, 19; `docs/TECH-DESIGN.md` sections 1, 7, 9 and 10.

## ADR-022 · The founder approves each PR, and Claude Code merges it · 2026-11-02 · decided
Context: `CLAUDE.md`, ADR-002 and `docs/GITHUB.md` had the founder merge every PR, the merge being the approval: every PR is opened from the founder's GitHub account, so GitHub can't take the founder's approving review. On 2 November 2026 the founder told Claude Code it could merge PR #1, which it did (`0a6c91c`). Asked whether that covered later PRs, the founder first picked "Only PR #1; I merge the rest", then wrote "i will approve then you merge".
Decision: For each PR, once `docs/GITHUB.md`'s steps 1 to 6 are done (`ci` green once it exists, every finding fixed or answered, the evidence linked, "Ready for the founder" filled in), the founder approves it in a message in the project's thread, naming the PR or answering Claude Code's message about it. Claude Code then squash-merges it through REST at the head the founder approved (`gh api -X PUT repos/beurni2/tadayo/pulls/<n>/merge -f merge_method=squash -f sha=<head> -f commit_title='<PR title> (#<n>)' -F commit_message=@<file>`), with a merge message written for the merge that holds no personal data; without `commit_title` and `commit_message`, GitHub uses the repository's default, every commit's message (`COMMIT_MESSAGES`). Nothing on GitHub approves a PR: everything Claude Code posts there appears under the founder's account, so a comment or review can't show that the founder wrote it. A push after the approval needs a new approval. Gates are unchanged: only the founder passes a gate.
Alternatives: The founder merges every PR, as `CLAUDE.md` said and the founder's first answer kept; the founder's later message replaced it.
Consequences: This supersedes the last sentence of ADR-002 ("The founder merges."). `CLAUDE.md` ("I approve every gate and merge every pull request"; "Git": "Never merge") and `docs/GITHUB.md` (its introduction, "What GitHub enforces" ("his merge is the approval"), step 6 and "Never") are brought in line in a PR of their own, since the rulebook documents change only in their own PRs (`docs/MILESTONES.md`, "Lanes"), and `README.md`'s "Rules of the road" ("The founder merges.") with them; the founder's instruction applies from 2 November 2026 meanwhile. To undo it, the founder says so, and the rulebook goes back in its own PR. A PR that adds or changes a file under `.github/workflows/` (the B0 plan's slices 2, 9, 10b, 10c and 12) may have its merge refused, as the session's pushes and its merges from `main` can be (`docs/GITHUB.md`, "Workflow files"); slice 2's merge is the first test, and its result goes in `docs/LIMITATIONS.md`. If the merge is refused, Claude Code doesn't work around it (no other token, no contents API, no bot): it asks the founder to merge that PR with Squash and merge, at the head the founder approved. T57's "founder's approval in the PR" for a destructive change was the founder's merge; where it lives now is FQ39, and until it's answered no PR with a destructive migration is merged.
Links: ADR-002; T57; FQ39; `CLAUDE.md`; `docs/GITHUB.md`; `docs/MILESTONES.md`, "Lanes".

## ADR-023 · The dev API host `api-dev.tadayo.app` · 2026-11-02 · decided
Context: ADR-017 gives the API host to `tadayo.app`, and every DNS record the build needs goes in Cloudflare. No document named `dev`'s API host, which the first TestFlight build calls (the B0 plan's review, PR #2).
Decision: `dev`'s API answers at `api-dev.tadayo.app`: a CNAME to `tadayo-api-dev.fly.dev` in Cloudflare with the proxy off (DNS only), so Fly issues and renews its certificate directly; `ops`' `fly-app-create` requests it. The dev build's API base URL is `https://api-dev.tadayo.app`. `prod`'s host is named before Gate D.
Alternatives: `tadayo-api-dev.fly.dev` for `dev`, which ADR-017 doesn't allow, since it gives the API host to `tadayo.app`; a record proxied by Cloudflare, which puts Cloudflare in front of Fly's certificate.
Consequences: The founder adds the record in step (2) after slice 10b (the B0 plan, section 1.2); slice 12's first build waits until the host answers. Changing it later means a new build.
Links: ADR-017; `docs/TECH-DESIGN.md` sections 1, 7 and 10; `docs/plans/B0.md`.

## ADR-024 · Spikes S1, S2 and S4 run before Gate A · 2026-11-02 · decided
Context: Spikes S1 (the share extension), S2 (the photo pipeline) and S4 (push) need the founder's account in an active club on `dev` with the founder's day in its calendar: S1's commit checks membership and audience (`docs/TECH-DESIGN.md` section 5), S2's upload goes through S1's build, and S4's push opens its club and day only after access is rechecked (T38). B0 builds no clubs (B1) and no calendar (B2), a club activates only once at least two people approve the same roster (spec 04, T7), and ADR-021 says scripts and seeds never read or change the founder's account. FQ38 asked how to resolve this. On 2 November 2026 the founder chose its option (a).
Decision: S1, S2 and S4 run once B1 and B2 are on `dev`, before Gate A, and before B3 and B4 build media and contributing on them. The founder's account joins its club in the app, the way Gate A's own check forms a club: two accounts through an invitation link, the same roster approved, the days confirmed (spec 04 and 05; T6, T7). The other account is the internal tester's, on a second iPhone (FQ28's default), so FQ28's second phone is needed before spike S1 rather than at Gate A; the founder collects the tester's consent first (FQ28), and inviting the tester needs the founder's yes (`CLAUDE.md`, "Git"). No script or seed touches the founder's account. Each spike proves what `docs/MILESTONES.md`'s B0 table says; the B2 plan schedules the three, and their reports are part of Gate A's evidence. S3, S5 and S6 stay in B0 and in Gate 0's evidence.
Alternatives: FQ38's (b), the founder's internal tester joining in B0, which brings a minimal form of B1's and B2's club and calendar code into the spikes; and (c), one `ops` run adding the founder's account to a club of scripted members, which relaxes ADR-021, T6, T7 and spec 04, 05 and 32 once.
Consequences: Gate 0 passes, and B1 and B2 start, with three of the six spikes unproven. That relaxes `CLAUDE.md`'s "Order of work", where B0 held all six spikes, and `docs/MILESTONES.md`'s B0 goal; both are changed in their own PR, with B0's spikes, Gate 0's and Gate A's evidence, and a paragraph under B2 for the three spikes. No invariant is relaxed. If one of the three shows that a native assumption fails, the stages that build on it (B3 and B4 for S1, B3 for S2, B8 for S4) are re-planned before they start. S2's photo (the B0 plan's F9) and the APNs key (`APNS_KEY_ID`, `APNS_KEY_P8`) are needed before Gate A rather than Gate 0.
Links: FQ38, FQ28; ADR-014, ADR-021; T6, T7, T38; spec 04, 05; `CLAUDE.md`; `docs/MILESTONES.md`; `docs/plans/B0.md`.

## ADR-025 · The api and ios lanes start inside B0 · 2026-11-02 · decided
Context: `CLAUDE.md`, `docs/MILESTONES.md` and the B0 plan had one session build B0, with the api and ios lanes starting after Gate 0. On 2 November 2026 the founder asked whether more task windows could work safely, securely and in step to speed up development. Most of B0 is a chain, and five of its PRs (slices 2, 9, 10b, 10c and 12) add workflow files, each needing no other branch meant to merge. The app slices, 11 and 11b, need nothing from slices 4 to 10a: only the `ios` workflow (slice 9), and for part of slice 11 the contract and mock (slice 3). The proposal (in the project's files, `plans/b0-parallel-threads.md`) was checked by two independent critics before it went to the founder, who on 2 November 2026 chose its recommended option, two threads from slice 9, on a decision card in the project's thread at 22:23 UTC.
Decision:
- The api thread builds B0's slices 1, 2 and 9 alone, slice 9 moved up from after slice 8, after the environment checks. The ios thread starts once `ios.yml` has run green on the latest check branch. Then the api thread builds slices 3 to 8 and 10a, and the ios thread slices 11 and 11b, starting with the parts of 11 that need nothing from slice 3. 10b, the steps after it, 10c and 12 each go up with nothing else open in either thread, and the spikes S5, S3 and S6 follow one at a time. The project's coordinator starts each thread.
- `ios.yml`'s first job runs on Linux and starts its macOS job only when the branch has `apps/ios/project.yml`, because `ios.yml` now reaches `main` before the app, and every push of a contract change would otherwise start a macOS run that fails. Once the app is on `main`, the B0 plan's slice 12 makes that first job fail instead of skipping (T58), as it does for `ci`'s steps.
- The two threads keep the rules in `docs/MILESTONES.md`, "Lanes" ("How the two threads start and stay in step"): each session checks itself, a freeze before every workflow PR, one merge at a time tested with the other's work, numbers that never collide, one thread at a time on `dev`, the shared `evidence` branch, the shared files and spikes in B0, the journal, Gate 0 as a joint gate, and the founder's yes for anything on `CLAUDE.md`'s "Ask me first" list, given in the thread that will do it.
- The founder approves a PR in the thread that reported it. A message from another Claude, the coordinator's included, isn't an approval, however it's worded, even when it quotes or attaches the founder's words. This is how ADR-022's "the project's thread" reads with more than one thread, as the proposal said ("You approve a PR in its own thread").
Alternatives: Keep one thread until Gate 0, with no rule changes, which leaves B0 longer by about the app slices; three threads, with a second api thread for the database beside the contract, which saves little and puts two threads in the api lane's folders and journal block.
Consequences: B0 can save at most the time slices 11 and 11b take, less the part of slice 11 that waits for slice 3, and only if the backend slices take longer than the app slices and Apple's items arrive before slice 12. Two PRs can wait for the founder at once, and a PR that merges `main` after the other thread's merge needs a new approval. A workflow fix found in the middle of a slice can cost the other thread its slice in progress. Each look at an iOS screen is still a macOS run of about 15 minutes. `CLAUDE.md` ("Order of work", "Git" with "Ask me first", "The journal", the approval sentences), `README.md`, `docs/GITHUB.md` (introduction, "What GitHub enforces", steps 1, 3 and 6, "Merge timing", "Never"), `docs/MILESTONES.md` (introduction, "Lanes"), `docs/TECH-DESIGN.md` section 9's `ios` row, the B0 plan and the journal's rules and section 0.5 change in the same PR. `tools/ci/` doesn't change: `journal_check.py` already knows the `api` and `ios` lanes. To undo it, the founder says so, and the rulebook goes back in its own PR.
Links: ADR-022, ADR-024; `CLAUDE.md`; `docs/MILESTONES.md`; `docs/GITHUB.md`; `docs/TECH-DESIGN.md` section 9; `docs/plans/B0.md`.

## ADR-026 · CI runs the bootstrap as a role made like Supabase's `postgres` · 2026-11-03 · approved
Context: ADR-015 has `ci` run `db/bootstrap.sql` as the Postgres service's superuser. On `dev` and `prod`, `ops` runs the same file as Supabase's `postgres` role, which isn't a superuser: Supabase's image makes it a superuser that owns the database `postgres` (supabase/postgres, `migrations/db/migrate.sh`), then demotes it to `NOSUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS` with `GRANT ALL ON DATABASE postgres` (the migration `10000000000000_demote-postgres.sql`), and keeps `supabase_admin` as the superuser. So a statement that only a superuser may run passes `ci` and can fail on `dev`, the first time `ops` runs the bootstrap there, after the B0 plan's slice 10b. Slice 4 is likely to write one: on Postgres 16 and later, a role that isn't a superuser and has just created `tadayo_app` can't run `CREATE SCHEMA app AUTHORIZATION tadayo_app` ("must be able to SET ROLE"), because creating a role gives its creator only the ADMIN option on it. PR #8's independent review reproduced that on PostgreSQL 16.15, as a role with those attributes, in a rolled-back transaction. The founder chose to build it in PR #8 on a decision card in the api thread, at 01:26 UTC on 2026-11-03.
Decision:
- The `postgres` service's superuser is `supabase_admin`, the role Supabase keeps as its superuser (`POSTGRES_USER: supabase_admin` and `POSTGRES_DB: postgres` in `.github/workflows/ci.yml`). It can't be the service's default `postgres`, demoted afterwards: a cluster's first role must stay a superuser ("The bootstrap user must have the SUPERUSER attribute", seen on PostgreSQL 16.15).
- `db-bootstrap` (`tools/ci/ci_steps.py`, `SUPABASE_SQL`), as `supabase_admin` and in one transaction, makes:
  - Supabase's `anon`, `authenticated` and `service_role` (ADR-015) as its image has them: without login, inheriting (the migration `20230529180330_alter_api_roles_for_inherit.sql`), `service_role` bypassing row-level security;
  - the role `postgres` as its image makes it: `NOSUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS`, the owner of the database `postgres`, with `GRANT ALL ON DATABASE postgres`, and with `anon`, `authenticated`, `service_role`, `pg_monitor`, `pg_read_all_data` and `pg_signal_backend` granted to it with the ADMIN option (the migration `20250605172253_grant_with_admin_to_postgres_16_and_above.sql`).
  Each role is made with a plain `CREATE ROLE`, so a role already there fails the step.
- Connected as `postgres`, it checks that `postgres` isn't a superuser and fails otherwise. Then it runs `db/bootstrap.sql` connected as `postgres`, as `ops` does on `dev`.
- Migrations and tests still run as `tadayo_app` (ADR-015). `DATABASE_ADMIN_URL`, for tests that act as `anon` or `authenticated`, is `supabase_admin`.
- This replaces only ADR-015's "the bootstrap as the Postgres service's superuser".
Alternatives: Keep ADR-015's superuser, and find such a statement on `dev` after slice 10b, when it needs a fix to slice 4 before `deploy-dev.yml` can be sent. Or have slice 4's database tests run the file as such a role themselves, which puts CI's setup into every package that tests the database.
Consequences: Slice 4 writes `db/bootstrap.sql` for a role that isn't a superuser (for example, `GRANT tadayo_app TO postgres` before `CREATE SCHEMA app AUTHORIZATION tadayo_app`). Differences between `ci`'s plain Postgres and Supabase's remain, so the first `ops` bootstrap on `dev` is still the proof: the schemas Supabase's image adds (`auth`, `extensions`, `storage`) and its grants on them; the role `authenticator`; supautils' reserved roles; and supautils' privileged role (`supabase_privileged_role`, which `postgres` belongs to on Supabase), which lets `dev`'s `postgres` run some statements that otherwise need a superuser (publications, foreign data wrappers, event triggers, some settings) and that `ci` refuses. A local check needs a server made like `ci`'s (`initdb --username=supabase_admin`), because the session's own cluster's first role is `postgres` (`docs/LIMITATIONS.md`). To undo it, `db-bootstrap` runs the file as `supabase_admin`, in a CI-configuration PR of its own (T58).
Links: ADR-015; T53, T58, T59; `docs/TECH-DESIGN.md` section 9; the B0 plan's slices 2, 4 and 10; PR #8.

## ADR-027 · Brand revision 1.1, and handoffs 1 to 4 in the repository before slice 11's screens · 2026-11-03 · decided
Context: Design handoff 1 (delivered on 2 November 2026) came back with brand revision 1.1: its `brand-tokens.json` 1.1 replaces handoff 0's colour tokens (the input border, cover 1, and new roles: the button's pressed and disabled pairs, the focus ring, the avatar's fills, the label on a photograph), its component sheet and its dark icon, which is now transparent; it also names the geometry (card radius 16, photo 14, ticket 18, surface 12, button 13, input 10, plaque 9) and a full type scale (the card's status line 13/18, the date title 25/29, the plaque's 10/12 and 25/28, among others), which settle the radius and sizes handoff 0 left open, and it rewords the cover-assignment rule (it no longer says a historical slot isn't reused for a different sender, which bears on FQ41). Handoffs 2, 3 and 4 kept `brand-tokens.json` 1.1 and the dark icon byte-identical, and each sent a fuller component sheet, handoff 4's holding every earlier one. FQ45 asked where such a change goes, since ADR-006 makes `design/reference/brand/` the brand, `design/reference/README.md` ("Don't") forbids editing a file there, and the naming rule gives each brand asset one name. Separately, `docs/plans/B0.md` section 5.2 brought handoff 1 into the repository only after slice 12 and the first TestFlight build, so slice 11 would have built sign-in, the profile and the tabs with no club from the spec, and rebuilt them once the renders entered. The renders for every B0 screen were already delivered and checked in the project's files (`design/handoff-1/` to `design/handoff-4/`).
Decision:
- FQ45, answered by the founder on 3 November 2026 at 00:58 UTC: adopt brand revision 1.1. A brand revision the founder adopts replaces the files in `design/reference/brand/`, which are remade from it under the same names (`docs/DESIGN-HANDOFF.md`, "Naming rule"), in the PR that brings the delivery in; the delivery itself stays as it arrived in `design/reference/claude-design/handoff-<n>/`, and the earlier revision stays in its own handoff's folder, so nothing is lost. A revision the founder hasn't adopted stays only in its handoff's folder, and the inventory names it beside the brand file it would change.
- Answered by the founder on 3 November 2026 at 11:15 UTC, on a card in the ios thread ("Bring design handoffs 1 to 4 and brand 1.1 into the repo now?": "Yes, now, before the screens"): handoffs 1 to 4 enter the repository now, in one design PR from the ios lane, before slice 11 builds its screens, instead of on `ios/b1-handoff-1` after slice 12. Slice 11 builds A02, A03, `G06-no-club`, `F01-no-club` and `M01-no-club` from their renders, and its tokens are revision 1.1's. Slice 11b keeps the icon (from the remade `design/reference/brand/`).
- Proposed by Claude Code, not decided, and raised in this ADR's PR for the founder: handoff 5 and every later handoff enter the repository through the ios lane once delivered and checked, each in a design PR of its own, rather than at a point the stage plan fixes. Until the founder answers, each later handoff waits for its stage plan's timing or the founder's word.
Alternatives: Keep handoff 0's brand files and build from them until a later answer (FQ45's default). Keep section 5.2's timing, which builds the B0 screens from the spec first and again from the renders after slice 12, costing a second set of `ios` runs.
Consequences: `design/reference/brand/` holds revision 1.1 once the design PR merges; handoff 0's files stay in `design/reference/claude-design/handoff-0/`. `CLAUDE.md`'s layout line, `design/reference/README.md`'s "Don't", `docs/DESIGN-HANDOFF.md` ("Who does what", "Naming rule", the brief's template), `docs/MILESTONES.md` (B0's list and Gate 0's evidence) and the B0 plan (slices 11 and 11b, section 5.2) say so; its section 1.1's F5 row, the api thread's, is asked for under "Needs from the other lane" in `docs/PROGRESS.md`. `brand-tokens.md` holds the adopted revision's whole token set: colours, type and geometry. A design PR touches only `design/reference/` and the logs, so it doesn't conflict with the api lane's slices, and it isn't a workflow PR, so no freeze is needed, though a push to `design/reference/**` starts an `ios` run. The 2.1 renders stay the book's record; a handoff's render in `screens/` still wins over 2.1's.
Links: FQ45; ADR-006, ADR-020, ADR-025; T44, T46; `docs/DESIGN-HANDOFF.md`; `docs/plans/B0.md` sections 1.1, 2 and 5.2.

## ADR-028 · CI lets Xcode run the OpenAPI generator's build plugin · 2026-11-05 · proposed
Context: `TadayoAPI` is "generated from `packages/contracts/openapi.yaml` on every build" (`docs/TECH-DESIGN.md` section 4; ADR-005), which the Swift OpenAPI Generator does as a SwiftPM build plugin. Xcode runs a package's build plugin only once a person has trusted it in Xcode's dialog, and `xcodebuild` without that trust refuses it. On the check branch `ios/b0-plugins-check`, which never merges, `ios` run 41958887177 (at `ab8968c`, the app linking `TadayoAPI`, `tools/ci/` as on `main`) failed in its build step with `Validate plug-in "OpenAPIGenerator" in package "swift-openapi-generator"` and `** TEST BUILD FAILED **`, and printed only the second: no line of the build log says `error:` (the evidence branch's `ios/b0-plugins-check/ab8968c/ios/logs/build.log`). CI has no person to trust it.
Decision:
- `tools/ci/ios_steps.py` passes `-skipPackagePluginValidation` to both of its `xcodebuild` calls: the build (`build-for-testing`, or `build` for a scheme with no tests) and `test-without-building`, which resolves the package graph again. `ios_steps_test.py` checks both. With the flag, run 41961456622 on the same branch (at `a45fa23`, started by hand, since a push that changes only `tools/ci/` doesn't start `ios`) ran "Running swift-openapi-generator", compiled the generated `Client.swift` into the app, built (`** TEST BUILD SUCCEEDED **`, the build step 3 minutes 24 seconds) and passed its tests, with no warning from `TadayoAPI`.
- The build step also prints `xcodebuild`'s list of the commands that failed (`The following build commands failed:`, its indented lines and its count; `LogFilter`), since that list is the only place a refused plugin is named.
- Slice 12's archive (`ios/b0-release`) passes the same flag, or the first TestFlight build fails the same way.
What the flag turns off: Xcode's check that a person trusted each package build plugin in the build graph, for every plugin, not only this one. Today the graph has one, `OpenAPIGenerator`; `ios`'s log would show another as "Running …". It doesn't skip macro validation (`-skipMacroValidation`, not passed). The plugin runs code at build time: the generator, pinned `exact: "1.14.3"`, and the packages it depends on, which float within their own requirements because `Package.resolved` is ignored (`packages/swift/.gitignore`) and XcodeGen makes the project afresh on each run. A new build plugin in the graph is a dependency change, which a PR shows in a `Package.swift` or `apps/ios/project.yml`; review is what checks it.
Alternatives: Commit the generated sources, with a check that they match the contract: no plugin and no flag, but about 59,000 generated lines in the repository and a regeneration step on every contract change, where TECH-DESIGN asks for generation on every build. Run the generator's command plugin before `xcodebuild` into an ignored folder: a second path for the same code, which Linux's `swift test` would need too. Trust only this plugin by writing Xcode's own trust record on the runner, or set the `IDESkipPackagePluginFingerprintValidatation` default: the format of the first and the effect of the second aren't documented, so a check could pass for a reason nobody can read.
Consequences: Xcode, the Linux `swift test` in `ci` and the session all run the same generator on the same contract, so the client can't drift from the server. Pinning the generator's own dependencies is a later change if one of them moves badly (`docs/LIMITATIONS.md`). An api PR that changes an operation the app calls changes it additively, or in three steps (the api thread and the ios thread, 5 November 2026; `docs/PROGRESS.md`, ios "Needs from the other lane").
Links: ADR-005; T58; `docs/TECH-DESIGN.md` sections 2 and 4; the B0 plan's slices 11 and 12; runs 41958887177 and 41961456622.
