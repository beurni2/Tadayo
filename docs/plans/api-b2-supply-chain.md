# The outside audit's B6: smaller supply-chain and branch gaps (api lane)

The outside audit of 24 November 2026, its item B6 (Low, T58): "Smaller supply-chain and branch gaps". The founder's
order of the audit's items (the coordinator's relay of 10:02 UTC on 2026-11-24): B1, B7, B8, B6. This is the last of
them, and the parts that are the api lane's. Three pull requests, because `ci_config_guard.py` (guard 1, T58) lets a
branch that changes `tools/ci/` or `.github/` change nothing else but the logs.

## 0. The five items, re-checked on `main` at `57d9641`

1. **The `evidence` branch is unprotected, and `ios.yml`'s evidence job gives a write token to the branch's own
   script.** A branch rule is a setting of the repository, the founder's (with the audit's A1 and A2); `ios.yml` is the
   ios lane's. Section 2.
2. **Old `ios/b0-*-check` and `-probe` branches.** On 2026-11-28 the repository has 38 branches, 20 of them an ios
   check or probe: `ios/b0-adopt-email-check`, `-adopt-header-check`, `-adopt-root-probe`, `-arrival-probe`,
   `-email-return-check`, `-email-return-check-b`, `-ios-check`, `-ios26-check`, `-ios26-glassprobe`,
   `-ios26-tabprobe`, `-keychain-check`, `-pin-stuck-shot-check`, `-pin-tree-probe`, `-plugins-check`,
   `-profile-scroll-probe`, `-spike-video-probe`, `-xcode27-check`, and `ios/b1-glass-probe`, `-keyboard-probe`,
   `-opening-probe`. Deleting them is destructive and shared, and they are the ios lane's. Section 2.
3. **`flyctl`'s pinned SHA-256 came from one download** (`tools/ci/ops_steps.py` `FLYCTL_SHA256`). Compared on
   2026-11-28 with the v0.5.8 release's own `flyctl_0.5.8_checksums.txt` (the release names it so; `checksums.txt`
   answers 404): its line for `flyctl_0.5.8_Linux_x86_64.tar.gz` is
   `0115ae5202c9984695e22e4e99a375565ae3d7edc462377ce00c833406c877ac`, the pin, and the tarball downloaded the same
   day hashes to it. Recorded beside the pin in PR 2.
4. **pnpm comes from npm with no check of its own, and `.nvmrc` is a floating major; no audit runs.** `ci_steps.py`
   `setup_pnpm` and the `Dockerfile` run `npm install --global pnpm@12.16.1`, which takes whatever tarball the
   registry serves for that name, checked only against the registry's own word. Yet the repository already pins it:
   `pnpm-lock.yaml` records pnpm itself (`packageManagerDependencies`), `pnpm@12.16.1` with integrity
   `sha512-CR0d7nkn…MvZW0Q==`, which the registry's tarball matched on 2026-11-28. `.nvmrc` says `26`, so `ci`'s
   `setup-node` takes the newest Node 26 while the image runs 26.13.1 (and `docs/LIMITATIONS.md`'s row of 2026-11-06:
   a newer tzdata could come with no commit).
5. **`journal_check.py` skips any commit whose committer email is `noreply@github.com`,** which any client can set,
   so such a commit needs no journal entry. The skip is there for a commit the founder makes on GitHub's website (a
   workflow file GitHub refused from a session, `docs/GITHUB.md`, "Workflow files"; `journal_check_test.py`
   `test_web_commits_need_no_entry`). GitHub signs every such commit with its web-flow key, fingerprint
   `968479A1AFF927E37D1A566BB5690EEEBB952194` (created 2024-01-16): the key from `keyserver.ubuntu.com` verifies the
   signatures on `main`'s own squash merges (`57d9641`, `4f5de34`, `9e283c0`: `git log --format=%G?` gives `U`, a good
   signature from a key not marked trusted, under that key alone).

## 1. What this lane does

**PR 1, `api/b2-supply-chain` (this one; no CI configuration).**
- `Dockerfile`: pnpm is `npm pack`ed, its tarball checked with `sha512sum --check --strict` against the lockfile's
  integrity in hexadecimal, and only then installed from the file. A tarball that isn't the pinned one stops the build.
- `.nvmrc`: `26.13.1`, the image's Node, so `ci` runs the Node the image runs, and a Node or tzdata change is a commit.
- `tools/ops/src/deploy-files.test.ts`: the image's Node version is `.nvmrc`'s whole version; the Dockerfile's only
  `npm` install is that `pack`, check, install from the file and remove, with the hash the lockfile's own.

**PR 2, `api/b2-supply-chain-ci` (CI configuration, no freeze: no workflow file), after PR 1.**
- `ci_steps.py` `setup_pnpm`: the same check, the hash read from `pnpm-lock.yaml`, before `npm install --global` from
  the file; a lockfile with no such integrity, or a tarball that differs, fails the step.
- `journal_check.py`: a commit counts as GitHub's own only when its signature verifies under GitHub's web-flow key,
  vendored in `tools/ci/` with its fingerprint checked, in a keyring of its own; the committer's email alone no longer
  skips the check. Tests sign with a key of the test's own, given by the same constant.
- `ops_steps.py`: the comparison of item 3 written beside `FLYCTL_SHA256`.

**PR 3, with `api/b2-alerts-workflow` under one freeze.** `ci_steps.py audit` (`pnpm audit --prod`, failing on a
high or critical advisory in a production dependency) and its step in `ci.yml`. Dev tools' advisories are printed, not
failed on (the audit counted 6, none in what the image runs).

## 2. What is the founder's or the ios lane's

- A branch rule for `evidence`: no force-push, no deletion (Settings, Rules, Rulesets, a branch ruleset targeting
  `evidence` with "Restrict deletions" and "Block force pushes"). The founder's, with A1 and A2.
- Deleting the 20 branches of item 2: asked of the founder on a card, once the ios lane has said none is still needed.
- `ios.yml`'s evidence job: the ios lane's (the audit's B6, first bullet).

## 3. Tests and planted breakages

PR 1, each planted alone and run against `deploy-files.test.ts`:
- B1. The Dockerfile back to `npm install --global pnpm@12.16.1`.
- B2. A hash one digit off.
- B3. The check without `--strict`.
- B4. `.nvmrc` back to `26`.
- B5. `.nvmrc` at another patch than the image's.

Rehearsed in the session (no Docker daemon): the Dockerfile's command, with Node 26.13.0's npm, packs, checks and
installs pnpm 12.16.1 into a scratch prefix, as `npm install --global pnpm@12.16.1` did; a wrong hash makes
`sha512sum` exit 1. `deploy-dev` builds the image at merge.

## 4. Records

The journal (entry, block 1.2, table 4.1, the T58 row), `docs/PROGRESS.md`, `docs/LIMITATIONS.md`'s row of
2026-11-06 (its cause gone with a whole `.nvmrc`).
