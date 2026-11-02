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
- **Supabase stays closed:** the app uses it only to sign in and to put its own pending upload at the signed upload URL (T53, T12).
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
    - ADR-016: `dev` in US East, near the founder.
    - ADR-017: the domain `tadayo.app`.
    - ADR-018: iOS 17 stays the minimum; the founder's iPhone runs iOS 18.
- **The founder's answers:** FQ1, iPhone first; FQ2, keep 2.1's screens and add the brand; FQ3 for `dev`, US East, near the founder; FQ4 for the founder's phone, which runs iOS 18; FQ5's domain, `tadayo.app`. All on 1 November 2026.
- **Defaults in force until he answers** (`docs/QUESTIONS.md`: FQ3 for `prod`, and FQ4 to FQ37). The ones that shape the trial most:
    - iOS 17 as the minimum (FQ4; the founder's phone runs iOS 18, the trial members' are unknown);
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
- **The operator's access:** no route serves a drop's content to the moderation operator, where spec 07 gives "restricted audited case access"; the `ops` scripts hold or remove a drop by its id (T9, FQ32).
- **Remember this:** every dismissal is durable, where spec 19 makes only "Don't suggest this day again" durable (T62, FQ33).
- **Where 2.1's renders break a rule:** names instead of "Her pick" and the other gendered strings, the Highlight label only on the viewer's own cards, the rail's order, and no Share icon.
- **Where the book wins over the spec:** Reduce Motion opens the photo at once, where spec 15 says a crossfade; and "Added for", where spec 10 says "Added to".

The screen-by-screen list is `design/reference/INVENTORY.md`, "Known differences".

---

## 1. State of the project

### 1.1 Shared (the api lane keeps this block)

**Updated:** 2026-11-02 00:52 UTC, starter-pack

- **Stage:** B0 Foundations, not started. Next gate: Gate 0 (`docs/MILESTONES.md`).
- **Lanes:** none yet; one session until Gate 0.
- **PRs:** #1, `docs: add the Tadayo starter pack` from `starter-pack`, open. Four independent reviews are recorded, with their findings fixed or answered in the PR's "Review" section; the fourth review's fixes go to a fifth review.
- **Branches:** `main` holds one commit, `Initial commit` (`README.md` only), made from the session at the founder's request on 2026-11-01 because the repository was created empty. `starter-pack` adds the pack and its document fixes. `draft/b0-plan`, made from `starter-pack` at the founder's request, holds the draft of `docs/plans/B0.md`, updated for the founder's answers; it is never merged or opened as a PR, and stays as it is once the plan moves to `plan/b0`.
- **`main`'s protection:** on, read back on 2026-11-01 through the summary (`docs/GITHUB.md`): no required check yet. Squash merges only, and merged branches are deleted.
- **Environments:** `dev` being set up by the founder in US East (Supabase `us-east-1`, Fly `iad`; ADR-016). `prod` not created (Gate D).
- **The domain:** `tadayo.app`, registered by the founder on Cloudflare on 2026-11-01 (ADR-017).
- **TestFlight:** no build yet.
- **`ci` on `main`:** not set up yet; B0 adds it.

**What exists and works (verified).** On `starter-pack`, the starter pack unpacked at the repository root by the commit `docs: unpack the Tadayo starter pack`. Its tree matched a separate unzip of `tadayo-starter-pack.zip` (`diff -r`, no difference) until that commit rewrote this journal's section 1.1 and added its log entry; the document fixes since are in the log. The journal tools' tests pass: `python3 tools/ci/journal_hook_test.py` (6 tests) and `python3 tools/ci/journal_check_test.py` (29 tests), Python 3.13.18, git 2.43.0. Nothing else is built.

**In progress.** PR #1: a fifth independent review, of the fourth review's fixes (`docs/GITHUB.md`, step 5).

**Next, in order:**
1. On `starter-pack`, review the commit that records the fourth review with fresh reviewers (`git diff 138fcab..HEAD`), fix or answer each finding, record it in a commit with the PR's row in section 4, and fill in the PR's "Review" and "Ready for the founder" sections. Done when the PR says it's ready for the founder.
2. After the founder merges it: `git fetch origin`, `git switch -c plan/b0 origin/main`, then `git checkout origin/draft/b0-plan -- docs/plans/B0.md`; write its journal entry, and open its PR with its own review. Leave `draft/b0-plan` as it is.
3. In the first session the founder starts after merging the starter-pack PR, check that the journal hook fires (a `git commit` without `docs/JOURNAL.md` staged is refused by `tools/ci/journal_hook.py`) and that the CodeRabbit skills no longer appear, and record both in `docs/LIMITATIONS.md`.
4. The B0 slices, in the order `docs/plans/B0.md` sets.

**Blocked or waiting for the founder:**
- Reviewing and merging the starter-pack PR once it says it's ready, and deciding the rule changes it lists for the founder.
- Selecting the Tadayo environment for the project, with the hosts in `docs/TECH-DESIGN.md` section 10's network list allowed: the first session's environment refused Supabase, Fly, Cloudflare, swift.org and `docs.github.com` among them (`docs/LIMITATIONS.md`).
- FQ31, before design handoff 0 starts: until the founder answers, nothing in `design/reference/INVENTORY.md` changes, so handoff 0's rows can't go to `requested 0`.
- Accounts for B0 (`docs/TECH-DESIGN.md` section 10). In the setup thread on 2026-11-01 the founder reported submitting the Apple Developer Program enrolment, putting the Supabase organization on the Pro plan with `tadayo-dev` in `us-east-1` and its data API off, signing up on Fly.io, and adding `tadayo.app` in Resend. None of it is verified: the session's proxy refused `api.supabase.com`, `api.fly.io` and `api.resend.com` on 2026-11-01, and no Apple host was tried (`docs/LIMITATIONS.md`). B0's environment checks only test whether the session reaches the hosts. The accounts show when B0 first uses them: `tadayo-dev` and its closed data API in the Supabase probe, Fly when `ops` creates the app, Resend when the founder's own sign-in code arrives, though its verification of `tadayo.app` shows only once a code reaches another address, which no B0 step sends (the internal tester's, by Gate A; FQ28), and the enrolment in the first TestFlight upload with the App Store Connect key. Still waiting: Apple's approval of the enrolment, then the App Store Connect API key and the APNs key; Resend's verification of `tadayo.app`; a yes to FQ5's identifiers. The B0 plan names each account and secret exactly.
- The trial members' iPhone models and iOS versions (FQ4), which matter only if one can't run iOS 17. The founder's runs iOS 18 (ADR-018).
- Design handoff 0 in Claude Design. Gate 0 waits for its icon frames: the first TestFlight upload needs the icon, and spikes S1 to S4 and S6 need that build.
- Whether the 23:27 log entry may be reworded to drop the founder's location and phone details, which the journal's rule on personal data forbids (the PR asks).
- Open questions with defaults in `docs/QUESTIONS.md`; the defaults apply until answered. FQ31 to FQ37 are the conflicts the starter-pack PR found whose fix would loosen a rule.

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
    - trial states: 147, of which 50 have 2.1 renders (49 to build, plus the system picker's reference) and 97 are missing;
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
| Q05 Nonmember invite token cannot read caption or media. | | | planned | B1, B3 |
| Q06 New and rejoined membership intervals cannot inherit earlier drops. | | | planned | B3 |
| Q07 Caption visible before reveal but no media URL source identity or preview leaks. | | | planned | B3 |
| Q08 Sender own preview cannot be reused by another account. | | | planned | B3 |
| Q09 Manipulated device clock cannot reveal content. | | | planned | B2, B3 |
| Q10 Competing final slot submissions produce at most six total and two links. | | | planned | B2, B3 |
| Q11 Multi select counts each photo separately and reports partial failure. | | | planned | B3, B4 |
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

#### 2026-11-02 00:52 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's fourth independent review, of `git diff f3ee267..138fcab`, and fixed its findings. Two fresh reviewers (the documents, and privacy and security) reported 7 findings, and a separate reader confirmed each one. The fixes:
- `docs/TECH-DESIGN.md` section 6: if iOS cancelled the background transfer, the app queues the removal again at its next launch, so an offline relaunch doesn't strand it. `docs/MILESTONES.md` B8's device test covers a force-quit followed by a launch made offline.
- `docs/TECH-DESIGN.md` section 8: the leak scanner also fails an upload URL signed with overwriting on (T12).
- `docs/TECH-DESIGN.md` section 10: the R2 keys are scoped to each environment's own bucket, and `prod`'s deletion log gets a bucket of its own before `prod` exists, so no key in `dev`'s app reaches it (section 9). ADR-003 and section 1 say one bucket, so this is FQ37 in `docs/QUESTIONS.md`, with that as its default.
- `docs.github.com`, refused on 2026-11-01 (the 23:30 entry) and again today, joins the refused hosts in `docs/LIMITATIONS.md`, B0's host check in `docs/MILESTONES.md` and this journal's section 1.1.
- Section 1.1: Resend shows only that the founder's own code arrives in B0, and its domain's verification only once a code reaches another address, which no B0 step sends. The question on the 23:27 entry joins the list for the founder. Section 0.7's defaults run to FQ37.
- The PR's body now holds every change, each review's findings with their outcomes, and the questions for the founder, updated right after this commit is pushed.

Corrections to earlier entries, since the log is append-only:
- The 23:30, 00:15 and 00:33 entries said findings were answered "in the PR", and the 00:15 entry that the PR lists the 23:27 question. The PR's body still read "To come" until the update that follows this commit.
- The 00:33 entry said only Supabase, Fly, Cloudflare and swift.org of section 10's hosts were refused; `docs.github.com` was too.
- The 00:33 entry's "Decisions and questions" said "None new", but it changed FQ36's default back to treating everything the two accounts add as personal data.
**Why:** `docs/GITHUB.md` steps 4 and 5: decide each finding on its merits, record the review in a commit, and write the reason for each finding not fixed in the PR's "Review" section. Where a fix would change a decision (ADR-003's one bucket), it's a question for the founder, as `CLAUDE.md` asks.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- `curl https://docs.github.com/` from the session on 2026-11-02: `CONNECT tunnel failed, response 403`.
**Not verified:** That a background `URLSession` delivers the queued removal while the app is suspended: B8's device test measures it. Whether R2 tokens can be scoped to one bucket on the founder's Cloudflare plan: Gate D's work checks it, and the session's proxy refuses `api.cloudflare.com`.
**Decisions and questions:** FQ37 added to `docs/QUESTIONS.md`. `docs/LIMITATIONS.md`'s hosts row adds `docs.github.com`.
**Next:** Review `git diff 138fcab..HEAD` and the PR's body with fresh reviewers (`docs/GITHUB.md`, step 5), fix or answer what they find, and record it in a commit with the PR's row. Done when the PR says it's ready for the founder.

#### 2026-11-02 00:33 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's third independent review, of `git diff 4559931..f3ee267`, and fixed its findings. Two fresh reviewers (the documents, and privacy and security) reported 13 findings, and a separate reader checked each one: 10 held, two of them the same gap. The fixes:
- `docs/TECH-DESIGN.md` section 8's leak scanner exempts only the one signed upload URL in the viewer's upload intent, and only the source details T40 gives for a link the viewer resolved. The rest of both responses is checked, and the intent fails on any other URL (T12). The 00:15 entry's exemption covered both responses whole.
- The queued removal after a logout made offline now has an owner: `docs/MILESTONES.md` B8 builds it with a device test (it lands with the app suspended, and at the next launch after a force-quit), and section 8's Device row lists it. Section 6 sends it at the next launch if iOS cancelled the transfer.
- `docs/TECH-DESIGN.md` section 10:
    - the Supabase row names the GitHub environments section 9 uses (`dev` for `tadayo-dev`, `prod` for `tadayo-prod`), not environments named after the projects;
    - the Cloudflare token moves, before `prod` exists, to where only jobs on `main` get it, since its DNS and Pages reach `prod` (section 9).
- `docs/QUESTIONS.md` FQ36: everything the founder's and the internal tester's accounts add on `dev`, test content included, is treated as personal data, as before the 00:15 entry. Only test content may be added, as that entry set.
- This journal's section 1.1:
    - restores the "Known limits and risks" paragraph, which the 00:15 rewrite dropped by mistake;
    - says only Supabase, Fly, Cloudflare and swift.org of section 10's hosts were refused;
    - says which hosts were tried for the accounts the founder reported, and where B0 first uses each account.
- Section 4's row for this PR gives the second review's range, which held the founder's answers too, and leaves the 23:27 entry open for the founder.

Corrections to the 00:15 entry, since the log is append-only:
- Its "Not verified" pointed at a B8 device check that no document planned. B8 now plans it.
- It called FQ36's default strict, but its handling sentence had narrowed from everything the two accounts add to their addresses and anything real. That's restored.
- It said section 10's pointers keep the table from being read against section 9; the Cloudflare row didn't have one until now.
- Its heading says 00:15; the commit was made at 00:09 UTC.
**Why:** `docs/GITHUB.md` step 5: review the fixes again, decide each finding on its merits, and record the review in a commit. CLAUDE.md asks the shared block for the known limits, and the journal's rules ask "Not verified" to say who can check it.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- `git show 4559931:docs/JOURNAL.md`: the restored paragraph matches the one the 00:15 rewrite dropped.
**Not verified:** That a background `URLSession` delivers the queued removal while the app is suspended: B8's device test measures it.
**Decisions and questions:** None new. The three findings that didn't hold are answered in the PR.
**Next:** Review `git diff f3ee267..HEAD` with fresh reviewers (`docs/GITHUB.md`, step 5), fix or answer what they find, and record it in a commit with the PR's row. Then fill in the PR's "Review" and "Ready for the founder" sections. Done when the PR says it's ready for the founder.

#### 2026-11-02 00:15 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's second independent review, of `git diff 8e4a0c7..4559931`, and fixed its findings. Three fresh reviewers (the documents, the journal tools, and privacy and security) reported 17 findings, and a separate reader checked each one: 14 held, and the journal tools' reviewer found nothing. The fixes:
- `docs/TECH-DESIGN.md` section 6: registering a device token covers an account switch, not a logout made offline. That logout now queues the removal, authorized by a removal secret the app sent with the registration (the server keeps only its hash), and a background `URLSession` sends it when the network returns. Until it lands, the old account's pushes can still reach the device, and the section says so.
- `docs/TECH-DESIGN.md` section 6: `POST /v1/uploads`'s stored response leaves out the signed upload URL; a replay signs a new one only while the upload is still pending, and otherwise returns no URL (T12). The reviewer's own fix signed one on every replay, which would loosen T12.
- `docs/TECH-DESIGN.md` section 8:
    - the leak scanner's exemption also covers the viewer's own upload intent and the link the viewer resolved (T12, T40), which it would otherwise fail;
    - the push-payload test applies before and after the reveal and to every recipient, the author included, and a caption or comment must still be readable at dispatch (T9, T37). It keeps "no URL": the reviewer's fix narrowed it to media and source URLs.
- `docs/TECH-DESIGN.md` section 10: the Supabase and Fly key rows say where the keys move before `prod` exists (section 9). The reader didn't confirm this finding, since section 9's rule starts at Gate D; the pointer keeps the table from being read against it.
- `docs/QUESTIONS.md`:
    - FQ31's default is now strict: until the founder answers, nothing already in `design/reference/` is edited, `INVENTORY.md` included, apart from moving an uploaded export into its `handoff-<n>/` folder, which `CLAUDE.md` allows. Work that would change an inventory row waits.
    - FQ36's default keeps `dev` synthetic apart from the founder's and the internal tester's sign-in addresses: they add only test content there. FQ36 cites ADR-003 and ADR-004, not ADR-011.
- Resend: `docs/MILESTONES.md` B0 and `docs/LIMITATIONS.md` say why B0 doesn't check it (section 10's network list leaves it out, because the session never calls it). This block and `docs/PROGRESS.md` ask the founder for section 10's hosts, not a list with Resend.
- This journal's section 0.7: the defaults in force run to FQ36, and the founder's answers name only `dev`'s region and the phone's major iOS version. Section 0.8 adds the operator's access (FQ32) and Remember this (FQ33).
- Filled in the second review in this PR's row in section 4. Rewrote section 1.1, which now records the accounts the founder reported, not verified.

Corrections to the 23:30 entry, since the log is append-only:
- It said each of FQ31 to FQ36 had a default that loosens nothing. FQ31's loosened `CLAUDE.md`'s rule on `design/reference/`, and FQ36's accepted real content on `dev`. Both are now strict.
- It said the Worker tests check every push payload, but the row it added checked media and sources only before the reveal. It does now.
- The 23:27 entry names the founder's location and phone more precisely than the journal's rule on personal data allows. It can't be rewritten without the founder's word, so the PR lists it for the founder.
**Why:** `docs/GITHUB.md` step 5: review the fixes again, decide each finding on its merits, and record the review in a commit. Where a finding's own fix would loosen a rule, the commit makes the reader's tighter fix instead.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- A `grep` of `docs/JOURNAL.md` for the founder's state, phone model and exact iOS version finds them only in the 23:27 entry.
**Not verified:** That a background `URLSession` delivers the queued removal after the app is suspended: B8 builds it, and its device check is where that's measured.
**Decisions and questions:** FQ31's and FQ36's defaults made strict. For the founder, in the PR: whether the 23:27 entry may be rewritten to drop the personal data.
**Next:** Review `git diff 4559931..HEAD` with fresh reviewers (`docs/GITHUB.md`, step 5), fix or answer what they find, and record it in a commit with the PR's row. Then fill in the PR's "Review" and "Ready for the founder" sections. Done when the PR says it's ready for the founder.

#### 2026-11-01 23:30 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's independent review and fixed its findings. Five fresh reviewers (process, design, stages, the journal tools, and privacy and security) reported 27 findings. A separate reader checked each one, and 26 held. The fixes:
- `docs/QUESTIONS.md`: FQ31 to FQ36, each with a default that loosens nothing. Four are the conflicts this PR leaves for the founder: editing `INVENTORY.md`, T9 and the operator's case access, T62's dismissals, and the weekly report against `prod`. Two came from the review: adding 2.1's own pack, and what `dev` holds. `CLAUDE.md` asks for such conflicts to be questions, not only lines in a PR.
- Supabase: `CLAUDE.md`, `docs/DECISIONS.md` ADR-003, this journal's section 0 and `docs/TECH-DESIGN.md` section 12 said the app uses Supabase only to sign in, but ADR-009 and T12 have it upload its own pending upload to a signed upload URL. All four now say so.
- `docs/TECH-DESIGN.md` section 6:
    - the contract gains reading a drop's comment thread (spec 16, R04), and removing a device's push registration at logout or account switch (spec 23), also in `docs/MILESTONES.md` B8;
    - stored idempotency responses never hold caption or comment text, and an account's receipts are purged with it (T19, T27).
- `docs/TECH-DESIGN.md` section 8:
    - the privacy matrix adds six drop states (active, withdrawn, removed, held, occurrence suspended, club suspended), so the SQL read filters meet all of T9;
    - the leak scanner covers the author role's responses, every drop but the viewer's own;
    - the Worker tests check every push payload (T16, T37; spec 14, 21).
- `docs/TECH-DESIGN.md` section 9:
    - `ios` also runs on `packages/contracts/**`, so a contract change builds the app;
    - from Gate D, no key that reaches `prod` is available to a run on any branch but `main`. That means GitHub environments, per-app Fly tokens, and `main` as `prod`'s only deployment branch. `docs/MILESTONES.md` repeats it in B9's `prod` line.
- `docs/GITHUB.md`: the PR-body file goes in `/tmp`, never in the working tree.
- `docs/MILESTONES.md` B0's environment checks add the CodeRabbit switch and the hosts the first session was refused. `docs/LIMITATIONS.md` marks the CodeRabbit row "to confirm", and the hosts row names those checks.
- `design/reference/INVENTORY.md`: the new state `C04-failed` (B4, MILESTONES), with the counts now 147 trial states and 97 missing; `F02-added` added to the Highlight-label difference and to FQ21. This journal's audit map gives Q11 the stages B3 and B4.
- `tools/ci/`:
    - `journal_check.py` refuses a shared, api or ios heading without its time (test added: `test_heading_without_its_time`);
    - the first-PR fixture strips untimed entries too;
    - `test_spec_row_swapped` anchors on the table's header, so it survives the first spec row;
    - `test_all_mode` asserts the missing section by name;
    - `journal_hook_test.py`'s docstring says the "unsure" cases aren't run.
- Filled in this PR's row in section 4. Rewrote section 1.1.
**Why:** `docs/GITHUB.md` steps 3 to 5: decide each finding on its merits, fix the valid ones, and record the review in a commit. Where a finding's own fix would loosen a rule, the commit doesn't make it; it adds a question with a strict default, as `CLAUDE.md` asks.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. With the new heading rule removed, `test_heading_without_its_time` fails. With the check for a missing section removed, `test_all_mode` fails.
- `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- The inventory's counts, recomputed from its rows: 147 trial states, 97 missing.
- The one finding that didn't hold is answered in the PR: the reviewer's brief doesn't ban CodeRabbit, but the CLI isn't installed and the skill stops without it.
**Not verified:** GitHub's plan limits for environments on a private repository (docs.github.com is refused by the session's proxy). Gate D's work checks it before `prod` exists. The second review of these fixes is still to come.
**Decisions and questions:** FQ31 to FQ36 added to `docs/QUESTIONS.md`. `docs/LIMITATIONS.md`: the CodeRabbit row is back to "to confirm", and the hosts row is reworded.
**Next:** Review `git diff 8e4a0c7..HEAD` with fresh reviewers (`docs/GITHUB.md`, step 5), fix or answer what they find, and record it in a commit with the PR's row. Then fill in the PR's "Review" and "Ready for the founder" sections. Done when the PR says it's ready for the founder.

#### 2026-11-01 23:27 UTC · shared · starter-pack · PR none
**Did:** Recorded three of the founder's answers from 1 November 2026, each in `docs/QUESTIONS.md` and as an ADR in `docs/DECISIONS.md`, as `docs/QUESTIONS.md` asks:
- FQ3 for `dev`: the founder is in Virginia, US, so `dev` is in US East (Supabase `us-east-1`, Fly `iad`), not Paris (ADR-016). `docs/TECH-DESIGN.md` section 7's `dev` row says so. `prod`'s region stays open.
- FQ5's domain: the founder registered `tadayo.app` on Cloudflare (ADR-017). `docs/TECH-DESIGN.md` section 10's domain row names it. The identifiers stay FQ5's defaults until the founder confirms them.
- FQ4 for the founder's phone: an iPhone 13 on iOS 18.3.2, so iOS 17 stays the minimum (ADR-018). Before each gate, the UI tests also run on an iOS 18 simulator, the founder's version (`docs/TECH-DESIGN.md` section 8). The trial members' phones are still unknown.
- This journal's section 0.7 lists ADR-016 to ADR-018 and the answers; section 1.1 is rewritten.
**Why:** The founder's answers in the setup thread, relayed on 2026-11-01: "in Virginia US", "done with tadayo.app", and "iPhone 13" with "iOS Version 18.3.2". FQ3's default puts `dev` nearest the founder, and the pack had assumed Paris.
**Verified:** `grep -n "Paris\|cdg\|eu-west" docs/TECH-DESIGN.md docs/QUESTIONS.md`: only FQ3's `prod` line, which names Paris as the choice for West Africa or Europe. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0. `python3 tools/ci/journal_check_test.py`: 28 tests, OK.
**Not verified:** That the Supabase project and the Fly app are in those regions: the founder is creating them, and the session's proxy refuses both hosts. The B0 plan's `ops` scripts and the Supabase probe read them back in slice 10.
**Decisions and questions:** ADR-016, ADR-017 and ADR-018 added (decided by the founder's answers). FQ3, FQ4 and FQ5 updated with the answers; FQ3's `prod` region, FQ4's trial members and FQ5's identifiers stay open.
**Next:** Fix or answer each finding of PR #1's independent review, and record the review in a commit with the PR's row in section 4. Done when the PR says it's ready for the founder.

#### 2026-11-01 22:26 UTC · shared · starter-pack · PR none
**Did:** Fixed real mistakes in the pack's documents: contradictions and wrong references, none relaxing a rule or a decision. Each is listed in the PR's body:
- `docs/DECISIONS.md` ADR-002: the privacy and security review's triggers now match `docs/GITHUB.md` (time, idempotency and the video viewer added).
- `docs/TECH-DESIGN.md` section 7: `dev` and `prod` each have one Fly app with the process groups `api` and `worker`, as section 1 and ADR-003 say; the Resend key is Supabase's SMTP password, not a Fly secret, as section 10 says; the app also holds Supabase's project URL and public key for sign-in (ADR-015, T53).
- `docs/TECH-DESIGN.md` section 3: the monthly reset of `evidence` without a force-push (the founder deletes the branch, the session pushes a fresh orphan with `gates/`). Section 6: `POST /v1/sources/resolve` added to the contract list, which `docs/MILESTONES.md` calls the whole OpenAPI v1.
- `CLAUDE.md`: "Ask me only about" now names the ADRs, the third-party SDKs that see personal data and the destructive or shared actions that the same file asks about; the repository layout names `design/reference/pack/` (FQ25).
- `docs/MILESTONES.md`: `Dockerfile` and `fly.toml` in the api lane (section 3 of `docs/TECH-DESIGN.md`); B3 tests Q09, as the audit map says.
- `docs/INVARIANTS.md` T57: cites `docs/TECH-DESIGN.md` section 3 and `CLAUDE.md`, "Git", where its rules are stated.
- `docs/QUESTIONS.md` FQ19: says spec 05 doesn't say how the club's zone is chosen; the default (the creator's device) is unchanged.
- `docs/GITHUB.md`: the protection summary shows only whether the rule is on and its required checks, so the screenshot covers the rest.
- `design/reference/INVENTORY.md`: `global-unavailable` is built in B8, with the deep links that reach it (`docs/MILESTONES.md`); the rail-order difference names the five renders that show it.
- This journal: the audit map gives Q05 the stages B1 and B3, as `docs/MILESTONES.md` does.
- `tools/ci/journal_check_test.py`: `FirstPullRequestTest` builds the first PR from the journal as the handoff wrote it, not from the live journal, which every commit changes. Its assertions are unchanged (T58; this first PR may carry CI configuration).
- `docs/LIMITATIONS.md`: the GraphQL row confirmed, the Docker and branch-protection rows with what this session saw, and a new row for the environment's refused hosts. `docs/PROGRESS.md`: the shared section. Section 1.1, and the PR's row in section 4.

Two earlier entries claim more than their commits show, and the log is append-only, so they are corrected here. The 21:22 entry's `diff -r` and `journal_check_test.py` ran before that commit rewrote this journal: at that commit the tree matches the zip except `docs/JOURNAL.md`, and two tests failed (`test_unpack_without_an_entry` and `test_state_left_as_the_handoff_wrote_it`, "0 != 1"), because they read the live journal; this commit fixes the test. The handoff entry says the hook's tests run all 88 commands for real: `tools/ci/journal_hook_test.py` runs 84, and only feeds the hook the `gh api` case marked not to run and the 3 it can't tell.
**Why:** Step 3 of the founder's first message: fix real mistakes in the documents and list every change, never relaxing a rule or a decision. The mistakes were found by a sweep of the documents through seven lenses, each finding checked by a second reader; 24 of 32 held up. The ones whose fix would relax a rule or a decision aren't changed here and are listed for the founder in the PR.
**Verified:** `python3 tools/ci/journal_check_test.py`: 28 tests, OK (2 failed before the fix). `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0. For `docs/LIMITATIONS.md`: `gh api graphql` refused (HTTP 403); `gh api repos/beurni2/tadayo/branches/main/protection` refused (HTTP 403), the summary showed protection on with no required check; `docker info` found no daemon; `curl` through the proxy got `CONNECT tunnel failed, response 403` for `api.supabase.com`, `api.fly.io`, `api.cloudflare.com`, `api.resend.com` and `download.swift.org`, and 200 from `registry.npmjs.org`. Python 3.13.18, git 2.43.0.
**Not verified:** The journal hook (this session started before `.claude/settings.json` existed). Whether the session may start a workflow by hand (there is no workflow yet). Whether the Tadayo environment allows the refused hosts (it isn't selected for the project yet).
**Decisions and questions:** `docs/LIMITATIONS.md`: three rows updated and one added (above). `docs/QUESTIONS.md` FQ19: its citation corrected, its default unchanged. Not changed, for the founder to decide (in the PR): T9's single exception and the operator's case access (spec 07, T55); T62's durable dismissals and spec 19's two controls; editing `INVENTORY.md`, which `CLAUDE.md` and `design/reference/README.md` forbid and other rules require; the weekly trial report against `prod` through `ops`.
**Next:** Open the PR titled `docs: add the Tadayo starter pack` (`gh api -X POST repos/beurni2/tadayo/pulls`, base `main`, head `starter-pack`), then run its independent review (`docs/GITHUB.md`). Done when the review is recorded in a commit and the PR says it's ready for the founder.

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
| #1 | `starter-pack` | The starter pack (`CLAUDE.md`, `docs/`, `design/reference/`, the PR template, `.claude/settings.json`, `.yamllint.yaml`, `tools/ci/`), with the document fixes its body lists, and the founder's answers to FQ3, FQ4 and FQ5 (ADR-016 to ADR-018) | First review: five fresh reviewers (process, design, stages, the journal tools, privacy and security), each finding checked by a separate reader. 27 findings, 26 confirmed: 24 fixed, 2 whose fixes would loosen a rule turned into FQ35 and FQ36 (with FQ31 to FQ34 for the conflicts the PR lists); the one not confirmed (the reviewer's brief and CodeRabbit) answered in the PR. Second review, of the founder's answers and the first review's fixes (`8e4a0c7..4559931`): three fresh reviewers (the documents, the journal tools, privacy and security), each finding checked by a separate reader. 17 findings, 14 confirmed: 13 fixed (two with the reader's tighter fix, where the reviewer's own would have loosened a rule), and the personal data in the 23:27 log entry fixed only in the rewritable sections, the entry left for the founder's word (in the PR); the 3 not confirmed answered in the PR, one also given a pointer in `docs/TECH-DESIGN.md` section 10. Third review, of those fixes (`4559931..f3ee267`): two fresh reviewers (the documents, privacy and security), each finding checked by a separate reader. 13 findings, 10 confirmed and fixed; the 3 not confirmed answered in the PR. Fourth review, of those fixes (`f3ee267..138fcab`): two fresh reviewers (the documents, privacy and security), each finding checked by a separate reader. 7 findings, all confirmed and fixed, one through a question for the founder (FQ37). Fifth review, of those fixes and the PR's body: to come | None: documents and the journal tools, whose tests the log lists |

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
