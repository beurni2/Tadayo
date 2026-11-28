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
- `Dockerfile`: pnpm's two tarballs are `npm pack`ed: `pnpm@12.16.1`, a wrapper, and `@pnpm/exe.linux-x64@12.16.1`, the
  binary the wrapper's install script links in its place, which is what runs `pnpm install` (section 5, finding 1).
  Both are checked with `sha512sum --check --strict` against the lockfile's integrity in hexadecimal, and only then
  installed from the files with `npm install --global --offline`, so npm fetches nothing more. A tarball that isn't the
  pinned one stops the build, and so does a builder that isn't x86-64 Linux (Fly's remote builder is).
- `.nvmrc`: `26.13.1`, the image's Node, so `ci` runs the Node the image runs, and a Node or tzdata change is a commit.
- `tools/ops/src/deploy-files.test.ts`: the image's Node version is `.nvmrc`'s whole version; every `RUN` that names a
  package tool (`npm`, `npx`, `corepack`, `pnpm`, `pnpx`, `pnx`, `pn`, `yarn`) is either that `pack`, check, offline
  install from the files and remove, with both hashes read from the lockfile, or the frozen install with its filters.

**PR 2, `api/b2-supply-chain-ci` (CI configuration, no freeze: no workflow file), after PR 1.**
- `ci_steps.py` `setup_pnpm`: the same check of both tarballs (GitHub's `ubuntu-24.04` runner is x86-64 Linux), the
  hashes read from `pnpm-lock.yaml`, before `npm install --global --offline` from the files; a lockfile with no such
  integrity, or a tarball that differs, fails the step.
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

Rehearsed in the session (no Docker daemon): the first commit's command, with Node 26.13.0's npm, packed, checked and
installed pnpm 12.16.1 into a scratch prefix, but its install still fetched `@pnpm/exe.linux-x64` from the registry
unchecked (section 5, finding 1). `deploy-dev` builds the image at merge.

Round 1, the second commit, each planted alone and run against `deploy-files.test.ts`, B1 to B5 again with them:
- K1. The binary's tarball left out: only the wrapper packed and checked, and installed online.
- K2. The binary's hash one digit off.
- K3. The install without `--offline`.
- K4 to K7. A `RUN` of its own with `npx --yes some-tool`, `corepack enable pnpm`, `npm --global install pnpm@latest`
  or `pnpm self-update` (the review's finding 3 found the first commit's test passed these).
- K8. `&& pnpm self-update` after the frozen install, in its own `RUN`.
- K9. The check moved after the install.
- K10. `|| true` after the check.
- K11. `npm ci` at the start of the runtime stage's first `RUN`.

Rehearsed in the session: the second commit's `RUN` text, run by `/bin/sh` (dash) in a scratch folder with an empty
npm cache and prefix and Node 26.13.0's npm, exits 0, leaves the folder empty, and `pnpm --version` gives 12.16.1, the
wrapper's `pnpm` the same file (inode) as the checked binary's; the binary's hash one digit off makes `sha512sum` exit
1; the wrapper's tarball installed alone with `--offline` and an empty cache fails, so the binary can't come from
anywhere but the checked file.

Round 2, the third commit, each planted alone and run against `deploy-files.test.ts`, each missed by the second
commit's test, which looked only at `RUN`s naming a package tool:
- K12. `RUN node -e "fetch('https://example.com/x')"` in the `deps` stage.
- K13. `ARG T=npm` and `RUN $T i some-tool` in the `deps` stage.
- K14. `RUN curl -fsSL https://example.com/i.sh | sh` in the `deps` stage.
- K15, a control. `RUN node -e …` in the runtime stage, caught already by the photo user's test, which pins that stage's
  two `RUN`s.

## 4. Records

The journal (entry, block 1.2, table 4.1, the T58 row), `docs/PROGRESS.md`, `docs/LIMITATIONS.md`'s row of
2026-11-06 (its cause gone with a whole `.nvmrc`).

## 5. Review

Round 1, one fresh subagent at `c35abf0` (a lower-risk PR: at most two rounds). Each finding fixed or answered in the
second commit:
1. **Blocker, fixed.** The check covered pnpm's wrapper, not the binary that runs: `pnpm@12.16.1` has 14
   `optionalDependencies` (`@pnpm/exe.*`), and its `preinstall` and `postinstall` (`node install.js`) link the
   platform's binary over `pnpm`, `pn`, `pnpx` and `pnx`; the install fetched `@pnpm/exe.linux-x64` from the registry
   unchecked. Now that tarball is packed and checked too, against the lockfile's `'@pnpm/exe.linux-x64@12.16.1'`
   integrity, and the install is `--offline` from the two files. PR 2's `setup_pnpm` does the same (section 1).
2. **Should-fix, fixed.** The records said more than the first commit did (the Dockerfile's comment, the T58 row, the
   api block, `docs/PROGRESS.md`, the 4.1 row, the entry's rehearsal). Rewritten; the first commit's entry stays as it
   is, and the second's says what it got wrong.
3. **Should-fix, fixed.** "And nothing else" wasn't true of the test: it looked only at `npm install`, `i`, `add` and
   `pack`. It now takes every `RUN` that names a package tool, and allows only the two expected ones (K4 to K8, K11).
4. **Nit, fixed.** `sha512sum --check --strict` reads one space between the hash and the name as well as two (coreutils
   9.4, checked). The file keeps the two-space form `sha512sum` writes; the test's comment no longer says it's needed.
5. **Nit, fixed in the records.** `setup-node` with `26` takes a Node 26 from the runner's tool cache before the newest,
   so `ci` could run a newer Node 26 than the image's, not always the newest.

Round 2, one fresh subagent at `a803ad2` (the last round for a lower-risk PR). No blocker; each finding fixed or
answered in the third commit:
1. **Should-fix, fixed.** The records said nothing of `main` at `717bf4b` (#153) merged in as `a803ad2`, and still
   asked for `ci` on the second commit `ad15d3d`, whose run that push cancelled (run 46112237686). The api block, step
   11 (z) and `docs/PROGRESS.md` now say so and ask for `ci` on the third commit.
2. **Nit, fixed in the third commit's entry.** The second commit's entry left "npm 26.13.1's handling of the install
   scripts" unverified, and misnamed it: Node 26.13.1 ships npm 11.20.0 (nodejs.org/dist/index.json), the session's
   own npm, and `ci`'s node job at `a803ad2` logged "Resolved .nvmrc as 26.13.1", `node: v26.13.1`, and the same
   allowScripts notice, so the scripts run there as here.
3. **Nit, answered.** The second commit's entry said `--offline` makes "a missing binary fail the build". That holds
   while npm runs the install scripts: were they skipped, the wrapper's `bin/pnpm.mjs` would look for the binary
   installed beside it, and download one only if none were there. Here the binary is one of the two files npm is told
   to install, so it is there (the reviewer ran it with `--ignore-scripts` and dead proxies: `pnpm --version` gave
   12.16.1 and nothing was fetched), and on any other platform npm refuses that file (`EBADPLATFORM`). The claim is
   corrected in the third commit's entry; the log is append-only.
4. **Nit, fixed.** The test pinned only the `RUN`s naming a package tool, so `node -e`, `curl` or a variable could
   still fetch in the `deps` stage. It now also pins that stage's `RUN`s to the same two; the runtime stage's two were
   pinned already, and `ADD` refused, so every command the image runs is one of four (K12 to K15).
