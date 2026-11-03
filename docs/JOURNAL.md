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
    - Until the ios thread starts in B0 (once slice 9's `ios.yml` has run green on the latest check branch; ADR-025), there is one session at a time (from slice 1, the api thread), which writes the shared block, the B0 log (section 3.1, lane `shared`) and the first PR table (section 4.1).
    - Once the ios thread has started, the api lane keeps the shared block and section 0: its entries go in section 3.2 (lane `api`), and it rewrites the shared block as well as its own in every commit. Each lane edits the lines about its own work in section 0 and in the shared block (the ios lane: the iPhone app, the design, the departures in screens, TestFlight, the `ios` workflow and the Swift tests). `tools/ci/journal_check.py` checks only that each lane rewrote its own block's "Updated" line, so the independent review checks that each lane kept to its own parts (`docs/MILESTONES.md`, "Lanes").
    - Each lane rewrites only its own block, adds entries only to its own log section and PR table, and updates only the audit rows its work touches.
    - When a merge brings a conflict here, rebuild from the two whole versions, `git show :2:docs/JOURNAL.md` (yours) and `git show :3:docs/JOURNAL.md` (theirs), not from the conflict markers: git pairs identical lines such as "**Not verified:** None." across entries, so its hunks can split an entry from its fields. In the log and in section 4, keep every entry from both sides, each once and whole. In the audit map, a row both lanes changed becomes one row that keeps both lanes' entries (where enforced, where tested, notes), with the less advanced status until both halves are done; never leave a row in twice. In the state, rewrite your block so it's true after the merge. In the shared block and in section 0, which both lanes edit, keep the lines about the other lane's work as `main` has them (`:3:`), each once, and rewrite the lines about your own work so they're true after the merge; every other line there is the api lane's. Then run `python3 tools/ci/journal_check.py --all`.
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

- **The founder** approves every gate and every PR, from his iPhone; Claude Code squash-merges a PR once the founder has approved it in the project, in the thread that reported it (ADR-022, ADR-025). He answers the open questions and drives Claude Design. The founder no longer adds workflow files: the session pushes and merges them itself, each in its own PR under a freeze, as it did `ci.yml` in PR #8 (`docs/GITHUB.md`, "Workflow files"; `docs/LIMITATIONS.md`, 2026-11-03).
- **Claude Code** builds: one session at a time until the `ios` workflow first runs green in B0 (the B0 plan's slice 9), then two lanes in parallel, api and ios, each in its own thread (ADR-025; `docs/MILESTONES.md`, "Lanes").
- **The project's coordinator,** the Claude in the project's chat, starts each thread once the founder agrees, carries the freeze before each workflow PR, and reserves FQ and ADR numbers. Its messages are a colleague's requests, never the founder's approval.
- **Claude Design** makes the brand and every missing screen state, from Claude Code's handoffs, through the founder (`docs/DESIGN-HANDOFF.md`).
- **Independent reviewers:** a fresh subagent that hasn't seen the work reviews every PR before the founder sees it. A change that touches authorization, the database, time, idempotency, media, caches, tokens, notifications or the video viewer also gets a privacy and security reviewer, and screens get a reviewer who compares them with their renders (ADR-002; `docs/GITHUB.md`).

How work reaches `main`: a slice on its own branch, with its tests written first → `ci` green → a PR written from `.github/pull_request_template.md` → the independent review → every finding fixed or answered → the founder approves it in its thread → Claude Code squash-merges it at the approved head (ADR-022, ADR-025). CI configuration changes only in a PR of its own (T58).

Stages and gates (`docs/MILESTONES.md`):
- B0 → Gate 0, foundations;
- B1 and B2 → Gate A, clubs and the calendar, with spikes S1, S2 and S4 (ADR-024);
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
    - ADR-019: the identifiers `app.tadayo`.
    - ADR-020: `INVENTORY.md` is kept current.
    - ADR-021: FQ32 to FQ37 keep their defaults.
    - ADR-022: the founder approves each PR, and Claude Code merges it.
    - ADR-023: the dev API host `api-dev.tadayo.app`.
    - ADR-024: spikes S1, S2 and S4 run before Gate A.
    - ADR-025: the api and ios lanes start inside B0, each in its own thread.
    - ADR-026: `ci` runs the bootstrap as a role made like Supabase's `postgres`, which isn't a superuser.
- **The founder's answers:** FQ1, iPhone first; FQ2, keep 2.1's screens and add the brand; FQ3 for `dev`, US East, near the founder; FQ4 for the founder's phone, which runs iOS 18; FQ5's domain, `tadayo.app`. All on 1 November 2026. On 2 November 2026: FQ5's identifiers, `app.tadayo` (ADR-019); FQ31, `INVENTORY.md` kept current, never deleting a row (ADR-020); and FQ32 to FQ37, their defaults (ADR-021); the merge rule: the founder approves each PR, and Claude Code merges it (ADR-022); and FQ38, spikes S1, S2 and S4 before Gate A (ADR-024); and two threads from the B0 plan's slice 9 (ADR-025). On 3 November 2026: building ADR-026 in PR #8 (01:26 UTC); FQ45, on its card in the project's first thread (now titled "Prepare the next design handoffs"), option "Adopt revision 1.1" chosen at 00:58 UTC: "The app builds from 1.1. An ADR and a rulebook change record it when handoff 1 is brought in." Right after the choice, that thread told the founder it would be recorded in the repository before the app's brand slice, 11b (00:59 UTC); the coordinator reserved ADR-027 for the record, to give to the ios thread when that thread starts (00:59 UTC), and marked the timing unsettled at 03:41 UTC. Under `docs/plans/B0.md` section 5.2, handoff 1 comes in only after slice 12, so the two timings would give slice 11b, and the first TestFlight icon, different brands, and the founder hasn't chosen between them: the ios thread asks in ADR-027's PR before slice 11b starts, and without an answer 11b builds from handoff 0's files. Until FQ45 is recorded, `docs/QUESTIONS.md` still shows it open, `design/reference/brand/` keeps handoff 0's files, and nothing is built from 1.1.
- **Defaults in force until the founder answers** (`docs/QUESTIONS.md`: FQ3 for `prod`, FQ4 for the trial members, FQ5's name, FQ6 to FQ30, and FQ39 to FQ44). The ones that shape the trial most:
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
    - the App Review account and club (FQ29);
    - no PR with a destructive migration is merged until FQ39 is answered.

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
- **The operator's access:** no route serves a drop's content to the moderation operator, where spec 07 gives "restricted audited case access"; the `ops` scripts hold or remove a drop by its id (T9, FQ32, the founder's choice on 2 November 2026).
- **Remember this:** every dismissal is durable, where spec 19 makes only "Don't suggest this day again" durable (T62, FQ33, the founder's choice on 2 November 2026).
- **Where 2.1's renders break a rule:** names instead of "Her pick" and the other gendered strings, the Highlight label only on the viewer's own cards, the rail's order, and no Share icon.
- **Where the book wins over the spec:** Reduce Motion opens the photo at once, where spec 15 says a crossfade; and "Added for", where spec 10 says "Added to".
- **Where design handoff 0's renders differ from a rule or from 2.1's layout:** the rule is built, or 2.1's layout with the brand where no rule decides (FQ40); a newcomer can take a departed member's cover colour, where the delivery's note says never (FQ41); F02 says spec 09's audience line, not the render's (FQ43); the folded card is built at the delivery's named radius and spec 24's, 16, and its status line at the metadata role, 13/18, where the frames draw 14 and about 11 (handoff 1 asks).

The screen-by-screen list is `design/reference/INVENTORY.md`, "Known differences".

---

## 1. State of the project

### 1.1 Shared (the api lane keeps this block)

**Updated:** 2026-11-03 03:58 UTC, plan/b0-rulebook-ci

- **Stage:** B0 Foundations (`docs/plans/B0.md`). Slices 1 and 2 merged (PRs #7 and #8). The rulebook PR from `plan/b0-rulebook-ci`, at the founder's yes in the api thread at 02:53 UTC on 2026-11-03, brings every rule about workflow files in line with what PR #8 showed: the session pushes workflow files and merges their PRs itself. Then slice 9, under a new freeze. Next gate: Gate 0, a joint gate.
- **Lanes:** the api thread started on 2026-11-02 at 23:28 UTC and is the one session until `ios.yml` has run green on the latest check branch, writing this block, log section 3.1 (lane `shared`) and table 4.1 (ADR-025). The ios thread hasn't started.
- **Freeze:** none. The coordinator lifted PR #8's freeze once it had merged, and asked to be asked again before slice 9's `ios.yml` PR (`docs/MILESTONES.md`, "Lanes").
- **PRs:** #1 to #6 merged by squash on 2026-11-02, each at the founder's approval in its thread (#1 at the founder's "you can merge yourself"): #1 the starter pack (`0a6c91c`), #2 the B0 plan (`1c4a4b5`), #3 the rulebook for ADR-022 and ADR-024 (`208c809`), #4 design handoff 0 as reference files (`7ab4bdc`), #5 handoff 1's states requested (`3d43860`), #6 ADR-025's lanes (`fa47c87`). #7 `chore: the pnpm workspace and the copy lint` (slice 1), approved by the founder in the api thread ("approve PR #7", 00:05 UTC on 2026-11-03) and squash-merged by Claude Code at the approved head `9446744` as `674b226`. #8 `ci: the ci workflow, its steps and guard 1` (slice 2), approved by the founder in the api thread ("merge PR #8", 02:53 UTC on 2026-11-03) and squash-merged by Claude Code through REST at the approved head `8450ca8` as `c06edbe` (GitHub's merge time 02:53:40 UTC): three rounds of independent review, a privacy-and-security review and a check of its description, every finding fixed or answered in its description, and ADR-026 built. #9 `docs: the session pushes and merges workflow files` (the rulebook PR, from `plan/b0-rulebook-ci`), open: opened at its first commit `f359593` with `ci` green (run 41569746184); the first review's fixes at `3064799` (run 41571881448 green), the second review's at `824c74e` (run 41573707711 green), and the third review's in the commit this block was written in.
- **Branches:** `main` at `c06edbe`. `plan/b0-rulebook-ci`, made from `main` at `c06edbe`: PR #9. `api/b0-ci` was deleted by GitHub at PR #8's merge (the repository deletes a branch once its PR merges). `draft/b0-plan` (head `3a09601`) stays as it is, never merged. `evidence`, an orphan (head `4f6c991`), holds PR #4's comparison sheets; never merged, and its monthly reset needs the founder's yes (section 4.4).
- **`main`'s protection:** on, with `ci` (GitHub Actions, app 15368) as its required check, enforced for everyone: read back on 2026-11-03 at 02:47 UTC and again at 03:00 UTC (`gh api repos/beurni2/tadayo/branches/main --jq .protection`).
- **Environments:** `dev` being set up by the founder in US East (Supabase `us-east-1`, Fly `iad`; ADR-016), not yet reached by any slice. `prod` not created (Gate D). The session reaches Supabase's API, Fly, Cloudflare, swift.org, `docs.github.com` and `images.unsplash.com`; `supabase.com` itself (Supabase's documentation) and `apt.postgresql.org` are refused, again at 00:59 UTC on 2026-11-03 (`docs/LIMITATIONS.md`).
- **The domain:** `tadayo.app`, registered by the founder on Cloudflare on 2026-11-01 (ADR-017).
- **TestFlight:** no build yet.
- **`ci` on `main`:** green at `c06edbe`, every job (`node`, `postgres` on Postgres 17.11, `swift`, `tools`, `guards`) and the final `ci` (run 41568890065). Before the merge, on `api/b0-ci`, every run in section 4.1's row for PR #8 was green, the last 41568092779 at the approved head `8450ca8`. The session pushed `ci.yml` and merged its PR itself (`docs/LIMITATIONS.md`).
- **`docs/PROGRESS.md`:** current as of this commit.
- **Design:** design handoff 0 (the brand) is on `main` since PR #4. Design handoff 1 (sign-in and clubs, `docs/plans/B0.md` section 5.2) went to the founder on 2026-11-02 at 20:38 UTC; its export reached the project's files on 2026-11-02 (`design/handoff-1/export/`, 23:34 UTC) and was checked there (`design/handoff-1/check/`, 00:33 UTC on 2026-11-03); handoff 2's corrections to it reached them on 2026-11-03 (`design/handoff-2/export/`, 01:43 UTC) and were checked there (`design/handoff-2/check/`, 02:29 UTC); the times are the folders', read in this session. Both enter the repository when section 5.2 allows. FQ45 was answered on its card in the project's first thread at 00:58 UTC on 2026-11-03 (adopt brand revision 1.1, "when handoff 1 is brought in"; the founder's choice read from the card in this session); ADR-027 is reserved for the ios thread to record it when it starts, and when it applies is open (section 0.7). Design handoffs 3 and 4 are reserved for that thread's briefs (03:03 UTC on 2026-11-03), so the ios thread's next is 5. The inventory's counts are in the design line of section 1.3.

**What exists and works (verified).** On `main`: the starter pack, the B0 plan, the rulebook with ADR-022 to ADR-025, design handoff 0's reference files, handoff 1's states requested, slice 1 (PR #7): the pnpm workspace (Node 26, pnpm 12.16.1, TypeScript 6.0 strict, ESLint 10, Prettier; the packages `@tadayo/domain`, `@tadayo/contracts`, `@tadayo/api`, `@tadayo/worker`, `@tadayo/web`, `@tadayo/tests`, `@tadayo/ops`) and the copy lint (`pnpm copy-lint`, `packages/domain/src/copy/`; T41 to T43); and slice 2 (PR #8) with ADR-026, run in the session before its merge:
- `tools/ci/ci_config_guard.py`, guard 1 (T58): `python3 tools/ci/ci_config_guard_test.py`, 16 tests pass;
- `tools/ci/ci_steps.py`, every step `ci.yml` calls, each later target found rather than named (`TARGETS`) and passing empty until it arrives, with the ratchet that keeps an arrived target, per package for scripts, from going away; and ADR-026's database, made like Supabase's: `python3 -m unittest tools/ci/ci_steps_test.py`, 77 tests, 2 of them opt-in live tests: 75 pass and 2 are skipped without the opt-in, and all 77 pass with `CI_STEPS_LIVE_POSTGRES=1` against a local server made like `ci`'s; the pnpm steps refuse a `pnpm-workspace.yaml` setting outside `PNPM_SETTINGS` and a root pnpmfile; each test added after a review fails against a deliberately broken copy of the code it guards (47 mutations, all caught); `db-bootstrap` run for real against that local server refused a `db/bootstrap.sql` written for a superuser ("must be able to SET ROLE") and passed a corrected one;
- `tools/ci/toolchain.py`, the pins: Xcode 26.6, Swift 6.3.3 (read from swift.org's release list, cross-checked on the runner in slice 9), the image `swift:6.3.3-noble` by digest, Postgres 17;
- `.github/workflows/ci.yml`, green on GitHub on every push of `api/b0-ci` and on `main` at `c06edbe` (run 41568890065);
- Swift 6.3.3 in the session (`swift --version`), for the Swift package tests from slice 11.

On `plan/b0-rulebook-ci`: documents only, no code (below).

**In progress.** PR #9, the rulebook PR (`plan/b0-rulebook-ci`): `CLAUDE.md` ("Environment" and "Repository layout"), `docs/GITHUB.md` (its version, step 6 and "Workflow files"), `docs/TECH-DESIGN.md` (its version, sections 9 and 10), `docs/MILESTONES.md` (its version, B0's CI bullet), `docs/plans/B0.md` (section 2's text and rows 2, 9, 10b, 10c and 12, the risks, section 3's heading and introduction), `docs/LIMITATIONS.md`'s workflow row (the merge accepted), `docs/PROGRESS.md`'s shared section, and this journal. Three independent reviews: the first's 11 findings fixed or answered at `3064799`, the second's 7, of those fixes, at `824c74e`, and the third's 8, of those, in the commit this block was written in (section 3.1's entries). The third's fixes are small and each follows its reader's corrected fix, so no fourth review is planned; `ci` on that commit is next.

**Next, in order:**
1. Check `ci` on the pushed head: `gh api "repos/beurni2/tadayo/actions/runs?head_sha=$(git rev-parse origin/plan/b0-rulebook-ci)" --jq '.workflow_runs[] | [.id, .status, .conclusion] | @tsv'` (the full 40-character SHA; a short one finds no runs). Done when the `ci` run is `completed` and `success`: its final `ci` job fails unless every other job succeeded.
2. Only once every review run on PR #9 is recorded in a commit with `ci` green on it (`docs/GITHUB.md` step 5; if a commit's fixes changed a lot, review it again and record that first), fill in PR #9's "Review" and "Ready for the founder" (`gh api -X PATCH repos/beurni2/tadayo/pulls/9 -F body=@<file>`, the file outside the repository): the head and its green run, what changed, the review's findings and how each was fixed or answered, the risks (`docs/GITHUB.md` step 6) and what the founder needs to do; tick the boxes that hold. No commit after it: a commit would move the head away from what the founder approves. Done when the description names the head and its green run. Then tell the founder in the api thread.
3. The founder approves PR #9 there; squash-merge it at the approved head (`docs/GITHUB.md` step 6) and check `ci` on `main`'s new head. A push after the approval needs a new approval.
4. Slice 9, `ios/b0-ios-workflow`: first ask the coordinator for the freeze; then the `tools/ci/` scripts `ios.yml` calls and `ios.yml` itself, which also prints `xcrun swift --version` and fails unless it is `tools/ci/toolchain.py`'s `SWIFT_VERSION`, and, in the same PR, step 6's two leftovers; after its merge, push `ios/b0-ios-check` and tell the coordinator once `ios.yml` runs green there.
5. Design handoffs 1 and 2: they stay in the project's files and enter the repository on `ios/b1-handoff-1` only when `docs/plans/B0.md` section 5.2 allows.
6. In slice 9's PR (step 4), or, if it has merged without them, in a CI-configuration PR of their own (T58), two leftovers this rulebook PR can't touch: `.github/pull_request_template.md`'s "Ready for the founder" comment leaves out the risks `docs/GITHUB.md` step 6 asks for; and `.yamllint.yaml`'s comment on `new-line-at-end-of-file` (lines 11 to 13) still says the founder pastes every workflow file. Reword it to say a file the founder adds through GitHub's web editor, when GitHub refuses the session's push (`docs/GITHUB.md`, "If GitHub refuses a workflow push"), usually loses its final line break; keep the rule off while that fallback stands, since step 5 there accepts a missing final line break. Done when both say so and guard 1 passes.

**Blocked or waiting for the founder:**
- Approving PR #9 once it says it's ready.
- Accounts for B0 (`docs/TECH-DESIGN.md` section 10). The founder reported on 2026-11-01 submitting the Apple Developer Program enrolment, `tadayo-dev` on Supabase's Pro plan in `us-east-1` with its data API off, a Fly.io sign-up, and `tadayo.app` added in Resend. None is verified yet; each shows when B0 first uses it (the B0 plan's section 1). Still waiting: Apple's approval, then the App Store Connect API key and, before Gate A, the APNs key (ADR-024); Resend's verification of `tadayo.app`; the Supabase project's URL and publishable key (slice 8, or the ios thread's slice 11).
- `supabase.com` in the environment's allowed domains: the founder's list names it, but the session is refused it (`docs/LIMITATIONS.md`).
- The trial members' iPhone models and iOS versions (FQ4), which matter only if one can't run iOS 17.
- The internal tester on a second iPhone (FQ28's default), before spike S1 (ADR-024; the plan's F8); S2's photo before spike S2 (the plan's F9).
- The founder's location and phone details: `main` says only "US East" and "iOS 18"; `draft/b0-plan` and PR #1's page keep older wording (see the log's entries of PR #1).
- Open questions with defaults in `docs/QUESTIONS.md`: FQ39 (no destructive migration merges before its answer), FQ40 to FQ44 (FQ42 by B1, FQ44 by slice 11). FQ45 is answered (the Design line above) and waits to be recorded by the ios thread; when it applies is open (section 0.7).

**How to run and check everything.**
- The session's tools: Node 26 isn't on the image's path; `export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH` (after `. /opt/nvm/nvm.sh; nvm install 26`), and `npm i -g pnpm@12.16.1` once per session. Swift: `. /opt/swiftly/env.sh`, then once per session the install in `docs/LIMITATIONS.md`'s swiftly row (`swiftly install 6.3.3`, never the newest).
- The workspace: `pnpm install`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` and `pnpm copy-lint`, each exit 0.
- `ci`'s steps, as `ci.yml` runs them: `python3 tools/ci/ci_steps.py <step>` (`setup-pnpm`, `install`, `lint`, `typecheck`, `format`, `copy-lint`, `openapi`, `unit`, `web`, `db-check`, `db-bootstrap`, `db-tests`, `privacy`, `tools-tests`, `swift`, `guards`, `ratchet`, `verdict`); the steps whose target hasn't arrived say so and pass. The database steps expect a server made like `ci`'s service (ADR-026) on `localhost:5432`: its first role `supabase_admin`, every password `postgres`. The session's own cluster can't be one; make a second one as `docs/LIMITATIONS.md`'s row on the session's own cluster and `initdb --username=supabase_admin` says, once per `db-bootstrap` run (it is 16, so `db-check` refuses it; CI's 17 is the authority). A slice turns a step on by giving a workspace package the script the step looks for: `openapi:check`, `test`, `build`, `test:db` (with `DATABASE_URL` as `tadayo_app` and `DATABASE_ADMIN_URL`; run one package at a time) or `test:privacy`; or by adding `db/bootstrap.sql` (run as `postgres`, made like Supabase's and not a superuser, with `-v app_password=…`, after `ci` has made Supabase's roles; ADR-026) or a Swift package's `Package.swift`. Once a target is on `main`, the ratchet fails a branch that removes it, a script counted once per package by the package's name (so every workspace package needs a `name` of its own, or the ratchet fails); retiring one takes a `RETIRED_TARGETS` entry in a CI-configuration PR.
- The CI tools' tests: `python3 tools/ci/ci_steps.py tools-tests` runs every `tools/ci/*_test.py` through `python3 -I -m unittest discover -s tools/ci -t tools/ci -p <file>` (the journal hook's, the journal check's, guard 1's and the steps'); `python3 -m unittest tools/ci/<file>` runs one by hand. Delete `tools/ci/__pycache__` after.
- The journal: `python3 tools/ci/journal_check.py --all`, and `--branch` on a branch. The hook doesn't fire in this session, so before each commit run it by hand: `echo '{"tool_input":{"command":"git commit"}}' | python3 -I tools/ci/journal_hook.py`, exit 0 with the journal staged. Take every time in the journal and the logs from `date -u` just before staging.
- A workflow file, before it's pushed: `actionlint`, `yamllint -c .yamllint.yaml` and `zizmor --offline --persona pedantic` (`pip install zizmor yamllint actionlint-py`), each with no findings.
- A design delivery: check the unpacked files against the .zip with `sha256sum`, render SVG frames with the session's Chromium at a device scale factor of 2, and make PDFs with `rsvg-convert -f pdf` (`docs/DESIGN-HANDOFF.md`, "How renders come back"); compare with `compare -metric RMSE`.
- To be written in B0: the backend tests against Postgres, the privacy matrix and the leak scanner; the Swift package tests; the `ios` workflow and where its snapshots land; the `ops` scripts; how to read the evidence branch.

**Known limits and risks.** See `docs/LIMITATIONS.md`. The ones that shape the work: cloud sessions can't compile SwiftUI (`docs/TECH-DESIGN.md` sections 2 and 9); the journal hook doesn't fire in this session, so `tools/ci/journal_check.py --branch` and running the hook by hand stand in for it; the session's PostgreSQL is 16 and can't be upgraded here, and Docker Hub rate-limits the pulls that could bring 17, so CI's Postgres 17 is the authority; `ci`'s database is made like Supabase's (ADR-026), but Supabase's schemas and supautils aren't in it, so the first `ops` bootstrap on `dev` is still the proof; the runner image offers only iOS 26 simulators, which matters for the pre-gate runs on older iOS (slice 9).

### 1.2 api lane

**Updated:** 2026-11-01, by the handoff.

Not started. The api thread builds slices 1, 2 and 9 as the one session, in block 1.1, log section 3.1 (lane `shared`) and table 4.1; it writes here, and in section 3.2 (lane `api`), once the ios thread has started (ADR-025; `docs/plans/B0.md`, opening lines). Its block will hold its PRs, what's in progress, what's next and what's blocked.

### 1.3 ios lane

**Updated:** 2026-11-03 03:40 UTC, plan/b0-rulebook-ci (the B0 session's design line)

Not started. It starts inside B0, once slice 9's `ios.yml` has run green on the latest check branch (ADR-025). Until then, the B0 session keeps the design line here:
- **Design** (`design/reference/INVENTORY.md`):
    - handoffs sent: 0 (the brand), delivered on 2026-11-02 and merged as PR #4 (`7ab4bdc`); 1 (sign-in and clubs, `docs/plans/B0.md` section 5.2), given to the founder on 2026-11-02 after that merge and started the same day, its 17 states `requested 1` on `main` since PR #5 (`3d43860`), delivered on 2026-11-02 at 23:34 UTC and checked, kept in the project's files (`design/handoff-1/`); 2 (corrections to handoff 1), delivered on 2026-11-03 at 01:43 UTC and checked, kept there too (`design/handoff-2/`). Neither is in the repository until `docs/plans/B0.md` section 5.2 allows, so the counts below are unchanged. Handoffs 3 and 4 are reserved for the briefs of the project's first thread ("Prepare the next design handoffs"), started on 2026-11-03; the ios thread's next brief is 5. FQ45 is answered, adopt revision 1.1, but when it applies, before slice 11b as the coordinator planned or when handoff 1 comes in after slice 12 as the card says, is open (section 0.7): put it to the founder in ADR-027's PR before slice 11b starts; without an answer, 11b builds from handoff 0's files in `design/reference/brand/`;
    - trial states: 149, of which 51 have a render, 17 are requested from handoff 1 and 81 are missing. 50 have a 2.1 render (49 to build, plus the system picker's reference), and three of those (`H01-open`, `H01-open-dark`, `F02-upcoming`) also have handoff 0's; `F02-upcoming-dark` has handoff 0's only. `F01-no-club` and `M01-no-club` were added in PR #4, for handoff 1;
    - built from spec: 0. Brand assets received: 4 of 4.

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
| T41 One vocabulary | `packages/domain/src/copy/rules.ts` `lintString`, over every string file by `packages/domain/src/copy/cli.ts` (`pnpm copy-lint`) | `packages/domain/src/copy/rules.test.ts`, `extract.test.ts`, `cli.test.ts` | tested | copy lint: the banned words, "Sent" in every form. It reads `.xcstrings`, `.strings` and `.html` only: copy in scripts (the invitation page's), in `project.yml`'s Info.plist keys, in the worker's push text, and SwiftUI literals that Xcode hasn't yet written to a catalog aren't read, so the slice that brings each adds its file kind to `extract.ts` (10a or S6, 11, B5). The nouns of spec 03 and exact dates aren't lintable; the screen reviews check them; in `ci` from slice 2 |
| T42 Names, not inferred pronouns | `packages/domain/src/copy/rules.ts` `lintString`, over every string file by `packages/domain/src/copy/cli.ts` (`pnpm copy-lint`) | `packages/domain/src/copy/rules.test.ts`, `extract.test.ts`, `cli.test.ts` | tested | copy lint: he, him, his, himself, she, her, hers, herself in system copy; in `ci` from slice 2 |
| T43 The voice is plain | `packages/domain/src/copy/rules.ts` `lintString`, over every string file by `packages/domain/src/copy/cli.ts` (`pnpm copy-lint`) | `packages/domain/src/copy/rules.test.ts`, `extract.test.ts`, `cli.test.ts` | tested | copy lint: exclamation marks. Plain voice beyond that is the screen reviews'; in `ci` from slice 2 |
| T44 Tokens, not values | | | planned | The brand's tokens arrived with design handoff 0: `design/reference/brand/brand-tokens.md` (PR #4). `TadayoDesign` takes them in slice 11b |
| T45 Native first | | | planned |  |
| T46 Claude Design designs; Claude Code never does | | | planned | Design handoff 0 (the wordmark, the icon, the tokens, the component sheet and four screens) came from Claude Design through the founder and was converted, never redrawn (PR #4). Where its marks came from: FQ42 |
| T47 Accessibility is part of done | | | planned |  |
| T48 Motion is one fold | | | planned |  |
| T49 Truthful states only | | | planned |  |
| T50 Ask only when needed | | | planned |  |
| T51 Analytics are first-party and pseudonymous | | | planned |  |
| T52 Logs carry no content | | | planned |  |
| T53 The server decides, and Supabase stays closed | | | planned | Supabase probe. Nothing enforces T53 yet. For slice 4's tests, `ci` makes Supabase's `anon`, `authenticated` and `service_role` as Supabase's image has them, and its `postgres` (`tools/ci/ci_steps.py` `Steps.db_bootstrap`, `SUPABASE_SQL`; ADR-026), tested by `tools/ci/ci_steps_test.py` `DatabaseStepsTest` and the opt-in `SupabaseSqlLiveTest` |
| T54 Outbox and idempotent workers | | | planned |  |
| T55 Serializers whitelist | | | planned |  |
| T56 Secrets stay out | | | planned |  |
| T57 Migrations expand, migrate, contract | | | planned |  |
| T58 Checks only get stronger | Guard 1: `tools/ci/ci_config_guard.py` `check`, run by `tools/ci/ci_steps.py guards` in `ci`'s `guards` job with guard 2 (`tools/ci/journal_check.py --branch`) and the ratchet (`ci_steps.py` `Steps.ratchet`: each target of `TARGETS` present where the branch left `main`, a file by its path and a script once per package by the package's name, every package named and no two alike, must still be there unless listed in `RETIRED_TARGETS`, so no target can go unseen); the pnpm steps refuse a `pnpm-workspace.yaml` setting outside `PNPM_SETTINGS` and a root pnpmfile, so pnpm can't be set to skip every script; `tools-tests` runs isolated from the rest of the repository; what a script runs and a test's own configuration are left to review; each step reads its target from `TARGETS`; the final `ci` job's `verdict` fails unless every job succeeded, and needs every other job with a job-level `if: always()`; `tools-tests` fails a test file that runs no test | `tools/ci/ci_config_guard_test.py` (the B0 plan's case: `.github/` with `docs/plans/x.md` fails, with the three logs passes; main moving ahead without a merge; a path git would quote), `tools/ci/ci_steps_test.py` (`GuardsStepTest`, `RatchetTest`, `TargetsTest`, `PnpmSettingsTest`, `WorkflowTest`, `VerdictStepTest`, `ToolsTestsStepTest`); `ci` runs 41551742269, 41557133745, 41561641059 and 41563717087 (the `guards` and `tools` jobs green; at `9748d0a`, the ratchet keyed per package passing; at `7f3b7a4`, every package named), and on `main` 41568890065 (at `c06edbe`, PR #8's merge) | tested | ci guard. Steps whose targets arrive later pass empty until slice 12 sets `REQUIRE_TARGETS`; the ratchet keeps one that has arrived |
| T59 Real Postgres and the privacy matrix | `.github/workflows/ci.yml`'s `postgres` job (a `postgres:17.11` service by digest, made like Supabase's, ADR-026); `tools/ci/ci_steps.py` `Steps.db_check` (Postgres 17 only), `Steps.db_bootstrap`, `Steps.db_tests` and `Steps.privacy` (as `tadayo_app`, one package at a time, kept by the ratchet) | `tools/ci/ci_steps_test.py` `DatabaseStepsTest`, `PackageScriptStepsTest`, `SupabaseSqlLiveTest` (opt-in); the `postgres` job of `ci` runs 41561641059 (at `9748d0a`: `POSTGRES_USER=supabase_admin` on Postgres 17.11, and `db-bootstrap`'s "`postgres` is made as Supabase makes it, not a superuser") and 41563717087 (at `7f3b7a4`, the same), and on `main` 41568890065 (at `c06edbe`, the same) | built | privacy matrix. The CI side only: the database tests arrive in slice 4 and the privacy matrix in slice 7 |
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

#### 2026-11-03 03:58 UTC · shared · plan/b0-rulebook-ci · PR #9
**Did:** Had `824c74e`, which rewrote "Merge timing" again, checked by a third pair of fresh reviewers (the procedure, each git command walked through its cases in scratch repositories; the records), each finding checked by a separate reader (`docs/GITHUB.md` step 5). 8 findings, 1 confirmed, 6 in part and 1 refuted. Fixed or answered:
- `docs/GITHUB.md` "Merge timing": its two cases overlapped for a merge of `main` that had conflicts, so a session could reset away its conflict resolution and ask for an Update branch GitHub doesn't show on a conflicting PR (in part: the next line names the case, and the resolution stays reachable through `ORIG_HEAD`). **Fixed:** the first case is only for a PR whose merge had no conflicts; the second is "Otherwise", and says not to reset but to leave the old branch as it is.
- `CLAUDE.md` "Git" still said to ask for Update branch whenever such a push is refused (confirmed). **Fixed:** push a merge of `main` at once, with nothing committed on top, and follow `docs/GITHUB.md`, "Merge timing", for when to drop the merge and ask for Update branch and when to use a fresh branch.
- FQ45 in 0.7 said the coordinator had given ADR-027 to the ios thread, which hasn't started, called the "before slice 11b" timing only the coordinator's, though the project's first thread told the founder so right after the choice (00:59 UTC), and didn't say when the founder is asked or what holds meanwhile; `docs/PROGRESS.md` didn't say "before slice 11b starts" (in part). **Fixed:** 0.7 gives the thread's message, the coordinator's reservation for the ios thread when it starts, and its note at 03:41 UTC marking the timing unsettled; the ios thread asks in ADR-027's PR before slice 11b starts; without an answer, 11b builds from handoff 0's files. 1.1's Design line reads the same; `docs/PROGRESS.md` says "before slice 11b starts". The 03:40 entry's "Fixed in 0.7, 1.1, 1.3 and `docs/PROGRESS.md`" went further than 0.7 and PROGRESS did; it stays as written.
- The 03:40 entry said the first review's counts were fixed "in PR #9's row and description"; the description still had the old counts, FQ45 as settled before slice 11b, and "the starter-pack thread" (in part). **Fixed:** the description's Review section was rewritten at 03:57 UTC (read back: none of the three remains), with the second review mapped finding by finding and FQ45's open timing in its risks.
- Next and `docs/PROGRESS.md` counted "two reviews", so a session resuming from PROGRESS could skip this one (in part: true when committed). **Fixed:** PROGRESS says every review run on PR #9, as Next step 2 does, and step 2 says to review a commit again first if its fixes changed a lot.
- The 03:40 entry said "3 confirmed and 4 in part" without naming the four (in part: none was dropped). **Answered** here and in PR #9's row and description: the in-part ones were the Update branch bullet (its `journal_check.py` point not taken, unconfirmed and CI configuration), the branch without a PR (older than this PR, fixed anyway), Next without the second review (its "running" step not taken, false once committed) and Next step 6's order (renumbering not taken).
- Next step 1 used `head_sha=<sha>` while the journal writes heads short, and the runs list matches only a full SHA (in part: a run's conclusion already covers every job, since the final `ci` job fails unless all succeed). **Fixed:** step 1 uses `$(git rev-parse origin/plan/b0-rulebook-ci)` and prints each run's status; `docs/GITHUB.md`'s REST recipes say `{sha}` is the full 40-character commit.
- 1.1's Design line quotes the card's "when handoff 1 is brought in" beside the choice, said to misplace it (refuted: it is the chosen option's own wording, and every record reads the timing the same way). **Answered**, no change.
- This journal: 0.7, 1.1 (PR #9, Design, In progress, Next steps 1 and 2), this entry and PR #9's row. `CLAUDE.md` "Git"; `docs/GITHUB.md` "Merge timing" and its REST introduction; `docs/PROGRESS.md` Next and FQ45.
**Why:** `docs/GITHUB.md` steps 4 and 5 for PR #9: `824c74e` changed the refusal procedure again, so it was checked again.
**Verified:** `gh api "repos/beurni2/tadayo/actions/runs?head_sha=824c74e"` returns no run, and with the full SHA returns 41573707711, `completed` `success`. PR #9's description read back after the 03:57 UTC update: no "starter-pack", "6 confirmed and 5" or "9 problems". `python3 tools/ci/journal_check.py --all` and `--branch`, `python3 tools/ci/ci_config_guard.py` and the hook run by hand: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. The merge-of-`main` and refusal steps haven't been run against GitHub, which hasn't refused this session. No fourth review: this round's fixes are small, each following its reader's corrected fix.
**Decisions and questions:** None new. FQ45's timing stays the founder's, for ADR-027's PR before slice 11b.
**Next:** Check `ci` on this commit (section 1.1's Next step 1); done when it is `completed` and `success`. Then Next step 2.

#### 2026-11-03 03:40 UTC · shared · plan/b0-rulebook-ci · PR #9
**Did:** Had PR #9's fixes (`3064799`) reviewed again, since they rewrote the refusal procedure (`docs/GITHUB.md` step 5): two fresh reviewers who hadn't seen the work (the procedure in `docs/GITHUB.md`, each git command walked through its cases in scratch repositories; the records), each finding checked by a separate reader. 7 findings, 3 confirmed and 4 in part, all fixed:
- `docs/GITHUB.md` "Merge timing": `git reset --keep HEAD^1` drops a refused merge of `main` only when the merge is the last commit; with a commit on top, that commit's files left the tree and the merge stayed. **Fixed:** push a merge of `main` at once, with nothing on top; before the reset, check that the merge is the last commit (`git rev-parse -q --verify HEAD^2`); with commits on top, re-apply on a fresh branch.
- The same bullet didn't say which **Update branch**, didn't say to commit nothing while waiting, and gave no step if `git pull --ff-only` refuses. **Fixed:** the button itself, which merges `main` in, not **Update with rebase**; commit nothing while waiting; if the pull refuses, stop and tell the founder, never force-push, rebase or merge `main` locally. In part: its point that `tools/ci/journal_check.py` could skip commits GitHub rebases wasn't taken, being unconfirmed, and that file is CI configuration (T58).
- No route for a refused merge of `main` on a branch without a PR, though the 03:22 entry said the fallback covered every case. **Fixed:** a branch with no PR, one whose PR conflicts, or one with commits on top of the refused merge is re-applied on a fresh branch from `main`, as for a branch set aside (`docs/MILESTONES.md`, "Lanes"), its PR opened at step 2's time. The 03:22 entry's "every case" went further than its text until this commit; it stays as written.
- Next, in order, didn't mention the second review, so a session resuming from it could have called PR #9 ready with that review unrecorded. **Fixed:** this entry records it, and Next step 2 now waits until every review run on PR #9 is recorded in a commit with `ci` green on it.
- FQ45's timing was given as "before slice 11b", which is the coordinator's plan (its message in the project's first thread at 00:59:46 UTC), not the founder's card: option "Adopt revision 1.1" says "The app builds from 1.1. An ADR and a rulebook change record it when handoff 1 is brought in", and handoff 1 comes in after slice 12 (`docs/plans/B0.md` section 5.2). The thread was also called "the starter-pack thread", a name the journal never defines. **Fixed** in 0.7, 1.1, 1.3 and `docs/PROGRESS.md`: the card quoted; both timings named and left to the founder, to be asked in ADR-027's PR before slice 11b; without an answer, 11b builds from handoff 0's files; the thread named as the project's first thread, now titled "Prepare the next design handoffs". The coordinator is told.
- The first review's counts didn't add up: its verdicts were 5 confirmed and 6 in part, not 6 and 5, and its 11 findings come to 8 problems, 7 fixed and 1 answered, not 9 problems with 8 fixed. The correction to the 03:02 entry belonged to the `.yamllint.yaml` and row 9 findings, not a problem of its own. **Fixed** in PR #9's row and description; the 03:22 entry stays as written.
- Next step 6's CI-configuration leftovers came after slice 9's step, though they belong in slice 9's PR. **Fixed:** step 4 now carries them, and step 6 says slice 9's PR, or a PR of their own if it merged without them; the number is kept, since the 03:22 entry names "Next step 6".
- This journal: sections 0.7, 1.1 (the PRs, Design, In progress, Next steps 2, 4 and 6, the open questions), 1.3's design line, this entry and PR #9's row. `docs/PROGRESS.md`: Next and FQ45. `docs/GITHUB.md`: "Merge timing".
**Why:** `docs/GITHUB.md` step 5: the first review's fixes changed the refusal procedure a lot, so it was reviewed again.
**Verified:** In a scratch repository: `git rev-parse -q --verify HEAD^2` succeeds right after `git merge main` and fails once a commit sits on top; `git reset --keep HEAD^1` on the bare merge drops it and the workflow file with it, keeping the branch's commit before it; with a commit on top, it drops that commit's file from the tree and leaves the merge and the workflow file. The repository's settings through REST: `allow_update_branch` true, `allow_rebase_merge` false. The FQ45 card re-read through the project's messages (its options and their consequences). `ci` run 41571881448 green at `3064799`. `python3 tools/ci/journal_check.py --all` and `--branch`, `python3 tools/ci/ci_config_guard.py` and the hook run by hand: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. The merge-of-`main` and refusal steps haven't been run against GitHub, which hasn't refused this session.
**Decisions and questions:** FQ45's timing is open between the card's words and the coordinator's plan; it is the founder's, for the ios thread to ask in ADR-027's PR before slice 11b. It isn't added to `docs/QUESTIONS.md` here: FQ45's record there is the ios thread's.
**Next:** Check `ci` on this commit; done when every job is green. Then section 1.1's Next step 2.

#### 2026-11-03 03:22 UTC · shared · plan/b0-rulebook-ci · PR #9
**Did:** Opened PR #9 (`docs: the session pushes and merges workflow files`) at `f359593`, with `ci` green (run 41569746184), and had it reviewed independently (`docs/GITHUB.md` step 3): three fresh reviewers who hadn't seen the work (the rules across the whole repository; anything relaxed; the records), each finding checked by a separate reader who tried to refute it. 11 findings: 6 confirmed and 5 confirmed in part, which come to 9 problems. Fixed or answered:
- `docs/GITHUB.md` "If GitHub refuses a workflow push" was the old one-time test's recovery (`git reset HEAD~1`, move the file), wrong when the workflow change is in an earlier commit or already on GitHub, and it no longer covered a refused push of a merge of `main` (two findings). **Fixed:** the ban on workarounds (no other token, no contents API, no bot, not the session's GitHub tools) now covers every refusal: a workflow PR's own push, a merge of `main`, and a merge; a refused workflow branch goes back to the last commit GitHub accepted (`git reset origin/<branch>`, or to the merge base if never pushed) with the workflow file restored to that commit's, or leaves the branch for a new one if an earlier push already carried it; "Merge timing" says to drop a refused merge (`git reset --keep HEAD^1`) before asking for Update branch; the intro keeps that the session's GitHub tools were refused the same way.
- The fallback's step 1 had lost "using the repository's `.yamllint.yaml`". **Fixed:** `yamllint -c <the repository>/.yamllint.yaml`.
- The version lines weren't bumped, though PRs #3 and #6 bumped them. **Fixed:** `docs/GITHUB.md` 1.3, `docs/TECH-DESIGN.md` 1.2 and `docs/MILESTONES.md` 1.3, each dated 3 November 2026.
- `docs/plans/B0.md` row 9 still said `ios/b0-ios-check` "can't take a workflow change from `main`". **Fixed:** the reason is now that such a push is untested and, on a branch never opened as a PR, has no Update branch to fall back on; the procedure (a new check branch) is unchanged.
- FQ45's answer was written into 1.1 and `docs/PROGRESS.md` from the coordinator's records, while section 0.7 still listed FQ45 among the defaults in force (two findings). **Fixed:** the founder's choice, "Adopt revision 1.1", was read from its card in the starter-pack thread (chosen by the founder at 00:58:44 UTC on 2026-11-03); 0.7 now lists it among the 3 November answers, says the ios thread records it with ADR-027 before slice 11b, and that until then `docs/QUESTIONS.md` still shows it open and nothing is built from 1.1; the defaults in force are FQ39 to FQ44. `docs/QUESTIONS.md` isn't changed here: recording FQ45 is the ios thread's, as the coordinator assigned it.
- Handoff 1's export was dated 2026-11-03; it reached the project's files on 2026-11-02 at 23:34 UTC. **Fixed** from the folders' times, read in this session (handoff 1's export and check, handoff 2's export and check), in 1.1 and 1.3.
- Section 1.3's design line, which the B0 session keeps, still showed handoff 1 undelivered and no handoff 2. **Fixed:** handoffs 1 and 2 delivered and checked, kept in the project's files, the counts unchanged; handoffs 3 and 4 reserved for the starter-pack thread's briefs (the coordinator's message there at 03:03 UTC), so the ios thread's next is 5; its Updated line rewritten.
- `.yamllint.yaml` lines 11 to 13 still say the founder pastes every workflow file (two findings). **Answered:** it is CI configuration (guard 1, T58), so this PR can't change it; it is now Next step 6, beside the PR template's comment, for the next CI-configuration PR. In part: the rule it explains, `new-line-at-end-of-file: disable`, still holds for the fallback, where the founder pastes a file and `docs/GITHUB.md` step 5 accepts a missing final line break; only the comment is stale.
- The 03:02 UTC entry's "every rule about workflow files" went further than its grep checked (`.yamllint.yaml` and row 9's wording weren't covered). Corrected here; that entry stays as written (the log is append-only).
- This journal: sections 0.7 and 1.1 (PR #9, In progress, Next renumbered, Design), 1.3's design line, this entry, and PR #9's row in 4.1 with its number and the review. `docs/PROGRESS.md`: FQ45 and the handoff dates.
**Why:** `docs/GITHUB.md` steps 2 to 5 for PR #9.
**Verified:** `grep -rn "goes to you\|can't push\|can't take\|I'll send you\|probably can't\|have been refused\|through the founder\|through me\|been refused\|pasted\|paste" CLAUDE.md README.md docs/GITHUB.md docs/TECH-DESIGN.md docs/MILESTONES.md docs/plans/B0.md .yamllint.yaml .github/`: the hits about workflow files are other sessions refused (`docs/GITHUB.md` "Workflow files", `docs/TECH-DESIGN.md` section 10), the fallback (`docs/GITHUB.md`'s step 1, `docs/plans/B0.md`'s risks) and `.yamllint.yaml`'s comment (Next step 6); the others are about design files, design handoffs, plans and secrets. `git log -G"^Version [0-9]"` on the three documents: PRs #3 and #6 bumped them. The FQ45 card read through the project's messages (option 0, chosen by the founder at 00:58:44 UTC). `ls -la --time-style=full-iso` on `/mnt/project-files/design/handoff-1/` and `handoff-2/`. `python3 tools/ci/journal_check.py --all` and `--branch`, `python3 tools/ci/ci_config_guard.py` and the hook run by hand: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. The new fallback steps in `docs/GITHUB.md` haven't been run: GitHub hasn't refused this session.
**Decisions and questions:** None new. The freeze and every rule around workflow files stay as they were; the fallback is now written for every case a refusal can take.
**Next:** Check `ci` on this commit; done when every job is green. Then section 1.1's Next step 2: PR #9's "Review" and "Ready for the founder".

#### 2026-11-03 03:02 UTC · shared · plan/b0-rulebook-ci · PR none
**Did:** Brought every rule about workflow files in line with what PR #8 showed, at the founder's yes ("yes for the wording fix", 02:53 UTC on 2026-11-03, in the api thread): the session pushes workflow files and merges their PRs itself.
- `CLAUDE.md`: the "Environment" bullet, from "You probably can't push files under `.github/workflows/`" to "You push workflow files yourself": each in its own CI-configuration PR (T58), under a freeze, and sent to the founder only if GitHub ever refuses one; the "Repository layout" line on `.github/`.
- `docs/GITHUB.md`: step 6 records the merge test's result; "Workflow files" rewritten: how this project differs from other sessions; the three rules (each in its own PR under a freeze, thin, checked with `actionlint`, `zizmor` and `yamllint` before the push); "Merge timing" (the freeze; the session's push of a merge of `main` that brings a workflow change is untested, with Update branch and a fresh branch as the fallbacks); and "If GitHub refuses a workflow push", which keeps the five steps for the founder adding a file, no longer pointing at a founder's guide.
- `docs/TECH-DESIGN.md`: section 9's reason for thin workflows (the logic tested and guarded in `tools/ci/`, and a fix there needs no workflow PR and its freeze), and section 10's line on workflow pushes.
- `docs/MILESTONES.md`: B0's CI bullet.
- `docs/plans/B0.md`: section 2's text on merge timing and its `ci.yml` bullet (both tests accepted on 2026-11-03); rows 2, 9, 10b, 10c and 12 ("pushed by me"); the risks; section 3's heading ("The workflow files") and introduction.
- `docs/LIMITATIONS.md`: the workflow row's workaround, and its status with the merge accepted (PR #8, 02:53:40 UTC, `c06edbe`, `ci` green on `main` in run 41568890065), and the one case not yet tried.
- `docs/PROGRESS.md`'s shared section, stale since slice 1: PRs #7 and #8 done, this PR in progress, slice 9 next, FQ45's answer.
- This journal: section 0.5's line on the founder and workflow files (it pointed at a "If the push works" paragraph that is gone); section 1.1; the T58 and T59 rows (`ci` on `main`); this entry; PR #8's row in 4.1 (its last run and its merge) and this PR's row (`to open`).
**Why:** The founder's yes to Next step 4 of 02:45 UTC on 2026-11-03: the rules said the session can't push workflow files, and PR #8 showed it can push and merge them. No rule is relaxed: each workflow is still its own CI-configuration PR (T58) under a freeze (ADR-025), checked by the same three linters, and approved by the founder; the old `docs/GITHUB.md` already said, "If the push works", to push workflow files yourself, still in their own PR.
**Verified:** `grep -rn "goes to you\|can't push\|I'll send you\|probably can't\|have been refused\|through the founder\|through me\|been refused" CLAUDE.md docs/GITHUB.md docs/TECH-DESIGN.md docs/MILESTONES.md docs/plans/B0.md README.md`: four hits, each consistent with `docs/LIMITATIONS.md`: other sessions refused (`docs/GITHUB.md` "Workflow files", `docs/TECH-DESIGN.md` section 10), design files (`docs/TECH-DESIGN.md` section 3) and the fallback if GitHub refuses one (`docs/plans/B0.md`'s risks). PR #8's merge and `main`'s run read back through REST: `gh api repos/beurni2/tadayo/pulls/8` (merged at 02:53:40 UTC as `c06edbe`, head `8450ca8`) and `gh api repos/beurni2/tadayo/actions/runs/41568890065` (success at `c06edbe`); `main`'s protection read back at 03:00 UTC (`ci`, app 15368, enforced for everyone). `python3 tools/ci/journal_check.py --all` and `--branch`, `python3 tools/ci/ci_config_guard.py` and the hook run by hand: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. The session's push of a merge of `main` that brings a workflow change: untested, and the freeze keeps it from arising (`docs/GITHUB.md`, "Merge timing"). FQ45's answer and handoffs 1 and 2 in the project's files are from the coordinator's records, not read in this session.
**Decisions and questions:** `docs/LIMITATIONS.md`'s workflow row (the merge accepted). No ADR: what each workflow PR must be is unchanged; only who pushes it changed, as the rulebook already provided. The freeze stays as ADR-025 has it, though its reason about a merge of `main` is now "untested" rather than "refused"; loosening it would be the founder's call.
**Next:** Check `ci` on this commit; done when every job is green. Then section 1.1's Next step 2: open the PR.

#### 2026-11-03 02:45 UTC · shared · api/b0-ci · PR #8
**Did:** Ran the privacy-and-security-only review `docs/GITHUB.md` step 3 asks for, which PR #8 hadn't had, and a check of PR #8's rewritten description; fixed both.
- The privacy and security review, at `7f3b7a4`: one fresh reviewer given spec 07, 14 and 33, T9 to T12, T53, T58 and T59, ADR-015 and ADR-026; its findings checked by a separate reader. 2 findings, 1 confirmed and 1 in part, both fixed:
  - `tools/ci/ci_steps.py`: one pnpm setting (`scriptShell: /bin/true` or `nodeOptions` in `pnpm-workspace.yaml`) or a root `.pnpmfile.cjs` made every pnpm check pass without running, and neither file is CI configuration to guard 1. `Steps.workspace_packages` now refuses a top-level `pnpm-workspace.yaml` key outside `PNPM_SETTINGS` (`packages` only), and any line it can't read; `Steps.pnpm_settings_problem` also refuses a root `.pnpmfile*`; `install`, the root scripts (`Steps.pnpm`) and the package steps check it before running pnpm. In part: what a script runs and a test's own configuration stay with review, so the T58 row no longer says no test can be switched off.
  - `Steps.tools_tests`: a root `unittest.py` or a `tools/__init__.py` could stand in for the CI tools' tests, because `python3 -m unittest tools/ci/<file>` put the root on the path. Each file now runs through `python3 -I -m unittest discover -s tools/ci -t tools/ci -p <file>`.
- `tools/ci/ci_steps_test.py`, 77 tests, 2 of them opt-in live tests: `PnpmSettingsTest` (every pnpm step runs with the workspace's own settings, and refuses `scriptShell`, `nodeOptions`, `pnpmfile`, `ignoreScripts`, an unknown key, a line that isn't a plain setting, an entry outside the packages list, and `.pnpmfile.cjs` or `.mjs`, without running pnpm); `ToolsTestsStepTest` (the isolated command, and a failing test still failing with a root `unittest.py` and a `tools/__init__.py` that exit 0). The `WORKSPACE` fixture lost its `other:` key, which showed other keys being ignored: they are now refused, which `PnpmSettingsTest` asserts (a stricter rule, T58).
- The description check, at `7f3b7a4`: one fresh reader, its findings checked by a separate reader. 6 findings, 5 confirmed and 1 in part, all fixed: the description said "ready" while this PR's records weren't complete (its "Ready for the founder" was set to "Not yet" at 02:18 UTC, and is filled in only after `ci` is green on this commit, Next step 2); the rulebook PR's list left out `docs/MILESTONES.md` (in the description) and `CLAUDE.md`'s "Repository layout" line (in Next step 4, with `through me` in its grep); one answered alternative missing from the first review's; no risks in "Ready for the founder" (added to the draft; the PR template's comment leaves them out, noted in Next step 4); the privacy-and-security box ticked before that review ran.
- PR #8's description, updated at 02:44 and 02:45 UTC: both new reviews in "Review", the counts, and the privacy-and-security box ticked.
- This journal: section 1.1 (the stage, PR #8's line, the runs, what exists, In progress, Next steps 1 to 4, the CI tools' command); the T58 row (the pnpm settings, the isolated tools tests, what stays with review, run 41563717087) and the T59 row (run 41563717087); this entry; PR #8's row in 4.1, whose answers are now in the description.
**Why:** `docs/GITHUB.md` step 3 (a privacy and security reviewer for anything touching the database or the workflow's security) and steps 4 to 6.
**Verified:** `python3 -m unittest tools/ci/ci_steps_test.py`: 77 tests OK, 2 skipped, on Python 3.13 and 3.12; with `CI_STEPS_LIVE_POSTGRES=1` against the local cluster made like `ci`'s, 77 OK. Guard 1 16, the journal check 29 and the hook 6, OK. 47 mutations in scratch copies, each caught by a failing test: the 38 of the earlier entries (one of them now targeting the isolated command) and 9 new (the settings allowlist, the pnpmfile check, `-I`, `discover` replaced by a plain path, `install` and the root scripts calling pnpm unchecked, the package steps' check, entries outside the packages list, a list entry starting with `-`). On this branch with Node 26.13.0 and pnpm 12.16.1: `install`, `lint`, `typecheck`, `format`, `copy-lint`, `openapi`, `unit`, `web`, `db-tests`, `privacy`, `swift`, `tools-tests` (the four files, OK through the isolated command) and `ratchet` exit 0. In a scratch pnpm 12.16.1 workspace: `script-shell`, `node-options` and `shell-emulator` in `.npmrc`, and `NPM_CONFIG_SCRIPT_SHELL`, don't change a failing script's exit 1. `python3 tools/ci/journal_check.py --all` and `--branch`, and `python3 tools/ci/ci_config_guard.py`: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. Whether pnpm reads settings from anywhere else in the repository than `pnpm-workspace.yaml` and a root pnpmfile: pnpm 12's documentation wasn't read for it; `.npmrc` was tested.
**Decisions and questions:** None new. Within T58, the pnpm settings are guarded by an allowlist in `tools/ci/` rather than by adding `pnpm-workspace.yaml` to guard 1's paths, which would be the founder's call (`docs/TECH-DESIGN.md` section 9).
**Next:** Check `ci` on this commit; done when every job is green. Then section 1.1's Next step 2: fill in PR #8's "Ready for the founder" with this head and its run.

#### 2026-11-03 02:03 UTC · shared · api/b0-ci · PR #8
**Did:** Fixed PR #8's third independent review, of `f611024..9748d0a` (ADR-026's build and the second review's fixes; `docs/GITHUB.md` step 5, since those fixes changed a lot): two fresh reviewers (the code, the records), each finding checked by a separate reader; 10 findings, 7 confirmed and 3 confirmed in part, all fixed.
- `tools/ci/ci_steps.py`: `Steps.present_targets`, which the ratchet reads, refuses a workspace package without a `name` or with another package's `name`, so the ratchet fails with "can't read the targets": two packages sharing a name could each lose a script the other kept, unseen, and a nameless package was keyed by its directory, so moving it failed. `Steps.manifests` refuses a `package.json` that isn't a JSON object, or whose `scripts` isn't one. The docstring says so.
- `tools/ci/ci_steps_test.py`, 71 tests, 2 of them opt-in live tests: `PackageScriptStepsTest.CASES` names the documented scripts again (`openapi:check`, `test`, `build`, `test:db`, `test:privacy`). `9748d0a` had derived it from `TARGETS`, which tested `TARGETS` against itself and dropped the pin on the names later slices build to: a weakened test (T58), now restored, with `TargetsTest.test_the_package_steps_look_for_the_documented_scripts` tying the list to `TARGETS`. `RatchetTest`: two packages with one name, a package without a name, a manifest that isn't an object.
- `docs/LIMITATIONS.md`: the row on the session's own cluster stops the server with `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl ... stop"`, since `pg_ctl` isn't on root's path and refuses to run as root.
- This journal: section 0.7 (ADR-026, and the founder's choice of 01:26 UTC); section 1.1 (the stage, PR #8's line, the test and mutation counts, In progress, Next steps 2 and 4, the database recipe's pointer to `docs/LIMITATIONS.md` by subject, the ratchet's names); the T58 row (every package named, run 41561641059) and the T59 row (the `postgres` job of run 41561641059, the first run with ADR-026's database); this entry; PR #8's row in 4.1.
- Corrections to the 01:42 UTC entry: its "67 tests and 2 opt-in live ones" means 67 tests, 2 of them opt-in live tests (65 run and 2 skipped without the opt-in); its "Every `ci_steps.py` step run for real" means the 16 steps it lists, and `setup-pnpm` and `verdict` ran only on GitHub (run 41561641059); its "This journal" list left out section 0.7, which ADR-026's approval changed and this commit brings up to date. Its section 1.1 said "every finding fixed or answered" while the answers weren't yet in the PR's description, and its Next went from `ci` to the description without this review; this review was then run.
**Why:** `docs/GITHUB.md` steps 4 and 5: every finding fixed or answered, in a commit that records the review.
**Verified:** Python 3.13 and 3.12: `python3 -m unittest tools/ci/ci_steps_test.py`: 71 tests OK, 2 skipped; with `CI_STEPS_LIVE_POSTGRES=1` against the local PostgreSQL 16.15 cluster made like `ci`'s, 71 OK, and no role left after (`pg_roles` count 0 for the five names). Guard 1 16 OK, the journal check 29 OK, the hook 6 OK. 38 mutations in scratch copies, each caught by a failing test: the 32 of the 01:42 entry, and 6 new (the duplicate-name check, the missing-name check, the checks that a manifest and its `scripts` are objects, `TARGETS` naming `openapi:never` or `build:web`). On this branch: `python3 tools/ci/ci_steps.py ratchet` passed ("each of the 1 target(s) on main at 674b226a047f is still here or retired"), and `unit` exit 0. `ci` run 41561641059 at `9748d0a`: `node`, `postgres`, `swift`, `tools`, `guards` and `ci` all `success`; the `postgres` job on Postgres 17.11 printed "`postgres` is made as Supabase makes it, not a superuser", and `guards` printed "ci: ratchet: passed". `python3 tools/ci/journal_check.py --all` and `--branch`, and `python3 tools/ci/ci_config_guard.py`: exit 0.
**Not verified:** This commit on GitHub: `ci` runs on its push. PR #8's description is still the one of 00:21 UTC; it is rewritten after this commit (Next).
**Decisions and questions:** `docs/LIMITATIONS.md`: the cluster row's stop command. No new ADR or FQ.
**Next:** Check `ci` on this commit (`gh api "repos/beurni2/tadayo/actions/runs?head_sha=<sha>" --jq '.workflow_runs[] | [.id, .conclusion] | @tsv'`); done when every job is green. Then section 1.1's Next step 2, the PR's description.

#### 2026-11-03 01:42 UTC · shared · api/b0-ci · PR #8
**Did:** Built ADR-026, which the founder chose on the api thread's decision card at 01:26 UTC ("Yes, add it to PR #8"), and fixed or answered PR #8's second independent review: three fresh reviewers (the workflow and ADR-026, the scripts, the records), each finding checked by a separate reader; 10 findings, 5 confirmed and 5 confirmed in part.
- ADR-026 (`docs/DECISIONS.md`, now `approved`): `.github/workflows/ci.yml`'s `postgres` service is made with `POSTGRES_USER: supabase_admin` and `POSTGRES_DB: postgres`, and its health check asks as `supabase_admin`. `tools/ci/ci_steps.py` `Steps.db_bootstrap` runs `SUPABASE_SQL` as `supabase_admin` in one statement list: `anon`, `authenticated` and `service_role` without login and inheriting (Supabase's migration `20230529180330_alter_api_roles_for_inherit.sql`), `service_role` bypassing row-level security; and `postgres` as Supabase's image makes it (`migrations/db/migrate.sh`, `10000000000000_demote-postgres.sql`, `20250605172253_grant_with_admin_to_postgres_16_and_above.sql`): not a superuser, owner of the database `postgres`, `GRANT ALL ON DATABASE`, and the API roles, `pg_monitor`, `pg_read_all_data` and `pg_signal_backend` with the ADMIN option. Each role is made with a plain `CREATE ROLE`, so a role already there fails the step. Connected as `postgres`, the step then reads `rolsuper` and fails unless it is `f`, before it looks for `db/bootstrap.sql` and runs it as `postgres`.
- The ratchet keys a script target by the package's `name` in its `package.json`, so one package losing a script another still has fails; a directory moved with its name kept still passes. A target can go only through `RETIRED_TARGETS`, changed in a CI-configuration PR of its own (T58). `TARGETS` is the one source: each step reads its script or file from it (`targets_of`), and `PackageScriptStepsTest.CASES` is derived from it. The workspace reader globs relative to the root (`glob.glob(pattern, root_dir=...)`), so a root holding `[`, `*` or `?` is read as a path.
- `tools/ci/ci_steps_test.py`, 67 tests and 2 opt-in live ones: `TargetsTest`; `DatabaseStepsTest` for ADR-026 (the URLs, the SQL as Supabase's image has it with no `IF NOT EXISTS`, the order of the commands, refusing a superuser or no answer, the file run as `postgres`); `SupabaseSqlLiveTest` (the roles, the database's owner and the ADMIN memberships read back inside a rolled-back transaction, and the PG16+ "must be able to SET ROLE" failure shown as `postgres`); `RatchetTest` (a renamed script, one package losing a script another keeps, a moved script failing unless retired, a moved directory, file targets); `WorkflowTest` matching the `ci` job's own `if: always()` at the job's indentation through `read_ci_job`, and the service made like Supabase's; `WorkspaceTest` with a root named `odd [x] *`. The roles' tests changed because they asserted Supabase's old attributes (`NOINHERIT`, before its 2023-05-29 migration), not to make code pass.
- `docs/LIMITATIONS.md`: a row of 2026-11-03: the session's cluster can't stand in for `ci`'s, because its first role is `postgres`; a server made with `initdb --username=supabase_admin` under `/var/lib/postgresql/` can, and the scratchpad can't hold it (the `postgres` user can't read it).
- This journal: the T53 row's note, the T58 row (per package, `RETIRED_TARGETS`), the T59 row (`built`, CI side only), section 1.1 (Next steps 1 to 6, the database recipe, the known limits), this entry and PR #8's row in 4.1.
- Correction to the log: the 00:50 UTC entry says `pg_roles` showed `anon`, `authenticated` and `service_role` "without login or inheritance", and calls them made "as Supabase has them". Supabase's three roles inherit since its 2023-05-29 migration; from this commit `ci` makes them so.
**Why:** The founder's choice on ADR-026, and `docs/GITHUB.md` steps 4 and 5: every finding fixed or answered.
**Verified:** Python 3.12: `python3 -m unittest` on each `tools/ci/*_test.py`: guard 1 16 OK, the steps 67 OK with 2 skipped, the journal check 29 OK, the hook 6 OK; with `CI_STEPS_LIVE_POSTGRES=1` against a PostgreSQL 16.15 cluster made like `ci`'s service (`initdb --username=supabase_admin`, port 5432), the steps 67 OK with none skipped, and no role left after (`pg_roles` count 0 for the five names). 32 mutations in scratch copies of `tools/ci/` and `ci.yml` (the superuser check, the owner, `INHERIT`, the file run as `supabase_admin`, `RETIRED_TARGETS`, the package's name in the key, the root-relative glob, a `TARGETS` name, `IF NOT EXISTS`, the ADMIN grants, `POSTGRES_USER`, the job's `if: always()`, and the first review's 16), each caught by a failing test. Every `ci_steps.py` step run for real against that cluster with Node 26.13.0 and pnpm 12.16.1: `install`, `lint`, `typecheck`, `format`, `copy-lint`, `unit`, `openapi`, `web`, `db-bootstrap`, `db-tests`, `privacy`, `swift`, `tools-tests`, `ratchet` and `guards` exit 0; `db-check` refuses 16, as it should. `db-bootstrap` with a `db/bootstrap.sql` written as slice 4 might naively write it fails with `must be able to SET ROLE "tadayo_app"`; with `GRANT tadayo_app TO postgres;` first it passes and `app` is owned by `tadayo_app`; a second run fails loudly (`role "anon" already exists`). `ci.yml`: `actionlint`, `yamllint -c .yamllint.yaml` and `zizmor --offline --persona pedantic`, no findings. `python3 tools/ci/ci_config_guard.py`, `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** This commit on GitHub, with Postgres 17.11 running `SUPABASE_SQL`: `ci` runs on its push. Whether hosted Supabase projects carry settings that aren't in the supabase/postgres repository: the first `ops` bootstrap on `dev` shows it. PR #8's description still says what it said at 01:03 UTC; it is rewritten next, so the second review's records finding (the answers said to be "in the PR") is fixed only once that is done.
**Decisions and questions:** ADR-026 approved and built. `docs/LIMITATIONS.md`: the row above. Answered rather than taken, to go in the PR: `typecheck` in `TARGETS` (it is slice 1's root script, and `pnpm -r run typecheck` wouldn't close the gap, since pnpm skips packages without the script). No new FQ.
**Next:** Check `ci` on this commit (`gh api "repos/beurni2/tadayo/actions/runs?head_sha=<sha>" --jq '.workflow_runs[] | [.id, .conclusion] | @tsv'`); done when every job is green and the `postgres` job's `db-bootstrap` log says "`postgres` is made as Supabase makes it, not a superuser".

#### 2026-11-03 01:03 UTC · shared · api/b0-ci · PR #8
**Did:** Fixed or answered PR #8's independent review: four fresh reviewers (the scripts, the workflow, the plan, the records), each finding checked by a separate reader; 21 findings, 20 confirmed in whole or part, which come to 18 problems.
- `tools/ci/ci_steps.py`: the ratchet (`Steps.ratchet`, step `ratchet`, run by `guards` as a third guard): with `TARGETS` listing each later target, a branch fails when a target present where it left `main` (`git merge-base origin/main HEAD`, checked out in a scratch worktree) is missing from it, so a step can't switch itself off by passing empty (T58); a script may move between packages. The package steps run `pnpm -r run <script>` without `--if-present`, so pnpm fails if it finds no package with the script; the workspace reader refuses `**` and `package.yaml` or `package.json5`, which pnpm reads differently. `db-tests` and `privacy` run one package at a time (`--workspace-concurrency=1`): every package gets the same database. `db-bootstrap` runs Supabase's roles' SQL on every run, before looking for `db/bootstrap.sql`, so Postgres 17 runs it now. `tools-tests` runs each file through `python3 -m unittest`, which fails a file that runs no test. The docstring says all of it.
- `tools/ci/ci_steps_test.py` (56 tests): `RatchetTest` (9, on scratch clones), `WorkflowTest` (the final `ci` job needs every other job in `ci.yml`, both ways, and has `if: always()`; it fails if it can't read them), the swift step with its first package failing, the workspace's refusals and a directory without `package.json`, `GuardsStepTest` with a branch named `api/b0-main`, two real `tools-tests` runs, and the live roles test opt-in only, reading the roles' attributes back. `tools/ci/ci_config_guard_test.py` (16): `main` moving ahead without a merge, and a path git would quote.
- `.github/workflows/ci.yml`: each commit on `main` gets its own concurrency group, so a merge's run is never dropped while it waits behind another; branches keep only their newest run.
- `tools/ci/toolchain.py`: the Swift pin cites swift.org's release list, which names Xcode 26.6 for 6.3.3.
- `docs/DECISIONS.md`: ADR-026 (proposed), CI runs the bootstrap as a role made like Supabase's `postgres`, number reserved by the coordinator.
- `docs/LIMITATIONS.md`: the workflow push's time (00:17 UTC), the refused hosts' times and a recheck, Docker Hub's 429 as a rate limit rather than a refusal, the Swift pin as read rather than inferred, and Swift 6.3.3 installed in the session.
- This journal: section 0.5 (the founder no longer adds workflow files), 1.1, the T58 row (`tested`, run 41551742269), this entry, and PR #8's row in 4.1.
- Correction to the log: this branch's four entries before this one are headed 00:50, 00:55, 01:05 and 01:10 UTC, and section 1.1's "Updated" line said the same at each, but their commits (`8fc0e10`, `b484f66`, `d5105a7`, `b40d542`) were made at 00:16, 00:16, 00:19 and 00:19 UTC. PR #7's entries headed 23:45 and 23:58 UTC on 2026-11-02 were pushed at 23:36 and 23:41 UTC. Those times were written ahead of the clock. From this entry on, each time comes from `date -u` just before staging; this one was read at 01:03 UTC.
**Why:** `docs/GITHUB.md` steps 4 and 5: every finding fixed or answered, in a commit that records the review.
**Verified:** `python3 tools/ci/ci_steps_test.py`: 56 tests OK, 1 skipped; with `CI_STEPS_LIVE_POSTGRES=1` against the local PostgreSQL 16, the live roles test OK. `python3 tools/ci/ci_config_guard_test.py`: 16 OK. `journal_check_test.py` 29 OK and `journal_hook_test.py` 6 OK, each also through `python3 -m unittest`. Each new test fails against a deliberately broken copy of the code it guards: 16 mutations in scratch copies (the three-dot diff, `-z`, `|=` in `swift`, the `**` refusal, `--if-present` back, `-m unittest` dropped, the ratchet's comparison, its worktree cleanup and its call from `guards`, `on_main`'s equality, the `package.json` check, one package at a time, and four in `ci.yml`: a job left out of `needs`, `if: always()` removed, a new job not needed, `needs` as a block list), all caught. `python3 -m unittest` on a file with only a pytest-style function exits 5 on Python 3.12.3 and 3.13. On this branch, `python3 tools/ci/ci_steps.py` with `unit`, `openapi`, `web`, `db-bootstrap` (the roles' SQL against the local 16), `db-tests`, `privacy`, `swift`, `tools-tests`, `guards` and `ratchet` ("passed: each of the 1 target(s) on main at 674b226a047f is still here"): exit 0. `ci.yml`: `actionlint`, `yamllint -c .yamllint.yaml`, `zizmor --offline` with the default and pedantic personas, no findings. Swift: `swiftly install 6.3.3`, then `swift --version` "Swift version 6.3.3 (swift-6.3.3-RELEASE)" and a new package's `swift test` passed. ADR-026's facts on the local PostgreSQL 16.15, in rolled-back transactions: `ALTER ROLE postgres NOSUPERUSER` refused ("The bootstrap user must have the SUPERUSER attribute"). `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** These changes on GitHub: `ci` runs on this commit's push. ADR-026's build, which waits on the founder. The per-merge concurrency group on `main`, until slice 2 merges.
**Decisions and questions:** ADR-026 proposed, for the founder (a decision card in the api thread). `docs/LIMITATIONS.md`: the rows above. Answered rather than taken, in the PR: the plan reviewer's finding that `ci` making Supabase's roles contradicts the B0 plan's slice 4 row (refuted: ADR-015 says the CI bootstrap makes them, and nothing requires the file to); a ratchet per package and script (a step-level one lets a script move between packages); `pnpm -r ls` as the package list (the reader refuses what pnpm reads differently instead); a `journal_check.py` rule refusing times after their commit (this branch's own four entries would fail it, and the log is append-only). The founder was asked at 00:50 UTC to make `ci` the required check, which `docs/GITHUB.md` asks for at `ci`'s first run.
**Next:** Check `ci` on this commit (`gh api "repos/beurni2/tadayo/actions/runs?head_sha=<sha>"`); done when every job is green and the `guards` log shows the ratchet passing.

#### 2026-11-03 01:10 UTC · shared · api/b0-ci · PR none
**Did:** Added slice 2's PR row to section 4.1 (`to open`), before the PR is opened, as the journal's Rules ask; section 1.1's "Updated" line.
**Why:** The journal's Rules: a PR's row goes in the last commit before the PR opens.
**Verified:** `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** None.
**Decisions and questions:** None.
**Next:** Open slice 2's PR, `ci: the ci workflow, its steps and guard 1`, once `ci` is green on this commit (`gh api -X POST repos/beurni2/tadayo/pulls`). Done when it's open and its independent review is under way.

#### 2026-11-03 01:05 UTC · shared · api/b0-ci · PR none
**Did:** Recorded the one-time push test: GitHub accepted `.github/workflows/ci.yml` from the session, and ran it green. `docs/LIMITATIONS.md`'s workflow-files row now says so: the session pushes workflow files itself, each in its own PR. This journal's section 1.1: the result, `ci`'s first run, the next steps (the founder no longer pastes `ci.yml`).
**Why:** `docs/GITHUB.md`, "Workflow files", "Test it once": the result goes in `docs/LIMITATIONS.md`.
**Verified:** `git push origin api/b0-ci`: `8fc0e10..b484f66`, no refusal. The file's SHA-256 with one final line break: `771fe89a7f836924beb5a31a58bdd63d87a51a503d1b660826d92b38218ead7c`. Run 41551742269 (`gh api repos/beurni2/tadayo/actions/runs/41551742269/jobs`): `node`, `postgres`, `swift`, `tools`, `guards` and `ci` all `success`. Its logs: `node` ran Node v26.13.0 and pnpm 12.16.1 and the domain tests, and said `openapi:check` and `build` aren't here yet; `postgres`'s `db-check` read `170011`, and `db-bootstrap`, `db-tests` and `privacy` passed empty; `swift` passed empty; `tools` ran the four test files (14, 39 with 1 skipped, 29 and 6 tests, OK); `guards`: guard 1 passed and the journal check ran; `ci`: "every job succeeded: guards, node, postgres, swift, tools". `python3 tools/ci/journal_check.py --branch`: exit 0.
**Not verified:** Whether the session can merge a workflow PR: tested at slice 2's merge (ADR-022).
**Decisions and questions:** `docs/LIMITATIONS.md`: the workflow-files row's status. `CLAUDE.md` and `docs/GITHUB.md` still say the session probably can't push workflow files; they change only in a rulebook PR of their own, so slice 2's PR lists it for the founder.
**Next:** Open slice 2's PR and have it reviewed independently (`docs/GITHUB.md` steps 2 and 3). Done when every finding is fixed or answered in a commit that records the review, with `ci` green.

#### 2026-11-03 00:55 UTC · shared · api/b0-ci · PR none
**Did:** Added `.github/workflows/ci.yml`, as written and checked in the previous entry, for the one-time test of whether a cloud session can push a workflow file (`docs/GITHUB.md`, "Workflow files", "Test it once"; the B0 plan's slice 2).
**Why:** The B0 plan's slice 2: `ci.yml`'s first push is that test, and its result goes in `docs/LIMITATIONS.md`.
**Verified:** The file is byte for byte `/tmp/claude-0/wf/ci.yml`, which passed `actionlint`, `yamllint` and `zizmor` (previous entry). Its SHA-256, with exactly one final line break, is in the next entry, with the push's result.
**Not verified:** Whether GitHub accepts the push: this commit is the test.
**Decisions and questions:** None.
**Next:** Push `api/b0-ci`. If GitHub refuses it, `git reset HEAD~1`, keep the file in `/tmp/claude-0/wf/ci.yml`, and commit only a journal entry and a `docs/LIMITATIONS.md` row recording the refusal; if it accepts it, record that. Done when the result is in `docs/LIMITATIONS.md`.

#### 2026-11-03 00:50 UTC · shared · api/b0-ci · PR none
**Did:** Slice 2 of `docs/plans/B0.md`, CI configuration only (T58), before `ci.yml` itself:
- `tools/ci/ci_config_guard.py`, guard 1 (`docs/TECH-DESIGN.md` section 9): a branch that changes `.yamllint.yaml`, `.github/`, `.claude/` or `tools/ci/` changes nothing else but `docs/DECISIONS.md`, `docs/LIMITATIONS.md` and `docs/JOURNAL.md`; compared with `origin/main...HEAD`, renames as both paths, skipped on main, failing without `origin/main`. Tests first, in `tools/ci/ci_config_guard_test.py` (14), on scratch clones: the B0 plan's two cases, each kind of CI configuration, `docs/PROGRESS.md` not a log, deletions, a rename out of `tools/ci/`, a merge of `main`, main by git and by `GITHUB_REF_NAME`.
- `tools/ci/ci_steps.py`, the steps `ci.yml` calls, so the workflow stays thin. A step whose target arrives later finds it and passes empty while it's absent: `openapi` (a package's `openapi:check`, slice 3), `unit` (`test`), `web` (`build`, slice 10a), `db-bootstrap` (`db/bootstrap.sql`, slice 4, after the step makes Supabase's `anon`, `authenticated` and `service_role` as Supabase has them), `db-tests` (`test:db`), `privacy` (`test:privacy`, slice 7), `swift` (`packages/swift/TadayoCore` and `TadayoAPI`'s `Package.swift`, slice 11, in the pinned image). `REQUIRE_TARGETS`, for slice 12, makes each fail instead. Always-present steps: `setup-pnpm` (the version `packageManager` names, nothing else accepted), `install` (frozen), `lint`, `typecheck`, `format`, `copy-lint`, `db-check` (the service's major must be 17), `tools-tests` (every `tools/ci/*_test.py`), `guards` (guards 1 and 2, both run, skipped on main), `verdict` (the final `ci` job: every job in `toJSON(needs)` succeeded). The docstring states the interface later slices build to: script names, `DATABASE_URL` and `DATABASE_ADMIN_URL`, and how `db/bootstrap.sql` is run. Tests first, in `tools/ci/ci_steps_test.py` (39, one live test against a real server when `CI_STEPS_LIVE_POSTGRES=1`).
- `tools/ci/toolchain.py`: Xcode 26.6, Swift 6.3.3, `swift:6.3.3-noble` by digest, Postgres 17, with the evidence for each.
- `.github/workflows/ci.yml` written in `/tmp/claude-0/wf/ci.yml`, not yet in the repository: jobs `node`, `postgres` (a `postgres:17.11` service by digest), `swift`, `tools`, `guards` (full history) and the final `ci` (`if: always()`, `needs:` all five, `verdict`); push on every branch but `evidence`, no `pull_request`; `permissions: {}` at the top and `contents: read` per job; `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 pinned to commit SHAs; no secrets.
- `docs/LIMITATIONS.md`: the simulator row's evidence, and rows for `supabase.com` and `apt.postgresql.org` refused, the session's PostgreSQL 16, and the inferred Swift pin. This journal: section 1.1, the audit row T58.
**Why:** The B0 plan's slice 2, the second of slices 1, 2 and 9 that the api thread builds as the one session (ADR-025), so every later PR has `ci`.
**Verified:** `python3 tools/ci/ci_config_guard_test.py`: 14 tests OK. `python3 tools/ci/ci_steps_test.py`: 39 tests OK, 1 skipped; with `CI_STEPS_LIVE_POSTGRES=1` against the local PostgreSQL 16, the live test OK, and `pg_roles` then showed `anon`, `authenticated` and `service_role` without login or inheritance, `service_role` bypassing row-level security. On this branch, with Node 26.13.0 and pnpm 12.16.1, `python3 tools/ci/ci_steps.py` with each step: `install`, `lint`, `typecheck`, `format`, `copy-lint`, `unit` (49 tests) exit 0; `openapi`, `web`, `db-bootstrap`, `db-tests`, `privacy` and `swift` said their targets aren't here yet and exit 0; `tools-tests` ran the four test files, all OK; `verdict` with one successful job exit 0; `db-check` against the local 16 exit 1, as it should. The workflow: `actionlint` 1.7.12, `yamllint` 1.38.0 with `.yamllint.yaml`, and `zizmor --offline --persona pedantic` 1.32.0, no findings. The pins: Docker Hub's API gave the digests of `swift:6.3.3-noble` and `postgres:17.11`; `git ls-remote` and a shallow fetch gave the actions' commits and dates (checkout v7.0.1 of 2026-07-17, setup-node v7.1.0 of 2026-10-07). `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** `ci.yml` on GitHub: it isn't pushed yet. The steps on a runner (Python 3.12, the runner's `psql`, Docker). `db-check` and `db-bootstrap` against Postgres 17. The Swift pin, until slice 9's run.
**Decisions and questions:** `docs/LIMITATIONS.md`: one row's status, three rows added (above). Choices within the plan, listed in the PR: Supabase's roles made by `ci`, not by `db/bootstrap.sql`, so the bootstrap is the same file `ops` runs on `dev`; the full checkout only where the guards need it; no dependency cache, so no cache can be poisoned. No ADR or FQ.
**Next:** The one-time push test: copy `/tmp/claude-0/wf/ci.yml` to `.github/workflows/ci.yml`, commit it with its journal entry, push (`docs/GITHUB.md`, "Test it once"). Done when the result is recorded in `docs/LIMITATIONS.md`.

#### 2026-11-02 23:58 UTC · shared · api/b0-workspace · PR #7
**Did:** Recorded and acted on PR #7's independent review (one fresh reviewer, 10 findings).
- Fixed: `package.json` pins vitest 5.0.5 and `pnpm-lock.yaml` was rebuilt, so `pnpm-workspace.yaml` no longer carries the `minimumReleaseAgeExclude` that pnpm 12 had added for vitest 5.1.0, published hours earlier; `pnpm-workspace.yaml` adds `tests` and `tools/ops`, each an empty package with its `tsconfig.json` (`@tadayo/tests`, `@tadayo/ops`), so slices 4 to 10a reach `pnpm -r --if-present` and ESLint's project service without a root-file change; `.prettierignore` skips `tools/ci/` only. In the copy lint: `extract.ts` reads `label`, `aria-description`, `aria-roledescription`, `aria-valuetext` and `aria-placeholder` too, and decodes `.strings`' `\U0021` escapes; `rules.ts` catches `﹗`, `⁉`, `❗` and `❕`; `cli.ts` reads UTF-16 without a byte-order mark, and skips `design/reference/` only at the top of the repository. Tests added for each.
- Answered (in the PR): copy outside string files (scripts, Info.plist keys, push text, SwiftUI literals not yet in a catalog) isn't read; written into the T41 to T43 audit rows, so the slice that brings each surface adds its file kind. Keys are linted as copy, which could flag a key like `home.sent.title`: kept, since such a key is renamed and the trial is English-only. "Sent" refused in every form, which would block book p46's "copies already sent to other apps" once external sharing is built: kept strict, flagged to the founder.
- This journal: section 1.1, the audit rows T41 to T43, PR #7's row in section 4.1.
**Why:** `docs/GITHUB.md` steps 3 to 5: every finding fixed or answered in a commit that records the review.
**Verified:** `pnpm install` (lockfile rebuilt; no release-age error); `pnpm test`: 3 files, 49 tests passed; `pnpm lint`, `pnpm typecheck` (now 7 packages), `pnpm format:check` and `pnpm copy-lint` exit 0; `pnpm -r exec pwd` lists `tests` and `tools/ops`. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0. The hook run by hand with the journal staged: exit 0.
**Not verified:** `ci`, which arrives in slice 2.
**Decisions and questions:** None new; the three answered findings are in the PR's "Review" section.
**Next:** The founder approves PR #7 in the api thread; then squash-merge it at the approved head and check `main`'s tree equals it. Done when PR #7 shows merged.

#### 2026-11-02 23:45 UTC · shared · api/b0-workspace · PR none
**Did:** Slice 1 of `docs/plans/B0.md` and the api thread's environment checks (the plan's section 6).
- The pnpm workspace (`docs/TECH-DESIGN.md` sections 1 and 3): `package.json` (pnpm 12.16.1, Node 26 in `engines`, the scripts `lint`, `typecheck`, `test`, `format`, `format:check` and `copy-lint`; `typecheck` and `test` run each package's own script through `pnpm -r --if-present`, so later slices add theirs without touching `tools/ci/`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc` (26), `.gitignore`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` so Node 26 runs the `.ts` files as they are), `eslint.config.js` (ESLint 10, typescript-eslint's `strictTypeChecked`), `.prettierrc.json` and `.prettierignore` (the documents, design references and CI configuration keep their own form). The empty packages `@tadayo/domain` (`packages/domain`), `@tadayo/contracts`, `@tadayo/api` (`services/api`), `@tadayo/worker` (`services/worker`) and `@tadayo/web` (`apps/web`).
- The copy lint (T41 to T43; `docs/MILESTONES.md`, B0), in `packages/domain/src/copy/`: `rules.ts`, whose `lintString` refuses T41's words (dressing room, edition, publication, quota, and "Sent" in every form, so a drop is never "Sent"), the gendered pronouns of T42 (he, him, his, himself, she, her, hers, herself) and exclamation marks (T43); `extract.ts`, which reads the copy out of `.xcstrings` (keys and every value, not translators' comments), `.strings` (keys and values, UTF-16 too) and `.html` (text and the `alt`, `title`, `aria-label`, `placeholder`, `content` and `value` attributes, not markup, scripts, styles or comments); `cli.ts`, run by `pnpm copy-lint`, over every such file git lists, tracked or new and not ignored, except `design/reference/`, which is never shipped. Tests written first from the rules: each rule with failing and passing strings, each file kind, and the command end to end on a scratch repository.
- `docs/LIMITATIONS.md`: the environment checks' results (below), with two new rows (swiftly, Node 26). `docs/PROGRESS.md`'s shared section. This journal: section 1.1 rewritten, the audit rows T41 to T43.
**Why:** The B0 plan's slice 1, the first of slices 1, 2 and 9 that the api thread builds as the one session (ADR-025), and the coordinator's brief for the api thread: the environment checks first.
**Verified:** Environment, at 23:29 to 23:31 UTC: `curl` through the proxy to `api.supabase.com` (404), `api.fly.io` (404), `api.cloudflare.com` (301), `download.swift.org` (302), `docs.github.com` (302) and `images.unsplash.com` (200), no tunnel refusal. `docker info`: no daemon; `dockerd` started by hand, then `docker info` showed server 29.9.2; `docker run hello-world` and `docker pull postgres:17-alpine` got Docker Hub's 429, and `public.ecr.aws` was refused. `pg_lsclusters`: PostgreSQL 16, stopped. swiftly absent; installed by hand, `swiftly --version` 1.1.2, `swiftly list-available` from Swift 6.4.2. The journal hook: on a scratch branch never pushed, `git commit -m "hook test 2"` without the journal staged made a commit, so the hook didn't fire; `python3 -I tools/ci/journal_hook.py` fed the same command refused it (exit 2); the scratch branch was deleted. The CodeRabbit skills and agents still listed. Slice 1, with Node 26.13.0 and pnpm 12.16.1: `pnpm install`; `pnpm test`, 3 files, 43 tests passed; `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm copy-lint` ("0 string file(s), 0 finding(s)") exit 0. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0. The hook run by hand with the journal staged: exit 0.
**Not verified:** That `ci` runs these checks: `ci.yml` comes in slice 2. Why the journal hook doesn't fire: the cause isn't visible from the session (`docs/LIMITATIONS.md`). The copy lint on real string files: none exists until the app's catalogs (slice 11) and the web pages (slice 10a).
**Decisions and questions:** `docs/LIMITATIONS.md`: the CodeRabbit, journal hook, refused hosts and Docker rows updated with what this session saw; rows added for swiftly and Node 26. Choices within the plan, listed in the PR: "Sent" refused in every form, not only as a drop state, since T41 and `CLAUDE.md` say "never Sent" (sign-in copy says "We emailed a code"); the copy lint lives in `@tadayo/domain`, as `docs/TECH-DESIGN.md` section 8 lists it with the domain tests; TypeScript 6.0, since typescript-eslint 8.72 supports TypeScript below 6.1 and TypeScript 7 has no ESLint support yet.
**Next:** Open slice 1's PR, `chore: the pnpm workspace and the copy lint`, and have it reviewed by a fresh subagent (`docs/GITHUB.md` step 3). Done when every finding is fixed or answered in a commit that records the review.

#### 2026-11-02 23:10 UTC · shared · plan/b0-lanes · PR #6
**Did:** Merged `main` into `plan/b0-lanes` after PR #5 merged (`501179a`, the journal rebuilt from both whole versions), recorded PR #6's independent review, and fixed what it confirmed:
- The approval: `docs/GITHUB.md` step 6 and "What GitHub enforces", and ADR-025, now say the founder approves a PR in the thread that reported it, and that a message from another Claude, the coordinator's included, isn't an approval even when it quotes or attaches the founder's words. `CLAUDE.md`'s "Ask me first" and a new MILESTONES bullet, "The founder's yes", say the same for every step on that list.
- When the lanes start: "until the ios thread starts", not "until the lanes start", in `CLAUDE.md` ("The journal"), the journal's Rules, block 1.2 and MILESTONES' journal bullet, so the api thread writes slices 1, 2 and 9 as the one session (lane `shared`).
- Gate 0 is a joint gate (`CLAUDE.md` "Order of work", MILESTONES "Joint gates", the B0 plan's section 7), and the lane that finishes second puts the report together.
- `docs/GITHUB.md` step 3 gives the reviewer the branch's lane and asks it to check that the branch kept to it; step 1, `CLAUDE.md` and the journal's Rules say how a conflict in the shared block and section 0 is rebuilt.
- MILESTONES "Lanes": `dev` is claimed and released through the coordinator, with no merge by the other thread meanwhile, handoff 1's delivery included, and S6's `apps/web` merge as the one exception; the `evidence` reset needs the founder's yes and no pushes meanwhile; the B0 plan's other sections are the api thread's; each spike is run by the thread its branch names, and S6 by the api thread.
- The B0 plan: the Supabase URL and publishable key go to whichever thread asks first, which passes them on; Resend stays due at slice 8; slice 11b starts before 10a merges or else after 10c; a workflow fix lets the other thread finish or set aside its branch, as MILESTONES says; slice 9's skip is a `tools/ci/` script that slice 12 makes fail instead (also `docs/TECH-DESIGN.md` section 9 and ADR-025); slice 9's row no longer claims 15 macOS minutes for a run that fails at XcodeGen.
- The state, `docs/PROGRESS.md`'s shared section and section 4.1's row brought up to date after PR #5's merge.
**Why:** `docs/GITHUB.md` step 3: four fresh reviewers (the rulebook's consistency, the B0 plan's order, safety and security, the records and the PR's body), each finding checked by a separate reader, reviewed PR #6 at `b10213c`. They found 29 problems: 24 confirmed, which come to 18, and 5 not confirmed (where reserved numbers are kept, the founder's yes for the `evidence` reset, the freeze's wording twice, and the reservations again), answered in the PR. PR #5 merged at 22:31 UTC, after PR #6 opened, so both PRs' journal and `docs/PROGRESS.md` changes had to be joined.
**Verified:** The fixes were made by a script that asserts each replaced text occurs exactly once (all 38 did), and replaced the B0 plan's set-aside bullet whole. After the merge, both sides' logs are subsequences of the merged log (`journal_check.is_subsequence` over `log_history`), `check_all` finds no problem, and `journal_check.py --branch` passed on `501179a`. Before this commit: `python3 tools/ci/journal_check.py --all` and `--branch`, `journal_check_test.py` (29 tests) and `journal_hook_test.py` (6 tests) pass. A case-insensitive `grep` for "relay" over `CLAUDE.md`, `README.md`, `docs/GITHUB.md`, `docs/MILESTONES.md`, `docs/DECISIONS.md` and `docs/plans/B0.md` finds nothing, so no approval by relay is left.
**Not verified:** As in the 22:26 entry: the rules themselves until two threads run, and the coordinator's part in them; `ios.yml`'s skip, which slice 9 builds. No `ci` yet.
**Decisions and questions:** Corrections to the 22:26 entry, whose text stays as it is. Its approval sentence let the founder's words be relayed to a PR's thread, which widened ADR-022 beyond the proposal the founder chose ("You approve a PR in its own thread"), so its "no rule loosened" was wrong; the relay is removed, and with that no rule is loosened. Its Verified field said the grep also found the phrases in old log entries; it found them only in ADR-025's Context and Alternatives and in that entry's own Verified line. Its Did said the key requests for both Supabase and Resend moved; only Supabase's URL and publishable key move, and Resend stays at slice 8. Its "until the lanes start" is now "until the ios thread starts". No new FQ.
**Next:** The founder approves PR #6 in this thread; then squash-merge it at the approved head through REST (`docs/GITHUB.md`, step 6) and check that `main`'s tree equals that head. Done when PR #6 shows merged.

#### 2026-11-02 22:26 UTC · shared · plan/b0-lanes · PR none
**Did:** Recorded the founder's choice to run B0 in two threads as ADR-025 (`docs/DECISIONS.md`), and carried it into the rulebook in a PR of its own:
- `CLAUDE.md`: "Order of work" (the api and ios lanes start inside B0, each in its own thread: the api thread alone until `ios.yml` has run green, the B0 plan's slice 9, then the ios thread beside it); "The journal" (the shared block is the one session's until the lanes start, then the api lane's, and each lane edits the lines about its own work); the approval sentences (the founder approves a PR in the project, in the thread that reported it).
- `README.md` and `docs/GITHUB.md`: the same approval sentence (introduction, "What GitHub enforces", step 6, "Never"); step 6 adds that a message from another Claude isn't an approval; "Merge timing" now needs no branch meant to merge in either lane, opened as a PR or not, and no new branch until the workflow PR has merged. Version 1.2.
- `docs/MILESTONES.md`: its introduction, and "Lanes" with a new list, "How the two threads start and stay in step": the start, each session checking itself, a freeze before every workflow PR, one merge at a time tested with the other's work, numbers that never collide, one thread at a time on `dev`, the shared `evidence` branch, the shared files in B0, and the journal. Version 1.2.
- `docs/TECH-DESIGN.md` section 9: the `ios` row's first job on Linux skips the rest when the branch has no `apps/ios/project.yml`. Version 1.1.
- `docs/plans/B0.md`: its opening lines; the key requests in section 1.2 (Supabase's URL and publishable key, Resend), now due at slice 8 or slice 11's sign-in, whichever comes first; section 2's order paragraph ("Two threads"), "of either thread" for workflow PRs, the set-aside rule covering the other thread's branch, slice 9's row moved after slice 2 with its skip and its start ("2 merged; nothing else open"), and the "Starts when" of slices 3, 10a and 11; section 3's `ios.yml` row; section 4's one thread at a time on `dev`; section 6's hook check repeated by each thread.
- `docs/PROGRESS.md`'s shared section, and this journal's rules, sections 0.5 (who does what, and the project's coordinator), 0.7 (ADR-025), 1.1, 1.2's and 1.3's opening lines, this entry and section 4.1's row.
**Why:** On 2026-11-02 at 21:56 UTC the founder asked, through the project's coordinator, whether more task windows could work safely, securely and in step to speed up development. Claude Code wrote a proposal (in the project's files, `plans/b0-parallel-threads.md`), had it checked by two independent critics (the order, and safety), folded in the 20 problems they found, and put it to the founder on a decision card. At 22:23 UTC the founder chose its recommended option, two threads from slice 9. The rulebook documents change only in their own PRs (`docs/MILESTONES.md`, "Lanes"), so this PR comes before any thread starts.
**Verified:** The edits were made by a script that asserts each replaced text occurs exactly once in its file (all 35 did); slice 9's row was moved whole. `grep -rn "after Gate 0\|until Gate 0\|your lane has no\|branch of mine"` over `CLAUDE.md`, `README.md`, `docs/*.md` and `docs/plans/*.md` finds them only in ADR-025's own context and in old log entries. `python3 tools/ci/journal_check.py --all` and `--branch`, `python3 tools/ci/journal_check_test.py` (29 tests) and `python3 tools/ci/journal_hook_test.py` (6 tests) pass (run before this commit). `tools/ci/journal_check.py` already accepts the `api` and `ios` lanes and checks each lane's own "Updated" line (its `LANE_BLOCKS`), so no change to `tools/ci/` is needed.
**Not verified:** The rules themselves are untested until two threads run. Whether the project's coordinator can carry the freezes and the number reservations as written is known only once it does. `ios.yml`'s skip is a plan for slice 9, not built yet. The PR's independent review hasn't run yet.
**Decisions and questions:** ADR-025, decided by the founder. Its approval sentence reads ADR-022's "the project's thread" as the thread that reported the PR, or the founder's own words relayed to it; it is listed in the PR for the founder. No new FQ; no rule loosened: each workflow freeze now covers both threads, which is stricter than "your lane".
**Next:** Open the PR for `plan/b0-lanes` through REST, then have it reviewed by fresh reviewers that haven't seen the work (`docs/GITHUB.md`, step 3). Done when every finding is fixed or answered and recorded here.

#### 2026-11-02 22:05 UTC · shared · ios/b0-handoff-1-requested · PR #5
**Did:** Recorded PR #5's independent review and fixed what it confirmed.
- The review: a workflow of two fresh reviewers (the inventory and the plan; the records, the PR's body and privacy), each finding checked by a separate reader. 6 findings, all confirmed, which come to 4 problems, all fixed in this commit or the PR's body.
- `design/reference/INVENTORY.md`: `G06-no-club`'s stage from B1 to B0, since slice 11 builds it with `F01-no-club` and `M01-no-club` (the plan's slice 11; MILESTONES' B0 "The three tabs with truthful empty states").
- `docs/plans/B0.md` section 5.2: says the founder was asked, with the brief, to attach the export in the project's thread when it's done, where "Where it goes" says to keep it in Files until asked; Claude Code holds it in the project's files until the rest of "Where it goes" is met.
- This journal: the state 1.1 (the times, PR #5's state, and step 2 of "Next, in order", which no longer holds steps 3 and 4), 1.3's "Updated" line, and PR #5's row in 4.1. The PR's body: the review, the departure above, and "Ready for the founder".
- A correction to the 21:52 entry, whose text stays as it is because the log is append-only: PR #4 merged at 20:36 UTC (GitHub's `merged_at`, 20:36:31), and Claude Code gave the founder handoff 1's brief at 20:38 UTC (the thread's message), not 20:37 and 20:40.
**Why:** `docs/GITHUB.md`: a fresh subagent reviews every PR, and every finding is fixed or answered before the founder is told it's ready.
**Verified:**
- Each fix applied by a script that asserts each old text occurs exactly once.
- The inventory's trial table, counted by a script: 149 rows, 50 `received`, 1 `received (reference only)`, 17 `requested 1`, 81 `missing`; the B0 rows are now the five A02 and A03 states and the three no-club states.
- `gh api repos/beurni2/tadayo/pulls/4 --jq .merged_at`: 2026-11-02T20:36:31Z.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** None beyond the 21:52 entry's.
**Decisions and questions:** A departure from the approved plan, listed for the founder in PR #5: handoff 1's export comes back attached in the project's thread as soon as it's done, as Claude Code asked when it sent the brief, instead of staying in the founder's Files until asked; when it enters the repository is unchanged. `G06-no-club`'s stage follows the plan's slice 11.
**Next:** The founder's approval of PR #5 in the project's thread, then the merge (this journal's state, "Next, in order").

#### 2026-11-02 21:52 UTC · shared · ios/b0-handoff-1-requested · PR #5
**Did:** Set design handoff 1's 17 states to `requested 1`, because the founder has started it in Claude Design.
- `design/reference/INVENTORY.md`: `A02-email`, `A02-code`, `A02-code-error`, `A02-age`, `A03-profile`, `G01-invite-people`, `G01-pending`, `G02-expired`, `G02-changed`, `G02-full`, `G02-web`, `G03-waiting`, `G03-declined`, `G05-members`, `G06-no-club`, `F01-no-club` and `M01-no-club` from `missing` to `requested 1`; the counts: 149 trial states, 51 with a render, 17 requested, 81 missing.
- `docs/plans/B0.md` section 5.2: when and how the brief was sent, and that it was started.
- `docs/PROGRESS.md`'s shared section: PR #4 done, handoff 1 in progress. This journal: the state 1.1, the design line in 1.3, and PR #5's row in 4.1.
**Why:** `docs/DESIGN-HANDOFF.md` and the inventory track a handoff's states as `requested <n>` once the founder has started it (ADR-020; the plan's F6 and section 5.2). After PR #4 merged at 20:37 UTC, Claude Code gave the founder handoff 1's brief at 20:40 UTC, with `brand-tokens.md`, `brand-components.png` and handoff 0's PDF from `main` (copies in the project's files, `design/handoff-1/`); the founder wrote at 21:50 UTC that it's started.
**Verified:**
- The 17 states are exactly the ones the brief names (`docs/plans/B0.md` section 5.2, its code block); each row was `missing` before, a script asserted it, and nothing else in the table changed.
- The inventory's trial table, counted by a script: 149 rows, 50 `received`, 1 `received (reference only)`, 17 `requested 1`, 81 `missing`.
- The copies given to the founder: `brand-tokens.md` and `Tadayo_Brand_Implementation_Handoff.pdf` equal `main`'s byte for byte; `brand-components.png` has the same pixels as `main`'s (`compare -metric AE`: 0), though the project's files store it re-encoded.
- After PR #4's merge, `git diff e5b647f origin/main` is empty.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That Claude Design reads the linked repository, or which files the founder attached; the export will show.
**Decisions and questions:** None.
**Next:** Push, open PR #5 and have it reviewed independently (this journal's state, "Next, in order").

#### 2026-11-02 12:24 UTC · shared · ios/b0-brand-ref · PR #4
**Did:** Recorded the check of the first review's fixes on PR #4 (`a16bf78..5ca377c`), fixed what it confirmed, and marked PR #4 ready.
- The check: a workflow of two fresh reviewers (the fixes against the findings and the sources; the records and the PR's body), each finding checked by a separate reader. 13 findings, 12 confirmed, which come to 8 problems, all fixed in this commit or the PR's body; the 1 not confirmed is answered in the PR.
- `docs/QUESTIONS.md` FQ45: the default now keeps the app and the next brief on `design/reference/brand/` until the founder answers, as ADR-006 says; building from what handoff 1 changes becomes Claude Code's proposal, with the departure from ADR-006 and `docs/DESIGN-HANDOFF.md` it would make.
- `design/reference/brand/brand-tokens.md`: the sentence `5ca377c` added on line 3, pointing to the inventory, removed, so the file holds only what the delivery says; the cover line says again that `brand-tokens.json`'s "coverAssignment" counts the slots 0 to 5 (its keys are `cover1` to `cover6`).
- `docs/plans/B0.md`: slice 9 pushes to the `evidence` branch, which already exists, instead of creating it.
- This journal: the state 1.1 (PR #4's state, the `evidence` branch under "Branches", the counts of both reviews, readiness tied to the PR's "Ready for the founder" section), 1.3's "Updated" line, and PR #4's row in 4.1. `docs/PROGRESS.md`'s shared section.
- The PR's body: spec 32 in its list, the answer on slice 11b's scope made exact, the check's findings, and "Ready for the founder" filled.
**Why:** `docs/GITHUB.md`, steps 5 and 6: the fixes were checked by fresh reviewers before the founder is told the PR is ready, and the commit that records a review carries its fixes and its record.
**Verified:**
- Each fix applied by a script that asserts each old text occurs exactly once.
- `design/reference/claude-design/handoff-0/brand-tokens.json` names its covers `cover1` to `cover6` and `onCover1` to `onCover6`, and only its "coverAssignment" counts "slot 0..5".
- `git ls-remote origin evidence`: head `4f6c991`, holding the eight sheets under `ios/b0-brand-ref/a16bf78/design/`.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** As in the 11:06 entry: the icon on an iPhone; whether iOS accepts the opaque dark icon; the routes "Send to Claude Code on the web" and the upload on GitHub. No `ci` yet.
**Decisions and questions:** FQ45's default changed, as above. Corrections to earlier entries, whose text stays as it is: the 11:59 entry's "Next" named the founder's approval while this check was still to run, and its "Decisions and questions" left out two changed rows: FQ41's default, which now leaves how a former member's drops get their colour to the founder, with Claude Code's proposal and the departure from spec 32 it would make; and `docs/LIMITATIONS.md`'s "no PNG export" row, back to "To confirm". The 11:06 entry's "Decisions and questions" left out its `docs/LIMITATIONS.md` rows: two new (which route brings a delivery to the session; no SVG-to-PDF converter) and two changed (the "no PNG export" row and the app icon's). The state at `5ca377c` said 21 findings were fixed in that commit; two were fixed in the PR's body.
**Next:** The founder's approval of PR #4 in the project's thread, then the merge (this journal's state, "Next, in order").

#### 2026-11-02 11:59 UTC · shared · ios/b0-brand-ref · PR #4
**Did:** Recorded PR #4's independent review and fixed every finding it confirmed.
- The review: a workflow of four fresh reviewers (fidelity of the named files to the delivery; differences against the spec, the book and the invariants; the B0 plan; the records and the PR's body), each finding checked by a separate reader that hadn't seen the work. 25 findings, 21 confirmed, which come to 16 problems, all fixed in this commit or the PR's body; the 4 not confirmed are answered in the PR.
- `design/reference/brand/brand-tokens.md`: now holds only what the delivery says: its table, its own contrast check, the tokens frame's line, the icon's yellow, and its notes as written, with `brand-tokens.json`'s "coverAssignment" quoted in full. Claude Code's measurements and the two pointers to FQ41 moved out, because nothing in `design/reference/brand/` is edited once it's on `main`, and handoff 1 gives this file to Claude Design as the brand.
- `design/reference/INVENTORY.md`: "Text on a cover" carries the measured ratios; a new item for the input border (2.92:1 on surface in light, under the 3:1 a control's boundary needs); the card's status line is built at the metadata role, 13/18, and the card radius at 16, the delivery's named token and spec 24's, where the frames draw about 11 and 14; rows `F01-no-club` and `M01-no-club` (stage B0, missing) added, because handoff 1 now goes before slice 11 and names them. Counts: 149 trial states, 51 with a render, 98 missing.
- `docs/QUESTIONS.md`: FQ41 says spec 32's member list (the "Current eligible roster") can't carry the colour of a former member whose drops stay, and leaves how to the founder, with Claude Code's proposal and the departure it would make; FQ42 is needed by B1, since the invitation page shows the wordmark on `tadayo.app` from then, and asks before committing the boards, as FQ35 does, instead of putting them in `handoff-0/`; new FQ45, where a later handoff's change to the brand goes, with a default.
- `docs/plans/B0.md`: F6, slice 11's row and section 5.2's state count say PR #4 marked handoff 0's rows `received` and added the two no-club rows; section 5.1 says PR #4 goes ahead of slice 11b; handoff 1's brief attaches handoff 0's own PDF when the repository isn't linked, asks for a changed brand asset to come back whole under its handoff 0 title, and says what's built until it answers; section 6's delivery-route check records handoff 0's result.
- `docs/LIMITATIONS.md`: the "no PNG export" row goes back to "To confirm": handoff 0's .zip held PNGs, and its documents were made with python-docx and LibreOffice.
- The PR's body: FQ26's new case, FQ20's answer, the card radius and status line, FQ45, FQ41's and FQ42's changes, and T9, T25, T55 and T57 in its list.
- This journal: sections 0.7 (FQ39 to FQ45), 0.8 (the card radius and status line), the state 1.1, the design line in 1.3 (which still showed handoff 0 unsent and the old counts), and PR #4's row in 4.1. `docs/PROGRESS.md`'s shared section.
**Why:** `docs/GITHUB.md`: a fresh subagent reviews every PR, and every finding is fixed or answered before the founder is told it's ready.
**Verified:**
- Each fix applied by a script that asserts each old text occurs exactly once.
- The inventory's trial table, counted by a script: 149 rows, 50 `received`, 1 `received (reference only)`, 98 `missing`.
- The ratios moved into the inventory, recomputed with WCAG 2's formula: secondaryText on the six covers 4.06 to 4.21:1 light and 1.23 to 1.32:1 dark; inputBorder 3.17:1 on canvas and 2.92:1 on surface in light, 5.93:1 and 4.76:1 in dark. Action as text on canvas, which `brand-tokens.md` no longer holds: 6.43:1 light and 9.57:1 dark.
- `brand-tokens.md`'s quote of "coverAssignment" equals the value in `brand-tokens.json`.
- A correction to the 10:08 entry's privacy line, which said the `.docx`'s properties name only `python-docx` and the PDF's only LibreOffice: `pdfinfo` gives the PDF's author as `python-docx`, its creator as Writer and its producer as LibreOfficeDev; the `.docx`'s `core.xml` names `python-docx` as creator, and its `app.xml`, from python-docx's template, names Microsoft Macintosh Word as the application. None of it is personal data.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** As in the 11:06 entry: the icon on an iPhone, masked, in light, dark and tinted; whether iOS accepts the opaque dark icon; the routes "Send to Claude Code on the web" and the upload on GitHub. No `ci` yet, so no check runs on PR #4.
**Decisions and questions:** FQ45 is new, with a default. The card radius and the status line follow the delivery's named tokens and spec 24, not the frames, until handoff 1 answers. The two no-club rows go in now rather than in slice 11, so every state handoff 1 names has a row when it goes out. FQ42 is needed by B1, not Gate D. The 4 findings not confirmed (FQ40 and the contact sheets; FQ43 and T41; slice 11b's scope; section 0.8's completeness) are answered in the PR.
**Next:** The founder's approval of PR #4 in the project's thread, then the merge (this journal's state, "Next, in order").

#### 2026-11-02 11:06 UTC · shared · ios/b0-brand-ref · PR #4
**Did:** Made the named files of `docs/DESIGN-HANDOFF.md` ("Naming rule") from design handoff 0's delivery, checked them against the brief, compared the frames with the spec, the book and the invariants, and recorded what to build where they differ.
- `design/reference/brand/`:
    - `brand-wordmark.pdf` and `brand-wordmark-dark.pdf`: the delivery's path-only `assets/brand-wordmark*.svg` as vector PDFs (`rsvg-convert -f pdf`), 686.25×217.5 pt, transparent;
    - `brand-icon-1024.png`, `brand-icon-dark-1024.png` and `brand-icon-tinted-1024.png`: the square masters `assets/brand-icon*.svg` at 1024×1024 (Chromium through Playwright), opaque RGB;
    - `brand-components.png`: `frames/brand-components.svg` at 2× (2200×1960);
    - `brand-tokens.md`: the token table of `IMPLEMENTATION.md` copied exactly, with the contrast the delivery checked, what Claude Code measured beyond it, the icon's own yellow and the delivery's note on the tokens.
- `design/reference/screens/`: `H01-open.png`, `H01-open-dark.png`, `F02-upcoming.png` and `F02-upcoming-dark.png`, the frames' SVGs at 786×1704 (393×852 at 2×).
- `design/reference/INVENTORY.md`: the four brand rows and `F02-upcoming-dark` to `received`; `H01-open`, `H01-open-dark` and `F02-upcoming` point at handoff 0's renders, with 2.1's as the layout where no rule decides (FQ40). "Known differences": the 2.1 items handoff 0 fixes say so, and a new item lists where handoff 0's renders depart from a rule or from 2.1's layout, and what is built: the drop's ··· safety menu, F02's back button and person in the header, the Highlight label after the reveal, the club switcher's chevron, the bookmark, the lock glyph without "Locked", the star glyph, the photo radius, members' photos, the avatar fallback on cover2, cover ink, the unnamed sizes and the card radius, the blank-caption card, "Past days", apostrophes, the tab bar, the delivery's notes that reach beyond appearance, and the wordmark and dark icon. Counts: brand 4 of 4 received; 147 trial states, 51 with a render, 96 missing.
- `docs/QUESTIONS.md`: FQ40 (which layout handoff 0's screens set), FQ41 (each sender's cover colour), FQ42 (where the brand's identity boards came from), FQ43 (F02's audience line) and FQ44 (dates on phones set to other regions), each with a default; handoff 0's answer under FQ20 ("Deborah-Anne's pick"); a second case under FQ26 (the rail when a contributor has no day that week).
- `docs/plans/B0.md`: F5 done; slice 11b re-scoped to the icon in the asset catalog and the tokens in `TadayoDesign`, since the reference files go first in PR #4; section 5.1 says when and how handoff 0 arrived; handoff 1's brief (section 5.2) gains the brand questions handoff 0 left open (the avatar fallback on covers, the button's states, unnamed sizes and the card radius, a label on a photograph, the input border on surface, cover1 and the accent, the dark icon's background), the wordmark's clear space, and A01-welcome's wordmark.
- `docs/LIMITATIONS.md`: what Claude Design's export held, the route that worked (attachment in the project's thread, for a PDF and a .zip), the icon row's status, and the SVG-to-PDF tool. `docs/PROGRESS.md`'s shared section. This journal: the state, the audit map's T44 and T46, sections 0.7 and 0.8, PR #4's row in section 4.1, and a row for the comparison sheets in section 4.4.
**Why:** `docs/DESIGN-HANDOFF.md`, "How renders come back", steps 3 to 5: make the named files, check them against the brief, and compare each with the spec, the book and the invariants before anything is built from them, with the differences in the inventory, the journal and the next handoff. Handoff 1 goes out only once `brand-tokens.md` and `brand-components.png` are on `main`.
**Verified:**
- Rendering again from the committed `design/reference/claude-design/handoff-0/` gives the same pixels as the first render (`compare -metric AE`: 0 for each of the eight PNGs).
- Sizes with `identify`: the icons 1024×1024 with no alpha channel, the screens 786×1704, the component sheet 2200×1960. `pdfinfo`, `pdfimages -list` and `pdffonts`: each wordmark PDF is one 686.25×217.5 pt page, the SVG's 915×290 px exactly, with no image and no font. Each PDF drawn back at 915×290 (`pdftocairo -transp`) against Chromium's drawing of its SVG: RMSE 0.5% and 0.8%, edge anti-aliasing only.
- Against Claude Design's own PNG previews in `frames/`: RMSE 0.22% to 0.28% for the icons and 0.69% to 1.10% for the four screens at 1×, 0.82% for the component sheet and 0.92% for the tokens frame, again anti-aliasing; the icons drawn by `rsvg-convert` match Chromium's to the same RMSE, so the previews were drawn the same way.
- The token table in `IMPLEMENTATION.md` equals `brand-tokens.json`, and `brand-tokens.md`'s table equals both (a script compared every value). All 28 of `contrast-checks.json`'s pairs recomputed with WCAG 2's formula: the same ratios, the lowest 4.64:1. Every glyph on a cover or the plaque in the four screens' SVGs is drawn in #182B25: a script found 25 in each H01 frame and 150 in each F02 frame, with no other fill.
- The comparison: a workflow of four fresh readers (the brief; the spec and the invariants; the book's contracts and 2.1's renders; the delivery's own notes), each finding checked by a separate reader, and a completeness critic. 124 findings, 123 confirmed (the one not: whether the feed's next drop shows below the first); many overlap across readers. The critic added 20. The confirmed ones are recorded as the inventory's items, FQ40 to FQ44, FQ20's and FQ26's additions, and handoff 1's brand questions; the ones about later code (the highlight flag only in the author's serializer, the cover colour in the member list and never a drop, the icon's checks on a device) are kept for the slices that build them, in the inventory's items and the questions.
- The inventory's trial table, counted by a script: 147 rows, 50 `received`, 1 `received (reference only)`, 96 `missing`.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** How the icon looks on an iPhone, masked, at 60 and 29 points, light, dark and tinted: slice 11b's TestFlight build. Whether iOS accepts the opaque dark icon as it is (Apple asks for a transparent background on a dark icon); it goes in the asset catalog as delivered, and handoff 1 asks. The routes "Send to Claude Code on the web" and the upload to `design/reference/claude-design/` on GitHub. `OFL.txt` reads "Copyright 2026 The Arimo Project Authors" where the font's own name table says 2020; the delivery is kept as it arrived, and the app doesn't use Arimo.
**Decisions and questions:** FQ40 to FQ44 are new, each with a default that stands until the founder answers. FQ41's default departs from the delivery's note that a departed member's colour is never given to anyone else, which six colours can't keep; FQ43's default takes spec 09's audience line over the render's. Slice 11b is re-scoped (the plan's section 2). The delivery's sentence "These targeted directions supersede conflicting brand examples in the 2.1 book" is read as covering colours, the wordmark, the icon and how components look, not the product's rules or the book's layout contracts.
**Next:** Push the branch, put the comparison sheets on the `evidence` branch, open PR #4, and have it reviewed independently (this journal's state, "Next, in order").

#### 2026-11-02 10:08 UTC · shared · ios/b0-brand-ref · PR #4
**Did:** Unpacked design handoff 0's delivery, as it arrived, into `design/reference/claude-design/handoff-0/` (`docs/DESIGN-HANDOFF.md`, "How renders come back", step 2). It is the .zip the founder attached in the project's thread at 09:56 UTC on 2026-11-02, `Tadayo_Brand_Implementation_Pack.zip` (2,491,305 bytes, SHA-256 `2f862c54b7f482d7a96f2c04fcdb0363647656e23826b0b8b81e964b3659675a`): 37 files, with no folder around them.
- At the top: `IMPLEMENTATION.md` and `README.md`, and the handoff document as `Tadayo_Brand_Implementation_Handoff.docx` and `.pdf` (13 pages).
- `assets/`: the wordmark (`brand-wordmark.svg`, `brand-wordmark-dark.svg`) and the three icon masters (`brand-icon.svg`, `brand-icon-dark.svg`, `brand-icon-tinted.svg`), as paths only; the Arimo font, `Arimo[wght].ttf`, with its licence, `OFL.txt`.
- `brand-tokens.json`, `contrast-checks.json`, `frame-manifest.json` (11 frames, in order) and `verification.json`.
- `frames/`: each of the 11 frames as SVG, with Claude Design's own PNG preview.

The PDF the founder attached first, at 09:48 UTC (485,593 bytes, SHA-256 `04941a7b…a84d`), isn't committed: its 13 pages render identically to the PDF inside the .zip (no pixel differs at 150 dpi), with the same text, and only their file metadata differs. It stays in the project's files.
**Why:** `docs/DESIGN-HANDOFF.md` step 2 puts each delivery in its own commit, so every named file the next commit makes can be checked against its source. The founder sent the design before slice 11 (`docs/plans/B0.md` section 5.1 had planned it after), and on 2 November Claude Code told the founder the brand's reference files would land on `main` in a small PR of their own, ahead of the app code, so that design handoff 1 can go to Claude Design while B0 is built; the founder then sent the .zip.
**Verified:**
- `sha256sum` of every file in `design/reference/claude-design/handoff-0/` equals the same file unpacked separately from the attachment and from its copy in the project's files (both `2f862c54…675a`).
- No file has a symbolic link, a script or an executable; no SVG holds `<script>`, `<foreignObject>`, `<text>` or a reference outside itself (`grep`); the only embedded image is one JPEG in each of `frames/H01-open.svg` and `frames/H01-open-dark.svg` (900×1125, no EXIF).
- No personal data: the `.docx`'s properties name only `python-docx`, the PDF's only LibreOffice, and a search of every file for the founder's email, name, state and phone found nothing.
- The two PDFs compared with `pdftoppm -r 150` and ImageMagick's `compare -metric AE`: 0 pixels differ over 13 pages; `pdftotext` gives the same 241 lines.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** The delivery's content against the brief, the spec and the book: the next commit does that.
**Decisions and questions:** The brand's reference files land in this PR, ahead of slice 11, rather than in slice 11b after it (`docs/plans/B0.md` section 5.1): reference files only, with no app code, asset catalog or `TadayoDesign` tokens, which stay in slice 11b. The next commit updates the plan.
**Next:** Make the named brand and screen files from the delivery, check them against the brief, and record the differences (this journal's state, "Next, in order", step 1).

#### 2026-11-02 09:20 UTC · shared · plan/b0-rulebook · PR #3
**Did:** Recorded PR #3's independent review. Four fresh reviewers (ADR-022 in the rulebook; FQ38's answer; whether the B0 plan still works end to end; the records and privacy) reported 15 findings, and a separate reader checked each one: 11 held, which come to 8 problems, all fixed:
- **The merge command broke on an apostrophe** in a PR title, PR #3's included. `docs/GITHUB.md` step 6 says to write each `'` as `'\''`.
- **The first test of merging a workflow PR** (ADR-022) was missing from the rulebook and the plan. `docs/GITHUB.md` step 6 and the plan's section 2 now say the merge of `ci.yml`'s PR is the one-time test, recorded in `docs/LIMITATIONS.md`.
- **FQ39 pointed T57's rewording at this PR,** which leaves T57 unchanged. It now goes in a rulebook PR of its own; `docs/PROGRESS.md` says so too.
- **"After the founder merged the starter-pack PR"** in this journal's next steps and the plan's section 6: Claude Code merged it. Now "after the starter-pack PR merged".
- **The plan's Apple row still asked for the APNs key by slice 12.** It's now needed by spike S4, before Gate A.
- **Whose the second account in the spikes' club is.** ADR-024 and the plan's F8 say it's the internal tester's, on a second iPhone (FQ28's default), needed before spike S1 rather than at Gate A, with the tester's consent first and the founder's yes before the invitation; ADR-024 links FQ28; the journal's waiting list and `docs/PROGRESS.md` list it.
- **ADR-024 cited `docs/TECH-DESIGN.md` section 5 for an upload check** it doesn't describe. Now S1's commit checks membership and audience, and S2's upload goes through S1's build.
- **The PR body didn't say what wasn't verified.** It now does.

The four findings not confirmed are answered in the PR.
**Why:** `docs/GITHUB.md` steps 3 to 5.
**Verified:**
- Each fix applied as an exact replacement asserted to occur once (12).
- PR #3's title, put into the merge command's template with `'\''` and checked with `bash -n`: no syntax error.
- A search of every Markdown file for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That GitHub accepts the session's squash merge of a PR that adds a workflow file: slice 2's merge is the first test.
**Decisions and questions:** ADR-024 now names the spikes' second account (FQ28's default, the internal tester) and its timing; no new decision. FQ39's default now sends T57's rewording to a rulebook PR of its own.
**Next:** The founder approves PR #3 in the project's thread, and Claude Code squash-merges it at the approved head (ADR-022). Done when PR #3 shows merged.

#### 2026-11-02 08:52 UTC · shared · plan/b0-rulebook · PR #3
**Did:** Merged PR #2 and started PR #3, the rulebook PR.
- **PR #2 merged.** The founder approved it in the project's thread at 08:45 UTC ("you can merge PR#2"); Claude Code squash-merged it through REST at the approved head `a604e1c`, with the title `docs: plan B0 (#2)` and a merge message written for it that holds no personal data (ADR-022). `main` is `1c4a4b5`, whose tree matches `a604e1c`'s.
- **FQ38 answered.** At 08:45 UTC the founder chose (a) on the decision card: spikes S1, S2 and S4 run before Gate A. Recorded as ADR-024 in `docs/DECISIONS.md`, and as answered in `docs/QUESTIONS.md`.
- **ADR-022 in the rulebook.** `CLAUDE.md` (the founder approves every gate and every PR, and Claude Code merges a PR once it's approved in the thread; "How you work" step 6; "Git": never merge a PR the founder hasn't approved at its current head), `docs/GITHUB.md` (version 1.1: its introduction, "What GitHub enforces", step 6 with the merge command and the refused-merge fallback, and "Never") and `README.md`'s "Rules of the road".
- **ADR-024 in the rulebook.** `CLAUDE.md`'s "Order of work" (B0 holds spikes S3, S5 and S6; S1, S2 and S4 run before Gate A) and `docs/MILESTONES.md` (version 1.1: B0's goal, its TestFlight bullet and "Spikes", Gate 0's evidence, a paragraph under B2 for spikes S1, S2 and S4, and Gate A's evidence).
- **The records.** `docs/plans/B0.md`: the goal, F8 answered, F9 and section 1.3's APNs rows needed before Gate A, slice 13 for S5, S3 and S6, section 4's order and its S1, S2 and S4 rows, and section 7's evidence. `docs/LIMITATIONS.md`'s app-icon row names the spikes per gate. `docs/PROGRESS.md`'s shared section, and this journal's sections 0.5, 0.7, 1.1 and 4.1.
**Why:** The founder approved PR #2 in the thread, and ADR-022 has Claude Code merge an approved PR. ADR-022 also says `CLAUDE.md`, `docs/GITHUB.md` and `README.md` follow in a PR of their own (`docs/MILESTONES.md`, "Lanes"); FQ38's answer changes `CLAUDE.md` and `docs/MILESTONES.md`, so it goes in the same rulebook PR.
**Verified:**
- `git rev-parse origin/main^{tree}` equals `git rev-parse a604e1c^{tree}`.
- Each edit applied as an exact replacement asserted to occur once.
- A search of every Markdown file for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That GitHub accepts the session's squash merge of a PR that adds a workflow file: slice 2's merge is the first test.
**Decisions and questions:** ADR-024 added (FQ38's answer). T57 in `docs/INVARIANTS.md` is unchanged: FQ39 is open, and until it's answered no PR with a destructive migration merges.
**Next:** Push `plan/b0-rulebook`, open PR #3, and have it reviewed by fresh reviewers, each finding checked by a separate reader. Done when every finding is fixed or answered and the PR says it's ready.

#### 2026-11-02 08:16 UTC · shared · plan/b0 · PR #2
**Did:** Recorded the last check of the second round of fixes (`3d8627b..e3a466e`). Three fresh reviewers (FQ38 and FQ39; the order; the records and privacy) reported 15 findings, and a separate reader checked each one: 10 held, which come to 8 problems, all fixed:
- **FQ38's (a) understated what it changes.** Besides Gate 0's and Gate A's evidence, it changes `CLAUDE.md`'s "Order of work" (B0 holds "the spikes S1 to S6 that retire the native unknowns" before the two lanes start) and, in `docs/MILESTONES.md`, B0's goal and its spikes. It relaxes Gate 0 and that order of work: Gate 0 would pass, and B1 and B2 would start, with three of the six spikes unproven; no invariant is relaxed. `docs/QUESTIONS.md` and the plan's F8 now say so.
- **FQ38's (c) left out T6 and spec 04 and 05.** The run would also give the founder's account its days in the club's calendar, with their occurrences, which nobody confirmed.
- **The rulebook PR's scope.** The journal's next steps and `docs/PROGRESS.md` now list what it carries if the founder has answered by then: FQ38's (a) changes, and T57 for FQ39's proposal. FQ39 names `README.md` among the documents that PR brings in line.
- **The plan's order.** A branch in progress that can't be finished without a workflow change is set aside, and its slice re-applied from `main` after the workflow PR merges (section 2). Slice 10a starts only once `ios.yml` is green on the latest check branch, so an `ios.yml` fix can still go up next. Handoff 1's branch waits until `ios-release`'s first run on `main` has put its build in TestFlight and no workflow PR is waiting.
- **The founder's phone.** Section 4 says reports, the Gate 0 PDF, PRs and the journal name it only as "your iPhone, iOS 18", with nothing from S2's photo's EXIF and not whose iPhone took it, and that F9's answer is recorded only as "S2's photo is ready".
- **The PR's body.** Its list of invariants adds T7, and notes that FQ38 cites T38, that its (c) would relax T6, T7 and spec 04, 05 and 32, and that FQ39 cites T57.

Corrections to the 07:41 entry, since the log is append-only: its FQ38 (a) "changes `docs/MILESTONES.md`'s gates … relaxes no rule", which is replaced as above; its (c) relaxed "ADR-021, T7 and spec 32 once", to which T6 and spec 04 and 05 are added.

The five findings not confirmed are answered in the PR.
**Why:** `docs/GITHUB.md` steps 4 and 5. The founder asked that anything relaxing a rule or a decision be listed; FQ38's recommended option relaxed Gate 0 and B0's order of work without saying so.
**Verified:**
- Each fix applied as an exact replacement asserted to occur once (10).
- A search of every Markdown file for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That GitHub accepts the session's squash merge of a PR that adds a workflow file: slice 2's merge is the first test.
**Decisions and questions:** FQ38's (a) and (c) now state everything they change; its default and recommendation are unchanged. The decision card on FQ38 said (a) relaxes no rule; the founder is told in the thread that it relaxes Gate 0 and B0's order of work.
**Next:** The founder approves PR #2 in the project's thread; Claude Code squash-merges it at the approved head (ADR-022). Done when PR #2 shows merged.

#### 2026-11-02 07:41 UTC · shared · plan/b0 · PR #2
**Did:** Recorded the check of the review's fixes (`194d72c..3d8627b`). Four fresh reviewers (whether each fix does what its problem needed; the order; the new records; privacy and security) reported 30 findings, and a separate reader checked each one: 27 held, which come to 16 problems, all fixed:
- **FQ38 was wrong.** Its recommended option, a club the founder creates alone, can't work: a club activates only once at least two people approve the same roster (spec 04, T7; A01), and FQ16's default gives a club under two members no occurrences. Its default ("nothing reads or changes the founder's account") would have blocked the founder's own sign-in. Its option on a script left out T7 and that the fixtures' only free place is Leila's, and its option on moving the spikes left out S2. FQ38 is rewritten in `docs/QUESTIONS.md`: (a) S1, S2 and S4 run before Gate A instead, once B1 and B2 have built clubs and days (changes `docs/MILESTONES.md`'s gates, in a PR of their own; relaxes no rule), recommended; (b) the founder's tester joins early, so a club activates properly; (c) one script run adds the founder's account to a club of scripted members (relaxes ADR-021, T7 and spec 32 once). Default: no script or seed touches the founder's account, nothing puts it in a club, the founder's own sign-in goes ahead, and S1, S2 and S4 wait. The plan's F8, S1's roster and slice 13's order say the same. The decision card recommending the old option was withdrawn and a corrected one posted.
- **The plan's order.** A workflow PR now waits for every branch of Claude Code's that is meant to merge, not only open PRs. `ios/b0-brand-2` waits for workflow PRs too, and section 5.1 tells the founder how to send the rest of handoff 0 to it. After an `ios.yml` fix, the check runs again on a new branch. Slice 10a builds and tests `deploy-branch`'s refusal of commits that aren't green. Section 1.3's lead-in agrees with step (2) on the Apple secrets.
- **ADR-022.** Its merge command names the message (`commit_title`, `commit_message`). The follow-up PR covers `docs/GITHUB.md`'s "What GitHub enforces" and `README.md` too. A workflow PR whose merge is refused goes to the founder to merge. T57's "approval in the PR" becomes FQ39, new in `docs/QUESTIONS.md`: until it's answered, no PR with a destructive migration is merged.
- **The PR's body.** Review item 26 names the 06:00 entry's "Decisions and questions" field.

Corrections to the 06:55 entry, since the log is append-only: FQ38 as it described it, with its default and its recommended option, is replaced as above.

The three findings not confirmed are answered in the PR. One was taken anyway: ADR-022's command now names its merge message.
**Why:** `docs/GITHUB.md` steps 4 and 5. The founder asked that anything relaxing a rule or a decision be listed; FQ38's recommended option relaxed T7 and A01 without saying so.
**Verified:**
- Each fix applied as an exact replacement asserted to occur once (16, with FQ38 replaced whole and FQ39 added).
- A search of every Markdown file for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That GitHub accepts the session's squash merge of a PR that adds a workflow file: slice 2's merge is the first test.
**Decisions and questions:** FQ38 rewritten (default: no script or seed touches the founder's account, and S1, S2 and S4 wait; (a) recommended). FQ39 added (default: no PR with a destructive migration merges until answered). ADR-022 extended: the merge message, the places the follow-up PR changes, the refused merge of a workflow PR, and T57.
**Next:** A last check of these fixes (`git diff 3d8627b..` this commit) by fresh reviewers, each finding checked by a separate reader; fix or answer each, record it, and mark PR #2 ready. Done when the PR says it's ready for the founder.

#### 2026-11-02 06:55 UTC · shared · plan/b0 · PR #2
**Did:** Opened PR #2 and recorded its independent review. Four fresh reviewers (what the plan covers; whether its order works; privacy and security; the records and the PR's body) reported 42 findings, and a separate reader checked each one: 40 held, which come to 26 problems, all fixed in `docs/plans/B0.md` unless named otherwise:
- **The order.** Slice 7 adds the Fastify app's skeleton, so the privacy matrix and the leak scanner have routes; slice 8 builds on it. Slice 12 waits for 10c, with `deploy-dev` green and the dev API host answering. `ios/b0-brand` is made only once slice 11 has merged and no workflow PR waits; icon frames sent first have their own path, with the rest on `ios/b0-brand-2`. Handoff 1's branch waits for slice 12. `ios.yml`'s first run is a push to `ios/b0-ios-check`, never opened as a PR, and slice 11 starts once that run is green. `ci`'s steps find their targets until slice 12 makes them strict. Step (2) after 10b asks only for the Fly secrets slice 10 needs.
- **What the founder provides.** F7 restates ADR-021 in full: evidence included, and scripts and seeds never read or change the founder's accounts. F8 asks FQ38, new in `docs/QUESTIONS.md`: how the founder's account joins a club on `dev` for spikes S1, S2 and S4. F9 asks for S2's 48-megapixel photo. The Apple row adds a TestFlight internal testing group. The Cloudflare row adds the record for the dev API host `api-dev.tadayo.app` (ADR-023, new) and `tadayo.app` on the Pages project. F5 is needed by slice 11b.
- **Privacy.** Spike server code reaches `dev` only from a commit green in `ci`, with every spike route held to T9, T10 and T12. S6's web part merges to `main` before it's tried.
- **Accuracy.** Slice 2's Swift pin follows the newest Xcode (TECH-DESIGN section 1). Slice 6's tests cover the six drop states and T23's denials. Gate 0's UI run includes iOS 18 (ADR-018). The hosts recheck includes `images.unsplash.com`, here and in `docs/LIMITATIONS.md`. The REST check names `fly-app-create`. The references to the step that creates the Fly app are right.
- **The records.** The merge rule is ADR-022 (below). Section 1.1's list of places holding the founder's details names commit `004680d`'s message on PR #1's page. Section 4.1's row names every file. The PR's citation list is complete.

The founder's answer on merging, recorded as ADR-022: asked at 06:03 UTC whether letting Claude Code merge PR #1 covered later PRs, the founder first picked "Only PR #1; I merge the rest", then wrote at 06:04 UTC "i will approve then you merge". Sections 0.5 and 0.7 say so. `CLAUDE.md` and `docs/GITHUB.md` follow in a PR of their own (`docs/MILESTONES.md`, "Lanes").

Corrections to the 06:00 entry, since the log is append-only:
- Its "Decisions and questions" said the merge question "is asked of the founder". It was asked at 06:03 UTC, after that commit, and is now answered (ADR-022).
- That field should also have named `docs/LIMITATIONS.md`'s two changed rows: the refused hosts and Docker.
- Its F7 bullet said F7 records the default the founder chose. F7 kept the draft's narrower wording; fixed here.

The two findings not confirmed are answered in the PR: guard 1 and guard 2 "skipped on `main`" follow `docs/TECH-DESIGN.md` section 9, and can be steps inside a job that succeeds; and `ops.yml`'s bootstrap secrets break no rule, because section 3's "least privilege" is about the workflow's `permissions`, and FQ36 accepted that `dev`'s keys reach workflows run by hand.
**Why:** `docs/GITHUB.md` steps 4 and 5. The founder asked for every account and secret named exactly, and for anything that relaxes a decision to be listed. FQ38 is the one place the plan can't go on without changing a decision, so it's a question whose default changes nothing.
**Verified:**
- Each fix applied as an exact replacement asserted to occur once (31 in the plan).
- A search of the plan for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That a Cloudflare token with Pages edit can create the Pages project on `deploy-dev`'s first run, and that Fly issues the certificate for `api-dev.tadayo.app` with the record DNS only: slices 10a and 10c check them against the providers' documentation, which this session can't reach.
**Decisions and questions:** ADR-022 (the founder approves each PR, and Claude Code merges it) and ADR-023 (the dev API host) added. FQ38 added; its default: nothing reads or changes the founder's account, and spikes S1, S2 and S4 wait. `docs/LIMITATIONS.md`: the hosts row's recheck list adds `images.unsplash.com`.
**Next:** Check these fixes (`git diff 194d72c..` this commit) with fresh reviewers, each finding checked by a separate reader; fix or answer each, record the check, and mark the PR ready. Done when PR #2 says it's ready for the founder.

#### 2026-11-02 06:00 UTC · shared · plan/b0 · PR none
**Did:** Made `plan/b0` from `main` after PR #1 merged (`0a6c91c`), and brought the B0 plan over with `git fetch origin` and `git checkout origin/draft/b0-plan -- docs/plans/B0.md`. Updated the plan for the founder's answers of 2026-11-02 and today's state:
- F1: the founder reported the Tadayo cloud environment set; the session that made this branch had started before, so the first session started after it rechecks the hosts.
- F3, and the Supabase and Fly rows: the founder's phone and place only as "iOS 18", "US East", `us-east-1` and `iad`, at the founder's word.
- F4 (FQ5): the identifiers confirmed (ADR-019), with `app.tadayo.widgets`; the name stays the default. F6 (FQ31): answered by ADR-020, so the inventory steps go ahead without waiting. F7 (FQ36): the default chosen (ADR-021). The Apple row no longer waits on F4.
- Where the plan spoke of the starter-pack PR as open, it speaks of it as merged; section 6's rows on the hosts, Docker and Swift record the recheck of 2026-11-02.

`docs/LIMITATIONS.md`: the rows on the refused hosts and on Docker record the recheck at 05:58 UTC and the founder's report. `docs/PROGRESS.md`'s shared section and this journal's section 1.1 rewritten; this PR's row added to section 4.1.
**Why:** The founder's step 4: after the starter-pack PR merged, make `plan/b0` from `main`, bring the plan over, write its journal entry and open it as its own PR, leaving `draft/b0-plan` as it is. The plan carried answers and personal details that the founder's answers of 2026-11-02 changed.
**Verified:**
- `git diff --stat ff8e00d 0a6c91c`: no difference, so `main`'s tree is the starter pack's last commit.
- From this session at 05:58 UTC: `curl` to `api.supabase.com`, `api.fly.io`, `api.cloudflare.com`, `api.resend.com`, `download.swift.org`, `docs.github.com` and `images.unsplash.com` each failed with `CONNECT tunnel failed, response 403`; `registry.npmjs.org` returned 200; `docker info` found no daemon; `swift` isn't installed.
- A search of `docs/plans/B0.md` for the founder's state, phone model and exact iOS version: no match.
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK. `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** Whether the Tadayo environment the founder set lets a session reach the hosts, has Docker's daemon and installs Swift: this session started before it was set. The first session started after it checks (the plan's section 6).
**Decisions and questions:** The founder let Claude Code merge PR #1 ("you can merge yourself"). Whether that covers later PRs is asked of the founder; until answered, `CLAUDE.md`'s rule stands and the founder merges.
**Next:** Open the PR `docs: plan B0` and have it reviewed independently (`docs/GITHUB.md`). Done when every finding is fixed or answered, the review is recorded here and in section 4.1, and the PR says it's ready for the founder.

#### 2026-11-02 05:42 UTC · shared · starter-pack · PR #1
**Did:** Recorded the review of `21a9cf9`, the commit with the founder's answers. Two fresh reviewers (the documents, and privacy) reported 19 findings, and a separate reader checked each one: 16 held, which come to ten problems. The fixes:
- `docs/DECISIONS.md`: ADR-021 records FQ32 to FQ37's answers, each default in full, as `docs/QUESTIONS.md` asks of every answer; section 0.7 lists it.
- `docs/TECH-DESIGN.md`: section 1's deletion log is one R2 bucket per environment (FQ37), and section 7's `dev` row holds the two sign-in addresses, treated as personal data (FQ36), so neither contradicts the founder's answers.
- `docs/QUESTIONS.md`: the introduction to FQ31 to FQ37 says the founder answered each; FQ34 says Claude Code asks for the answer the weekly report on `prod` needs before Gate E.
- Section 0.7: FQ5's name is still a default in force. Section 1.1 and `docs/PROGRESS.md` no longer wait on the founder to decide the PR's rule changes. Section 1.1's list of where the founder's details remain is complete, and the step that makes `plan/b0` rewords the plan's Supabase and Fly rows as well as F3.
- The three findings not confirmed are answered in the PR.

Corrections to the 05:20 entry, since the log is append-only:
- It said FQ5 was answered; its identifiers were, and its name stays the default.
- Its search for the founder's details covered only `starter-pack`'s files. `draft/b0-plan` still holds them, in the plan and in two commit messages.
**Why:** `docs/GITHUB.md` steps 4 and 5. `docs/QUESTIONS.md`: an answer is recorded there and in `docs/DECISIONS.md`. The fixes are the readers' own text and change no rule, so the review stops here.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all`: exit 0. `--branch`: exit 1, with only the problem the 05:20 entry names (commit `21a9cf9` reworded the 23:27 entry at the founder's word).
**Not verified:** None.
**Decisions and questions:** ADR-021 added (decided by the founder's answers).
**Next:** The founder merges PR #1. Then make `plan/b0` from `main`, bring `docs/plans/B0.md` over, reword its F3, Supabase and Fly rows and mark the answered questions, write its entry, and open it as its own PR with its own review. Done when `plan/b0`'s PR says it's ready for the founder.

#### 2026-11-02 05:20 UTC · shared · starter-pack · PR #1
**Did:** Recorded the founder's answers to PR #1's questions, given on 2026-11-02 ("1, yes, yes, 3 yes, defaults for the rest"):
- FQ31: Claude Code may edit `design/reference/INVENTORY.md` to keep it current, never deleting a row. ADR-020 records it, FQ31 says so, and `CLAUDE.md`'s "Repository layout" names the exception. `design/reference/README.md`, which the answer doesn't cover, is unchanged and read with that exception (ADR-020).
- The founder's location and phone details: at the founder's word, the 23:27 log entry, ADR-016, ADR-018, FQ3 and FQ4 now say only "US East" and "iOS 18". The 23:27 entry's "Why" says it was reworded and why.
- FQ5: the identifiers `app.tadayo`, `app.tadayo.share`, `app.tadayo.widgets` and `group.app.tadayo` are confirmed (ADR-019); the name stays Tadayo.
- FQ32 to FQ37: the founder chose each default, and each now says so. Section 0.7 lists the answers and ADR-019 and ADR-020; section 0.8 marks FQ32's and FQ33's departures as the founder's choice.
- `docs/PROGRESS.md` and section 1.1 drop FQ31 and FQ5 from the blockers.
**Why:** The founder's answers in this thread. `CLAUDE.md`: the founder's direct instruction beats every other rule, which covers rewording a log entry the journal's rule otherwise keeps unchanged.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all`: exit 0.
- `python3 tools/ci/journal_check.py --branch`: exit 1, with one problem, as expected: this commit "changed or removed an earlier log line", the three lines of the 23:27 entry the founder asked to reword. Every other check passes. Nothing in the check was changed to hide it.
- A search of every Markdown file in the repository for the founder's state, phone model and exact iOS version: no match.
**Not verified:** None.
**Decisions and questions:** ADR-019 and ADR-020 added (decided by the founder's answers). FQ5, FQ31 and FQ32 to FQ37 answered.
**Next:** Review this commit with fresh reviewers, a privacy and security reviewer among them (`docs/GITHUB.md`, step 5); fix or answer what they find, record it with the PR's row, and update "Ready for the founder". Done when the PR says it's ready to merge.

#### 2026-11-02 03:58 UTC · shared · starter-pack · PR #1
**Did:** Recorded a check that `2abad53`'s fixes do what the per-sign-in check's findings asked, and of the PR's body. Four fresh checkers (findings 0 to 5, findings 6 to 10, the diff as a whole, and the journal and the body) reported 12 problems, and a separate reader checked each one: 10 held, which come to four problems, each found by more than one checker. None is in the documents' rules; all four are in what this journal and the PR's body say about them:
- The body's commit line for `4ca204f` still said it stated every requirement the mechanism carried. It now says all but four, which `c6b17ae` and `2abad53` add.
- List 11 gave only the number of requirements still missing. It now names the four: a new secret at each sign-in, the send at each launch of a removal never sent, the resend after any ending but the two that end a removal, and the send at the logout.
- List 13's summary of the new worker test left out "for that account", which would have contradicted (e). It now says a push for the removed sign-in's account.
- List 13 said every version before `f1685e9` required the send at the logout. The first three commits had no removal at all; the versions from `4559931` to `25efc81` did.
- The two problems not confirmed are answered in the PR. The PR's "Ready for the founder" is filled in.

Corrections to the 03:37 entry, since the log is append-only:
- Its worker test bullet left out "for that account": the test, in `docs/MILESTONES.md` B8, is about pushes for the removed sign-in's account.
- It said every version before `f1685e9` required the send at the logout; the versions from `4559931` to `25efc81` did.
- It said list 11 named the missing requirements; until this commit list 11 gave only their number.
**Why:** `docs/GITHUB.md` steps 5 and 6. The documents' text didn't change in this commit, so the review stops here, and the PR is ready for the founder.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That a design can meet section 6's requirements (a) to (e) and its outcome together, a push APNs held while the device was offline included; B8's PR shows it, or asks the founder.
**Decisions and questions:** None new. The founder's are in the PR's "Ready for the founder".
**Next:** The founder reviews and merges PR #1. Then make `plan/b0` from `main`, bring `docs/plans/B0.md` over from `draft/b0-plan`, write its entry, and open it as its own PR with its own review. Done when `plan/b0`'s PR says it's ready for the founder.

#### 2026-11-02 03:37 UTC · shared · starter-pack · PR #1
**Did:** Recorded a check of `git diff 4ca204f..c6b17ae` and of the PR's body, with one of three fresh reviewers comparing section 6 and B8 with each earlier version. They reported 11 findings, and a separate reader checked each one: all 11 held. The fixes, most in the readers' own words:
- `docs/TECH-DESIGN.md` section 6: the outcome is again that once the removal lands no push for that account may reach the device, unless it has signed in on it again since that logout; registering moves a token from any earlier sign-in, so it agrees with (e); (c) starts with the app sending the removal at the logout, which every version before `f1685e9` required.
- `docs/MILESTONES.md` B8's api tests, for each requirement and each case: a removal sent after the token moved to a later sign-in, of the same account or another, gets `NOT_FOUND` and leaves that registration in place; nothing personal is kept for a removed sign-in, nothing that leads to its account through another table included; a push the worker sends after the removal lands, a deferred, aggregated or retried one included, goes to none of the device's tokens unless a later sign-in of the same account holds it; a later sign-in's first registration after a removal is accepted.
- B8's logic tests: the send at the logout, and a test for every failed ending, each one (c) names included.
- The PR's body: list 11 says which requirements were still missing; "Not verified" names (a) to (e) together and the push APNs holds; a list 13 and this check's table.

Corrections to the 03:04 entry, since the log is append-only:
- It narrowed the outcome to the pushes the server sends after the removal lands. No finding asked for that, and it relaxed a requirement without a question for the founder. It's reverted.
- Its "the same account signing in again included" held for late registrations, not for a removal sent after the token moved. Its B8 tests went from each case to each requirement, which dropped some cases; both are named now.
- It left out a fourth requirement still missing: the send at the logout.
**Why:** `docs/GITHUB.md` step 5; T58: never weaken a test; the founder's rule never to relax a rule.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That a design can meet (a) to (e) and the outcome together. Among them, whether B8 can keep a push APNs held while the device was offline, and delivers after the removal lands, from reaching the device; Apple's notification filtering entitlement may be needed. B8's PR shows it, or asks the founder.
**Decisions and questions:** None new.
**Next:** A check that these fixes do what the findings asked, and of the PR's body; fix what it finds, record it with the PR's row, and fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 03:04 UTC · shared · starter-pack · PR #1
**Did:** Recorded a check of `git diff f1685e9..4ca204f` and of the PR's body, in which a third fresh reviewer compared section 6 and B8 with each earlier version in the PR. Three reviewers reported 10 findings, and a separate reader checked each one: all 10 held. Section 6 still judged late registrations by account, so the same account signing in again slipped between its cases, and its list of failed endings had become closed. So `docs/TECH-DESIGN.md` section 6 now states the push removal's requirements per sign-in, lettered (a) to (e), and B8's tests name the letter each one checks:
- A token belongs to one sign-in at a time, a new token from iOS replaces that sign-in's registration, and registering moves the token from any other sign-in, of the same account or another.
- (a) Every removal is authorized by a secret generated at that sign-in, never an earlier sign-in's; (b) nothing personal is kept for a removal or for refusing a late registration (spec 23); (c) a pending removal, whether the logout was offline, it was never sent, or it ended any way but the two answers in (d), the 3xx, other 2xx and TLS and DNS failures included, is sent at each launch and whenever iOS wakes the app, with a delay after each failed attempt, and what authorizes it is kept until it ends; (e) a registration of a sign-in that lands after that sign-in's removal, or after the token moved to a later sign-in of the same account or another, changes nothing, and nothing kept for the earlier sign-in may refuse the later one's registration.
- The outcome covers the pushes the server sends after the removal lands, since APNs can't take back a push it was handed before.
- `docs/MILESTONES.md` B8: api tests for (a), (b) and (e), the same account signing in again included; logic tests for (a), (c) and (d), a new secret at each sign-in included.
- The PR's body: list 11 names the restored rule that the app keeps what authorizes a removal; a list 12 and this check's table.

Corrections to the 02:33 entry, since the log is append-only:
- Its "Why" cited `CLAUDE.md` for "never relax a rule"; `CLAUDE.md` doesn't say that. The rule is step 3 of the founder's first message, as the 22:26 entry's "Why" says.
- It said section 6 stated each requirement the mechanism had carried. Three were still missing: a new secret at each sign-in, the send at each launch of a removal never sent, and the resend after any ending but the two that end a removal (it named six). Its B8 bullet also left out the test that what authorizes a removal is kept.
**Why:** `docs/GITHUB.md` step 5; T58: never weaken a test; the founder's rule never to relax a rule. Stating each requirement per sign-in covers the same account's later sign-in, which per-account wording couldn't tell apart from the one that logged out.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That a design can meet (a) to (e) together; B8's PR shows it.
**Decisions and questions:** None new.
**Next:** Check this commit and the PR's body with fresh reviewers, one of them comparing section 6 with each earlier version; fix what they find, record it with the PR's row, and fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 02:33 UTC · shared · starter-pack · PR #1
**Did:** Recorded the final check, of `git diff 25efc81..f1685e9` and of the PR's body. Two fresh reviewers reported 13 findings, and a separate reader checked each one: 12 held. Leaving the push removal's mechanism to B8 had dropped requirements the mechanism carried, so section 6 now states each one as a requirement, without fixing the mechanism:
- `docs/TECH-DESIGN.md` section 6: at the logout the app deletes that sign-in's session credential, and a removal after it is authorized by a secret only that sign-in's app holds, which the server never stores in a form that could authorize a removal; only the server's removal, or its neutral `NOT_FOUND`, ends a removal, also one that already landed but whose answer was lost or that was sent after the token moved, and then the app sends it no more and deletes what authorized it; a 4xx other than `NOT_FOUND` is sent again, and what authorizes it is kept; a late registration may neither leave the token with the account that logged out nor take the token, or its registration, from the account it moved to; and the outcome allows that account's pushes again once it has signed in on the device again since that logout, which a removal limited to its own sign-in couldn't otherwise meet.
- `docs/MILESTONES.md` B8: the api tests check that the server holds the secret only in a form that can't authorize a removal, and both halves of the moved-token case; the logic tests check the session credential's deletion at logout, which answers end a removal, and that what authorized it is then deleted.
- The PR's body: list 10 names the 02:05 entry's correction of the 01:46 entry; "Not verified" names B8's mechanism instead of the withdrawn background `URLSession`; a list 11 and this check's table.

Corrections to the 02:05 entry, since the log is append-only:
- It said five of the findings that held were cases the push removal's mechanism left open; six were (the PR's findings 0, 1, 2, 5, 6 and 7: the four cases it names, two of them reported twice).
- Its "Verified" line said each case the last four reviews named for the removal was in section 6's list or B8's tests. Not all were: the answers that end a removal, the deletion of what authorized it, the secret held only in a form that can't authorize a removal, and the moved-token case's second half had been dropped. Each is back, as above.
- It said no push for that account reaches the device once the removal lands, without the case of that account signing in again.
**Why:** `docs/GITHUB.md` step 5, and `CLAUDE.md`: never relax a rule; T58: never weaken a test. Leaving the mechanism to B8 is still right, but its requirements stay in section 6, where B8's design and its privacy and security review start from.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** That every requirement each earlier version of section 6 held is in this one: the check that follows compares them.
**Decisions and questions:** None new. The one finding that didn't hold is answered in the PR.
**Next:** Check this commit and the PR's body with fresh reviewers, comparing section 6 with each earlier version in the PR; fix what they find, record it with the PR's row, and fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 02:05 UTC · shared · starter-pack · PR #1
**Did:** Recorded the last check, of `git diff 098c625..25efc81` and of the PR's body. Two fresh reviewers reported 10 findings, and a separate reader checked each one: 9 held. Five were again cases the push removal's mechanism left open (a registration landing after its own removal, a moved registration's secret untested, a removal recorded but never sent, a device test that no longer required the removal to land). Seven rounds have now patched that mechanism, and each patch opened a new case. So:
- `docs/TECH-DESIGN.md` section 6 states what the removal must achieve after every logout, online or not: the server ends up holding no registration of that sign-in for the device, and no push for that account reaches it once the removal lands. It lists every case the reviews found, as cases the design must handle, and leaves the mechanism to B8's PR, which gets its own privacy and security review. Whatever authorizes a removal without the session can remove only that sign-in's registration, the server answers anything else with the neutral `NOT_FOUND` (T14), and it keeps nothing personal for it beyond the registration (spec 23).
- `docs/MILESTONES.md` B8: api tests for each case section 6 lists, the moved-token case included; a device test in four cases, each of which must see the removal land; logic tests for each case, every ending other than the server's sent again with a delay.
- The PR's body: T14 among the invariants touched; list 9 completed (section 8's Device row, both halves of the api test, the corrections); a list 10 for this commit.

Correction to the 01:46 entry, since the log is append-only: its rule said a registration landing late can't bring the removed one back, but a registration landing after its own removal, which the server answered `NOT_FOUND`, could. The mechanism it described is withdrawn; section 6 now lists that case for B8.
**Why:** `docs/GITHUB.md` step 5. A starter-pack PR fixes the documents' mistakes; the push removal's protocol is B8's work, and its PR is where it can be built and tested against each case.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- Each case the last four reviews named for the removal is in section 6's list or B8's tests.
**Not verified:** The removal's mechanism, which B8 designs.
**Decisions and questions:** None new. The one finding that didn't hold is answered in the PR.
**Next:** A final check of this commit and the PR's body with fresh reviewers; fix what they find, record it with the PR's row, and fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 01:46 UTC · shared · starter-pack · PR #1
**Did:** Recorded the check of the sixth review's fixes, of `git diff bc49f71..098c625` and of the PR's body, and fixed its findings. Two fresh reviewers reported 9 findings, and a separate reader checked each one: 8 held. Five were edge cases of the push removal after a logout, so its text is rewritten as one rule rather than patched again:
- `docs/TECH-DESIGN.md` section 6: every logout, online or not, leaves the removal pending until the server ends it. One removal secret per sign-in, sent with every registration of it; the server keeps the hash of a removed or moved registration's secret and refuses a later registration that carries it, so a registration landing late can't bring it back. The app sends the removal again, with a delay, after any other ending (a 5xx, a 429, another 4xx, a timeout, a dropped connection, a cancelled transfer), when iOS wakes it and at each launch. Only the server's removal, or its neutral `NOT_FOUND` (T14), ends it and deletes the secret.
- `docs/MILESTONES.md` B8: an api test that a secret removes only its own registration and that a removed registration's secret can't register again; device tests for a logout made online and the three offline cases; logic tests for one secret per sign-in and for each ending. Section 8's Device row says "after a logout, online or not".
- Section 1.1: the question for the founder also covers ADR-016, ADR-018, FQ3, FQ4, the B0 plan's F3 row, and commit `004680d`'s message, which the squash merge copies to `main`.
- The PR's body: the same question, with how to take those words out of the merge message.

Corrections to earlier entries, since the log is append-only:
- The 23:27 entry said the UI tests also run on an iOS 18 simulator before each gate. `docs/TECH-DESIGN.md` section 8 said then, as it and ADR-018 say now, that they do so when the runner offers one.
- The section 6 text the 23:30 entry added sent an online logout's removal once, with no retry if it failed, and the 01:26 entry's logic test named only a 5xx, a 429 and a timeout as endings to retry, narrower than section 6's rule. Both are replaced by the rule above.
**Why:** `docs/GITHUB.md` step 5. Patching the removal one case at a time kept leaving the next case open; one rule that holds the removal pending until the server ends it covers them together.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
- `gh api repos/beurni2/tadayo --jq .squash_merge_commit_message`: `COMMIT_MESSAGES`.
**Not verified:** None beyond the earlier entries'.
**Decisions and questions:** None new. The one finding that didn't hold is answered in the PR. The question on the 23:27 entry now also covers commit `004680d`'s message.
**Next:** Fresh reviewers check the push removal's rewrite and the PR's body (`docs/GITHUB.md`, step 5); fix what they find and record it in a commit with the PR's row. Then fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 01:26 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's sixth independent review, of `git diff ce16ab1..bc49f71` and of the PR's body, and fixed its findings. Two fresh reviewers (the documents and the PR's body, and privacy and security) reported 8 findings, and a separate reader checked each one: 7 held, two of them the same gap. The fixes:
- `docs/TECH-DESIGN.md` section 6: the removal secret is generated at each sign-in and sent with every registration of that sign-in, so a re-registration whose answer was lost (a zone change, for one) can't leave the server holding a secret the app doesn't have. A refusal then means the token has moved to another sign-in, which already stops the old account's pushes.
- `docs/MILESTONES.md` B8: the logic test names a 5xx, a 429 and a timeout (queued again, secret kept), and a refused secret (secret deleted, not queued again). The 01:10 entry's test, "a removal the server answers with an error", missed the timeout and contradicted section 6 for a refusal.
- The PR's body: "Ready for the founder" names the review that is running; the pointer to FQ31 to FQ37 goes to "Risks and open questions"; the iOS 18 simulator runs before each gate when the runner offers one, as section 8 and ADR-018 say; and the question on the 23:27 entry names the other files that carry the same details: ADR-016, ADR-018, FQ3 and FQ4, merged by this PR, and the B0 plan's F3 row.
**Why:** `docs/GITHUB.md` step 5. Each round has found fewer problems of substance; the last ones are in the push removal's edge cases and in the PR's body, so the next step checks only that each of these fixes holds.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** None beyond the earlier entries'.
**Decisions and questions:** None new. The one finding that didn't hold is answered in the PR. The question on the 23:27 entry now also covers ADR-016, ADR-018, FQ3, FQ4 and the B0 plan's F3 row.
**Next:** Fresh reviewers check that each of these fixes holds and the PR's body matches the repository (`docs/GITHUB.md`, step 5); fix what they find and record it in a commit with the PR's row. Then fill in "Ready for the founder". Done when the PR says it's ready for the founder.

#### 2026-11-02 01:10 UTC · shared · starter-pack · PR #1
**Did:** Recorded PR #1's fifth independent review, of `git diff 138fcab..ce16ab1` and of the PR's body, and fixed its findings. Two fresh reviewers (the documents and the PR's body, and privacy and security) reported 9 findings, and a separate reader checked each one: 8 held, two of them the same gap. The fixes:
- `docs/MILESTONES.md` B8: the device test names three cases again, since the 00:52 entry's change replaced the online relaunch after a force-quit instead of adding the offline one. A logic test covers a removal the server answers with an error.
- `docs/TECH-DESIGN.md` section 6: a removal that ends without the server removing the registration or refusing the secret (a 5xx, a 429 or a timeout) is queued again, with a delay, when iOS wakes the app to report it; any removal still pending is queued again at each launch; and the secret is deleted only once the server has removed the registration or refused the secret.
- `docs/TECH-DESIGN.md` section 8: the leak scanner also replays each upload intent, checking a pending replay's URL the same way and failing a replay made after `POST /v1/uploads/{id}/complete` that carries any URL (T12).
- `docs/MILESTONES.md` B9: `prod`'s deletion log gets its own R2 bucket before `prod` exists, and each app's R2 keys are read back in Cloudflare (section 10, FQ37), so the check the 00:52 entry gave to Gate D has an owner.
- Section 1.1: a code reaching the founder from a `tadayo.app` address already shows Resend has verified the domain, because Resend refuses to send from a domain it hasn't verified, whoever the code is for.
- The PR's body: the "Not verified" line on the accounts matches section 1.1; the second review's summary says 13 fixed, with the 23:27 entry left for the founder; the Resend lines match section 1.1.

Corrections to the 00:52 entry, since the log is append-only:
- It said B8's device test covers a force-quit followed by a launch made offline; it dropped the online relaunch in doing so. Both are named now.
- Its Resend line said B0 shows only that the founder's own code arrives. The code arriving from `tadayo.app` shows the domain's verification too.
**Why:** `docs/GITHUB.md` step 5: review the fixes again, decide each finding on its merits, and record the review in a commit. T58: never weaken a test.
**Verified:**
- `python3 tools/ci/journal_check_test.py`: 29 tests, OK. `python3 tools/ci/journal_hook_test.py`: 6 tests, OK.
- `python3 tools/ci/journal_check.py --all` and `--branch`: exit 0.
**Not verified:** Resend's refusal of an unverified sending domain comes from the reader's reading of Resend's documentation; the session's proxy refuses `api.resend.com`, so nothing here sent a message. Slice 8 shows it when the first code arrives.
**Decisions and questions:** None new. The one finding that didn't hold is answered in the PR.
**Next:** Review `git diff ce16ab1..HEAD` and the PR's body with fresh reviewers (`docs/GITHUB.md`, step 5), fix or answer what they find, and record it in a commit with the PR's row. Done when the PR says it's ready for the founder.

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
- FQ3 for `dev`: the founder is in US East, so `dev` is there too (Supabase `us-east-1`, Fly `iad`), not Paris (ADR-016). `docs/TECH-DESIGN.md` section 7's `dev` row says so. `prod`'s region stays open.
- FQ5's domain: the founder registered `tadayo.app` on Cloudflare (ADR-017). `docs/TECH-DESIGN.md` section 10's domain row names it. The identifiers stay FQ5's defaults until the founder confirms them.
- FQ4 for the founder's phone: it runs iOS 18, so iOS 17 stays the minimum (ADR-018). Before each gate, the UI tests also run on an iOS 18 simulator, the founder's version (`docs/TECH-DESIGN.md` section 8). The trial members' phones are still unknown.
- This journal's section 0.7 lists ADR-016 to ADR-018 and the answers; section 1.1 is rewritten.
**Why:** The founder's answers in the setup thread, relayed on 2026-11-01: their region (US East), "done with tadayo.app", and their iPhone's iOS version (iOS 18). This entry was reworded on 2026-11-02, at the founder's word, to drop their exact location and phone details. FQ3's default puts `dev` nearest the founder, and the pack had assumed Paris.
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
| #1 | `starter-pack` | The starter pack (`CLAUDE.md`, `docs/`, `design/reference/`, the PR template, `.claude/settings.json`, `.yamllint.yaml`, `tools/ci/`), with the document fixes its body lists, and the founder's answers to FQ3, FQ4 and FQ5 (ADR-016 to ADR-018), and on 2026-11-02 to FQ5's identifiers, FQ31 and FQ32 to FQ37 (ADR-019, ADR-020) | First review: five fresh reviewers (process, design, stages, the journal tools, privacy and security), each finding checked by a separate reader. 27 findings, 26 confirmed: 24 fixed, 2 whose fixes would loosen a rule turned into FQ35 and FQ36 (with FQ31 to FQ34 for the conflicts the PR lists); the one not confirmed (the reviewer's brief and CodeRabbit) answered in the PR. Second review, of the founder's answers and the first review's fixes (`8e4a0c7..4559931`): three fresh reviewers (the documents, the journal tools, privacy and security), each finding checked by a separate reader. 17 findings, 14 confirmed: 13 fixed (two with the reader's tighter fix, where the reviewer's own would have loosened a rule), and the personal data in the 23:27 log entry fixed only in the rewritable sections, the entry left for the founder's word (in the PR); the 3 not confirmed answered in the PR, one also given a pointer in `docs/TECH-DESIGN.md` section 10. Third review, of those fixes (`4559931..f3ee267`): two fresh reviewers (the documents, privacy and security), each finding checked by a separate reader. 13 findings, 10 confirmed and fixed; the 3 not confirmed answered in the PR. Fourth review, of those fixes (`f3ee267..138fcab`): two fresh reviewers (the documents, privacy and security), each finding checked by a separate reader. 7 findings, all confirmed and fixed, one through a question for the founder (FQ37). Fifth review, of those fixes (`138fcab..ce16ab1`) and the PR's body: two fresh reviewers (the documents and the PR's body, privacy and security), each finding checked by a separate reader. 9 findings, 8 confirmed and fixed; the 1 not confirmed answered in the PR. Sixth review, of those fixes (`ce16ab1..bc49f71`) and the PR's body: two fresh reviewers (the documents and the PR's body, privacy and security), each finding checked by a separate reader. 8 findings, 7 confirmed and fixed; the 1 not confirmed answered in the PR. A check that those fixes hold (`bc49f71..098c625`) and of the PR's body: two fresh reviewers, each finding checked by a separate reader. 9 findings, 8 confirmed and fixed, five of them by rewriting the push removal as one rule; the 1 not confirmed answered in the PR. A last check of that rewrite (`098c625..25efc81`) and the PR's body: two fresh reviewers, each finding checked by a separate reader. 10 findings, 9 confirmed and fixed, the removal's by stating what it must achieve and its cases and leaving the mechanism to B8; the 1 not confirmed answered in the PR. A final check of those fixes (`25efc81..f1685e9`) and the PR's body: two fresh reviewers, each finding checked by a separate reader. 13 findings, 12 confirmed and fixed, the removal's by stating each requirement its mechanism had carried; the 1 not confirmed answered in the PR. A check of those fixes (`f1685e9..4ca204f`) and the PR's body, one reviewer comparing section 6 with each earlier version: three fresh reviewers, each finding checked by a separate reader. 10 findings, all confirmed and fixed, the removal's by stating its requirements per sign-in. A check of those fixes (`4ca204f..c6b17ae`) and the PR's body: three fresh reviewers, one comparing with each earlier version, each finding checked by a separate reader. 11 findings, all confirmed and fixed. A check that those fixes do what the findings asked (`c6b17ae..2abad53`), and of the PR's body: four fresh checkers, each problem checked by a separate reader. 12 problems, 10 confirmed, which come to four, all in the PR's body and the log, and fixed there; the 2 not confirmed answered in the PR. The founder's answers of 2026-11-02, recorded in their own commit (`21a9cf9`), reviewed by two fresh reviewers (the documents, and privacy), each finding checked by a separate reader: 19 findings, 16 confirmed (ten problems) and fixed, including ADR-021; the 3 not confirmed answered in the PR. Ready to merge | None: documents and the journal tools, whose tests the log lists |
| #2 | `plan/b0` | `docs/plans/B0.md`, the B0 plan, brought from `draft/b0-plan` and updated for the founder's answers of 2026-11-02 (ADR-019 to ADR-021); `docs/LIMITATIONS.md`'s rows on the refused hosts and Docker, with the recheck of 2026-11-02; `docs/PROGRESS.md`'s shared section and this journal's state (section 1.1) rewritten. After its review: ADR-022 (the founder approves each PR, and Claude Code merges it), ADR-023 (the dev API host), FQ38 and FQ39, with sections 0.5 and 0.7 | First review: four fresh reviewers (what the plan covers, its order, privacy and security, the records and the PR's body), each finding checked by a separate reader. 42 findings, 40 confirmed, which come to 26 problems, all fixed, one through a question for the founder (FQ38); the 2 not confirmed answered in the PR. A check of those fixes (`194d72c..3d8627b`): four fresh reviewers (the fixes, the order, the new records, privacy and security), each finding checked by a separate reader. 30 findings, 27 confirmed, which come to 16 problems, all fixed, FQ38 rewritten and FQ39 added; the 3 not confirmed answered in the PR, one of them taken anyway. A last check of the second round's fixes (`3d8627b..e3a466e`): three fresh reviewers (FQ38 and FQ39, the order, the records and privacy), each finding checked by a separate reader. 15 findings, 10 confirmed, which come to 8 problems, all fixed; the 5 not confirmed answered in the PR | None: documents |
| #3 | `plan/b0-rulebook` | `CLAUDE.md`, `docs/GITHUB.md` and `README.md` brought in line with ADR-022 (the founder approves each PR in the project's thread, and Claude Code merges it); FQ38's answer recorded as ADR-024 and carried into `CLAUDE.md`'s "Order of work", `docs/MILESTONES.md` (B0's goal, TestFlight bullet and "Spikes", Gate 0's evidence, a paragraph under B2, Gate A's evidence) and `docs/plans/B0.md`; FQ38 marked answered in `docs/QUESTIONS.md`; `docs/LIMITATIONS.md`'s app-icon row; `docs/PROGRESS.md`'s shared section; this journal's sections 0.5, 0.7, 1.1, 3.1 and 4.1. After its review: the merge command's quoting, the first test of merging a workflow PR, FQ39's pointer, the spikes' second account (FQ28) | Four fresh reviewers (ADR-022 in the rulebook, FQ38's answer, the B0 plan end to end, the records and privacy), each finding checked by a separate reader. 15 findings, 11 confirmed, which come to 8 problems, all fixed; the 4 not confirmed answered in the PR | None: documents |
| #4 | `ios/b0-brand-ref` | Design handoff 0's delivery, unpacked as it arrived in `design/reference/claude-design/handoff-0/`; the named files made from it in `design/reference/brand/` (wordmark PDFs, icon PNGs, `brand-tokens.md`, `brand-components.png`) and `design/reference/screens/` (`H01-open`, `H01-open-dark`, `F02-upcoming`, `F02-upcoming-dark`); `design/reference/INVENTORY.md`'s rows, counts and "Known differences"; FQ40 to FQ44, with FQ20's answer and FQ26's second case; `docs/plans/B0.md` (F5, slice 11b, sections 5.1 and 5.2); `docs/LIMITATIONS.md`; `docs/PROGRESS.md`; this journal's sections 0.7, 0.8, 1.1, 2, 3.1, 4.1 and 4.4. After its review: `brand-tokens.md` holding only the delivery's words, the card radius and status line, the input border, rows `F01-no-club` and `M01-no-club`, FQ41's former members, FQ42 by B1, FQ45, handoff 1's attachments, and the plan's F6 and section 6. After the check of those fixes: FQ45 keeps to `design/reference/brand/` until the founder answers, `brand-tokens.md`'s first and cover lines, the plan's slice 9 (`evidence` exists), and this journal's state | Four fresh reviewers (fidelity to the delivery; differences against the spec, the book and the invariants; the B0 plan; the records and the PR's body), each finding checked by a separate reader. 25 findings, 21 confirmed, which come to 16 problems, all fixed; the 4 not confirmed answered in the PR. A check of those fixes (`a16bf78..5ca377c`): two fresh reviewers (the fixes, the records and the PR's body), each finding checked by a separate reader. 13 findings, 12 confirmed, which come to 8 problems, all fixed; the 1 not confirmed answered in the PR. Ready to merge | The comparison sheets on `evidence`, under `ios/b0-brand-ref/a16bf78/design/` |
| #5 | `ios/b0-handoff-1-requested` | Design handoff 1's 17 states (`docs/plans/B0.md` section 5.2) from `missing` to `requested 1` in `design/reference/INVENTORY.md`, with its counts; section 5.2 says when the brief was sent; `docs/PROGRESS.md`'s shared section; this journal's sections 1.1, 1.3, 3.1 and 4.1. After its review: `G06-no-club`'s stage to B0; section 5.2 says how the export comes back; the times of PR #4's merge and of the brief; the state's step on handoff 1's export | Two fresh reviewers (the inventory and the plan; the records, the PR's body and privacy), each finding checked by a separate reader. 6 findings, all confirmed, which come to 4 problems, all fixed | None: documents |
| #6 | `plan/b0-lanes` | The founder's choice of two threads from the B0 plan's slice 9, recorded as ADR-025 and carried into `CLAUDE.md` ("Order of work", "Git" with "Ask me first", "The journal", the approval sentences), `README.md`, `docs/GITHUB.md` (the approval sentences, steps 1 and 3, "Merge timing"), `docs/MILESTONES.md` (its introduction, and "Lanes" with the rules the two threads keep and Gate 0 as a joint gate), `docs/TECH-DESIGN.md` section 9's `ios` row, `docs/plans/B0.md` (the order, sections 1.2, 2, 3, 4, 6 and 7), `docs/PROGRESS.md`'s shared section, and this journal's rules and sections 0.5, 0.7, 1.1, 1.2, 1.3, 3.1 and 4.1; `main` merged in after PR #5 (`501179a`) | Four fresh reviewers (the rulebook's consistency, the B0 plan's order, safety and security, the records and the PR's body), each finding checked by a separate reader. 29 findings, 24 confirmed, which come to 18 problems, all fixed: the approval only in the PR's own thread (the relay removed), when the lanes start, Gate 0 as a joint gate, the reviewer's lane check, the shared block's conflict rule, the B0 plan's owners and the spikes', `dev` claimed through the coordinator, the `evidence` reset, the founder's yes for "Ask me first", the keys' and slice 11b's timing, the set-aside rule, the end of `ios.yml`'s skip, and the records; the 5 not confirmed answered in the PR. Ready to merge | None: documents |
| #7 | `api/b0-workspace` | Slice 1: the pnpm workspace (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.base.json`, `eslint.config.js`, Prettier), the empty packages of `docs/TECH-DESIGN.md` section 3, and the copy lint (`packages/domain/src/copy/`, `pnpm copy-lint`; T41 to T43); the environment checks in `docs/LIMITATIONS.md`; `docs/PROGRESS.md`; this journal's sections 1.1, 2, 3.1 and 4.1. After its review: `tests/` and `tools/ops/` in the workspace, vitest 5.0.5, `.prettierignore` narrowed to `tools/ci/`, and the copy lint's gaps closed (more HTML attributes, every exclamation form, `\U` escapes, UTF-16 without a mark, the skip list) | One fresh reviewer. 10 findings: 7 fixed (vitest 5.1.0 let past pnpm's release-age policy, `tests/` and `tools/ops/` outside the workspace, `tools/` wholly unformatted, HTML attributes, exclamation forms, `.strings` escapes and UTF-16 without a mark, a too-broad skip); 3 answered in the PR (copy outside string files, written into the T41 to T43 audit rows for the slices that bring it; keys linted as copy, kept on purpose while the trial is English-only; "Sent" in every form, kept strict and flagged to the founder) | None: the session's runs, in the log |
| #8 | `api/b0-ci` | Slice 2, CI configuration only (T58): `.github/workflows/ci.yml` (jobs `node`, `postgres`, `swift`, `tools`, `guards` and the final `ci`), pushed by the session; `tools/ci/ci_config_guard.py` (guard 1), `tools/ci/ci_steps.py` (the steps `ci.yml` calls, later targets passing empty until slice 12, and the ratchet) and `tools/ci/toolchain.py` (Xcode 26.6, Swift 6.3.3, Postgres 17), with their tests; ADR-026 (approved by the founder at 01:26 UTC on 2026-11-03 and built: `ci`'s Postgres made like Supabase's, `supabase_admin` its superuser, and the bootstrap run as a `postgres` that isn't one); `docs/LIMITATIONS.md` (workflow files pushable, the simulators, `supabase.com` and `apt.postgresql.org` refused, the session's PostgreSQL 16, Docker Hub's rate limit, the Swift pin, Swift installed in the session); this journal's sections 0.5, 1.1, 2, 3.1 and 4.1. After its review: the ratchet, `pnpm` without `--if-present`, the database steps one package at a time, the roles' SQL on every run, `tools-tests` through `unittest`, the `ci.yml` coverage test, `main`'s per-commit concurrency group, the Swift pin's evidence, and the records' times. After its second review: ADR-026's `postgres` owning the database with Supabase's ADMIN grants and refused if a superuser, the API roles inheriting, the ratchet per package with `RETIRED_TARGETS`, `TARGETS` as the steps' one source, the job-level `if: always()` test, the root-relative glob, T53's and T59's rows, and Next step 4 naming every place. After its third review: every workspace package named and no two alike for the ratchet, the package steps' scripts pinned by name again, section 0.7, the audit rows' runs, Next step 4's places, and the cluster row's stop command. After its privacy and security review: a `pnpm-workspace.yaml` setting outside `PNPM_SETTINGS`, or a root pnpmfile, refused by the pnpm steps, and the CI tools' tests run isolated | Four fresh reviewers (the scripts, the workflow, the plan, the records), each finding checked by a separate reader. 21 findings, 20 confirmed in whole or part, which come to 18 problems: 17 fixed (the ratchet; `--if-present` and the workspace reader; files that run no test; the `ci` job's `needs`; the guard's and the steps' missing tests; the roles' SQL on Postgres 17; one package at a time on the database; `main`'s concurrency group; the Swift pin's evidence and its install; the journal's and the logs' times; T58's status; section 0.5; the rulebook PR and `docs/PROGRESS.md` in Next; the required check asked for; Docker's 429), and 1 put to the founder as ADR-026 (CI bootstraps as a superuser, and Supabase's `postgres` isn't one); the 1 not confirmed answered in the PR's description. Second review, of those fixes and ADR-026 (`f611024` and the founder's choice): three fresh reviewers (the workflow and ADR-026, the scripts, the records), each finding checked by a separate reader. 10 findings, 5 confirmed and 5 confirmed in part: 9 fixed (`postgres` not owning the database and without Supabase's grants; no refusal of a superuser `postgres`; one package losing a script another keeps; the `if: always()` test matching a step's; the glob reading the root as a pattern; `TARGETS` and the steps not tied; the API roles not inheriting; T53's and T59's rows; Next step 4's places), 1 fixed by rewriting the PR's description, at 02:05 UTC (the answers were said to be in it before they were); the `typecheck` part of the ratchet finding answered in it. Third review, of those fixes and ADR-026's build (`f611024..9748d0a`): two fresh reviewers (the code, the records), each finding checked by a separate reader. 10 findings, 7 confirmed and 3 in part, all fixed: two packages sharing a name, and a package without one, seen wrongly by the ratchet; the package steps' scripts no longer pinned by name (a test weakened at `9748d0a`, restored); Next without this review; section 0.7 without ADR-026; Next step 4 missing two places; the records saying the answers were in the PR before they were; the T59 row citing a run from before ADR-026; the cluster row's stop command; two overstated counts. Privacy and security review (`docs/GITHUB.md` step 3), at `7f3b7a4`: one fresh reviewer that looked only at privacy and security, its findings checked by a separate reader. 2 findings, 1 confirmed and 1 in part, both fixed: a pnpm setting or a root pnpmfile could make every pnpm check pass without running; a root `unittest.py` or `tools/__init__.py` could stand in for the CI tools' tests. A check of the PR's description, at `7f3b7a4`: one fresh reader, its findings checked by a separate reader. 6 findings, 5 confirmed and 1 in part, all fixed: the records not complete when the description said ready; `docs/MILESTONES.md` and `CLAUDE.md`'s layout line missing from the rulebook PR's list; one answered alternative missing; no risks in "Ready for the founder"; the privacy-and-security box ticked before that review ran | `ci` runs 41551742269, 41552080216, 41557133745 (at `f611024`), 41561641059 (at `9748d0a`), 41563717087 (at `7f3b7a4`) and 41568092779 (at `8450ca8`, the approved head), green; merged at the founder's approval (02:53 UTC on 2026-11-03) as `c06edbe`, and `ci` green on `main` there (run 41568890065) |
| #9 | `plan/b0-rulebook-ci` | At the founder's yes, every rule about workflow files brought in line with PR #8, where the session pushed `ci.yml` and merged its PR: `CLAUDE.md` ("Environment", "Git", "Repository layout"), `docs/GITHUB.md` (version 1.3, step 6, "Workflow files", the full SHA for `{sha}`), `docs/TECH-DESIGN.md` (version 1.2, sections 9 and 10), `docs/MILESTONES.md` (version 1.3, B0's CI bullet), `docs/plans/B0.md` (section 2 with row 9's check-branch reason, the risks, section 3); `docs/LIMITATIONS.md`'s workflow row (the merge accepted); `docs/PROGRESS.md`'s shared section; this journal's sections 0.5, 0.7 (FQ45), 1.1, 1.3's design line, 2 (T58, T59), 3.1 and 4.1. After its reviews: the refusal fallback in `docs/GITHUB.md` made general (every refusal banned from workarounds; how to undo a refused push of a workflow branch; yamllint with the repository's settings), and the refused merge of `main` made safe (pushed at once with nothing on top, in `CLAUDE.md` too; dropped only when it had no conflicts and is the last commit; Update branch and not Update with rebase; a fresh branch otherwise, the old branch left as it is); the version lines; row 9's reason; FQ45 read from its card, its timing left open; the handoff dates; 1.3's design line; two CI-configuration leftovers carried into slice 9's step | First review, at `f359593`: three fresh reviewers (the rules across the repository, anything relaxed, the records), each finding checked by a separate reader. 11 findings, 5 confirmed and 6 in part, which come to 8 problems: 7 fixed at `3064799` (the refusal fallback written for a one-time test and silent on a refused merge of `main`; yamllint's settings dropped from it; the version lines; row 9's "can't take"; FQ45 dropped from the defaults on an unread relay, with 0.7 left saying it was open; handoff 1's delivery date; 1.3's design line), 1 answered as a follow-up the PR can't make (`.yamllint.yaml`'s comment, CI configuration under T58, now Next step 6, the rule kept off for the fallback). Second review, of those fixes at `3064799`: two fresh reviewers (the procedure, each git command walked through its cases; the records), each finding checked by a separate reader. 7 findings, 3 confirmed and 4 in part, all fixed: a refused merge of `main` dropped with commits on top of it lost them from the tree; Update branch not named as the merge, with no rule for waiting or for a refused `git pull --ff-only`; no route for a branch without a PR; Next without the second review; FQ45's timing given as the coordinator's, not the card's, and its thread given a name the journal never defines; the first review's counts; the CI-configuration leftovers listed after slice 9's step (the in-part ones: Update branch, whose `journal_check.py` point wasn't taken; the branch without a PR, older than this PR; Next without the second review, whose "running" step wasn't taken; step 6's order, not renumbered). Third review, of those fixes at `824c74e`: two fresh reviewers (the procedure; the records), each finding checked by a separate reader. 8 findings, 1 confirmed, 6 in part and 1 refuted: 7 fixed (the two "Merge timing" cases overlapping for a merge with conflicts; `CLAUDE.md`'s "Git" still asking for Update branch unconditionally; FQ45's 0.7 saying ADR-027 was given to a thread not yet started, and leaving out when the founder is asked; the description's first-review counts and FQ45 text, claimed fixed before they were; Next and `docs/PROGRESS.md` counting two reviews; the second review's in-part findings unnamed; Next step 1's short SHA), 1 answered (1.1 quoting the card's "when handoff 1 is brought in" beside the choice: refuted, it is the chosen option's own wording) | None: documents only; `ci` runs 41569746184 (at `f359593`), 41571881448 (at `3064799`), 41573707711 (at `824c74e`) and the one on the third review's commit, linked in the PR's description |

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
| The named files made from them | `design/reference/brand/` and `design/reference/screens/` (`docs/DESIGN-HANDOFF.md`, "Naming rule") |
| A delivery's renders beside 2.1's, as JPEG sheets | `<branch>/<short-sha>/design/`, until the monthly reset |

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
