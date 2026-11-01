# Tadayo journal

This is the one document that tells a reader everything about Tadayo: what it is, how it's built, where the work stands, what comes next, and the proof behind every claim. It's written for a reader who has never seen the project: a new Claude Code session, another agent, the founder or an auditor. Read with the files it names, it's enough to start work at once, or to audit the whole project.

**Every commit updates it, in the same commit.** Two checks hold this:
- the hook in `.claude/settings.json` (`tools/ci/journal_hook.py`) refuses a commit that leaves the journal out;
- the `ci` guard (`tools/ci/journal_check.py --branch`) refuses a branch whose journal lacks an entry for one of its commits, leaves a field empty, changes an old entry or drops an audit row.

## How to read it

| You are | Read |
|---|---|
| New to Tadayo, or another agent | Section 0, then section 1. With them you can start work |
| Resuming work | Section 1 (the shared block and your lane's), then your lane's newest log entries |
| Reviewing or auditing | Section 5, which says how; then sections 0, 2 and 4, and the log |
| The founder | Section 1: "Next, in order" and "Blocked or waiting for the founder" |

## Its six parts

0. **Orientation:** what Tadayo is, how it's built, where everything is, who does what, the rules that matter most, the decisions in force, and where the build departs from its sources. It changes rarely; a commit that changes anything it describes updates it.
1. **State of the project:** rewritten, not appended, at every commit: where things are, what works and was verified, what's in progress, what's next in order, what's blocked, and how to run and check everything. A reader who stops here knows where the project stands.
2. **Audit map:** one row per invariant (T1 to T62), per spec acceptance test (Q01 to Q30) and per spec section with code: where it's enforced, where it's tested, and its status. An auditor starts here.
3. **Log:** one entry per commit, newest first, append-only: what changed, why, what was verified and how, what wasn't, the decisions, and the next step.
4. **Pull requests, gates and evidence:** one row per PR and per gate, and where every kind of evidence lives.
5. **How to audit this project:** the steps for an independent reviewer who has never seen it.

## Rules

- **Write for a stranger.** Name files and functions, commands, test names, PR numbers, evidence paths, spec sections and book pages. No "as before", no "see chat", no "the usual": a reader has only this journal and the repository.
- **Facts only.** "Verified" means you ran it, and the entry says what you ran and what it showed. "Not verified" is written as such, with the reason and who can check it. Never claim a check you didn't run.
- **What each commit updates:**
    - section 1, always (your block);
    - section 2, for every invariant, acceptance test or spec section the commit touched;
    - section 3, always: one new entry with all six fields;
    - section 0, when the commit changes anything it describes;
    - section 4: your PR's row in your last commit before you open it, and its number and review findings in the commit that records the review; a gate's row when its report is posted; and a new kind of evidence when it appears.
- **Every field of an entry is filled:** Did, Why, Verified, Not verified, Decisions and questions, Next. Where a field has nothing, write "None"; never leave it out. The `ci` guard checks this.
- **"Next" can be carried out as written:** the command to run or the file to open, and what done looks like. Then a session that has nothing but this journal can carry on.
- **Your block's first line** is `**Updated:** YYYY-MM-DD HH:MM UTC, <branch>`, rewritten at every commit. The `ci` guard checks that it changed.
- **Two lanes, separate places.** The state has a shared block and one block per lane, the log has one section per lane, and section 4 has one PR table per lane, so the lanes' edits stay apart.
    - Until Gate 0 there is one session, which writes the shared block, the B0 log and the first PR table.
    - After Gate 0, the api lane keeps the shared block and section 0. Each lane edits section 0's lines about its own work (the ios lane: the iPhone app, the design, and the departures in screens).
    - Each lane rewrites only its own block, adds entries only to its own log section and PR table, and updates only the audit rows its work touches.
    - When a merge brings a conflict here, rebuild from the two whole versions, `git show :2:docs/JOURNAL.md` (yours) and `git show :3:docs/JOURNAL.md` (theirs), not from the conflict markers: git pairs identical lines such as "**Not verified:** None." across entries, so its hunks can split an entry from its fields. In the log and in section 4, keep every entry from both sides, each once and whole. In the audit map, a row both lanes changed becomes one row that keeps both lanes' entries (where enforced, where tested, notes), with the less advanced status until both halves are done; never leave a row in twice. In the state, rewrite your block so it's true after the merge. Then run `python3 tools/ci/journal_check.py --all`.
- **On `main`, the journal is as of each PR's last commit.** A merge isn't written here; `git log --oneline origin/main` lists what merged, and each squash commit ends with its PR number.
- **The log is append-only.** Never shorten or edit an old entry; the `ci` guard checks that every old line is still there. Correct a mistake with a new entry that names the one it corrects.
- **Never delete an audit-map row.** Its status can go back (from `tested` to `built`, say), with the reason in the log.
- **No secrets** (keys, tokens), no real members' captions or photos, and no personal data, ever.

---

## 0. Orientation

What doesn't change from commit to commit. **Last checked against the repository:** 2026-11-01, at the handoff.

### 0.1 What Tadayo is

Tadayo makes each person's day a shared occasion for a private club of two to six friends (spec 01).
- **Days.** In a club of two or three, each member has two days a week; in a club of four to six, one. Sunday has no day (spec 05; Q01, Q02).
- **Contributing.** Friends add photos and selected short video links (TikTok, Instagram) for a member's next day. Each contributor has at most six drops per day, of which at most two are video links, and may pick one of them as a highlight. The member whose day it is, the star, adds under the same allowance, and the star's pick comes first (spec 01, 11, 15; A06 to A08).
- **Hidden until the day.** The people in a drop's audience can read its caption straight away. The photo or video stays hidden on the server, not under a drawing, and people outside the audience see nothing (spec 14; T9, T10).
- **The reveal.** At 7 AM in the club's time zone everything opens at once, and Home becomes that day until 1 AM the next morning; then the day lives in Memories. The 7 AM reveal is also the cutoff: later work goes to the member's next day, after the contributor confirms it (spec 05, 06, 15, 18; D02).
- **No pressure.** No counts, streaks, rankings, reminders or read receipts, and at most two ordinary pushes a day, never in quiet hours (spec 03, 21; T33 to T37).

The first build is a native iPhone app with a share extension, for a closed trial with the founder's friends through TestFlight (ADR-001, ADR-007). Android follows the trial, against the same API. Spec 01's own test of understanding applies to this section: its reader can say who sees a caption now, who sees the media later, and which day a new drop goes to.

### 0.2 How it's built

| Part | What it is | Decided in |
|---|---|---|
| iPhone app | Swift 6 and SwiftUI, iOS 17 or later until the founder confirms the phones (FQ4): the app and its share extension. Logic lives in Swift packages that test on Linux; views are thin | `docs/TECH-DESIGN.md` sections 1, 2, 4; ADR-001 |
| Server | A TypeScript API and a worker (Node 26, Fastify 5, plain SQL, OpenAPI generated from zod), one image on Fly.io | sections 1, 5, 6; ADR-003, ADR-005 |
| Data | Supabase: Postgres, with the tables in an `app` schema owned by the API's role `tadayo_app`; Auth with six-digit email codes; private Storage. Supabase's own data API is off, and a probe checks it after every deploy | ADR-003, ADR-011, ADR-015; T53 |
| Photos | Prepared on the phone (JPEG of at most 4096 px with no GPS; screenshots stay PNG) and uploaded with a one-object signed URL. Every read goes through the API, which checks access on each request; no read URL ever reaches the app | ADR-009, ADR-014; T12 |
| Time | The 7 AM and 1 AM instants are resolved in TypeScript with the Temporal API. The server's clock decides, never the phone's. Only `dev` has a clock that can be moved, for demonstrations | ADR-008, ADR-013; T1 to T3 |
| Push | APNs, sent by the worker, with the two-a-day budget and quiet hours | spec 21; T36, T37 |
| Web and the deletion log | The invitation page and the policy pages on Cloudflare Pages. The deletion log in a Cloudflare R2 bucket, so deletions survive a backup restore | ADR-010; T28 |
| Design | Design revision 2.1's 53 renders, plus the brand and every missing screen state from Claude Design, which the founder drives from Claude Code's handoffs. Claude Code never designs | ADR-006; T46; `docs/DESIGN-HANDOFF.md` |
| Building without a Mac | Cloud sessions (Linux) build and test everything but the screens. GitHub's macOS runners build the app, run its snapshot and UI tests, and upload it to TestFlight; the snapshots come back on the `evidence` branch | `docs/TECH-DESIGN.md` section 2 |
| Environments | `dev` from B0, used by every session and the founder's test builds; `prod` from Gate D, for the trial | section 7; ADR-004 |

### 0.3 Where everything is

| Path | What lives there | Lane |
|---|---|---|
| `apps/ios/` | `project.yml` (XcodeGen), the app, the share extension `TadayoShare`, fixtures, snapshot and UI tests | ios |
| `packages/swift/` | `TadayoCore` (logic), `TadayoAPI` (the generated client), `TadayoDesign` (tokens and components) | ios |
| `services/api/`, `services/worker/` | The API (routes, serializers, the media route) and the worker (outbox, occurrences, uploads, reveals, pushes, purges) | api |
| `packages/domain/` | Authorization, time, schedules, limits and commands, in pure TypeScript | api |
| `packages/contracts/` | `openapi.yaml`, generated and committed; changed only in its own PR | api |
| `db/` | Numbered SQL migrations, and the seed of the book's fixture clubs | api |
| `tests/` | Integration tests, the privacy matrix, the leak scanner, concurrency and load | api |
| `apps/web/` | The invitation page, `apple-app-site-association`, the privacy, terms and support pages | api |
| `tools/ops/`, `infra/` | The scripts the `ops` workflow runs, and the deployment files | api |
| `tools/ci/` | The scripts CI and the journal hook run, with their tests | CI-configuration PRs only (T58) |
| `.github/`, `.claude/`, `.yamllint.yaml` | The PR template and the workflows; Claude Code's project settings; the YAML lint settings | CI-configuration PRs only |
| `design/reference/` | 2.1's renders, Claude Design's deliveries and the files made from them, and `INVENTORY.md` | ios keeps the inventory |
| `docs/` | The spec, the book, the rulebook, this journal and the logs | shared, by `docs/MILESTONES.md`, "Lanes" |
| The `evidence` branch | An orphan branch, never merged: snapshots, contact sheets, gate reports, MP4s, test logs | the `ios` workflow and the lanes |

The full table is in `docs/TECH-DESIGN.md` section 3.

### 0.4 The documents and what each decides

| Document | What it decides | Read it |
|---|---|---|
| `CLAUDE.md` | How Claude Code works here: what matters most, the rules easiest to break, the build loop, git and this journal | first, every session |
| `docs/tadayo-build-spec-v3.md`, the spec | Product rules, audiences, privacy, limits, scheduling, removal, the data model, the API and the acceptance tests Q01 to Q30. Cited as "spec 14", rules as "A06", defaults as "D02" | before any slice |
| `docs/tadayo-design-book-2.1.md`, the book | Layouts, tokens, components, copy, motion, routes and state labels. Cited as "book p34" | before any screen |
| `docs/INVARIANTS.md` | Rules T1 to T62. They beat everything except a direct instruction from the founder | before any slice |
| `docs/TECH-DESIGN.md` | The stack, building without a Mac, the repository, CI, environments, testing and the security checklist | while building |
| `docs/MILESTONES.md` | Stages B0 to B9, the lanes, the gates and the trial | at the start of each stage |
| `docs/GITHUB.md` | How a PR reaches `main`: the loop, the independent review, workflow files, GitHub from a cloud session | before opening a PR |
| `docs/DESIGN-HANDOFF.md` | How designs are asked for and turned into files; Design handoff 0, the brand | before any screen |
| `design/reference/INVENTORY.md` | Every screen state with its render and status, and the known differences from 2.1 | before any screen |
| `docs/DECISIONS.md`, `docs/QUESTIONS.md` | The ADRs; the founder's open decisions, each with the default in force | when a choice is questioned, or the sources are silent |
| `docs/LIMITATIONS.md` | Every platform limit met, with its evidence and workaround | when something can't be done as planned |
| `docs/PROGRESS.md`, `docs/GATES.md` | The short view per lane; the founder's gate answers | at session start; at gates |
| `docs/plans/`, `docs/spikes/`, `docs/runbooks/` | Stage plans, spike reports and incident playbooks, written as the work goes | when their stage comes |

### 0.5 Who does what

- **The founder** approves every gate and merges every PR, from his iPhone. He answers the open questions, drives Claude Design, and adds the workflow files Claude Code sends him.
- **Claude Code** builds: one session until Gate 0, then two lanes in parallel, api and ios (`docs/MILESTONES.md`, "Lanes").
- **Claude Design** makes the brand and every missing screen state, from Claude Code's handoffs, through the founder (`docs/DESIGN-HANDOFF.md`).
- **Independent reviewers:** a fresh subagent that hasn't seen the work reviews every PR before the founder sees it. A change that touches authorization, the database, time, idempotency, media, caches, tokens, notifications or the video viewer also gets a privacy and security reviewer, and screens get a reviewer who compares them with their renders (ADR-002; `docs/GITHUB.md`).

How work reaches `main`: a slice on its own branch, with its tests written first → `ci` green → a PR written from `.github/pull_request_template.md` → the independent review → every finding fixed or answered → the founder squashes and merges. CI configuration changes only in a PR of its own (T58).

Stages and gates (`docs/MILESTONES.md`):
- B0 → Gate 0, foundations;
- B1 and B2 → Gate A, clubs and the calendar;
- B3 and B4 → Gate B, contributing;
- B5 and B6 → Gate C, the whole loop;
- B7 to B9 → Gate D, ready for the trial;
- Gate E, the trial starts.

### 0.6 The rules that matter most

The full list is `docs/INVARIANTS.md`. These are the ones a mistake breaks first:
- **Hidden means hidden.** Before 7 AM the audience reads the caption and nothing else, and only the author sees their own preview. One read predicate and one whitelist hold this, proved by the privacy matrix and the leak scanner (T9 to T12, T14, T16).
- **The server's clock decides.** Access, the cutoff and Home come from the stored instants and the server's time, sampled after the lock (T1 to T3, T5).
- **The right person and date.** Every add names the club, the person and the exact date. Nothing moves silently, "Added" means committed, six and two hold in one transaction, and each idempotency key commits once (T4, T17 to T20, T31).
- **Audiences don't change after commit,** and removal reaches every surface at once (T8, T24).
- **Nothing is counted, ranked or chased** (T15, T33, T37).
- **Supabase stays closed:** the app uses it only to sign in (T53).
- **Claude Design designs; Claude Code never does,** and no stock or generated imagery enters the app (T46).
- **Checks only get stronger,** and CI configuration changes alone (T58).

### 0.7 Decisions in force

- **ADRs** (`docs/DECISIONS.md`):
    - ADR-001: iPhone first, built on macOS CI.
    - ADR-002: no outside code reviewer.
    - ADR-003: Supabase, Fly.io, Resend, APNs and Cloudflare.
    - ADR-004: `dev` and `prod` only until the public launch.
    - ADR-005: plain SQL and generated contracts.
    - ADR-006: design revision 2.1, then Claude Design.
    - ADR-007: what the closed trial includes.
    - ADR-008: reveal and close instants computed in TypeScript.
    - ADR-009: media only through the API.
    - ADR-010: deletion tombstones kept outside the database.
    - ADR-011: email codes instead of magic links.
    - ADR-012: first-party analytics.
    - ADR-013: a clock that only `dev` can move.
    - ADR-014: photos prepared on the device.
    - ADR-015: Supabase's own data API stays closed.
- **The founder's answers:** FQ1, iPhone first; FQ2, keep 2.1's screens and add the brand. Both on 1 November 2026.
- **Defaults in force until he answers** (`docs/QUESTIONS.md`, FQ3 to FQ30). The ones that shape the trial most:
    - iOS 17 as the minimum (FQ4);
    - no photo-scanning provider in the closed trial, with his written acceptance (FQ8);
    - widgets after the trial (FQ9);
    - Live Photos as stills (FQ10);
    - Instagram as a link (FQ11);
    - email codes (FQ12);
    - no Share button (FQ14);
    - drafts kept on the device (FQ15);
    - names, never inferred pronouns (FQ20);
    - his own photograph as the Welcome example (FQ23);
    - the App Review account and club (FQ29).

### 0.8 Where the build departs from its sources

Each departure has a reason and a record. This list is meant to be complete: anything else that departs from the spec or the book is a finding.
- **Trial scope** (ADR-007), which differs from both spec 02's phases and spec 38's build order:
    - in the trial: push with the budget and quiet hours, roster revisions and approvals, basic report, hide, withdraw, pictured removal, leave, block and account deletion, and the operator scripts;
    - waiting for M1: widgets (FQ9), Sign in with Apple and Google (FQ12), resumable uploads, Live Photo motion (FQ10), embedded Instagram (FQ11), the full accessibility audit, data export (FQ18) and an operator console (FQ27);
    - later still: Remember this and the paid experiments (M1.5), and external sharing (after the trial, FQ14).
- **Media:** no signed read URL ever reaches the app, which is stricter than D10's five minutes (ADR-009).
- **Sign-in:** six-digit email codes instead of D06's magic link (ADR-011).
- **Photo safety:** spec 33 quarantines every upload until safety checks pass, and the closed trial runs with no scanning provider (FQ8).
- **Club setup:** no club cover (FQ17, against spec 04's optional cover), and no change of a club's time zone (FQ19).
- **Drafts:** on the device, per account, where the book makes them account-wide (FQ15).
- **Where 2.1's renders break a rule:** names instead of "Her pick" and the other gendered strings, the Highlight label only on the viewer's own cards, the rail's order, and no Share icon.
- **Where the book wins over the spec:** Reduce Motion opens the photo at once, where spec 15 says a crossfade; and "Added for", where spec 10 says "Added to".

The screen-by-screen list is `design/reference/INVENTORY.md`, "Known differences".

---

## 1. State of the project

### 1.1 Shared (the api lane keeps this block)

**Updated:** 2026-11-01 23:31 UTC, draft/b0-plan

- **Stage:** B0 Foundations, not started. Next gate: Gate 0 (`docs/MILESTONES.md`).
- **Lanes:** none yet; one session until Gate 0.
- **PRs:** #1, `docs: add the Tadayo starter pack` from `starter-pack`, open, in its independent review.
- **Branches:** `main` holds one commit, `Initial commit` (`README.md` only), made from the session at the founder's request on 2026-11-01 because the repository was created empty. `starter-pack` adds the pack and its document fixes. `draft/b0-plan`, made from `starter-pack` at the founder's request, holds the draft of `docs/plans/B0.md`; it is never merged or opened as a PR, and stays as it is.
- **`main`'s protection:** on, read back on 2026-11-01 through the summary (`docs/GITHUB.md`): no required check yet. Squash merges only, and merged branches are deleted.
- **Environments:** `dev` being set up by the founder in US East (Supabase `us-east-1`, Fly `iad`; FQ3). `prod` not created (Gate D).
- **The domain:** `tadayo.app`, registered by the founder on Cloudflare on 2026-11-01 (FQ5).
- **TestFlight:** no build yet.
- **`ci` on `main`:** not set up yet; B0 adds it.

**What exists and works (verified).** On `starter-pack`, the starter pack unpacked at the repository root by the commit `docs: unpack the Tadayo starter pack`. Its tree matched a separate unzip of `tadayo-starter-pack.zip` (`diff -r`, no difference) until that commit rewrote this journal's section 1.1 and added its log entry. The document fixes since are on `starter-pack` (PR #1), not on this branch. Here, `python3 tools/ci/journal_hook_test.py` passes (6 tests) and `python3 tools/ci/journal_check_test.py` fails 2 of its 28 tests, `test_unpack_without_an_entry` and `test_state_left_as_the_handoff_wrote_it`, because their fixture reads the live journal; PR #1 fixes the fixture. Python 3.13.18, git 2.43.0. Nothing else is built.

**In progress.** PR #1's independent review, on `starter-pack`. On `draft/b0-plan`, a branch that is never opened as a PR (the founder's instruction of 2026-11-01), the B0 plan `docs/plans/B0.md`; it reaches `main` through `plan/b0` after PR #1 merges.

**Next, in order:**
1. On `starter-pack`, finish PR #1's independent review: fix or answer each finding, and record the review in a commit that fills in the PR's row in section 4. Done when the PR says it's ready for the founder.
2. After the founder merges it: `git fetch origin`, `git switch -c plan/b0 origin/main`, then `git checkout origin/draft/b0-plan -- docs/plans/B0.md`; write its journal entry, and open its PR with its own review. Leave `draft/b0-plan` as it is.
3. In the first session the founder starts after merging the starter-pack PR, check that the journal hook fires (a `git commit` without `docs/JOURNAL.md` staged is refused by `tools/ci/journal_hook.py`), and record the result in `docs/LIMITATIONS.md`.
4. The B0 slices, in the order `docs/plans/B0.md` sets.

**Blocked or waiting for the founder:**
- Reviewing and merging the starter-pack PR once it says it's ready, and deciding the rule changes it lists for the founder.
- Selecting the Tadayo environment for the project, with Supabase, Fly, Cloudflare, Resend and swift.org allowed: the first session's environment refused them (`docs/LIMITATIONS.md`).
- Accounts for B0 (`docs/TECH-DESIGN.md` section 10): Apple Developer Program with the App Store Connect API key and the APNs key, Supabase on Pro with `tadayo-dev`, Fly.io, Resend on `tadayo.app`, and a yes to FQ5's identifiers. The B0 plan names each account and secret exactly.
- The trial members' iPhone models and iOS versions (FQ4), which matter only if one can't run iOS 17. The founder's is an iPhone 13 on iOS 18.3.2, so the minimum stays iOS 17.
- Design handoff 0 in Claude Design. Gate 0 waits for its icon frames: the first TestFlight upload needs the icon, and spikes S1 to S4 and S6 need that build.
- Open questions with defaults in `docs/QUESTIONS.md`; the defaults apply until answered.

**How to run and check everything.**
- The journal: `python3 tools/ci/journal_check.py --all`, and `--branch` on a branch; the hook's and the check's tests: `python3 tools/ci/journal_hook_test.py` and `python3 tools/ci/journal_check_test.py`.
- To be written in B0:
    - the commands for the backend tests, the privacy matrix and the leak scanner;
    - the Swift package tests;
    - the `ios` workflow, and where its snapshots and contact sheets land;
    - the `ops` workflow's scripts, including the dev clock and the Supabase probe;
    - how to read the evidence branch.

**Known limits and risks.** See `docs/LIMITATIONS.md`. The two that shape the work: cloud sessions can't push workflow files, and they can't compile SwiftUI. `docs/TECH-DESIGN.md` sections 2 and 9 handle both. The session that unpacked the pack started before `.claude/settings.json` existed, so the journal hook didn't run on its commits; `tools/ci/journal_check.py --branch` checked them instead.

### 1.2 api lane

**Updated:** 2026-11-01, by the handoff.

Not started (after Gate 0). Its block will hold its PRs, what's in progress, what's next and what's blocked.

### 1.3 ios lane

**Updated:** 2026-11-01, by the handoff.

Not started (after Gate 0). Until then, the B0 session keeps the design line here:
- **Design** (`design/reference/INVENTORY.md`):
    - handoffs sent: none. Design handoff 0 (the brand) is ready in `docs/DESIGN-HANDOFF.md` and in the founder's guide;
    - trial states: 146, of which 50 have 2.1 renders (49 to build, plus the system picker's reference) and 96 are missing;
    - built from spec: 0. Brand assets received: 0 of 4.

---

## 2. Audit map

One row per invariant, per acceptance test and per spec section with code. Status: `planned`, `built`, `tested`, `verified on device`. Add rows as code lands; never delete a row.

### Invariants

| Rule | Enforced in | Tested by | Status | Notes |
|---|---|---|---|---|
| T1 Server time decides | | | planned |  |
| T2 Two civil times, resolved independently | | | planned |  |
| T3 The reveal is the cutoff (D02) | | | planned |  |
| T4 Nothing is retargeted silently | | | planned |  |
| T5 Home is derived, not stored | | | planned |  |
| T6 The calendar keeps its promises | | | planned |  |
| T7 Membership is by exact roster | | | planned |  |
| T8 Audiences are immutable | | | planned |  |
| T9 One read predicate | | | planned |  |
| T10 Before the reveal, others get the caption and nothing else | | | planned | leak scanner |
| T11 The author's preview stays with the author | | | planned |  |
| T12 A cover is presentation; access is the server's | | | planned |  |
| T13 Captions are short and can't carry the find | | | planned |  |
| T14 Unauthorized looks like missing | | | planned |  |
| T15 Hidden counts stay hidden | | | planned |  |
| T16 Leaks are tested where they happen | | | planned | leak scanner |
| T17 Six and two, per contributor per occurrence | | | planned |  |
| T18 Reservations expire | | | planned |  |
| T19 One commit per idempotency key | | | planned |  |
| T20 "Added" means committed | | | planned |  |
| T21 Duplicates are checked privately | | | planned |  |
| T22 Highlights are pointers | | | planned |  |
| T23 Denials beat grants | | | planned |  |
| T24 Removal reaches everything at once | | | planned |  |
| T25 A pictured member removes without asking | | | planned |  |
| T26 Leaving and blocking are explicit | | | planned |  |
| T27 Deletion removes authored content everywhere, | | | planned |  |
| T28 Deletions survive a restore | | | planned |  |
| T29 A held drop never appears late | | | planned |  |
| T30 Drafts belong to their owner alone | | | planned |  |
| T31 The target is always explicit | | | planned |  |
| T32 Favourites are private pointers | | | planned |  |
| T33 Nothing is counted, ranked or chased | | | planned |  |
| T34 Opening is private | | | planned |  |
| T35 The day is finite | | | planned |  |
| T36 Notifications report real events only | | | planned |  |
| T37 Two a day, with quiet hours | | | planned |  |
| T38 Links keep their exact context | | | planned |  |
| T39 The player is a guest | | | planned |  |
| T40 Provider identity is hidden until the reveal | | | planned |  |
| T41 One vocabulary | | | planned | copy lint |
| T42 Names, not inferred pronouns | | | planned | copy lint |
| T43 The voice is plain | | | planned | copy lint |
| T44 Tokens, not values | | | planned |  |
| T45 Native first | | | planned |  |
| T46 Claude Design designs; Claude Code never does | | | planned |  |
| T47 Accessibility is part of done | | | planned |  |
| T48 Motion is one fold | | | planned |  |
| T49 Truthful states only | | | planned |  |
| T50 Ask only when needed | | | planned |  |
| T51 Analytics are first-party and pseudonymous | | | planned |  |
| T52 Logs carry no content | | | planned |  |
| T53 The server decides, and Supabase stays closed | | | planned | Supabase probe |
| T54 Outbox and idempotent workers | | | planned |  |
| T55 Serializers whitelist | | | planned |  |
| T56 Secrets stay out | | | planned |  |
| T57 Migrations expand, migrate, contract | | | planned |  |
| T58 Checks only get stronger | | | planned | ci guard |
| T59 Real Postgres and the privacy matrix | | | planned | privacy matrix |
| T60 Flags for what can fail or wait | | | planned | flags |
| T61 External sharing needs everyone's yes | | | planned | after the trial, flag external_share |
| T62 Remember this stays private and old | | | planned | M1.5, flag remember_this |

### Acceptance tests (spec 37)

| Test | Proved by | Evidence | Status | Stage |
|---|---|---|---|---|
| Q01 Two and three members receive two weekly dates each; four to six receive one. | | | planned | B2 |
| Q02 One star per assigned day; Sunday has no generated reveal. | | | planned | B2 |
| Q03 Club zone opens 7 AM closes next day 1 AM including midnight travel and DST cases. | | | planned | B0, B2 |
| Q04 Roster threshold change preserves submitted occurrences. | | | planned | B2 |
| Q05 Nonmember invite token cannot read caption or media. | | | planned | B1 |
| Q06 New and rejoined membership intervals cannot inherit earlier drops. | | | planned | B3 |
| Q07 Caption visible before reveal but no media URL source identity or preview leaks. | | | planned | B3 |
| Q08 Sender own preview cannot be reused by another account. | | | planned | B3 |
| Q09 Manipulated device clock cannot reveal content. | | | planned | B2, B3 |
| Q10 Competing final slot submissions produce at most six total and two links. | | | planned | B2, B3 |
| Q11 Multi select counts each photo separately and reports partial failure. | | | planned | B4 |
| Q12 Idempotent retry returns original drop after cutoff. | | | planned | B2, B3 |
| Q13 Upload crossing 7 AM preserves draft and requires next date confirmation. | | | planned | B4 |
| Q14 Star own posts follow same limits and remain hidden to others. | | | planned | B4, B5 |
| Q15 Highlight replacement is unique and star's pick comes first. | | | planned | B4, B5 |
| Q16 Unwrapped feed items need no animation; highlight skip and reduced motion work. | | | planned | B5 |
| Q17 Reveal worker retry sends no duplicate social event. | | | planned | B5 |
| Q18 Home is feed until 1 AM then next countdown even when opening or closing worker lags. | | | planned | B2, B5 |
| Q19 Removed drop disappears from feed favourites search widget candidates and suggestions. | | | planned | B6 |
| Q20 Source removed or login required produces safe provider fallback. | | | planned | B7 |
| Q21 WebView cannot access app credentials or navigate silently to arbitrary hosts. | | | planned | B7 |
| Q22 Reactions optional and silent opening creates no author notification. | | | planned | B6, B8 |
| Q23 Private favourites never generate social counts or ownership rights. | | | planned | B6 |
| Q24 More ideas cycles without repetition or lost draft state. | | | planned | B4 |
| Q25 Quiet days and absent users receive no missed contribution language. | | | planned | B6 |
| Q26 Logout purges account caches and installed widget grants. | | | planned | B6 |
| Q27 Account deletion removes authored access and enqueues all derived purges. | | | planned | B6 |
| Q28 Restored backup applies deletions before service exposure. | | | planned | B6, B9 |
| Q29 Stale widget retains original date and rechecks deep link access. | | | planned | M1 (widgets) |
| Q30 Screen reader large text keyboard reduced motion and error recovery pass. | | | planned | B9 |

### Spec sections with code

Add a row per spec section as its code lands: section, modules, tests, status.

| Section | Code | Tests | Status | Notes |
|---|---|---|---|---|

---

## 3. Log

Newest first within each section. One entry per commit, written in that commit, with every field filled; write "None" where a field has nothing. A commit can't name its own hash, so the entry doesn't. On `main`, an entry's changes are in its PR's squash commit (`git log -- docs/JOURNAL.md`), and the PR's own commits can be fetched with `git fetch origin pull/<n>/head`. The `ci` guard checks each new entry's heading and fields. Template:

```
#### <YYYY-MM-DD> <HH:MM> UTC · <lane: shared, api or ios> · <branch> · PR #<n>, or PR none
**Did:** what changed, by path, and the spec sections, book pages and invariants it implements.
**Why:** the slice, finding or request it serves.
**Verified:** each command you ran and what it showed: test names and counts, exit codes, evidence paths on the evidence branch.
**Not verified:** what you couldn't check, why, and who can (the founder on his iPhone, say). "None" only if everything was checked.
**Decisions and questions:** new or changed rows in DECISIONS, QUESTIONS or LIMITATIONS, or "None".
**Next:** the single next step, exactly: the command to run or the file to open, and what done looks like.
```

### 3.1 Shared and B0

#### 2026-11-01 23:31 UTC · shared · draft/b0-plan · PR none
**Did:** Brought `docs/plans/B0.md` in line with fixes from PR #1's independent review. `ios.yml` now also runs on pushes that change `packages/contracts/**`, so a contract change builds the app. Section 6 adds two environment checks that `docs/MILESTONES.md` B0 now lists: the CodeRabbit switch, next to the journal hook, and the hosts the first session was refused. Rewrote section 1.1's "Updated" line.
**Why:** PR #1's review fixed `docs/TECH-DESIGN.md` section 9 (the `ios` trigger) and `docs/MILESTONES.md` B0's environment checks. The plan must match them when it moves to `plan/b0`.
**Verified:** `grep -n "packages/contracts/\*\*" docs/plans/B0.md`: the `ios.yml` row. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** None.
**Decisions and questions:** None on this branch. FQ31 to FQ36 are on `starter-pack` (PR #1).
**Next:** After the founder merges PR #1: `git fetch origin`, `git switch -c plan/b0 origin/main`, `git checkout origin/draft/b0-plan -- docs/plans/B0.md`, write the journal entry, push, and open the PR `docs: plan B0` with its independent review. Done when that PR says it's ready for the founder. Leave `draft/b0-plan` as it is.

#### 2026-11-01 22:48 UTC · shared · draft/b0-plan · PR none
**Did:** Brought `docs/plans/B0.md` in line with the founder's answer to FQ4. F3 now asks only for the trial friends' phones: the founder's is an iPhone 13 on iOS 18.3.2, so the minimum stays iOS 17. Slice 11 sets iOS 17 as the minimum. Slice 9's `ios.yml` input runs the gate's UI tests on the oldest simulator and on iOS 18, the founder's version. Section 6's simulator check now looks for an iOS 18 simulator. Rewrote section 1.1 for this branch.
**Why:** The founder's answer to FQ4 ("iPhone 13" and "iOS Version 18.3.2"), relayed on 2026-11-01. PR #1 records it as ADR-018, which the plan cites.
**Verified:** `grep -n "ADR-018" docs/plans/B0.md`: F3, slices 9 and 11. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** Which iOS simulators the `macos-26` runner offers; slice 9 records it.
**Decisions and questions:** None on this branch. ADR-018, with FQ4 updated, goes to `starter-pack` (PR #1).
**Next:** After the founder merges PR #1: `git fetch origin`, `git switch -c plan/b0 origin/main`, `git checkout origin/draft/b0-plan -- docs/plans/B0.md`, write the journal entry, push, and open the PR `docs: plan B0` with its independent review. Done when that PR says it's ready for the founder. Leave `draft/b0-plan` as it is.

#### 2026-11-01 22:45 UTC · shared · draft/b0-plan · PR none
**Did:** In `docs/plans/B0.md` section 4, spike S6's "waits for" column no longer waits for F4's domain: it waits for a build with `tadayo.app` in its Associated Domains, now that the domain and its Cloudflare DNS exist (ADR-017). Rewrote section 1.1's "Updated" line.
**Why:** The previous entry says S6 no longer waits for a domain, but that commit left S6's own row unchanged. This commit makes the plan match the entry.
**Verified:** `grep -n "F4's domain" docs/plans/B0.md`: no match. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** None.
**Decisions and questions:** None.
**Next:** After the founder merges PR #1: `git fetch origin`, `git switch -c plan/b0 origin/main`, `git checkout origin/draft/b0-plan -- docs/plans/B0.md`, write the journal entry, push, and open the PR `docs: plan B0` with its independent review. Done when that PR says it's ready for the founder. Leave `draft/b0-plan` as it is.

#### 2026-11-01 22:42 UTC · shared · draft/b0-plan · PR none
**Did:** Brought `docs/plans/B0.md` in line with what the founder did and said on 1 November 2026. `dev` is in US East, nearest the founder in Virginia: the Supabase project `tadayo-dev` in `us-east-1` and the Fly app `tadayo-api-dev` in `iad`, with `primary_region = "iad"` in slice 10a and in the steps after 10b. The domain is `tadayo.app`, registered on Cloudflare. F4 now asks only for a yes to the identifiers, and spike S6 no longer waits for a domain. Resend verifies `tadayo.app` in `us-east-1` through Cloudflare's DNS, and Cloudflare's row is done. F2 is done: `main`'s rule is on. Section 6's protection check now records the rule as on. Rewrote section 1.1 of this journal for this branch.
**Why:** The founder's answers to FQ3 for `dev` ("in Virginia US") and FQ5's domain ("done with tadayo.app"), relayed on 2026-11-01. The plan must match the accounts being made now. PR #1 records both answers as ADR-016 and ADR-017, which the plan cites.
**Verified:** `gh api repos/beurni2/tadayo/branches/main --jq .protection` at 22:25 UTC: `{"enabled":true,"required_status_checks":{"checks":[],"contexts":[],"enforcement_level":"everyone"}}`. `grep -n -i "paris\|cdg\|eu-west" docs/plans/B0.md`: no match. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0. On this branch `python3 tools/ci/journal_check_test.py` fails 2 of 28 tests (the fixture fixed on `starter-pack`, PR #1).
**Not verified:** Resend's regions and Fly's `iad` against their current documentation, because the session's proxy refuses both hosts. The slices that use them check this.
**Decisions and questions:** None on this branch. ADR-016 and ADR-017, with FQ3 and FQ5 updated, are on `starter-pack` (PR #1).
**Next:** After the founder merges PR #1: `git fetch origin`, `git switch -c plan/b0 origin/main`, `git checkout origin/draft/b0-plan -- docs/plans/B0.md`, write the journal entry, push, and open the PR `docs: plan B0` with its independent review. Done when that PR says it's ready for the founder. Leave `draft/b0-plan` as it is.

#### 2026-11-01 21:48 UTC · shared · draft/b0-plan · PR none
**Did:** Wrote `docs/plans/B0.md`, the plan for stage B0 (`docs/MILESTONES.md`, "B0: Foundations"): what the founder provides and when, with every account and secret named and placed (section 1); the slices in order, with branches, invariants, tests written first and what each waits for, arranged so that each workflow PR goes up with no other PR open (section 2, `docs/GITHUB.md` "Workflow files"); the five workflow files the founder will add (section 3); spikes S1 to S6 in order, with the server and app code each needs and the TestFlight build each runs on (section 4); Design handoff 0, copied from `docs/DESIGN-HANDOFF.md`, with its branch `ios/b0-brand`, and Design handoff 1 for the screens B0 and B1 build (A02, A03, the tabs before a club exists, and the missing B1 states), with its branch `ios/b1-handoff-1` (section 5); the environment checks MILESTONES lists, with the results known so far (section 6); and Gate 0's evidence (section 7). Rewrote section 1.1 of this journal for this branch.
**Why:** Step 4 of the founder's first message: plan B0 on `draft/b0-plan`, made from `starter-pack`, while the starter-pack PR is reviewed.
**Verified:** A first draft was reviewed by four fresh subagents that hadn't seen it (process and order; accounts, secrets and infrastructure; design handoffs; completeness against the founder's request). Their 40 findings (some the same problem seen by two reviewers) were all applied, among them: `ios.yml` merges before the iOS slice's branch is made, since a branch can't take in a workflow change from `main`; `ops.yml` goes before `deploy-dev.yml`, and the Fly app, its secrets and the database bootstrap come between them; `FLY_API_TOKEN` added to `ops`; the Storage buckets made by an `ops` script; the Supabase project URL and publishable key asked for as public values; both email templates that a code sign-in uses; the Swift version pinned with `ci.yml`; the brand delivery as slice 11b, with its branch made when the design is ready; one branch and build per spike, with the server code each needs; handoff 1's `G05-members` kept to one club, `A02-age` placed after the code, the tabs' no-club states added, and the FQ20 wording listed. Environment results recorded in section 6 were run in this session: `docker info` (no daemon), `gh api graphql` (refused, HTTP 403), `gh api repos/beurni2/tadayo/branches/main/protection` (HTTP 403, "Resource not accessible by integration"), `gh api repos/beurni2/tadayo/branches/main --jq .protection` (no rule on `main`), and HTTPS to `images.unsplash.com`, `download.swift.org`, `api.supabase.com` and `api.fly.io` (refused by the session's proxy). `python3 tools/ci/journal_check.py --all` passes.
**Not verified:** The plan's claims about Apple, Supabase, Fly, Resend and Cloudflare settings were not checked against their current documentation, because the session's proxy refused those hosts; each is checked in the slice that uses it. The revised plan gets its own independent review on the `plan/b0` PR.
**Decisions and questions:** None. The plan follows ADR-003's one Fly app for `dev`; the starter-pack PR corrects `docs/TECH-DESIGN.md` section 7 to match.
**Next:** After the founder merges the starter-pack PR: `git fetch origin`, `git switch -c plan/b0 origin/main`, `git checkout origin/draft/b0-plan -- docs/plans/B0.md`, write the journal entry, push, and open the PR `docs: plan B0` with its independent review. Done when that PR says it's ready for the founder. Leave `draft/b0-plan` as it is.

#### 2026-11-01 21:22 UTC · shared · starter-pack · PR none
**Did:** Unpacked `tadayo-starter-pack.zip` into the repository root with `unzip -o`, keeping every path, so the pack's `README.md` replaced the one-line `README.md` on `main`. The pack adds `CLAUDE.md`, `docs/` (the spec, the book and the operating documents), `design/reference/` (the 53 renders of 2.1, the two wireframes, `INVENTORY.md` and the folder READMEs), `.github/pull_request_template.md`, `.claude/settings.json`, `.yamllint.yaml` and `tools/ci/` (the journal hook, the journal check and their tests). Rewrote section 1.1 of this journal. The zip itself was never in the repository: the repository was created empty, so the session made `main` with a README-only first commit and `starter-pack` from it, as the founder asked on 2026-11-01, and unpacked the copy of the zip the founder attached to the session (SHA-256 `0e4aac683de1c22b2cf48fc2bfdb9080cc6240392434855aa96ff678118bfd59`). There was no zip commit to delete.
**Why:** Step 1 of the founder's first message: put the starter pack on `starter-pack` for its PR to `main`.
**Verified:** `diff -r` between the working tree (without `.git`) and a separate unzip of the same file: no difference. The same pack's documents match `tadayo-handoff-docs.zip` (`diff -rq`: the documents are identical; the handoff zip has no renders, tools or settings files, and adds the founder's guide). `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check_test.py`: 28 tests, OK. `python3 tools/ci/journal_check.py --all`: exit 0. Python 3.13.18, git 2.43.0.
**Not verified:** The journal hook didn't run on this commit: this session started before `.claude/settings.json` existed, and Claude Code reads hooks only when a session starts. The first session started after the starter-pack PR merges checks it.
**Decisions and questions:** None.
**Next:** Apply the document fixes on `starter-pack` in one commit with its journal entry, then open the PR `docs: add the Tadayo starter pack`. Done when the fixes are pushed and listed in the PR.

#### 2026-11-01 · handoff · (none) · PR none
**Did:** The handoff pack was written outside the repository:
- `CLAUDE.md`;
- the build specification v3 (`docs/tadayo-build-spec-v3.md`) and the design book revision 2.1 (`docs/tadayo-design-book-2.1.md`), both converted to Markdown with their wording unchanged;
- the 53 screens of 2.1 in `design/reference/2.1/` and the spec's two wireframes;
- `docs/INVARIANTS.md` (T1 to T62), `docs/TECH-DESIGN.md`, `docs/MILESTONES.md`, `docs/GITHUB.md`, `docs/DESIGN-HANDOFF.md` with Design handoff 0, and `design/reference/INVENTORY.md`;
- `docs/QUESTIONS.md` (FQ1 to FQ30), `docs/DECISIONS.md` (ADR-001 to ADR-015) and the logs;
- the PR template, `.claude/settings.json` with the journal hook (`tools/ci/journal_hook.py`), the `ci` guard's journal check (`tools/ci/journal_check.py`), their tests (`tools/ci/journal_hook_test.py`, `tools/ci/journal_check_test.py`), and `.yamllint.yaml`;
- this journal: the orientation (section 0), the state, the audit map's rows for T1 to T62 and Q01 to Q30, the empty indexes of section 4, and the audit guide (section 5).

**Why:** To start B0 with the specs, the rules and the build loop settled.
**Verified:** Two independent reviewers checked the documents against both sources, one after the other; a third checked the revisions and the hook, and a fourth the journal's redesign and its check. Their findings were applied, among them: Supabase's data API closed and its Storage probed, media served only through the API, the API's database role owning its tables, Claude Design's real export formats, the brand handoff's icon gating the first TestFlight build, and the minimum iOS. The journal hook's tests pass (`python3 tools/ci/journal_hook_test.py`, Python 3.13, git 2.43), outside this repository. They check 88 commands, each also run for real to confirm what git does: 35 refused, 50 allowed and 3 it can't tell and lets through. The cases include amends (of a merge too), heredoc messages, subshells, globs and pathspec magic, a journal written earlier in the same call, and commands that only mention `git commit`. The journal check's 28 tests pass (`python3 tools/ci/journal_check_test.py`), each on a scratch clone with an `origin/main` and GitHub-style squash merges. These fail: a missing entry, an empty or missing field, a bad heading, an entry edited later on `main` or on the branch, a plain `git revert`, a deleted audit row (a spec row too), an unchanged state block, another lane's block changed instead of one's own, and an unchanged journal. These pass: the founder's web commits, fields holding code blocks and lists, a revert made the documented way, two lanes in parallel with a merge from `main`, two lanes' PR rows, a branch made from one that main squashed, and the first PR. `python3 tools/ci/journal_check.py --all` passes on this journal. Nothing has run in this repository yet.
**Not verified:** Every limit in `docs/LIMITATIONS.md` marked "to confirm".
**Decisions and questions:** ADR-001 to ADR-015; FQ1 to FQ30, with FQ1 and FQ2 decided by the founder on 1 November 2026.
**Next:** The first session unpacks the pack on `starter-pack` and opens the first PR.

### 3.2 api lane

### 3.3 ios lane

---

## 4. Pull requests, gates and evidence

The index an auditor uses to find the proof behind section 2.
- **A PR's row:** add it in your last commit before you open the PR, with `to open` as its number. The commit that records the PR's review fills in its number and its findings, fixed or answered. A PR is ready for the founder only with its row complete.
- **Whether a PR merged** is git's record, not this table's: `git log --oneline origin/main`.
- **A gate's row:** add it when its report is posted, and the founder's answer when it comes.

### 4.1 Pull requests: the one session, then the api lane

| PR | Branch | What it changed | Review findings | Evidence |
|---|---|---|---|---|

### 4.2 Pull requests: the ios lane

| PR | Branch | What it changed | Review findings | Evidence |
|---|---|---|---|---|

### 4.3 Gates

| Gate | Report on the evidence branch | Posted | The founder's answer (`docs/GATES.md`) |
|---|---|---|---|

### 4.4 Where the evidence lives

Paths on the `evidence` branch, unless they start with a repository folder. B0 fills in the rows it creates. Once a month, with the founder's yes, the evidence branch is replaced by a fresh one that keeps only `gates/` (`docs/TECH-DESIGN.md` section 3), so older per-commit sheets go; the committed snapshot references under `apps/ios/**/__Snapshots__/` stay.

| Evidence | Where |
|---|---|
| Snapshots and contact sheets of a pushed commit | `<branch>/<short-sha>/ios/`, until the monthly reset |
| Reference snapshots the tests compare with | `apps/ios/**/__Snapshots__/`, on `main` |
| Gate reports, as PDFs | `gates/` |
| Spike reports | `docs/spikes/` |
| Privacy-matrix and leak-scanner reports | set in B0 |
| Supabase probe results, per environment | set in B0 |
| TestFlight builds | the build number in the PR, and App Store Connect |
| Claude Design's deliveries | `design/reference/claude-design/handoff-<n>/` |

---

## 5. How to audit this project

For a reviewer who has never seen Tadayo. Change nothing, and report what you find.

1. **Read** section 0, then `docs/INVARIANTS.md`, then the spec's sections and the book's pages for what you audit. `CLAUDE.md` says how the project is meant to work.
2. **Check the state against the repository.** Every file, environment and build that section 1 names exists, and is as section 1 says. The journal on `main` is as of each PR's last commit: read what merged since from `git log --oneline origin/main`, and the PRs from GitHub (`docs/GITHUB.md` has the call that lists them). Every PR has its row in section 4.
3. **Check the journal's structure:** `python3 tools/ci/journal_check.py --all`. On a branch, `python3 tools/ci/journal_check.py --branch` runs the `ci` guard itself.
4. **Check the log against what happened.** Pick entries, and rerun the commands their "Verified" field lists, at the commit they ran on: the PR's squash commit on `main`, or the PR's own commits (`git fetch origin pull/<n>/head`). The results must match. Each PR in section 4 should match its log entries and its PR description.
5. **Check the audit map, row by row.** For each invariant, acceptance test and spec section, open the code under "Enforced in" and the test under "Tested by", run the test, and confirm the status. A row marked `verified on device` needs its evidence in section 4. A rule with code but no row is a finding.
6. **Run everything** with the commands in section 1, "How to run and check everything": the backend tests, the privacy matrix, the leak scanner and the Swift package tests. Then read the latest `ci` and `ios` results on GitHub.
7. **Check the decisions and departures.** Every ADR in section 0.7 holds in the code; every default in force is built as `docs/QUESTIONS.md` says; and the departures in section 0.8 are the only ones.
8. **Check the design line.** The counts in `design/reference/INVENTORY.md` match section 1. Each `built` state has its committed reference snapshot under `apps/ios/**/__Snapshots__/`, and it matches the state's render and the book's contracts; contact sheets on the evidence branch may be gone after its monthly reset. Nothing in the app was drawn or generated by Claude Code (T46).
9. **Report** what's wrong, unverified or missing, most serious first: the file and line, what goes wrong, and the evidence. Say what you couldn't check, and why.
