#!/usr/bin/env python3
"""Tests for tools/ci/journal_check.py. Run: python3 tools/ci/journal_check_test.py

Each test makes a scratch clone whose origin/main holds this repository's docs/JOURNAL.md, works
on branches the way the lanes would, and runs the check there.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CHECK = os.path.join(HERE, "journal_check.py")
JOURNAL = os.path.join(HERE, "..", "..", "docs", "JOURNAL.md")
LOG_SECTIONS = {"shared": "### 3.1 Shared and B0\n\n", "api": "### 3.2 api lane\n\n",
                "ios": "### 3.3 ios lane\n\n"}
STATE_BLOCKS = {"shared": "### 1.1 ", "api": "### 1.2 ", "ios": "### 1.3 "}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def as_the_handoff_wrote_it(text):
    """The pack's journal before any session's commit: no log entry but the handoff's, every block
    "Updated" by the handoff. The repository's own journal has moved on since."""
    text = re.sub(r"^#### \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC · .*\n(?:(?!#{2,4} |---$).*\n)*", "", text,
                  flags=re.M)
    return re.sub(r"^\*\*Updated:\*\* .*$", "**Updated:** 2026-11-01, by the handoff.", text, flags=re.M)


def entry(n, lane="shared", drop=None, empty=None, heading=None, extra=None):
    fields = {"Did": "Added the workspace (`package.json`, `pnpm-workspace.yaml`).",
              "Why": "B0's first slice.",
              "Verified": "`pnpm test`: 3 tests passed.",
              "Not verified": "None.",
              "Decisions and questions": "None.",
              "Next": "Write the contract: `packages/contracts/openapi.yaml`."}
    if extra:
        fields.update(extra)
    lines = [heading or f"#### 2026-11-02 {10 + n // 60:02d}:{n % 60:02d} UTC · {lane} · {lane}/b0-slice · PR none"]
    for name, text in fields.items():
        if name == drop:
            continue
        lines.append(f"**{name}:**" + ("" if name == empty else " " + text))
    return "\n".join(lines) + "\n\n"


class Clone:
    def __init__(self, with_journal=True):
        self.root = tempfile.mkdtemp(prefix="journal-check-")
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update(GIT_AUTHOR_NAME="Claude", GIT_AUTHOR_EMAIL="noreply@anthropic.com",
                        GIT_COMMITTER_NAME="Claude", GIT_COMMITTER_EMAIL="noreply@anthropic.com",
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_EDITOR="true")
        self.origin = os.path.join(self.root, "origin.git")
        self.work = os.path.join(self.root, "work")
        self.run("git", "init", "-q", "--bare", "-b", "main", self.origin, cwd=self.root)
        self.run("git", "clone", "-q", self.origin, self.work, cwd=self.root)
        self.write("README.md", "tadayo\n")
        if with_journal:
            self.write("docs/JOURNAL.md", read(JOURNAL))
        self.commit("main")
        self.run("git", "push", "-q", "origin", "HEAD:main")
        self.run("git", "fetch", "-q", "origin")
        self.run("git", "checkout", "-q", "-b", "feature")
        self.counter = 0

    def run(self, *args, cwd=None, env=None, check=True):
        result = subprocess.run(args, cwd=cwd or self.work, env=env or self.env,
                                capture_output=True, text=True)
        if check and result.returncode != 0:
            raise AssertionError(f"{args} failed: {result.stderr}")
        return result

    def path(self, rel):
        return os.path.join(self.work, rel)

    def write(self, rel, text):
        os.makedirs(os.path.dirname(self.path(rel)) or ".", exist_ok=True)
        with open(self.path(rel), "w", encoding="utf-8") as f:
            f.write(text)

    def journal(self):
        return read(self.path("docs/JOURNAL.md"))

    def edit_journal(self, old, new):
        text = self.journal()
        assert old in text, old
        self.write("docs/JOURNAL.md", text.replace(old, new, 1))

    def touch_state(self, lane="shared"):
        """Rewrites the first Updated line of the lane's state block."""
        lines = self.journal().split("\n")
        start = next(i for i, l in enumerate(lines) if l.startswith(STATE_BLOCKS[lane]))
        k = next(i for i in range(start, len(lines)) if lines[i].startswith("**Updated:**"))
        self.counter += 1
        lines[k] = f"**Updated:** 2026-11-02 {self.counter:02d}:00 UTC, {lane}/b0-slice"
        self.write("docs/JOURNAL.md", "\n".join(lines))

    def add_entry(self, text, lane="shared"):
        self.edit_journal(LOG_SECTIONS[lane], LOG_SECTIONS[lane] + text)

    def commit(self, message, web=False):
        env = dict(self.env)
        if web:
            env.update(GIT_COMMITTER_NAME="GitHub", GIT_COMMITTER_EMAIL="noreply@github.com")
        self.run("git", "add", "-A", env=env)
        self.run("git", "commit", "-q", "--allow-empty", "-m", message, env=env)

    def work_commit(self, n, lane="shared", **entry_options):
        """One ordinary commit: a code change, the lane's state rewritten, one new entry."""
        self.write(f"src/{lane}-{n}.txt", f"{n}\n")
        self.touch_state(lane)
        self.add_entry(entry(n, lane, **entry_options), lane)
        self.commit(f"{lane} commit {n}")

    def squash_merge(self, branch, message):
        """What GitHub's squash and merge does: one commit on main with the branch's tree."""
        self.run("git", "fetch", "-q", "origin")
        self.run("git", "checkout", "-q", "-B", "squash-tmp", "origin/main")
        self.run("git", "merge", "-q", "--squash", branch)
        self.run("git", "commit", "-q", "-m", message, env=dict(self.env, GIT_COMMITTER_NAME="GitHub",
                                                             GIT_COMMITTER_EMAIL="noreply@github.com"))
        self.run("git", "push", "-q", "origin", "HEAD:main")
        self.run("git", "fetch", "-q", "origin")

    def check(self, mode="--branch"):
        result = subprocess.run([sys.executable, "-I", CHECK, mode], cwd=self.work, env=self.env,
                                capture_output=True, text=True)
        return result.returncode, result.stderr

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


class JournalCheckTest(unittest.TestCase):
    def setUp(self):
        self.c = Clone()

    def tearDown(self):
        self.c.cleanup()

    def assertPasses(self):
        code, err = self.c.check()
        self.assertEqual(code, 0, err)

    def assertFails(self, words):
        code, err = self.c.check()
        self.assertEqual(code, 1, err)
        self.assertIn(words, err)

    # What passes
    def test_one_commit_one_entry(self):
        self.c.work_commit(1)
        self.assertPasses()

    def test_two_commits_two_entries(self):
        self.c.work_commit(1)
        self.c.work_commit(2)
        self.assertPasses()

    def test_no_commits_of_its_own(self):
        self.assertPasses()

    def test_web_commits_need_no_entry(self):
        self.c.work_commit(1)
        self.c.write(".github/workflows/ci.yml", "name: ci\n")
        self.c.commit("Create ci.yml", web=True)
        self.assertPasses()

    def test_fields_with_code_blocks_and_lists(self):
        self.c.work_commit(1, extra={
            "Verified": "\n```\n$ pnpm test\n## not a heading: inside the block\n3 passed\n```",
            "Did": "\n- `package.json`;\n- `pnpm-workspace.yaml`."})
        self.assertPasses()
        code, err = self.c.check("--all")
        self.assertEqual(code, 0, err)

    def test_template_can_change(self):
        self.c.edit_journal("Newest first within each section.", "Newest first within each lane's section.")
        self.c.work_commit(1)
        self.assertPasses()

    def test_revert_without_its_journal_change(self):
        self.c.work_commit(1)
        bad = self.c.run("git", "rev-parse", "HEAD").stdout.strip()
        self.c.run("git", "revert", "--no-commit", bad)
        self.c.run("git", "checkout", "HEAD", "--", "docs/JOURNAL.md")
        self.c.touch_state()
        self.c.add_entry(entry(2, extra={"Did": f"Reverted {bad[:7]}, because it broke the build."}))
        self.c.commit("Revert the workspace")
        self.assertPasses()

    def test_lanes_in_parallel_and_a_merge_from_main(self):
        c = self.c
        c.work_commit(1, lane="ios")
        # Meanwhile main takes in the api lane's PR.
        c.run("git", "checkout", "-q", "-b", "api-work", "origin/main")
        c.work_commit(2, lane="api")
        c.squash_merge("api-work", "api: first slice (#2)")
        c.run("git", "checkout", "-q", "feature")
        merge = c.run("git", "merge", "-q", "--no-edit", "origin/main", check=False)
        self.assertEqual(merge.returncode, 0, "the lanes' journal edits should merge without a conflict")
        self.assertPasses()

    def test_branch_from_a_branch_that_was_squashed(self):
        c = self.c
        c.work_commit(1)
        c.work_commit(2)
        c.run("git", "checkout", "-q", "-b", "second")
        c.work_commit(3)
        c.squash_merge("feature", "shared: first slice (#1)")
        c.run("git", "checkout", "-q", "second")
        merge = c.run("git", "merge", "-q", "--no-edit", "origin/main", check=False)
        if merge.returncode != 0:
            # Resolved by the journal's rules: every entry from both sides, each once (this branch
            # already holds main's), and this branch's block rewritten.
            conflicted = c.run("git", "diff", "--name-only", "--diff-filter=U").stdout.split()
            self.assertEqual(conflicted, ["docs/JOURNAL.md"])
            c.run("git", "checkout", "--ours", "docs/JOURNAL.md")
            c.run("git", "add", "docs/JOURNAL.md")
            c.run("git", "commit", "-q", "--no-edit")
        self.assertPasses()

    def test_two_lanes_pr_rows_merge_cleanly(self):
        c = self.c
        ios_table = "### 4.2 Pull requests: the ios lane\n\n| PR | Branch | What it changed | Review findings | Evidence |\n|---|---|---|---|---|\n"
        api_table = "### 4.1 Pull requests: the one session, then the api lane\n\n| PR | Branch | What it changed | Review findings | Evidence |\n|---|---|---|---|---|\n"
        c.edit_journal(ios_table, ios_table + "| to open | ios/b1-welcome | A01 | | |\n")
        c.work_commit(1, lane="ios")
        c.run("git", "checkout", "-q", "-b", "api-work", "origin/main")
        c.edit_journal(api_table, api_table + "| #3 | api/b1-clubs | clubs | none | |\n")
        c.work_commit(2, lane="api")
        c.squash_merge("api-work", "api: clubs (#3)")
        c.run("git", "checkout", "-q", "feature")
        merge = c.run("git", "merge", "-q", "--no-edit", "origin/main", check=False)
        self.assertEqual(merge.returncode, 0, "PR rows in the lanes' own tables should merge cleanly")
        self.assertPasses()

    # What fails
    def test_two_commits_one_entry(self):
        self.c.work_commit(1)
        self.c.write("src/extra.txt", "x\n")
        self.c.touch_state()
        self.c.commit("commit without an entry")
        self.assertFails("2 commit(s) of its own but its log gained 1")

    def test_missing_field(self):
        self.c.work_commit(1, drop="Not verified")
        self.assertFails("**Not verified:** is missing")

    def test_empty_field(self):
        self.c.work_commit(1, empty="Next")
        self.assertFails("**Next:** is empty")

    def test_bad_heading(self):
        self.c.work_commit(1, heading="#### Monday · api · branch")
        self.assertFails("heading doesn't follow the template")

    def test_main_entry_changed(self):
        self.c.edit_journal("**Why:** To start B0 with the specs", "**Why:** To start B0, with the specs")
        self.c.work_commit(1)
        self.assertFails("changed or removed an earlier log line")

    def test_branch_entry_changed_later(self):
        self.c.work_commit(1)
        self.c.edit_journal("**Why:** B0's first slice.", "**Why:** The first slice of B0.")
        self.c.work_commit(2)
        self.assertFails("changed or removed an earlier log line")

    def test_plain_revert_removes_an_entry(self):
        self.c.work_commit(1)
        self.c.run("git", "revert", "--no-edit", "HEAD")
        self.assertFails("changed or removed an earlier log line")

    def test_audit_row_deleted(self):
        row = next(l for l in self.c.journal().splitlines() if l.startswith("| T62 "))
        self.c.edit_journal(row + "\n", "")
        self.c.work_commit(1)
        self.assertFails("audit-map rows were deleted: T62")

    def test_spec_row_swapped(self):
        c = self.c
        c.edit_journal("|---|---|---|---|---|\n\n---\n\n## 3. Log",
                       "|---|---|---|---|---|\n| spec 06 Submission cutoff | db | t | built | |\n\n---\n\n## 3. Log")
        c.work_commit(1)
        c.squash_merge("feature", "shared: spec 06 (#1)")
        c.run("git", "checkout", "-q", "-B", "next", "origin/main")
        c.edit_journal("| spec 06 Submission cutoff | db | t | built | |", "| spec 14 Captions | api | t | built | |")
        c.work_commit(2)
        self.assertFails("audit-map rows were deleted: spec 06")

    def test_state_not_rewritten(self):
        self.c.write("src/file.txt", "1\n")
        self.c.add_entry(entry(1))
        self.c.commit("no state")
        self.assertFails("block's \"Updated\" line didn't change")

    def test_other_lanes_block_rewritten(self):
        self.c.write("src/file.txt", "1\n")
        self.c.touch_state("api")
        self.c.add_entry(entry(1, "ios"), "ios")
        self.c.commit("ios entry, api block")
        self.assertFails("the ios block's \"Updated\" line didn't change")

    def test_journal_unchanged(self):
        self.c.write("src/file.txt", "1\n")
        self.c.commit("code only")
        self.assertFails("has no change on this branch")

    def test_no_origin_main(self):
        self.c.work_commit(1)
        self.c.run("git", "update-ref", "-d", "refs/remotes/origin/main")
        self.assertFails("origin/main is missing")

    def test_all_mode(self):
        code, err = self.c.check("--all")
        self.assertEqual(code, 0, err)
        self.c.add_entry(entry(1, drop="Why"))
        code, err = self.c.check("--all")
        self.assertEqual(code, 1)
        self.assertIn("**Why:** is missing", err)
        self.c.edit_journal("## 5. How to audit this project", "## 5. Auditing")
        code, err = self.c.check("--all")
        self.assertIn("is missing", err)

    def test_usage(self):
        code, _ = self.c.check("--nothing")
        self.assertEqual(code, 2)


class FirstPullRequestTest(unittest.TestCase):
    """The starter-pack PR: main has only GitHub's README, and the founder's upload is a web commit."""

    def setUp(self):
        self.c = Clone(with_journal=False)
        self.c.write("tadayo-starter-pack.zip", "zip\n")
        self.c.commit("Add files via upload", web=True)
        self.c.write("docs/JOURNAL.md", as_the_handoff_wrote_it(read(JOURNAL)))
        os.remove(self.c.path("tadayo-starter-pack.zip"))

    def tearDown(self):
        self.c.cleanup()

    def test_unpack_with_its_entry(self):
        self.c.touch_state()
        self.c.add_entry(entry(1))
        self.c.commit("docs: unpack the starter pack")
        code, err = self.c.check()
        self.assertEqual(code, 0, err)

    def test_unpack_without_an_entry(self):
        self.c.commit("docs: unpack the starter pack")
        code, err = self.c.check()
        self.assertEqual(code, 1, err)
        self.assertIn("1 commit(s) of its own but its log gained 0", err)

    def test_state_left_as_the_handoff_wrote_it(self):
        self.c.add_entry(entry(1))
        self.c.commit("docs: unpack the starter pack")
        code, err = self.c.check()
        self.assertEqual(code, 1, err)
        self.assertIn("\"Updated\" line didn't change", err)


if __name__ == "__main__":
    unittest.main(verbosity=1)
