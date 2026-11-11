# Running B0 in two threads: a proposal

> Copied unchanged below this note from the project's files, where it was written for the founder, on 7 November 2026. The founder chose its recommended option, two threads from slice 9, on 2 November 2026; ADR-025 in `docs/DECISIONS.md` records it, and `CLAUDE.md`, `docs/MILESTONES.md` ("Lanes") and `docs/plans/B0.md` carry its rules.

*2 November 2026. For you to decide. Nothing changes until you answer.*

## The answer

Yes, with two threads, from a point early in B0. Most of B0 is a chain in which each slice builds on the one before, and five of its PRs are workflow files that can only go up when no other branch is waiting to merge. The safe gain is to start the two lanes the rulebook already defines, **api** and **ios**, during B0 instead of after Gate 0. The ios thread then builds the app (slices 11 and 11b) while the api thread builds the backend (slices 3 to 8 and 10a).

At most, that saves the time slices 11 and 11b take, less the part of slice 11 that waits for the contract (slice 3). It saves that much only if the backend slices take longer than the app slices, and Apple's items arrive before slice 12. It doesn't halve B0. A third thread would gain little, and would put two threads in the same lane's folders and journal block.

Every safety rule you have today holds in both threads: one branch per slice, your approval before every merge, the independent review, keys never in a chat, nothing in `prod`, and your yes before anything on CLAUDE.md's "Ask me first" list.

## The order

**1. This thread finishes, then stops making branches.** PR #5 (handoff 1's states) merges once you approve it. If you agree to this proposal, I write one rulebook PR (below), which merges once you approve it. After that, this thread makes no branch. It stays open only to receive handoff 1's export, which goes into the project's files, not onto a branch, so it holds nothing up. Its last journal entry hands over to the api thread.

**2. The api thread starts alone,** in a new session (this one started before your environment was set, so it has no journal hook). In order:
- the environment checks: the journal hook, the hosts, Docker and Swift, recorded in `docs/LIMITATIONS.md`;
- slice 1, the workspace and the copy lint;
- slice 2, `ci.yml` (a workflow PR);
- slice 9, `ios.yml` (a workflow PR), **moved up from after slice 8**. It needs only slice 2's Swift pin. Then its check run on `ios/b0-ios-check`, and if `ios.yml` needs a fix, that fix's workflow PR and a second check run.

**3. The ios thread starts** once `ios.yml` has run green on the latest check branch. The coordinator starts it. Until then, no other session makes a branch.

**4. The two threads work side by side:**

| api thread | ios thread |
|---|---|
| 3 contract: the OpenAPI file and the mock | 11 the app, first the parts that need nothing from the api thread: `project.yml` with both targets, `TadayoCore`, `TadayoDesign` with book p35's tokens, and the Lab |
| 4 database | 11 continued: once 3 has merged, `TadayoAPI`, the profile and the three tabs against the mock |
| 5 time | 11 continued: sign-in, against `tadayo-dev` |
| 6 authorization | 11b the icon and the brand's tokens |
| 7 privacy matrix and leak scanner | |
| 8 auth | |
| 10a deploy scripts | |

Sign-in never goes through the mock: the app signs in with Supabase directly (T53). So `tadayo-dev`'s URL and publishable key are needed by whichever of slices 8 and 11 reaches sign-in first, not only by slice 8.

**5. Serial again.** 10b (`ops.yml`), then the `ops` steps and your Fly secrets, then 10c (`deploy-dev.yml`), then 12 (`ios-release.yml` and the first TestFlight build). Each of these goes up only when neither thread has another branch meant to merge. If slice 11 is still going when 10a is done, 10b waits for it to merge; if 11b hasn't started, it waits until 10c has merged. The coordinator picks whichever order leaves no work set aside. After slice 12, the ios thread brings in handoff 1's delivery (plan section 5.2).

**6. The spikes S5, S3 and S6, one at a time,** in the plan's order (section 4). S5 and S6 use the one `dev` environment (the dev clock, `deploy-branch`), and S3 and S6 use your iPhone.

## What must stay serial, and why

- **Every workflow PR:** 2, 9, 10b, 10c and 12, and any fix to `ci.yml` or `ios.yml` found later. Once a workflow change merges, every other branch has to merge `main`, and a cloud session can't push that merge. The likeliest unplanned one is an `ios.yml` fix found during slice 11, the first full app it builds. That would make the api thread set aside the slice it has in progress (rule 7).
- **Anything on `dev`.** There is one Supabase project, one Fly app and one dev clock. Once 10c has merged, every merge to `main`, from either thread, migrates and redeploys `dev`, which replaces any `deploy-branch` deployment a spike is using.
- **Your approvals.** Two threads don't add PRs, but two can wait for you at once. A PR that has to merge `main` after the other thread's merge needs your approval again at its new head.
- **Rulebook changes** (CLAUDE.md, MILESTONES and the rest) stay in their own PRs, one at a time.

## The rules that keep both threads safe and in sync

1. **Each thread owns its folders** (MILESTONES, "Lanes"). The api thread: `services/`, `packages/domain`, `packages/contracts`, `db/`, `tests/`, `apps/web`, `tools/ops/`, `infra/`, `Dockerfile` and `fly.toml`. The ios thread: `apps/ios/`, `packages/swift/`, the inventory and the design handoffs. In the B0 plan, each edits only its own slices' rows, and the ios thread section 5. A spike's report in `docs/spikes/` belongs to the thread running that spike. Neither edits the other's files; a request goes in `docs/PROGRESS.md` under "Needs from the other lane".
2. **One branch per slice,** made from `main` and never shared, with no force-push and no rebase. The one shared branch is `evidence`, which both threads and the `ios` workflow push to. A thread fetches it before adding files; if its push is refused, it merges `origin/evidence` into its copy and pushes again. The monthly reset of `evidence` waits until both threads have pushed everything and agreed through the coordinator; then each fetches the fresh branch.
3. **The contract is the seam.** Only the api thread changes `openapi.yaml`, in a PR of its own. When a contract change merges, the ios thread merges `main` into its open branch, since `TadayoAPI` is built from that file.
4. **The `ios` workflow skips branches with no app.** Because `ios.yml` now reaches `main` before the app does, every push of the contract slice would otherwise start a macOS run that fails. That would put a red mark on the api thread's PR and use about 15 of the roughly 300 macOS minutes a month GitHub Pro includes. So slice 9 gives the workflow a short first job on Linux, and the macOS job runs only when the branch has `apps/ios/project.yml`. The `ios` check isn't required, so a skipped run is fine (TECH-DESIGN section 9).
5. **One merge at a time, each tested with the other's work.** You approve a PR in its own thread, and that thread merges it at the approved head, checks `ci` on `main`, and tells the other thread. `main` doesn't require a branch to be up to date before it merges, so the other thread then merges `main` into its open PR if it conflicts or a contract change has merged, pushes once, waits for `ci` (and `ios`) on that head, and asks for your approval again.
6. **The journal: separate where it can be.** The api thread keeps the shared block, its block 1.2, log section 3.2 and PR table 4.1. The ios thread keeps block 1.3, log section 3.3 and PR table 4.2. Each edits the lines about its own work in section 0 and the shared block (for the ios thread: the app, the design, TestFlight, the `ios` workflow and the Swift tests), and the audit rows its work touches; both will edit some rows, such as T1 and T41 to T43. On a conflict, the thread rebuilds the journal from both whole versions and keeps every entry. `journal_check.py` only checks that each lane rewrote its own "Updated" line, so the independent review checks that each thread stayed in its own parts.
7. **A freeze before every workflow PR.** Before one goes up, each thread tells the coordinator it has no branch meant to merge, pushed or not, opened as a PR or not. A thread with one either finishes it or sets it aside: it closes the PR with a comment linking the workflow PR, and re-applies the slice on a fresh branch from `main` once the workflow has merged. Neither thread makes a new branch until the workflow PR has merged.
8. **Numbers never collide.** No thread writes a PR number before GitHub has given it: until then, its log headings say `PR none`, which the journal guard already accepts. FQ and ADR numbers are reserved through the coordinator before first use and kept in the project's memory, so a new session finds them. Each new one still goes at the end of its file.
9. **One thread at a time on `dev`:** the `ops` scripts, the dev clock, `worker-scale` and `deploy-branch`. While a spike runs on `dev`, no PR merges, handoff 1's delivery included, until the spike's thread says it's done.
10. **Each session checks itself.** Hooks and Swift load per session, so the ios thread repeats the environment checks when it starts and records them in its first PR. Until its own hook is confirmed, it runs `python3 tools/ci/journal_check.py --branch` before every push.
11. **The same rules everywhere.** Every PR gets an independent review, plus the privacy and security review where the rules ask for it. Nothing touches `prod`. Without your yes in its own thread, no thread does anything on CLAUDE.md's "Ask me first" list: a database reset or destructive migration (and none merges until FQ39 is answered), deleting storage objects, changing App Store Connect settings, certificates or the bundle id, sending notifications to real people, or inviting testers. Keys go only from you into GitHub, Fly or Supabase settings, never into a thread.

## What changes in the rulebook, if you agree

One PR of its own, written by this thread, with ADR-025 recording your decision:
- **CLAUDE.md:** "Order of work" (the lanes start at B0's slice 9 instead of after Gate 0); "The journal" (the shared block is the one session's until the lanes start, then the api lane's); and the approval sentence, which says you approve a PR in the thread where it was reported. The same sentence changes in README and `docs/GITHUB.md`, and ADR-025 amends ADR-022's wording to match.
- **MILESTONES:** the opening paragraph and "Lanes", which also gains rules 2 and 5 to 10 above.
- **GITHUB.md:** "Merge timing", where "your lane has no other PR open" becomes "neither lane has a branch meant to merge, opened as a PR or not".
- **The B0 plan:** the new order; section 2's "no other branch of mine" becomes "of either lane"; the "Starts when" of slices 3, 9, 10a and 11; slice 9's skip for branches with no app; and section 1.2's key request, now due at whichever of slices 8 and 11 reaches sign-in first.
- **The journal:** its Rules, section 0.5, the state's "Lanes" line, blocks 1.2 and 1.3, and section 4.1's heading.
- `tools/ci/` needs no change: `journal_check.py` already knows the `api` and `ios` lanes.

## What it costs

- More coordination: a freeze before each workflow PR, and a new approval when a PR has to merge `main` after the other thread's merge.
- A small risk of losing a slice in progress, if a workflow fix turns up in the middle of it (rule 7).
- No more macOS minutes than one thread would use. Each look at an iOS screen is still a CI run of about 15 minutes, with roughly 20 runs a month included, so that budget limits how fast the ios thread can go.

## Options

- **Two threads from slice 9** (recommended): the gain above, with the lane rules that already exist plus the ones above.
- **Keep one thread until Gate 0:** no rule changes and no coordination, and B0 takes longer by about the app slices.
- **Three threads:** a second api thread, for example the database beside the contract. It saves little, and two threads would share the api lane's folders and journal block.
