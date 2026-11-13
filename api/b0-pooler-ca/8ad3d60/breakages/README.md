# PR #46's deliberate breakages, at `8ad3d60`

`8ad3d60` is the third commit of `api/b0-pooler-ca` (PR #46). It answers review round 1. The PR makes every database link check the session pooler's chain against Supabase's root, and the pooler's name against the host dialled (`docs/plans/api-b0-pooler-ca.md`).

**Result: all 48 caught** (`summary.txt`). They ran on 2026-11-13, in a detached worktree whose code was `8ad3d60`'s, with Node 26.13.0. This is not yet the PR's last head. Review round 2 adds a fourth commit and five more breakages. Their run, and the run at the head the founder approves, go up beside this folder, under `api/b0-pooler-ca/<short sha>/breakages/`.

## What a breakage is

Each entry of `B` in `breakages.py` changes one exact text, or a few texts, in one of these files:
- `packages/domain/src/db/ssl.ts`;
- `tools/ops/src/database.ts`, `environment.ts`, `run.ts` or `main.ts`;
- `services/api/src/connection.ts` or `services/worker/src/connection.ts`.

After each change, the script runs `npx vitest run` on the pin's test files:
- in `packages/domain`: `ssl.test.ts`;
- in `services/api`: `connection.test.ts` and `connection-tls.test.ts`, the real handshakes;
- in `services/worker`: `connection.test.ts`;
- in `tools/ops`: `database.test.ts`, `environment.test.ts`, `deploy-files.test.ts`, `run.test.ts`, `main.test.ts` and `bootstrap.test.ts`.

A breakage counts as caught only if both of these hold:
- a command fails;
- the output contains the words registered for that breakage, which are the start of a test's name.

A change that only breaks the build therefore doesn't count. The script restores each file after its entry, and compares a digest of the worktree before and after the run (`worktree restored`). Each file in `results/` records its entry's exact patch, the commands, the exit code, the words expected, the verdict, and the lines of output that name a failure.

These are the commands, run from the folder that holds `breakages.py`. Use a worktree of your own, because the script changes files in it and restores them:

```
git worktree add --detach /tmp/brk 8ad3d60
(cd /tmp/brk && pnpm install --frozen-lockfile)
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
BREAK_ROOT=/tmp/brk BREAK_OUT=$PWD/out python3 breakages.py --check   # every anchor found as often as stated
BREAK_ROOT=/tmp/brk BREAK_OUT=$PWD/out python3 breakages.py           # all, or --only NAME…
```

## Earlier runs

- `first-run-at-9f5bf6e/`: the first commit. 31 of 37 were caught. The six missed showed two gaps:
  - no test saw the root file checked when it is read, either through `supabaseRootCa` or through `pgEnvOf`;
  - no case reached `checkPinnedRoot`'s failure to read a certificate.

  They also showed three overlapping conditions in `checkPinnedRoot` that no test could tell apart.
- `run-at-09a5211/`: the second commit, which closes those gaps. 38 of 38 were caught.

Each run's files come from the script as it stood then, and each file records its own patch.

One name in the main run is wrong: entry 012, `root-read-each-time`. It deletes `root = pem;`, so `supabaseRootCa` returns undefined, and that is what the test catches. It doesn't make the file read on every call. Review round 2 found this (s-4). In the fourth commit the entry is renamed `root-never-kept`. A new `root-read-each-time` really does read on every call, and the read-once test now counts the reads.
