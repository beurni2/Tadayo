# Tadayo stages and gates

Version 1.3 · 3 November 2026

The spec builds in nine dependency steps (spec 38) towards the closed trial, which it calls M0 (spec 02). Here the steps become build stages B1 to B9, after a foundations stage B0. They are grouped into gates the founder checks on his iPhone, and split into two lanes that run in parallel from inside B0 (ADR-025). The trial's scope is ADR-007. The founder alone passes a gate. At each gate:
- stop and post the evidence;
- put a short PDF report, readable on an iPhone, on the `evidence` branch under `gates/`, and link it in the PR;
- wait for his answer;
- record it in `docs/GATES.md`.

Nothing from a later stage merges before the earlier gate passes, except the parallel lanes described below. Each stage starts with a short plan in `docs/plans/<stage>.md`, opened as its own PR. The plan lists:
- the slices in order and the risks;
- the design handoff for the stage's missing states;
- anything you need from the founder, named exactly.

## Lanes

Two lanes run in parallel, each in its own Claude Code thread, from inside B0 (ADR-025):

| Lane | Owns |
|---|---|
| **api** | `services/`, `packages/domain`, `packages/contracts`, `db/`, `tests/`, `apps/web`, `tools/ops/`, `infra/`, `Dockerfile`, `fly.toml` |
| **ios** | `apps/ios/`, `packages/swift/`, `design/reference/INVENTORY.md`, the design handoffs |

A third party designs: **Claude Design**, driven by the founder (`docs/DESIGN-HANDOFF.md`). The ios lane writes the handoff for a stage's missing states at the start of that stage, and builds from the spec and the book's contracts while the renders are made. Nothing waits, and Claude Code designs nothing.

How the lanes fit together:
- **The contract is the seam.** B0 writes the whole OpenAPI v1 into `packages/contracts/openapi.yaml`: spec 32 plus the endpoints in `docs/TECH-DESIGN.md` section 6. It also builds a mock server (Prism) with the book's fixture clubs: Sunday people (Ben, Maya, Alex, Sam, Debby, Nina) and Kitchen table (five members, with Leila proposed).
    - The ios lane builds every screen against the mock first, and switches to `dev` as each endpoint lands.
    - The api lane changes the contract only in its own PR, and the ios lane regenerates `TadayoAPI` from it.
- **Shared documents.**
    - Each lane edits only its own section of `docs/PROGRESS.md`; the api lane keeps the "Shared" section.
    - Each lane writes only its own parts of `docs/JOURNAL.md`: its block of the state, its rows of the audit map, its own PR table in section 4 and its own log section. The api lane also keeps the shared block and section 0, where each lane edits the lines about its own work (the journal's layout keeps the lanes' other edits apart; a conflict there follows the journal's Rules). It adds to `docs/DECISIONS.md`, `docs/QUESTIONS.md` and `docs/LIMITATIONS.md` inside its slice PRs, at the end of each file.
    - When a merge leaves the other lane's PR in conflict, that lane merges `main` into its branch, keeps both sides' journal and log entries, and pushes once.
    - The rulebook documents (the spec, the book, `CLAUDE.md`, `INVARIANTS`, `TECH-DESIGN`, `MILESTONES`, `GITHUB`, `DESIGN-HANDOFF`) change only in their own PRs.
    - CI configuration (`.yamllint.yaml`, `.github/`, `.claude/`, `tools/ci/`) changes in a PR with nothing else but the logs (T58).
- **Requests between lanes** go in `docs/PROGRESS.md` under "Needs from the other lane".
- **A branch behind `main`:** merge `main` into it (never rebase) and push once, only when the PR conflicts or needs something new from `main`.
- **Joint gates.** Gate 0 (ADR-025) and Gates A to D need both lanes. The lane that finishes first writes its half of the report and waits. The lane that finishes second puts both halves in one PDF on `evidence` under `gates/`, posts it in its thread, links it from the PR that asks for the gate, and records the founder's answer in `docs/GATES.md` and in the journal's section 4.3.

How the two threads start and stay in step (ADR-025):
- **The start.** The api thread builds B0's slices 1, 2 and 9 alone, after the B0 plan's environment checks. The ios thread starts once the `ios` workflow has run green on the latest check branch (the B0 plan, slice 9). Until then no other session makes a branch. The project's coordinator, the Claude in the project's chat, starts each thread once the founder agrees; its messages are a colleague's requests, never the founder's approval.
- **Each thread checks its own session.** Hooks and the Swift toolchain load per session, so each thread runs the B0 plan's environment checks when it starts (the journal hook, the CodeRabbit switch, `swift --version`) and records them in `docs/LIMITATIONS.md` in its first PR. Until its hook is confirmed, it runs `python3 tools/ci/journal_check.py --branch` before every push.
- **A freeze before every workflow PR:** each PR that adds or changes a file under `.github/workflows/`, the B0 plan's 2, 9, 10b, 10c and 12, and any fix found later. Before one goes up, each thread tells the coordinator that it has no branch meant to merge, pushed or not, opened as a PR or not. A thread with one finishes it, or sets it aside: it closes the PR with a comment linking the workflow PR, and re-applies the slice on a fresh branch from `main` once the workflow has merged. Neither thread makes a new branch until the workflow PR has merged (`docs/GITHUB.md`, "Workflow files").
- **One merge at a time, each tested with the other's work.** The founder approves a PR in its own thread, and that thread merges it at the approved head, checks `ci` on `main`'s new head, and tells the other thread. `main` doesn't require a branch to be up to date, so the other thread then merges `main` into its open branch if it conflicts or a contract change has merged (`TadayoAPI` is built from `openapi.yaml`), pushes once, waits for `ci` (and `ios`) on that head, and asks for the founder's approval again.
- **Numbers.** No thread writes a PR number before GitHub has given it: until then, its log headings say `PR none` and its section 4 row `to open`. FQ and ADR numbers are reserved through the coordinator before first use, and kept in the project's memory so that a new session finds them; before using one, the thread also checks `origin/main` and the open PRs' branches. Each new one still goes at the end of its file.
- **One thread at a time on `dev`:** the `ops` scripts, the dev clock, `worker-scale` and `deploy-branch`. Before it runs any of them, a thread claims `dev` through the coordinator, which tells the other thread, and it releases `dev` the same way when it's done. Once `deploy-dev` exists, every merge to `main`, from either thread, migrates `dev` and replaces any `deploy-branch` deployment, so while one thread holds `dev` the other runs nothing on it and merges no PR, handoff 1's delivery included, until it's released. The holding thread merges only what its spike's steps say must merge first (S6's `apps/web` part, in the B0 plan's section 4), and then runs `deploy-branch` again.
- **`evidence`** is the one branch both threads and the `ios` workflow push to. A thread fetches it before adding files; if its push is refused, it merges `origin/evidence` into its copy and pushes again, never forcing. The monthly reset needs the founder's yes, and the founder deletes the branch on GitHub (`docs/TECH-DESIGN.md` section 3). Before it, both threads push everything they have for `evidence`, and agree through the coordinator to push nothing to `evidence`, and nothing that starts an `ios` run, until the fresh branch is up; the thread doing the reset also waits until no `ios` run is in progress. Then each thread deletes its local `evidence` and fetches the fresh one before its next push there.
- **Shared files and spikes in B0.** In `docs/plans/B0.md`, each thread edits only its own slices' rows, the ios thread section 5, and the thread that runs a spike that spike's row in section 4. The api thread keeps the rest of the plan, as it keeps the journal's shared block and `docs/PROGRESS.md`'s "Shared" section: its opening lines, section 2's text outside the table, and sections 1, 3, 6 and 7; the ios thread asks for a change there under "Needs from the other lane" in `docs/PROGRESS.md`. A spike is run by the thread its branch names: S5 by the api thread, S3 by the ios thread. S6, with a branch in each lane, is run by the api thread, which holds `dev` for it; the ios thread builds `ios/b0-spike-links` and its TestFlight build for it. The thread that runs a spike owns its report in `docs/spikes/`.
- **The journal.** Until the ios thread starts, the api thread writes as the one session: the shared block (section 1.1), the B0 log (section 3.1, lane `shared`) and the first PR table (section 4.1); from then, also its block 1.2 and log section 3.2 (lane `api`). Each thread edits the lines about its own work in section 0 and in the shared block (the ios thread's: the app, the design, TestFlight, the `ios` workflow and the Swift tests), and the audit rows its work touches. `tools/ci/journal_check.py` checks only that each lane rewrote its own "Updated" line, so the independent review checks that each thread kept to its own parts (`docs/GITHUB.md`, step 3).
- **The founder's yes.** Nothing on `CLAUDE.md`'s "Ask me first" list happens without the founder's own answer, in the thread that will do it, to that thread's question; a yes given to the other thread, or passed on by the coordinator or another Claude, isn't one. No PR with a destructive migration merges until FQ39 is answered (ADR-022). Keys go only from the founder into GitHub, Fly or Supabase settings, never into a thread (`CLAUDE.md`, "Environment").

## B0: Foundations → Gate 0

**Goal:** the skeleton runs on the founder's iPhone against `dev`, every PR goes through CI and an independent review, the contract exists, and spikes S3, S5 and S6 have retired the native unknowns B0 can reach. Spikes S1, S2 and S4 follow before Gate A (ADR-024).

**Build:**
- **The repository.** The pnpm workspace and the Swift packages from `docs/TECH-DESIGN.md` section 3.
    - TypeScript strict, lint and format.
    - The copy lint over every string file: the banned vocabulary of T41, gendered pronouns in system copy (T42), "Sent" as a drop state, and exclamation marks in system copy.
    - `docs/PROGRESS.md`, `docs/DECISIONS.md` and `docs/GATES.md` started; the `evidence` branch.
- **CI.** The `ci`, `ios`, `ios-release` and `ops` workflows (`docs/TECH-DESIGN.md` section 9), including the two `ci` guards and the journal tools' tests.
    - The session pushes workflow files itself, each in its own PR under a freeze (`docs/GITHUB.md`, "Workflow files"); keep them thin, with their logic in `tools/ci/`.
    - The `ios` workflow pushes snapshots and contact sheets to the evidence branch.
- **The contract.** `openapi.yaml` for every endpoint and error code, the mock server with the fixture clubs, and the generated Swift client building on CI.
- **The database.**
    - A bootstrap step creates the `tadayo_app` role, the `app` schema it owns and `pg_trgm` (in CI, also Supabase's `anon`, `authenticated` and `service_role`). The first migration, run as `tadayo_app`, closes Supabase's data API: no grants for the public roles or `service_role`, and row-level security with no policies (ADR-015). The founder turns the data API off in the project's settings (his guide).
    - Migrations for spec 31's entities, with the constraints and indexes in `docs/TECH-DESIGN.md` section 6.
    - The authorization module with unit tests.
    - The time module with ADR-008's zones.
    - The privacy-matrix harness and the leak scanner, running green on the empty routes.
    - The Supabase probe (`docs/TECH-DESIGN.md` section 8), run on `dev` after each deploy.
- **Auth.** Supabase email codes end to end.
    - The API verifies the JWT, creates the user on first sign-in, and stores the 18-or-older confirmation (FQ13).
    - `GET /v1/me` and `PATCH /v1/me`.
- **The app.**
    - `project.yml`, with the app and share extension targets building on CI, at the minimum iOS the founder confirms (FQ4). Both targets carry a privacy manifest and `ITSAppUsesNonExemptEncryption = NO`.
    - `TadayoDesign` with book p35's tokens and the components of `docs/TECH-DESIGN.md` section 4, in the Lab (only in builds that point at `dev`), light and dark, with the fixture cast and photos (FQ24).
    - Sign-in and the profile (screens A02 and A03), built from spec until their renders arrive.
    - The three tabs with truthful empty states.
    - Snapshot tests producing PNGs and render-beside-snapshot contact sheets.
    - A TestFlight build on the founder's iPhone. App Store Connect refuses an upload without an app icon, and the only icon allowed is handoff 0's (T46), so the first upload waits for it, and so do the spikes that need the founder's iPhone (S3 and S6 in B0, and S1, S2 and S4 before Gate A). Until then, the app is built and tested on CI.
- **The brand handoff.** Design handoff 0 is ready in the founder's guide, so he can start it on day one. Copy it into `docs/plans/B0.md`. Gate 0 waits for its icon frames: if the rest of the brand takes longer, the founder can send the design as soon as those three frames are done, and the rest later.
- **The B1 handoff.** Write it in the B0 plan, for screens A02 and A03 and the club states B1 needs. Send it to the founder only once handoff 0's `brand-tokens.md` and `brand-components.png` are on `main`, because it builds on them.
- **Deploy.** `dev` on Supabase and Fly, connected through the session pooler, and `deploy-dev` on merge to `main`.
- **Confirm the environment.** Record each result in `docs/LIMITATIONS.md`:
    - whether Docker's daemon runs in the session;
    - whether the session can start a workflow by hand through REST;
    - whether it can read `main`'s branch protection;
    - whether the journal hook fires and the CodeRabbit plugin is off, in the first session started after the starter-pack PR is merged (sessions start from `main`, and Claude Code reads project settings only when a session starts);
    - whether the session reaches the hosts the first session was refused that `docs/TECH-DESIGN.md` section 10's network list names (Supabase, Fly, Cloudflare, swift.org and GitHub's documentation), once the founder has selected the Tadayo environment. Resend, refused too, isn't checked: the list leaves it out because the session never calls it (its key is only Supabase's SMTP password);
    - the one Swift version, pinned everywhere.

**Spikes.** Each spike gets a one-page report in `docs/spikes/` with its evidence. S1 to S4 and S6 run on the founder's iPhone, so they follow the first TestFlight build. Spike code merges only if it's clean enough to keep. S3, S5 and S6 run in B0. S1, S2 and S4 need the founder's account in an active club on `dev` with the founder's day in its calendar, which only B1 and B2 build, and no script or seed may put it there (ADR-021). So they run once B1 and B2 are on `dev`, before Gate A, and before B3 and B4 build media and contributing on them (B2, "Spikes S1, S2 and S4"; ADR-024).

| Spike | Prove |
|---|---|
| S1 Share extension | From TikTok's share sheet and from Photos, the compact composer shows club, person and exact date in under 500 ms on the founder's iPhone. A photo keeps uploading in the background after the sheet closes. The receipt appears only after the commit |
| S2 Photo pipeline | A 48-megapixel photo from an iPhone camera reaches the server as a JPEG of at most 4096 px with no GPS. The worker validates it and makes the renditions within the chosen Fly machine's memory, with the time measured (ADR-014) |
| S3 Video viewer | The TikTok Embed Player plays in the isolated web view on the founder's iPhone, signed out. Close, pause on background and Open original work. The player's messages are received with the origin checked; top-level navigation is intercepted. Records how TikTok treats the bundled shell's origin, and whether a hosted page is needed |
| S4 Push | A push with previews off reaches the founder's iPhone from the worker through APNs and opens the exact club and day. A 7 AM reveal push is deferred to 8 AM by quiet hours, shown with the dev clock |
| S5 Time | Reveal and close instants for the six zones of ADR-008, including Europe/London's missing and doubled 01:00. On `dev` with workers stopped, Home switches at the instant |
| S6 Links | A universal link opens the invitation in the app. Without the app, the web page shows the inviter's name and a "Get Tadayo" link: a placeholder until Gate E, when the external testing group's public TestFlight link exists. The token never reaches a server log |

**Gate 0 evidence:**
- the TestFlight build on the founder's iPhone: sign in with an email code, the three tabs, the Lab;
- the reports of spikes S3, S5 and S6 in one PDF, with the measured times;
- CI green, and the privacy matrix and leak scanner green on the empty routes;
- the Supabase probe's result on `dev`: every REST, GraphQL and Storage call refused or empty, and the data API off;
- a PR that went through the independent review, with every finding fixed or answered;
- `main`'s branch protection read back from GitHub, matching `docs/GITHUB.md` ("Check the protection");
- the Lab beside book p35's tokens and the 2.1 components.

## B1: Clubs (spec 38 step 1) → part of Gate A

- **api:** spec 04 and 07.
    - Users and profiles.
    - Clubs with proposed rosters, roster revisions and approvals, and membership intervals.
    - Invitations: create a link per candidate, preview after sign-in with the token in the body, accept the exact revision, approve, decline, expire and revoke.
    - The activation rule; the club list for the switcher; club details; leaving, with the end of the membership interval. The withdraw-on-leave cascade comes in B6.
    - Privacy-matrix rows for every club route, including the unaccepted invitee and the stranger (Q05).
- **ios:**
    - Screen A01 (`A01-welcome`, with the labelled example, FQ23). Screens A02 and A03 are brought to their renders as they arrive.
    - G01 (`G01-create`, then inviting people), G02 (`G02-invitation`, plus expired, changed and full), G03 (`G03-approve`, plus waiting and declined), G05 (`G05-club-details` and its members list) and G06 (`G06-switcher`).
    - `apps/web`'s invitation page, with the api lane.

## B2: Calendar and slots (step 2) → part of Gate A

- **api:** spec 05, 06 and 11.
    - Schedule proposals for one and two days, confirmation, visible conflicts.
    - Schedule versions and transitions at a safe boundary; the club paused under two members (FQ16).
    - Occurrence generation several weeks ahead.
    - `GET /v1/clubs/{id}/home` with `server_now`, the active or next occurrence and the countdown fields.
    - Reservations and counters, the six-and-two transaction (exercised with test uploads), the cutoff under the lock, idempotency.
    - Tests: Q01 to Q04, Q09 and Q10, Q12, and Q18 with workers stopped; ADR-008's zones.
- **ios:**
    - G04 (`G04-one-day`, `G04-two-days`, the conflict state).
    - H01 waiting states (`H01-waiting`, `H01-after-close`, `H01-sunday`, awaiting activation, club paused), with countdowns from `server_now` and a VoiceOver label giving the target date.
    - F01 (`F01-friends`, `F01-long-names`, `F01-friends-xl`) with the next dates; the F02 header with the exact date; C01 (`C01-picker`).

**Spikes S1, S2 and S4, before Gate A.** Both lanes, once B1 and B2 are on `dev` (ADR-024). The founder's account joins its club in the app, the way Gate A's own check forms a club: two accounts through an invitation link, the same roster approved, the days confirmed (spec 04 and 05; T6, T7). No script or seed touches the founder's account (ADR-021). Each spike proves what B0's table says, with a one-page report in `docs/spikes/`, and its code merges only if it's clean enough to keep. The B2 plan schedules them. If one shows that a native assumption fails, the stages that build on it (B3 and B4 for S1, B3 for S2, B8 for S4) are re-planned before they start.

**Gate A: clubs and the calendar.** The founder checks:
- two accounts form a club through an invitation link, approve the same roster, confirm their days, and see the same next dates;
- a third person needs everyone's approval;
- Home counts down to the next person's exact date;
- the dev clock moves a day open and shut with workers stopped;
- the report holds the zone and DST table, and the privacy-matrix report for club routes;
- the reports of spikes S1, S2 and S4, with the measured times (ADR-024).

## B3: Media and manifests (step 3) → part of Gate B

- **api:** spec 14 and 33.
    - Upload intents, direct upload, quarantine, preparation in the worker (signature, 20 MiB, 64 megapixels, metadata stripped, renditions, content hash, safety provider set to `none`), ready and held states.
    - Live Photos as stills (FQ10).
    - The author-preview endpoint (no-store).
    - The commit with the immutable audience and the sealing trigger.
    - Viewer-filtered manifests with the pre-reveal DTO.
    - The media route: the read predicate on every request, the bytes streamed with private, no-store caching, nothing before the reveal, and no signed read URL ever leaving the server (ADR-009).
    - `sources/resolve`, with TikTok and Instagram normalization and the safe fetcher.
    - The duplicate checks and the caption-source rule.
    - The leak scanner over every new route. Tests: Q05 to Q12.
- **ios:** the upload client: picker in its compatible representation, JPEG at up to 4096 px, GPS removed, PNG screenshots, a background session, the queue's states in `TadayoCore`.

## B4: Contributing (step 4) → part of Gate B

- **ios:**
    - C02 (`C02-photo`, `C02-keyboard`, plus link, several photos with caption review, the star's own composer, unsupported link, duplicate and external limit).
    - C03 (`C03-sources`, camera; the system picker in place of `C03-system-picker`).
    - C04 (`C04-link`, plus photos from Photos, signed out, receipt, pending and failed).
    - C05 (`C05-drafts`, `C05-private-draft`, empty, retarget).
    - C06 (`C06-ideas`, More ideas, the end of the batches, the star's set).
    - C07 (`C07-uploading`, `C07-failed`, `C07-missed-cutoff`, `C07-limit`, processing, pending offline, partial batch, returned from hold) and C08.
    - F02 (`F02-upcoming`, `F02-added`, `F02-your-drops`, author preview, caption edit, replace, withdraw, the note for a member who joined later).
    - `H01-first-drop`.
- **api:**
    - `PATCH` and `DELETE /v1/drops/{id}` while collecting; `PUT /v1/occurrences/{id}/highlight`.
    - The idea helper's aggregate events.
    - Tests: Q11, Q13, Q14, Q15, Q24.

**Gate B: contributing.** The founder checks:
- adding a photo for Debby from the app and from Photos' share sheet;
- a TikTok link from TikTok's share sheet;
- the caption visible to the others at once, and the photo hidden. The report shows:
    - the leak scanner's results;
    - a network capture from a non-author account;
    - the author's preview staying with the author;
- Drafts, kept and resumed;
- the allowance at six and two, with the race test's results;
- an upload crossing 7 AM on the dev clock, kept in Drafts with the next date offered;
- the idea helper.

## B5: The reveal (step 5) → part of Gate C

- **api:** spec 06 and 15.
    - Reveal and close as instants, with manifests and events materialized idempotently by the worker.
    - The highlight order: the star's pick, then schedule order (FQ26).
    - The star's own contributions; the moderation-hold exclusion.
    - Opening and closing outbox events, with no closing push.
    - Tests: Q14 to Q18.
- **ios:**
    - H01 during a day: `H01-open`, `H01-open-dark`, `H01-your-day` and `H01-quiet`, with the feed directly on Home.
    - R01: `R01-blank-caption`, `R01-past-day`, the end line, the removed placeholder, the video card, the large-text rail as a list.
    - R02 (`R02-photo`, `R02-screenshot`, removed while open, the author's own view).
    - R03 (`R03-opening`: the 650 ms fold, skip, Reduce Motion, repeat).
    - Safe transitions at 7 AM and 1 AM; the offline cached state.

## B6: Responses, Memories and removal (step 6) → part of Gate C

- **api:** spec 16, 18, 22 and 23.
    - Reactions from an allowlisted palette (FQ22); comments with replies, edit and delete, thread mute and report.
    - Favourites; Memories with member and month filters and For me; search over names, dates and caption text.
    - Removal propagation for withdrawal, pictured removal, hiding for oneself, moderation, the end of a membership, blocks, and account deletion with the tombstone log (ADR-010).
    - Leave with keep or withdraw; reports.
    - Tests: Q19, Q22, Q23, Q25, Q27.
- **ios:**
    - R04 (`R04-comments`, empty, edit, reply, report, mute) and the reactions.
    - M01 (`M01-memories`, `M01-search`, `M01-empty`, filters, no results) and M02 (`M02-favourites`, empty, the one-time explanation).
    - S01 (`S01-pictured-removal`, the author's menu, other members' menu, report, withdraw after the reveal).
    - S02 block and leave; G05's leave flow.
    - S03 (`S03-account`, privacy and safety, your contributions, appearance, sound and haptics) and S04. `S03-notifications` comes with B8.
    - Logout and account switching purge every cache and the roster cache, and leave the previous account's drafts unreadable (Q26).

**Gate C: the whole loop.** The founder checks:
- at 7 AM on the dev clock, Home becomes Debby's day;
- the highlights open with the fold, the photo viewer works, and reactions and comments work;
- at 1 AM, Home moves on and the day is in Memories;
- favourites and search work;
- a withdrawal and a pictured removal, with a before and after report of every surface;
- leave, block and delete account;
- the screens PDF: every state's render beside its snapshot, with the differences listed, and the inventory with no state left at `built from spec` without a stated reason.

## B7: Videos (step 7) → part of Gate D

- **api:** spec 17. The embed endpoint after the reveal only, the TikTok adapter, provider switches in `GET /v1/config`, Instagram as a link (FQ11). Tests: Q20.
- **ios:**
    - E01: `E01-entry` and `E01-unavailable`, plus loading, playing, login required, timeout and Instagram as a link.
    - The isolated web view's rules (T39).
    - Device tests: signed out, restricted network, app installed and absent, deleted source, region. Tests: Q20, Q21.

## B8: Notifications (step 8, without widgets) → part of Gate D

- **api:** spec 21.
    - APNs dispatch with aggregation, the two-a-day budget across clubs (FQ30), and quiet hours in the device's zone, with the reveal push deferred.
    - The access recheck at dispatch; preferences per account, club and thread; previews off by default; device registration, and its removal at logout or account switch.
    - Tests: Q22, and T36's never-cases; and, for the push registration's removal, one for each requirement and each case `docs/TECH-DESIGN.md` section 6 lists that the server meets: a removal removes only its own sign-in's registration, a new token's included, and gets the neutral `NOT_FOUND` for anything else, its own registration already removed included, and so does a removal sent after the token moved to a later sign-in, of the same account or of another, while the later sign-in keeps the token and its registration (a, d, T14); the server holds the removal's secret only in a form that can't authorize a removal (a); after a removal, and after a late registration it refused, the database holds nothing personal for that sign-in, including anything that names its account or the device or leads to either through another table, such as a session id the auth tables still link to the account (b); a push for that account that the worker sends after the removal lands, a reveal push deferred by quiet hours, an aggregated arrival and a retry of a push queued before the removal included, goes to none of the device's tokens unless a later sign-in of the same account holds that token when it is sent (the outcome); and a registration of a sign-in that lands after that sign-in's removal, or after the token moved to a later sign-in of the same account or of another, whether delayed or sent again after a lost answer, changes nothing: no registration of that sign-in remains, the later sign-in keeps the token and its registration, and a later sign-in's registration, of the same account or of another, is accepted, both its first, made after the earlier sign-in's removal and after a late registration of that sign-in was refused, and one sent again (e).
- **ios:**
    - The permission offer after the first contribution (`F02-added` and its first-time variant).
    - The notification settings (`S03-notifications`, `G05-notifications`).
    - Routing of deep links with the access recheck, and the not-available screen. Q29 waits for widgets in M1.
    - The removal of the push registration after every logout, with the mechanism B8's PR designs (`docs/TECH-DESIGN.md` section 6). Device test, in four cases, in each of which the removal must land: a logout made online, where it lands at the logout; one made offline, where it lands once the network returns while the app is suspended; the same with a force-quit and a relaunch made online, where it lands at that launch; and with a force-quit and a relaunch made offline, where it lands once the network returns after that launch. In each, no push for the old account reaches the iPhone afterwards. Logic tests for each requirement section 6 lists that the app meets, and for each case it names: every removal is authorized by a secret generated at its sign-in, and the next sign-in, of the same account or another, generates a new one; the app deletes the sign-in's session credential at the logout (a); the app sends the removal at the logout, and a pending removal, after an offline logout, one recorded but never sent, and one that ended any other way than the server's removal or its neutral `NOT_FOUND`, with a test for every such ending, each one (c) names included, is sent at each launch and when iOS wakes the app, with a delay after each failed attempt, and what authorizes it is kept (c); and the server's removal and its `NOT_FOUND`, also for a removal whose earlier answer was lost and one sent after the token moved, each end it, after which the app sends it no more and deletes what authorized it (d).

## B9: Trial readiness (step 9) → Gate D

- **Accessibility:** VoiceOver, the largest text sizes, an external keyboard, Reduce Motion, error recovery (Q30).
- **Security:** the privacy matrix on every route, the leak scanner, TECH-DESIGN section 12 applied to every feature, a security reviewer's pass over the whole API.
- **The restore drill**, with tombstone replay on a temporary project (Q28).
- **The moderation exercise:** a report, a hold or removal through the `ops` scripts, and the audit trail (FQ27).
- **Incident playbooks** in `docs/runbooks/` for spec 34's list.
- **The events dictionary** and the weekly trial report script (ADR-012).
- **The privacy pages and in-app explanations** (FQ6).
- **`prod`** in the FQ3 region, with its data API turned off by the founder and the Supabase probe green on it. No key that reaches it is available to a run on a branch other than `main` (`docs/TECH-DESIGN.md` section 9). Before it exists, its deletion log gets an R2 bucket of its own, and each app's R2 keys, read back in Cloudflare, reach only their own environment's bucket, so no key in `dev`'s app reaches `prod`'s (section 10, FQ37).
- **App Store Connect:**
    - the privacy details;
    - the external testing group;
    - the review account, its review club with the founder's own photos, and the review notes (FQ29);
    - the beta review submission.

**Gate D: ready for the trial.** The founder checks:
- the TikTok player on his iPhone in its failure states, and an Instagram link;
- notifications with previews off and on: the deferred 8 AM push, the budget and the grouping;
- the accessibility report;
- the restore drill report;
- the moderation exercise;
- the trial report on seeded data;
- FQ8 answered in writing;
- `prod` created, with the Supabase probe's result on it.

## Gate E: the trial starts

The founder runs the usability round (book p39) on the Gate D build, Claude Code fixes what it finds, and the first clubs join as external TestFlight testers (FQ28). Gate E's evidence:
- the fixes from the usability round;
- the beta review passed;
- the first weekly trial report.

The trial then runs two weeks, and at least six more weeks for the clubs that consent (spec 36). During it, Claude Code works only on fixes and on what the trial reports show, each through the normal PR loop.

## After the trial

M1, the first production release (spec 02), is planned from the trial's evidence, in its own PR, for the founder's approval. It starts from:
- widgets (screen W01 and the widget states, Q29);
- Sign in with Apple and Google;
- resumable uploads with a persisted queue;
- the full accessibility audit;
- an image-safety provider (FQ8);
- embedded Instagram if Meta approves (FQ11);
- Live Photo motion with video checks (FQ10);
- data export (FQ18), and the operator console if a second operator exists (FQ27);
- external sharing behind `external_share` (FQ14, T61);
- a staging environment;
- the Android app, native Kotlin, against the same contract.

M1.5 adds Remember this (spec 19, T62), broader search and the paid experiments, each behind its flag.

## Definition of done (every PR)

- It does what the spec section says, and keeps every invariant it touches.
- Tests cover the logic, and `ci` is green (once it exists). A new route has its privacy-matrix rows and passes the leak scanner.
- **For anything visible:**
    - snapshots on the `evidence` branch, linked from the PR, beside their renders and checked against the book's contracts;
    - `design/reference/INVENTORY.md` updated;
    - the handoff written for any state without a render.
- **It's documented where needed:** `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/QUESTIONS.md`. Every commit has its entry in `docs/JOURNAL.md`.
- **An independent review** by a fresh subagent, with every finding fixed or answered in the PR (`docs/GITHUB.md`).
