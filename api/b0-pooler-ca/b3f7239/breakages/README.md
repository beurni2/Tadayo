# PR #46's deliberate breakages, at `b3f7239`

`b3f7239` is the fourth commit of `api/b0-pooler-ca` (PR #46). It answers review round 2, which found nothing of medium or higher and 16 low findings. The PR makes every database link check the session pooler's chain against Supabase's root, and its name against the host dialled (`docs/plans/api-b0-pooler-ca.md`).

**Result: all 53 caught** (`summary.txt`). They ran on 2026-11-13 in a detached worktree whose code was `b3f7239`'s, with Node 26.13.0.

The method, the commands and the earlier runs are in `../../8ad3d60/breakages/README.md`. This run uses the same `breakages.py`, with these changes:
- **Five new entries:**
  - `root-read-each-time` makes `supabaseRootCa` read the file on every call.
  - `refusal-misses-another-root` drops `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` from `certificateRefusal`'s set.
  - `refusal-misses-a-twin-root` drops `CERT_SIGNATURE_FAILURE`.
  - `refusal-misses-unspecified` drops `UNSPECIFIED`.
  - `image-root-shut-out-again` puts `**/*.crt` after `.dockerignore`'s allowlist.

  Each is caught by the test named in its file under `results/`.
- **One rename:** entry 012, which deletes `root = pem;`, is renamed `root-never-kept`, because that is what it does.
- **Wider scope:** the script now also changes `.dockerignore`, `tools/ops/src/run.ts` and `tools/ops/src/main.ts`.

If the PR's head moves past this commit, the run at its last head goes up beside this folder, under `api/b0-pooler-ca/<short sha>/breakages/`.
