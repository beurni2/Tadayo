# PR #46's deliberate breakages, at `47488e2`, the PR's last head

`47488e2` is the fifth and last commit of `api/b0-pooler-ca` (PR #46). It answers a fresh check of the fourth commit, which found 7 low findings and nothing of medium or higher. It changes no code beyond two comments. The PR makes every database link check the session pooler's chain against Supabase's root, and its name against the host dialled (`docs/plans/api-b0-pooler-ca.md`).

**Result: all 53 caught** (`summary.txt`). They ran on 2026-11-13 in a detached worktree of `47488e2` itself, with Node 26.13.0, and the worktree was restored.

`breakages.py` is the same script as `../../b3f7239/breakages/`, byte for byte. The method and the commands are in `../../8ad3d60/breakages/README.md`. The earlier runs:
- `9f5bf6e`: 31 of 37;
- `09a5211`: 38 of 38;
- `8ad3d60`: 48 of 48;
- `b3f7239`: 53 of 53.
