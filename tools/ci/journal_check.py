#!/usr/bin/env python3
"""Checks docs/JOURNAL.md (CLAUDE.md, "The journal"; the rules at the top of the journal).

  python3 tools/ci/journal_check.py --branch
      The `ci` guard. It compares the branch with the point where it left main (its merge base
      with origin/main). It counts the branch's own commits: not merges, not commits made on
      GitHub's website (the founder's uploads and edits), and not commits whose entries are
      already on main (an earlier branch that main took in as a squash merge). A commit is
      GitHub's own only when GitHub is its committer and it is signed by GitHub's web-flow key
      (below): the committer's name and email are what any client says. It fails unless:
        1. docs/JOURNAL.md changed;
        2. the log gained at least one entry per counted commit (the handoff's entry doesn't
           count);
        3. every new entry has a well-formed heading and all six fields, each filled in;
        4. no commit changed or removed a line of the log that was there before it, and every
           line of main's log is still there: the log is append-only;
        5. every audit-map row is still there;
        6. the "Updated" line changed in the state block of each lane that added entries
           (shared: 1.1, api: 1.2, ios: 1.3).
      It needs a full checkout (fetch-depth: 0) and gpg. A branch with no counted commits passes.

  GitHub signs every commit made on its website with its web-flow key (the outside audit's B6).
  The key is vendored beside this file, in github-web-flow.asc, and the check imports it into a
  keyring of its own, made for the run and removed after it, and refuses to go on unless that
  keyring holds that one key, at WEB_FLOW_FINGERPRINT. A commit is GitHub's when `git
  verify-commit` against that keyring passes and gpg reports a valid signature whose primary key is
  that fingerprint. GitHub signs the commits it makes through its API for an account the same way,
  so the session's GitHub tools could make one; working around the check that way is still
  working around it (CLAUDE.md, "The journal"; docs/LIMITATIONS.md). When GitHub rotates the key,
  a CI-configuration PR vendors the new one.

  python3 tools/ci/journal_check.py --all
      Checks the journal as it is: its sections, and every entry's heading and fields. For
      audits, and for a check before pushing.

Exit 0 when the journal passes, 1 when it doesn't (each problem is printed), 2 on bad usage.

Tests: python3 tools/ci/journal_check_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import collections
import os
import re
import shutil
import subprocess
import sys
import tempfile

JOURNAL = "docs/JOURNAL.md"
SECTIONS = ["## 0. Orientation", "## 1. State of the project", "## 2. Audit map", "## 3. Log",
            "## 4. Pull requests, gates and evidence", "## 5. How to audit this project"]
FIELDS = ["Did", "Why", "Verified", "Not verified", "Decisions and questions", "Next"]
HEADING = re.compile(r"^#### \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2} UTC)? · (shared|api|ios|handoff)"
                     r" · \S+ · PR (?:#\d+|none)$")
FIELD_LINE = re.compile(r"^\*\*(" + "|".join(re.escape(f) for f in FIELDS) + r"):\*\*(.*)$")
FENCE = re.compile(r"^\s*```")
ROW_KEY = re.compile(r"^(T\d+|Q\d+|spec \d+|\d{2})\b")
LANE_BLOCKS = {"shared": "### 1.1", "api": "### 1.2", "ios": "### 1.3"}
WEB_COMMITTER = "noreply@github.com"  # commits made on GitHub's website
# GitHub's web-flow key, created 2024-01-16, which signs them (see the top of this file).
WEB_FLOW_KEY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "github-web-flow.asc")
WEB_FLOW_FINGERPRINT = "968479A1AFF927E37D1A566BB5690EEEBB952194"
# gpg's status lines that end any claim to a good signature.
BAD_STATUS = re.compile(r"^\[GNUPG:\] (?:BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG|NO_PUBKEY) ", re.M)
VALIDSIG = re.compile(r"^\[GNUPG:\] VALIDSIG [0-9A-F]{40} .* ([0-9A-F]{40})$", re.M)


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError("git " + " ".join(args) + " failed: " + result.stderr.strip())
    return result.stdout


class WebFlowKeyring:
    """A keyring of its own holding GitHub's web-flow key and nothing else, made on first use."""

    def __init__(self, key=None, fingerprint=None):
        self.key = key or WEB_FLOW_KEY
        self.fingerprint = fingerprint or WEB_FLOW_FINGERPRINT
        self.home = None

    def _gpg(self, *args):
        try:
            return subprocess.run(["gpg", "--batch", "--no-autostart", "--homedir", self.home, *args],
                                  capture_output=True, text=True)
        except FileNotFoundError:
            raise RuntimeError("gpg is missing: the check needs it to tell GitHub's own commits")

    def open(self):
        if self.home is not None:
            return
        self.home = tempfile.mkdtemp(prefix="web-flow-")
        imported = self._gpg("--quiet", "--import", self.key)
        if imported.returncode != 0:
            raise RuntimeError(f"gpg couldn't import {self.key}: {imported.stderr.strip()}")
        listed = self._gpg("--with-colons", "--fingerprint")
        primaries, previous = [], ""
        for line in listed.stdout.splitlines():
            if line.startswith("fpr:") and previous.startswith("pub:"):
                primaries.append(line.split(":")[9])
            previous = line
        if listed.returncode != 0 or primaries != [self.fingerprint]:
            raise RuntimeError(f"{self.key} must hold GitHub's web-flow key, {self.fingerprint}, and no "
                               f"other; it holds {', '.join(primaries) or 'none'}")

    def signed(self, sha):
        """Whether the commit is signed by the web-flow key."""
        self.open()
        env = dict(os.environ, GNUPGHOME=self.home)
        result = subprocess.run(["git", "-c", "gpg.program=gpg", "-c", "gpg.openpgp.program=gpg",
                                 "verify-commit", "--raw", sha], capture_output=True, text=True, env=env)
        status = result.stdout + result.stderr
        return (result.returncode == 0 and not BAD_STATUS.search(status)
                and any(primary == self.fingerprint for primary in VALIDSIG.findall(status)))

    def close(self):
        if self.home is None:
            return
        try:
            subprocess.run(["gpgconf", "--homedir", self.home, "--kill", "all"], capture_output=True)
        except FileNotFoundError:
            pass  # no gpg, so no agent to stop
        shutil.rmtree(self.home, ignore_errors=True)
        self.home = None


def journal_at(rev):
    """The journal's text at a revision, or None where it doesn't exist."""
    try:
        return git("show", f"{rev}:{JOURNAL}")
    except RuntimeError:
        return None


def scan(text):
    """The text's lines, each with whether it sits inside a fenced code block (fences included)."""
    lines, fenced = [], False
    for line in text.splitlines():
        line = line.rstrip()
        if FENCE.match(line):
            lines.append((line, True))
            fenced = not fenced
        else:
            lines.append((line, fenced))
    return lines


def section(text, title):
    """The (line, fenced) pairs of one `## ` section, without its heading; [] if it's missing."""
    lines = scan(text)
    for i, (line, fenced) in enumerate(lines):
        if not fenced and (line == title or line.startswith(title + " ")):
            body = []
            for later, later_fenced in lines[i + 1:]:
                if not later_fenced and later.startswith("## "):
                    break
                body.append((later, later_fenced))
            return body
    return []


def log_history(text):
    """The log's entries as plain lines: from its first lane section on, code blocks included."""
    if text is None:
        return []
    lines = section(text, "## 3. Log")
    for i, (line, fenced) in enumerate(lines):
        if not fenced and line.startswith("### "):
            return [line for line, _ in lines[i:]]
    return []


def entries(text):
    """The log's entries as (heading, [(line, fenced)]), in the order they appear."""
    if text is None:
        return []
    found, current, started = [], None, False
    for line, fenced in section(text, "## 3. Log"):
        if not fenced and line.startswith("### "):
            started, current = True, None  # a lane's section starts; the intro is over
        elif not started:
            continue
        elif not fenced and line.startswith("#### "):
            current = (line, [])
            found.append(current)
        elif current is not None:
            current[1].append((line, fenced))
    return found


def headings(text, include_handoff=True):
    return collections.Counter(h for h, _ in entries(text)
                               if include_handoff or " · handoff · " not in h)


def lane_of(heading):
    match = HEADING.match(heading)
    return match.group(1) if match else None


def entry_problems(heading, body):
    problems = []
    if not HEADING.match(heading) or (lane_of(heading) != "handoff" and " UTC · " not in heading):
        problems.append(f"{heading!r}: the heading doesn't follow the template "
                        "(#### YYYY-MM-DD HH:MM UTC · lane · branch · PR #n or PR none)")
    content = collections.OrderedDict()
    current = None
    for line, fenced in body:
        match = None if fenced else FIELD_LINE.match(line)
        if match:
            current = match.group(1)
            content[current] = match.group(2).strip()
        elif current is not None and line.strip():
            content[current] += " " + line.strip()
    for field in FIELDS:
        if field not in content:
            problems.append(f"{heading!r}: the field **{field}:** is missing")
        elif not content[field]:
            problems.append(f"{heading!r}: the field **{field}:** is empty (write \"None\" if it has nothing)")
    return problems


def audit_rows(text):
    """The key of every audit-map row: T1, Q01, spec 06, or else the whole first cell."""
    keys = []
    for line, fenced in section(text, "## 2. Audit map"):
        if fenced or not line.startswith("|") or set(line) <= set("|-: "):
            continue
        first = line.strip("|").split("|")[0].strip()
        if not first or first in ("Rule", "Test", "Section"):
            continue
        match = ROW_KEY.match(first)
        keys.append(match.group(1) if match else first)
    return keys


def updated_line(text, lane):
    """The first "Updated" line of a lane's state block, or None."""
    in_block = False
    for line, fenced in section(text, "## 1. State of the project"):
        if fenced:
            continue
        if line.startswith("### "):
            in_block = line.startswith(LANE_BLOCKS[lane])
        elif in_block and line.startswith("**Updated:**"):
            return line
    return None


def is_subsequence(old, new):
    remaining = iter(new)
    return all(any(line == candidate for candidate in remaining) for line in old)


def check_all(text):
    problems = []
    positions = []
    plain = [line for line, fenced in scan(text) if not fenced]
    for title in SECTIONS:
        if title in plain:
            positions.append(plain.index(title))
        else:
            problems.append(f"the section {title!r} is missing")
    if positions != sorted(positions):
        problems.append("the sections are out of order")
    for heading, body in entries(text):
        problems.extend(entry_problems(heading, body))
    return problems


def check_branch(keyring=None):
    keyring = keyring or WebFlowKeyring()
    try:
        return branch_problems(keyring)
    finally:
        keyring.close()


def branch_problems(keyring):
    if subprocess.run(["git", "rev-parse", "--verify", "-q", "origin/main"],
                      capture_output=True).returncode != 0:
        return ["origin/main is missing, so the journal can't be compared. Check out with fetch-depth: 0."]
    base = git("merge-base", "origin/main", "HEAD").strip()
    base_text = journal_at(base)  # None on the first PR, which adds the journal
    on_main = headings(base_text)
    problems = []
    counted, unsigned_web = [], []
    for line in git("log", "--no-merges", "--format=%H %ce", f"{base}..HEAD").splitlines():
        sha, _, committer = line.partition(" ")
        if not sha:
            continue
        if committer == WEB_COMMITTER:
            if keyring.signed(sha):
                continue  # made on GitHub's website
            unsigned_web.append(sha)
        after, before = journal_at(sha), journal_at(f"{sha}^1")
        added = headings(after, include_handoff=False) - headings(before, include_handoff=False)
        if added and all(on_main[h] >= n for h, n in added.items()):
            continue  # this commit's entries are on main already: a squash merge took it in
        counted.append(sha)
        if before is not None and not is_subsequence(log_history(before), log_history(after)):
            problems.append(f"commit {sha[:7]} changed or removed an earlier log line: the log is "
                            "append-only (correct a mistake with a new entry)")
    if not counted:
        return problems
    head_text = journal_at("HEAD")
    if head_text is None:
        return problems + [f"{JOURNAL} is missing"]
    if base_text == head_text:
        return problems + [f"{JOURNAL} has no change on this branch. Every commit writes its journal "
                           "entry (CLAUDE.md, \"The journal\")."]
    new = headings(head_text, include_handoff=False) - headings(base_text, include_handoff=False)
    if sum(new.values()) < len(counted):
        problems.append(f"the branch has {len(counted)} commit(s) of its own but its log gained "
                        f"{sum(new.values())} entr(ies): every commit adds one")
        for sha in unsigned_web:
            problems.append(f"commit {sha[:7]} names GitHub as its committer but isn't signed by "
                            f"GitHub's web-flow key ({WEB_FLOW_FINGERPRINT}), so it counts as a commit "
                            "of the branch's own")
    for heading, body in entries(head_text):
        if new.get(heading, 0) > 0:
            problems.extend(entry_problems(heading, body))
    if base_text is not None:
        if not is_subsequence(log_history(base_text), log_history(head_text)):
            problems.append("a line of main's log was changed or removed: the log is append-only")
        missing = collections.Counter(audit_rows(base_text)) - collections.Counter(audit_rows(head_text))
        if missing:
            problems.append("audit-map rows were deleted: " + ", ".join(sorted(missing)))
    for lane in sorted({lane_of(h) for h in new} - {None, "handoff"}):
        head_line = updated_line(head_text, lane)
        base_line = updated_line(base_text, lane) if base_text is not None else None
        if head_line is None:
            problems.append(f"the {lane} block of section 1 has no \"**Updated:**\" line")
        elif head_line == base_line or "by the handoff" in head_line:
            problems.append(f"the {lane} block's \"Updated\" line didn't change: rewrite your block of "
                            "the state, and its line (**Updated:** YYYY-MM-DD HH:MM UTC, <branch>)")
    return problems


def main(argv):
    if argv[1:] == ["--branch"]:
        try:
            problems = check_branch()
        except (OSError, RuntimeError) as error:
            problems = [str(error)]
    elif argv[1:] == ["--all"]:
        try:
            with open(JOURNAL, encoding="utf-8") as f:
                problems = check_all(f.read())
        except OSError as error:
            problems = [str(error)]
    else:
        print("usage: tools/ci/journal_check.py --branch | --all", file=sys.stderr)
        return 2
    for problem in problems:
        print(f"journal: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
