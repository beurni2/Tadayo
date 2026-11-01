#!/usr/bin/env python3
"""Tests for tools/ci/journal_hook.py. Run: python3 tools/ci/journal_hook_test.py

Each case builds a scratch repository in a named state, feeds the hook a Bash tool call as Claude
Code would, and then, unless it's marked not to run or it's "unsure", runs the command for real
with bash and asks git whether a commit without docs/JOURNAL.md was made. So every case it runs is
checked against what git really does:
- "refuse": the hook exits 2, and the command really makes a commit without the journal;
- "allow": the hook exits 0, and the command makes no such commit;
- "unsure": the hook exits 0 by design, because it can't tell (the `ci` guard still holds the rule).

CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "journal_hook.py")
GIT = shutil.which("git") or "/usr/bin/git"
HEREDOC_MESSAGE = ("git commit -m \"$(cat <<'EOF'\nFix the cutoff (T3)\n\nSays \"git commit\", `x`, $HOME and ) here.\n"
                   "EOF\n)\"")


def clean_env(home):
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(HOME=home, GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.invalid",
               GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.invalid",
               GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_EDITOR="true")
    return env


class Scratch:
    """A scratch repository holding the hook, in one of the states below."""

    FILES = ["docs/JOURNAL.md", "src.txt", "sub/inner.txt", "services/api/x.ts",
             ".github/workflows/ci.yml", "README.md", "CLAUDE.md"]

    def __init__(self, state="dirty", keeps_journal=True):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="journal-hook-"))
        self.top = os.path.join(self.root, "repo")
        self.home = os.path.join(self.root, "home")
        os.makedirs(self.top)
        os.makedirs(self.home)
        self.env = clean_env(self.home)
        self.git("init", "-q", "-b", "main")
        for rel in self.FILES:
            self.write(rel, rel + "\n")
        if keeps_journal:
            os.makedirs(os.path.join(self.top, "tools/ci"))
            shutil.copy(HOOK, os.path.join(self.top, "tools/ci/journal_hook.py"))
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "init")
        getattr(self, "state_" + state.replace("-", "_"))()

    # States
    def state_clean(self):
        pass

    def state_dirty(self):  # every file changed, nothing staged
        for rel in self.FILES:
            self.write(rel, "changed\n", append=True)

    def state_src_staged(self):  # src.txt staged, the journal changed but not staged
        self.state_dirty()
        self.git("add", "src.txt")

    def state_journal_staged(self):
        self.state_dirty()
        self.git("add", "docs/JOURNAL.md", "src.txt")

    def state_src_only(self):  # src.txt changed, the journal not
        self.write("src.txt", "changed\n", append=True)

    def state_head_journal(self):  # the last commit has the journal; src.txt staged since
        self.state_dirty()
        self.git("commit", "-q", "-am", "with journal")
        self.write("src.txt", "again\n", append=True)
        self.git("add", "src.txt")

    def state_head_no_journal(self):  # the last commit lacks the journal; src.txt staged since
        self.write("src.txt", "changed\n", append=True)
        self.git("commit", "-q", "-am", "no journal")
        self.write("src.txt", "again\n", append=True)
        self.git("add", "src.txt")

    def state_merge_head(self):  # HEAD merges a branch, with a journal conflict resolved
        self.git("checkout", "-q", "-b", "feat")
        self.write("docs/JOURNAL.md", "feat entry\n", append=True)
        self.git("commit", "-q", "-am", "feat")
        self.git("checkout", "-q", "main")
        self.write("docs/JOURNAL.md", "main entry\n", append=True)
        self.git("commit", "-q", "-am", "main")
        subprocess.run([GIT, "-C", self.top, "merge", "-q", "feat"], env=self.env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.write("docs/JOURNAL.md", "docs/JOURNAL.md\nmain entry\nfeat entry\n")
        self.git("add", "docs/JOURNAL.md")
        self.git("commit", "-q", "--no-edit")
        self.write("src.txt", "changed\n", append=True)
        self.git("add", "src.txt")

    def state_stashed(self):  # every change stashed
        self.state_dirty()
        self.git("stash", "-q")

    def state_two_commits(self):  # two commits, each with the journal
        for n in ("one", "two"):
            self.write("src.txt", n + "\n", append=True)
            self.write("docs/JOURNAL.md", n + "\n", append=True)
            self.git("commit", "-q", "-am", n)

    def state_feat_branch(self):  # a branch whose commit has the journal
        self.git("checkout", "-q", "-b", "feat")
        self.state_dirty()
        self.git("commit", "-q", "-am", "feat")
        self.git("checkout", "-q", "main")

    def state_untracked_journal(self):
        self.git("rm", "-q", "--cached", "docs/JOURNAL.md")
        self.git("commit", "-q", "-m", "untrack the journal")
        self.state_dirty()

    # Helpers
    def git(self, *args):
        subprocess.run([GIT, "-C", self.top, *args], check=True, env=self.env,
                       stdout=subprocess.DEVNULL)

    def git_out(self, *args):
        return subprocess.run([GIT, "-C", self.top, *args], env=self.env, capture_output=True,
                              text=True).stdout.strip()

    def write(self, rel, text, append=False):
        path = os.path.join(self.top, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a" if append else "w") as f:
            f.write(text)

    def hook(self, command, cwd=None):
        payload = {"tool_name": "Bash", "tool_input": {"command": command}, "cwd": cwd or self.top}
        env = dict(self.env, CLAUDE_PROJECT_DIR=self.top)
        result = subprocess.run([sys.executable, "-I", HOOK], input=json.dumps(payload), text=True,
                                capture_output=True, env=env, timeout=30)
        return result.returncode

    def commits_without_journal(self, command, cwd=None):
        """Runs the command for real and returns the new commits that don't change the journal."""
        before = self.git_out("rev-parse", "HEAD")
        subprocess.run(["bash", "-c", command], cwd=cwd or self.top, env=self.env, timeout=60,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        after = self.git_out("rev-parse", "HEAD")
        if after == before:
            return []
        lacking = []
        for sha in self.git_out("rev-list", after, "^" + before).split():
            parent = self.git_out("rev-parse", "-q", "--verify", sha + "^1")
            if parent:
                changed = self.git_out("diff", "--name-only", parent, sha, "--", "docs/JOURNAL.md")
            else:
                changed = self.git_out("diff-tree", "--root", "--no-commit-id", "--name-only", "-r",
                                       sha, "--", "docs/JOURNAL.md")
            if not changed:
                lacking.append(sha)
        return lacking

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


REFUSE, ALLOW, UNSURE = "refuse", "allow", "unsure"

# (command, expected, state, working directory relative to the repository, run it for real)
CASES = [
    # Commits without the journal: refused.
    ("git commit -m 'fix'", REFUSE, "src-staged", None, True),
    ("git add src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("git add .github/workflows/ci.yml && git commit -m ci", REFUSE, "dirty", None, True),
    ("git add -A src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ('git add src.txt && git commit -m "fix the -a flag"', REFUSE, "dirty", None, True),
    ('git add src.txt && git commit -m "update docs/JOURNAL.md later"', REFUSE, "dirty", None, True),
    ("git add src.txt && git commit -mfix-a", REFUSE, "dirty", None, True),
    ("git -C . commit -m fix", REFUSE, "src-staged", None, True),
    ("git -c user.name=x commit -m fix", REFUSE, "src-staged", None, True),
    ("git  commit -m fix", REFUSE, "src-staged", None, True),
    (GIT + " commit -m fix", REFUSE, "src-staged", None, True),
    ("GIT_EDITOR=true git commit -m fix", REFUSE, "src-staged", None, True),
    ("env GIT_EDITOR=true git commit -m fix", REFUSE, "src-staged", None, True),
    ("time git commit -m fix", REFUSE, "src-staged", None, True),
    ("git commit -m fix 2>&1 | tail -5", REFUSE, "src-staged", None, True),
    ("bash -c 'git commit -m fix'", REFUSE, "src-staged", None, True),
    ("bash -o pipefail -c 'git add src.txt && git commit -m fix'", REFUSE, "dirty", None, True),
    ("bash <<'EOF'\ngit add src.txt\ngit commit -m fix\nEOF", REFUSE, "dirty", None, True),
    ('out=$(git commit -m fix) && echo "$out"', REFUSE, "src-staged", None, True),
    ("if true; then git commit -m fix; fi", REFUSE, "src-staged", None, True),
    ("git commit src.txt -m fix", REFUSE, "dirty", None, True),
    ("git commit -m fix -- src.txt", REFUSE, "dirty", None, True),
    ("git commit -m fix", REFUSE, "src-staged", "sub", True),
    ("cd sub && git add inner.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("git add -n docs/JOURNAL.md && git commit -m fix", REFUSE, "src-staged", None, True),
    ("git add docs/JOURNAL.md src.txt && git commit -m a && git commit --allow-empty -m b",
     REFUSE, "dirty", None, True),
    ("git add src.txt && " + HEREDOC_MESSAGE, REFUSE, "dirty", None, True),
    ("git commit --amend --no-edit --reset-author", REFUSE, "head-no-journal", None, True),
    ("(cd /tmp && ls >/dev/null) && git add src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("top=$(cd .. && pwd) && git add src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("git add *.md && git commit -m docs", REFUSE, "dirty", None, True),
    ("cd sub && git add :/src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("git add -A -- . ':!docs/JOURNAL.md' && git commit -m fix", REFUSE, "dirty", None, True),
    ("git checkout -b work && git add src.txt && git commit -m fix", REFUSE, "dirty", None, True),
    ("git commit -am fix", REFUSE, "untracked-journal", None, True),

    # Commits with the journal: allowed.
    ("git commit -m fix", ALLOW, "journal-staged", None, True),
    ("git add docs/JOURNAL.md src.txt && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add -A && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add . && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add docs/ && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add -u && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add 'docs/*.md' && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add docs/*.md src.txt && git commit -m fix", ALLOW, "dirty", None, True),
    ("git add docs/JOURNAL.md; git commit -m fix", ALLOW, "dirty", None, True),
    ("git stage docs/JOURNAL.md src.txt && git commit -m fix", ALLOW, "dirty", None, True),
    ("git commit -am fix", ALLOW, "dirty", None, True),
    ("git commit -a -m fix", ALLOW, "dirty", None, True),
    ("git commit --all -m fix", ALLOW, "dirty", None, True),
    ("git commit -qam fix", ALLOW, "dirty", None, True),
    ("git commit docs/JOURNAL.md src.txt -m fix", ALLOW, "dirty", None, True),
    ("git commit -m fix -- docs/JOURNAL.md", ALLOW, "dirty", None, True),
    ("git add ../docs/JOURNAL.md && git commit -m fix", ALLOW, "dirty", "sub", True),
    ("cd sub && git add ../docs/JOURNAL.md && git commit -m fix", ALLOW, "dirty", None, True),
    ("cd .. && git add -A && git commit -m fix", ALLOW, "dirty", "sub", True),
    ("git commit --amend --no-edit --reset-author", ALLOW, "head-journal", None, True),
    ("git commit --amend -m 'better title'", ALLOW, "head-journal", None, True),
    ("git add src.txt && git commit --amend --no-edit", ALLOW, "merge-head", None, True),
    ("if git diff --cached --quiet; then echo none; else git commit -m fix; fi",
     ALLOW, "journal-staged", None, True),
    ("git commit -m fix 2>&1 | tail -5", ALLOW, "journal-staged", None, True),
    ("git add -A && git commit -m fix", ALLOW, "untracked-journal", None, True),
    ("git add docs/JOURNAL.md src.txt && " + HEREDOC_MESSAGE, ALLOW, "dirty", None, True),
    ("cat >> docs/JOURNAL.md <<'EOF'\n- 2026-11-01 entry\nEOF\ngit add docs/JOURNAL.md src.txt && git commit -m fix",
     ALLOW, "src-only", None, True),
    ("sed -i 's/JOURNAL/JOURNAL./' docs/JOURNAL.md && git commit -am fix", ALLOW, "src-only", None, True),
    ("python3 - <<'EOF'\nopen('docs/JOURNAL.md', 'a').write('- entry\\n')\nEOF\ngit add -A && git commit -m fix",
     ALLOW, "src-only", None, True),
    ("(cd services/api && ls >/dev/null) && git add docs/JOURNAL.md src.txt && git commit -m fix",
     ALLOW, "dirty", None, True),
    ("pushd services/api >/dev/null && ls >/dev/null && popd >/dev/null && git add docs/JOURNAL.md src.txt && git commit -m fix",
     ALLOW, "dirty", None, True),
    ('git add docs/JOURNAL.md src.txt && out=$(git commit -m fix 2>&1) && echo "$out"',
     ALLOW, "dirty", None, True),
    ("git switch -c work && git add -A && git commit -m fix", ALLOW, "dirty", None, True),
    ("git stash pop -q && git commit -am fix", ALLOW, "stashed", None, True),
    ("git reset --soft HEAD~2 && git commit -m squashed", ALLOW, "two-commits", None, True),
    ("git merge --squash feat && git commit -m 'squash feat'", ALLOW, "feat-branch", None, True),

    # Not commits: allowed.
    ("ls -la", ALLOW, "dirty", None, True),
    ("git status", ALLOW, "dirty", None, True),
    ("git log --oneline -5", ALLOW, "dirty", None, True),
    ('grep -n "git commit" README.md', ALLOW, "dirty", None, True),
    ('git log --grep="git commit"', ALLOW, "dirty", None, True),
    ("gh api -X POST repos/o/r/issues/1/comments -f body='run git commit after the review'",
     ALLOW, "src-staged", None, False),
    ("echo 'git commit -m x'", ALLOW, "src-staged", None, True),
    ("# git commit -m x", ALLOW, "src-staged", None, True),
    ("git commit --dry-run -m fix", ALLOW, "src-staged", None, True),
    ("git commit -h", ALLOW, "src-staged", None, True),
    ("git commit --porcelain", ALLOW, "src-staged", None, True),
    ("git commit --short", ALLOW, "src-staged", None, True),
    ("cat > notes.md <<'EOF'\ngit commit -m x\nEOF", ALLOW, "src-staged", None, True),
    ('echo \'{"tool_input":{"command":"git commit -m x"}}\' | python3 tools/ci/journal_hook.py',
     ALLOW, "src-staged", None, True),

    # The hook can't tell, so it lets the command through.
    ('git add "$FILES" && git commit -m fix', UNSURE, "dirty", None, True),
    ("git commit -m 'unclosed", UNSURE, "src-staged", None, True),
    ('cd "$(git rev-parse --show-toplevel)" && git add src.txt && git commit -m fix', UNSURE, "dirty", None, True),
]

# Known limits, kept here so a change in them shows up: (command, state, exit code, why).
KNOWN_LIMITS = [
    ("./update.sh && git add -A && git commit -m fix", "src-only", 2,
     "a script that writes the journal without naming it is refused; the message says to split the call"),
]


class JournalHookTest(unittest.TestCase):
    def test_cases(self):
        for command, expected, state, cwd, run in CASES:
            with self.subTest(command=command, state=state):
                repo = Scratch(state)
                try:
                    where = os.path.join(repo.top, cwd) if cwd else None
                    code = repo.hook(command, where)
                    self.assertEqual(code, 2 if expected == REFUSE else 0, "hook exit code")
                    if run and expected != UNSURE:
                        lacking = repo.commits_without_journal(command, where)
                        if expected == REFUSE:
                            self.assertTrue(lacking, "run for real, it made no commit without the journal")
                        else:
                            self.assertFalse(lacking, "run for real, it made a commit without the journal")
                finally:
                    repo.cleanup()

    def test_known_limits(self):
        for command, state, code, why in KNOWN_LIMITS:
            with self.subTest(command=command):
                repo = Scratch(state)
                try:
                    self.assertEqual(repo.hook(command), code, why)
                finally:
                    repo.cleanup()

    def test_other_repositories_and_places(self):
        other = Scratch("src-staged", keeps_journal=False)
        try:
            self.assertEqual(other.hook("git commit -m fix"), 0)
        finally:
            other.cleanup()
        repo = Scratch("src-staged")
        try:
            self.assertEqual(repo.hook("git commit -m fix", cwd=repo.home), 0)  # not a repository
        finally:
            repo.cleanup()

    def test_orphan_evidence_branch(self):
        repo = Scratch("clean")
        try:
            repo.git("switch", "-q", "--orphan", "evidence")
            repo.write("gates/gate-0.pdf", "pdf\n")
            repo.git("add", "gates")
            self.assertEqual(repo.hook("git commit -m 'gate 0 report'"), 0)
        finally:
            repo.cleanup()

    def test_bad_input(self):
        for payload in ["", "not json", "{}", "[]", '{"tool_input": {}}', '{"tool_input": null}',
                        '{"tool_input": {"command": 7}}']:
            result = subprocess.run([sys.executable, "-I", HOOK], input=payload, text=True,
                                    capture_output=True)
            self.assertEqual(result.returncode, 0, payload)

    def test_speed(self):
        repo = Scratch("journal-staged")
        try:
            big = "git commit -m '" + "word " * 200000 + "'"
            start = time.monotonic()
            self.assertEqual(repo.hook(big), 0)
            self.assertLess(time.monotonic() - start, 3.0)
        finally:
            repo.cleanup()


if __name__ == "__main__":
    unittest.main(verbosity=1)
