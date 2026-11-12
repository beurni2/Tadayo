# PR #41's deliberate breakages, at `7cf0071`

The sixth commit of `api/b0-ops-ssh` (PR #41, ADR-034) is `7cf0071`. It fixes what a fresh check of the fifth commit found, and it is the last commit that changes code. `ops` reaches the API's Machine with `flyctl ssh console`, and it removes the WireGuard peer each session makes.

**Result: all 84 caught** (`summary.txt`). They ran on 2026-11-12, finishing at 09:31 UTC, in a detached worktree of `7cf0071`, with Node 26.13.0. The same 84 were all caught at the fifth commit, `27a63e4`, at 09:09 UTC (`run-at-27a63e4/`).

## What a breakage is

Each entry of `B` in `breakages.py` changes one exact text in one of three files:
- `tools/ops/src/on-machine.ts` (the session and the peer's clean-up);
- `tools/ops/src/fly.ts` (`forDevApp`, the fence on flyctl's calls);
- `tools/ops/src/run.ts`.

After each change, the script runs `npx vitest run` on four test files in `tools/ops`: `src/on-machine.test.ts`, `src/run-remote.test.ts`, `src/main.test.ts` and `src/fly.test.ts`.

A breakage counts as caught only if both of these hold:
- the run fails;
- its output contains the words registered for that breakage: the start of a test's name, or a regular expression over several names (`re:`).

The script restores each file after its entry. It compares a digest of the worktree before and after the run (`worktree restored`). If an entry's text isn't found exactly, the run stops and names the entry, and nothing counts as caught.

These are the commands, run from the folder that holds `breakages.py`. Use a worktree of your own, because the script changes and restores files in it:

```
git worktree add --detach /tmp/brk 7cf0071
(cd /tmp/brk && pnpm install --frozen-lockfile)
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
BREAK_ROOT=/tmp/brk BREAK_OUT=$PWD/out python3 breakages.py --check   # every anchor found once
BREAK_ROOT=/tmp/brk BREAK_OUT=$PWD/out python3 breakages.py           # all, or --only NAME…
```

## Files

- `breakages.py`: the script and its 84 entries, as they ran here.
- `summary.txt`: one line per breakage (`CAUGHT` or `MISSED`, and the exit code). `results.json` holds the same data.
- `run.log`: the run's own lines.
- `results/<NNN>-<name>.txt`: each breakage's patch, command, exit code, registered words and verdict, with the lines of the test output that name failures.
- `first-run-at-6fe4988/`: the first run of the first 78 entries, at the third commit, `6fe4988`.
- `rerun-at-cf17b37/`: the nine breakages the first run missed, run again against the fourth commit's tree, `cf17b37`.
- `trial-before-27a63e4/`: the entries the fifth commit touched or added, tried against its tree before it was committed.
- `run-at-27a63e4/`: all 84 at the fifth commit, with the script as it was then.

## How the list came to be

**The first run** (`first-run-at-6fe4988/`) caught 69 of 78 entries. Of the 9 it missed:

- **One was registered under the wrong test:** `prefix-any-interactive`. The test it named, `removes every new peer named for this runner…`, has the other host's peer in the list before the session, so this breakage can't fail it. The test that holds the rule, `leaves a new peer not named for this runner…`, did fail in that run. The entry is now registered to that test.
- **Eight were real gaps.** The fourth commit added or extended a test for each:
  - `timeout-error-line-taken-as-flyctl`
  - `no-status-any-exit-code`
  - `making-line-after-session`
  - `strangers-unsaid-when-ours-left`
  - `reached-without-exit-status`
  - `reached-without-no-status`
  - `attempt-throws`
  - `fence-list-without-json`

  `docs/JOURNAL.md` section 3.2 has the details, in the entry for `cf17b37`.

The first run's script isn't kept on its own: the script was later edited where it stood. Each file in `first-run-at-6fe4988/results/` records its entry's patch and registered words.

**The rerun at `cf17b37`** (`rerun-at-cf17b37/`) caught all nine. Three entries were registered there to the new tests:
- `making-line-after-session`: `says that the session makes a peer…`
- `strangers-unsaid-when-ours-left`: `says a new peer not named for this runner too…`
- `attempt-throws`: `goes on with the clean-up when a removal's flyctl can't be started`

**The fifth commit** (the second review) changed the code, so the list changed with it:

- **Anchors moved by the fixes:** `attempt-throws` and the five `removal-*` entries.
- **A test replaced:** the agent-start test was replaced by `says every line of flyctl's failure to start its agent…`. `tunnel-hint-always` and `none-found-when-not-reached` now name it. `none-found-when-not-reached` also names the new test `says no peer of this run's is listed after a session that failed short of the Machine`.
- **Six new entries:**
  - `unmade-removal-as-exit-code`: a call the runner couldn't make reported as an exit code;
  - `unmade-list-ignored`: a listing that wasn't made read as flyctl's answer;
  - `unreached-none-unsaid`: nothing said after a session that failed short of the Machine with no new peer;
  - `relist-counts-all-ours`: the new list counting every peer of this run's, not only the failed removals. The second review's refuter judged it equivalent in every state flyctl can produce, because flyctl exits 0 only once Fly's API has removed the peer. Its test fakes a list that still shows a removed peer, as a list read too soon would.
  - `strangers-maybe-ours-beside`: a stranger said to be maybe this run's even beside one of this run's;
  - `strangers-never-maybe-ours`: never saying a stranger may be this run's.

**The trial before `27a63e4`** (`trial-before-27a63e4/`):

- **First invocation** (`first-invocation.log`): 11 of 12 caught. `unmade-list-ignored` failed only `starts no session when the peers can't be listed first…`, because its case is in the test of the first listing. It was registered to the test of the list after the session.
- **The fix:** its registration was changed to name both tests, and it was tried again with the other new entries, caught. This was the trial's one change of registration, made before the run above.
- **Numbering:** the second invocation numbered entries after a new one was inserted, so two files there carry 082.

**The sixth commit** reworded the runner's line after flyctl's own failure or a timeout and renamed the test that holds it. So `unreached-none-unsaid`'s anchor and the words `UNREACHED` changed between `run-at-27a63e4/breakages.py` and `breakages.py`; nothing else did.

## The 84

`summary.txt` lists them in order. The groups:

| Entries | What they break | Files |
|---|---|---|
| 001 to 023 | the session's command and arguments, and how flyctl's exit and last line are read | `on-machine.ts` |
| 024 to 037 | the organization, the first list, the line before the session, and the host and prefix rule | `on-machine.ts` |
| 038 to 048 | strangers, none found, and `reached` | `on-machine.ts` |
| 049 to 054 | the lists, and `attempt` | `on-machine.ts` |
| 055 to 065 | the removals and the new list | `on-machine.ts` |
| 066 to 069 | what happens after the clean-up | `on-machine.ts` |
| 070 | the runner's lines kept apart from the Machine's report | `run.ts` |
| 071 to 078 | `forDevApp`'s two WireGuard shapes | `fly.ts` |
| 079 to 084 | the second review's six new entries | `on-machine.ts` |
