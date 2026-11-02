# Pull requests and GitHub

Version 1.1 · 2 November 2026

This is how you, Claude Code, get work onto `main` from a cloud session. The founder approves every pull request in the project's thread, and then you merge it (ADR-022). No outside service reviews the code: before he sees a PR, you have it reviewed by an independent reviewer that hasn't seen your work.

## What GitHub enforces

You push and open PRs as the founder's GitHub account, so GitHub sees him as the author of every PR. Authors can't approve their own PRs, so no approval is required on GitHub. The founder's approval is a message in the project's thread (step 6): everything you post on GitHub appears under the founder's account, so nothing there can show that the founder wrote it, and nothing there approves a PR.

Branch protection on `main`, which he sets from his guide:
- a pull request is required to change `main`;
- `ci` must pass, reported by GitHub Actions, once `ci` exists;
- nobody may bypass these rules, the founder included;
- no force pushes and no deletion.

**Check the protection.** Tell the founder when it's time to add `ci` as a required check: when it has first run on a branch. Once he has, and again in the Gate 0 report, read the settings back with the branch-protection command below. Tell him exactly which value differs from:
- pull request required, with 0 approvals;
- required check `ci` from app 15368 (GitHub Actions), and branches not required to be up to date;
- bypassing not allowed (`enforce_admins`);
- force pushes and deletion off.

## The loop for every PR

1. **Check it before you open it.**
    - Run the checks that apply: lint, typecheck, unit tests, the copy lint, the database tests, the privacy matrix and the leak scanner.
    - Push as often as you like. `ci` runs on every push, and the `ios` workflow on pushes that change iOS files. Each `ios` run costs macOS minutes, so push iOS branches when there's something to look at.
    - Every commit carries its `docs/JOURNAL.md` update (`CLAUDE.md`, "The journal"). The `ci` guard refuses a branch whose journal lacks an entry for one of your commits, leaves a field empty, edits an old entry or deletes an audit row. Run `python3 tools/ci/journal_check.py --branch` before you push.
    - When merging `main` into your branch brings a conflict in `docs/JOURNAL.md` or the logs, keep both sides' entries. The other lane's entries are history too. An audit-map row both lanes changed becomes one row holding both, and your block of the state is rewritten so it's true after the merge (`docs/JOURNAL.md`, "Rules").
2. **Open the PR** when the slice is complete and `ci` is green on its last push (once `ci` exists).
    - The template isn't applied through the API: write the body from `.github/pull_request_template.md` and fill in every section.
    - Don't use drafts: they can't be marked ready through REST.
3. **Get an independent review.** Start a fresh subagent that hasn't seen your work. Give it:
    - the PR's diff (`git diff origin/main...HEAD`);
    - `docs/INVARIANTS.md`;
    - the sections of `docs/tadayo-build-spec-v3.md` and the pages of `docs/tadayo-design-book-2.1.md` the slice touches;
    - `docs/TECH-DESIGN.md` section 12;
    - `docs/JOURNAL.md` sections 0 to 2 and 4, and the branch's new log entries, so it can check that the journal's claims match the diff.

    Don't give it your reasoning or your conclusions. Ask for real problems only, each with the file, the line and what goes wrong. For example:
    - something hidden that leaks before the reveal;
    - a broken invariant, a race, or a drop that could be retargeted, duplicated or lost;
    - an instant that could move;
    - a missing test or privacy-matrix row;
    - copy that breaks the vocabulary or the voice;
    - a screen that doesn't match its render and contracts.

    Then add the specialist reviews that apply:
    - **Privacy and security.** For anything that touches authorization, the database, time, idempotency, media, caches, tokens, notifications or the video viewer, run a second reviewer that looks only at privacy and security. Give it spec 07's actors, spec 14 and 33, and the privacy matrix's roles and phases.
    - **Screens.** The reviewer compares the snapshot PNGs with their renders in `design/reference/` and with the book's contracts (book p34, p41). It checks tokens only (T44), native controls (T45), every state present, accessibility (T47) and copy (T41 to T43). It also asks the book's question from p5: could this screen be reskinned into any other app? If so, say where.
4. **Decide each finding on its merits.**
    - **Valid:** fix it. Most will be.
    - **Not valid:** write the reason in the PR's "Review" section, citing the spec section, invariant or ADR.
    - **Never drop a finding silently.**
5. **Push the fixes together,** in a commit that records the review: its findings, fixed or answered, in the entry and in the PR's row in the journal's section 4. A review that finds nothing still gets that commit. If the fixes changed a lot, review again with a new subagent.
6. **Tell the founder it's ready** only when all three are true:
    - `ci` is green (once it exists);
    - every finding is fixed or answered;
    - the evidence is linked.

    Fill in the PR's "Ready for the founder" section: what changed, the evidence, what the review found (fixed or answered), the risks, and what you need from him. Bring the PR's row in the journal's section 4 up to date in the same push.

    The founder approves the PR in a message in the project's thread, naming it or answering your message about it. Then squash-merge it through REST at the head the founder approved, with a merge message that holds no personal data: `gh api -X PUT repos/beurni2/tadayo/pulls/<n>/merge -f merge_method=squash -f sha=<head> -f commit_title='<PR title> (#<n>)' -F commit_message=@<file>` (ADR-022), with each `'` in the title written as `'\''`. A push after the approval needs a new approval. If GitHub refuses the merge of a PR that changes `.github/workflows/`, don't work around it: ask the founder to merge that PR with **Squash and merge** at the approved head. The merge of the first workflow PR in B0 (`ci.yml`, the B0 plan's slice 2) is the one-time test: record in `docs/LIMITATIONS.md` whether GitHub accepted it, as for the push ("Workflow files", "Test it once"; ADR-022).
7. **Answer his comments.** Read the founder's comments on the PR (commands below) and answer each one on the PR, signed "— Claude Code". When he asks for a change, push it and tell him.

## Workflow files

Cloud sessions have been refused pushes that add or change files under `.github/workflows/`. GitHub answers "refusing to allow an OAuth App to create or update workflow … without `workflow` scope", and the session's GitHub tools are refused the same way. Other files in `.github/` push normally.

**Merge timing.** Tell the founder a workflow PR is ready only when your lane has no other PR open. Once a workflow change merges, every open branch has to merge `main`, which a cloud session can't push. And when the journal conflicts, GitHub shows no **Update branch** button, so the slice would have to be re-applied on a fresh branch.

**Test it once,** with the first workflow file in B0. Commit the file with its journal entry, which the hook requires, and push.
- **If GitHub refuses it:** undo that unpushed commit with `git reset HEAD~1`, which keeps your files but unstages them. Move the workflow file out of the repository (to `/tmp`, keeping it to send). Then commit only the journal entry and a `docs/LIMITATIONS.md` row recording the refusal. From then on, send workflow files to the founder.
- **If the push works:** record that instead, and push workflow files yourself, still in their own PR.

While the refusal holds:
- **Keep workflows few and thin:** triggers, permissions, runners, and steps that call scripts in `tools/ci/`, which you can push. The logic lives in the scripts (`docs/TECH-DESIGN.md` section 9).
- **To add or change a workflow file:**
    1. Write it in `/tmp`, never in the repository's working tree, and check it there with `actionlint`, `zizmor` and `yamllint`, using the repository's `.yamllint.yaml` (install them with pip if they're missing). Fix what they find, because every later fix costs the founder another paste.
    2. Push the branch without the workflow file. It holds CI configuration only (T58): a new branch from `main` with the `tools/ci/` scripts the workflow calls, if any. Add a journal entry naming the workflow file the founder is adding, because the hook and the `ci` guard need one. Put the file's SHA-256 in it, computed with exactly one final line break: `printf '%s\n' "$(cat /tmp/<file>)" | sha256sum`.
    3. Send the founder the branch name, the file's path and the whole file in one code block. His guide has the steps ("When Claude Code sends you a workflow file").
    4. Keep that copy in `/tmp` while you wait. A cloud session checks at the end of every turn that everything in the repository is committed and pushed: an untracked workflow file would trip that check, and it would make `git pull` refuse the founder's commit. A later session won't have the copy; the hash in the journal is the check then.
    5. Commit nothing to that branch while you wait. When he says it's added, run `git pull --ff-only` and check the file: against your copy, or in a later session against the journal's hash, computed the same way. A missing final line break is fine. If it differs, send the file again. Then open the PR.
- **A merge from `main` that brings workflow changes into a branch** can be refused the same way.
    - Then ask the founder to tap **Update branch** on the PR.
    - A branch made before a workflow reached `main` doesn't run that workflow until `main` is merged in. So this happens to every open branch once `ci.yml` merges.
- **If that PR also conflicts with `main`,** GitHub offers no Update branch. Re-apply the slice on a fresh branch from `main`, open a new PR, and close the old one with a comment linking the new one.
- **Never work around the refusal:** no other token, no contents API, no bot.

## Talking to GitHub from a cloud session

The session's GitHub proxy blocks GitHub's GraphQL API, including `gh pr ...` and `gh issue ...`. Use REST through `gh api`. Replace `{owner}/{repo}`, `{n}` (the PR number), `{sha}`, `{comment_id}` and `{id}` with real values:

```bash
# The PR's head commit
gh api repos/{owner}/{repo}/pulls/{n} --jq .head.sha

# Open a PR, with the body written from .github/pull_request_template.md into /tmp, never into the working tree
gh api -X POST repos/{owner}/{repo}/pulls -f title='…' -f head='<branch>' -f base=main -F body=@/tmp/pr-body.md

# Update the PR's description
gh api -X PATCH repos/{owner}/{repo}/pulls/{n} -F body=@/tmp/pr-body.md

# Checks on a commit, with their titles
gh api repos/{owner}/{repo}/commits/{sha}/check-runs --jq '.check_runs[] | [.name, .status, .conclusion, .output.title] | @tsv'

# The founder's comments: on the PR, then on lines of code
gh api repos/{owner}/{repo}/issues/{n}/comments --paginate --jq '.[] | [.user.login, .created_at, .body] | @tsv'
gh api repos/{owner}/{repo}/pulls/{n}/comments --paginate --jq '.[] | [.id, .path, .line, .body] | @tsv'

# Comment on the PR, or reply to a comment on a line
gh api -X POST repos/{owner}/{repo}/issues/{n}/comments -f body='…'
gh api -X POST repos/{owner}/{repo}/pulls/{n}/comments/{comment_id}/replies -f body='…'

# List the PRs: number, state, when merged, branch, title (state=open, closed or all)
gh api 'repos/{owner}/{repo}/pulls?state=all&per_page=100' --jq '.[] | [.number, .state, .merged_at, .head.ref, .title] | @tsv'

# Find and re-run a workflow run
gh api "repos/{owner}/{repo}/actions/runs?head_sha={sha}" --jq '.workflow_runs[] | [.id, .name, .event, .conclusion] | @tsv'
gh api -X POST repos/{owner}/{repo}/actions/runs/{id}/rerun

# Start a workflow that runs by hand (ops, ios-release, load), on a branch, with its inputs.
# If the session's token may not, ask the founder to start it from the Actions tab, naming the inputs.
gh api -X POST repos/{owner}/{repo}/actions/workflows/ops.yml/dispatches -f ref='<branch>' -f 'inputs[script]=<script name>'

# Close a PR, for example one replaced by a fresh branch
gh api -X PATCH repos/{owner}/{repo}/pulls/{n} -f state=closed

# Branch protection on main. It needs the session's GitHub access to read the repository's administration settings.
# If it's refused, the shorter summary is in: gh api repos/{owner}/{repo}/branches/main --jq .protection
# That summary shows only whether the rule is on and its required checks: ask the founder for a screenshot of the rule for the rest (pull request and approvals, up to date, bypassing, force pushes, deletion).
gh api repos/{owner}/{repo}/branches/main/protection --jq '{
  approvals: .required_pull_request_reviews.required_approving_review_count,
  checks: .required_status_checks.checks, up_to_date: .required_status_checks.strict,
  no_bypass: .enforce_admins.enabled,
  force_pushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```

## Never

- Never push to `main`, force-push, rebase or rewrite published history, and never merge a PR the founder hasn't approved in the project's thread at its current head (ADR-022). When a branch needs something new from `main`, or conflicts with it, merge `main` into it and push once.
- Never post a commit status or a check run, and never resolve the founder's comments for him. Everything you post comes from his account.
- Never weaken a test, a check, a lint rule, the privacy matrix, the leak scanner, the `ci` guards or the journal hook to get a PR through (T58).
- Never change CI configuration (`.yamllint.yaml`, `.github/`, `.claude/`, `tools/ci/`) in a feature PR. It goes in its own PR, for the founder to read. Nothing else may change with it except the logs `docs/DECISIONS.md`, `docs/LIMITATIONS.md` and `docs/JOURNAL.md`.
- Never commit without the journal entry, and never get around the hook: don't edit it outside its own CI-configuration PR, and don't reshape a commit so the hook can't read it.
- Never ask the founder to approve a PR with `ci` red or a review finding unanswered.
- Never use the CodeRabbit plugin. Tadayo doesn't use CodeRabbit, and `.claude/settings.json` turns the plugin off; if its skills appear anyway, ignore them.

## Keeping PRs reviewable

- One slice per PR: ideally under 400 changed lines of hand-written code and under 40 files.
- A dependency change always includes its `package.json` change.
- Binaries the app or its tests need (snapshot references, the icon, fixture photographs) go in with the code that uses them, and the PR says why. Evidence goes on the `evidence` branch.
- A contract change (`packages/contracts/openapi.yaml`) is its own PR from the api lane, with the generated diff visible.
