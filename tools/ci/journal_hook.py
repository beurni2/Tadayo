#!/usr/bin/env python3
"""Refuse a git commit that leaves out docs/JOURNAL.md (CLAUDE.md, "The journal").

Claude Code runs this before every Bash command (.claude/settings.json, PreToolUse) and passes the
tool call as JSON on stdin. The script reads the command line the way the shell would: quotes,
heredocs, ( ) subshells, $(...) and backticks in the order they run, `bash -c`, scripts fed to a
shell on stdin, and `eval`. So text that only mentions "git commit" (a grep, a log search, a PR
comment, a heredoc body) is not a commit. For each `git commit` in a repository that holds this
file, it works out whether docs/JOURNAL.md will be in the commit. It follows the `cd`, `pushd`,
`popd` and `git add` commands that run before it in the same command line, counts an earlier
command that writes the journal, and accepts `--amend` of a commit that already has it.

Exit 2 refuses the command and shows the message to Claude Code. When the script can't tell (a
path held in a variable, an interactive add, an earlier command that rewrites the index, any
error), it exits 0: an unsure hook never blocks other work, and the `ci` guard
(tools/ci/journal_check.py --branch) still holds the rule for the branch.

Tests: python3 tools/ci/journal_hook_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import fnmatch
import glob
import json
import os
import re
import subprocess
import sys

JOURNAL = "docs/JOURNAL.md"
JOURNAL_NAME = "JOURNAL.md"
MARKER = "tools/ci/journal_hook.py"

MESSAGE = """docs/JOURNAL.md isn't in this commit. Every commit carries its journal entry (CLAUDE.md, "The journal"): rewrite the state, update the audit map, add the log entry, and stage the journal in this command or before it.
If the journal is in the commit and this refusal is wrong, split the command: run what comes before the commit in its own call, then `git add docs/JOURNAL.md` and the commit, as a plain `git commit`, in the next call. Add a row to docs/LIMITATIONS.md quoting the refused command, so the hook is fixed in its own PR. Never edit the hook or go around it.
"""

OPERATORS = ["&>>", "<<-", "<<<", "&&", "||", ";;", "|&", "<<", ">>", "<&", ">&", "&>", "<>", ">|",
             ";", "&", "|", "(", ")", "<", ">"]
HEREDOCS = {"<<", "<<-"}
SEPARATORS = {"\n", ";", "&", "&&", "||", "|", "|&", ";;"}
RESERVED = {"if", "then", "elif", "else", "do", "while", "until", "!", "{", "}", "fi", "done", "esac"}
PREFIXES = {"command", "builtin", "nohup", "exec", "time"}
SHELLS = {"bash", "sh", "dash", "zsh", "ksh"}
SHELL_OPTIONS_WITH_VALUE = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\+?=")
GIT_LAYOUT_VARIABLES = {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"}
# Commands that read files but never write them, so naming the journal doesn't change it.
READ_ONLY = {"cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "wc", "diff",
             "cmp", "ls", "stat", "file", "sha256sum", "sha1sum", "md5sum", "echo", "printf", "test",
             "[", "[[", "true", "false", "sort", "uniq", "cut", "nl"}

# git's own options before the subcommand that take the next word as their value.
GIT_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env",
                          "--attr-source"}
# git subcommands that can change the index or the working tree before a commit in the same line.
GIT_INDEX_CHANGERS = {"stash", "reset", "merge", "checkout", "switch", "restore", "rm", "mv",
                      "apply", "cherry-pick", "revert", "pull", "am", "read-tree", "update-index",
                      "rebase", "worktree", "clean"}
# git commit's options that take a value: short ones (value attached or next word), long ones.
COMMIT_SHORT_WITH_VALUE = set("mFCct")
COMMIT_SHORT_OPTIONAL_VALUE = set("uS")  # only an attached value: -uno, -Skey
COMMIT_LONG_WITH_VALUE = {"--message", "--file", "--reuse-message", "--reedit-message", "--fixup",
                          "--squash", "--author", "--date", "--template", "--cleanup", "--trailer",
                          "--pathspec-from-file"}
COMMIT_NO_COMMIT = {"--dry-run", "--short", "--porcelain", "--long", "--null", "--help"}


class Unsure(Exception):
    """The command line can't be read reliably, so the hook lets it through."""


# ---------------------------------------------------------------------------------------------
# Reading the command line


class Word:
    """A shell word after quote removal. `dynamic` means it holds an expansion whose value isn't
    known here ($x, $(...), `...`); `subs` are the command substitutions inside it."""
    __slots__ = ("text", "dynamic", "quoted", "subs")

    def __init__(self, text, dynamic, quoted, subs):
        self.text, self.dynamic, self.quoted, self.subs = text, dynamic, quoted, subs


class Heredoc:
    """A << or <<- redirection. Its body is filled in when the lexer reaches it."""
    __slots__ = ("strip_tabs", "delimiter", "body")

    def __init__(self, op):
        self.strip_tabs = op == "<<-"
        self.delimiter = None
        self.body = ""


class Lexer:
    """Splits a shell command line into words, heredocs and operators."""

    def __init__(self, s, i=0, nested=False):
        self.s = s
        self.i = i
        self.nested = nested  # inside $( ... ): stop at the closing parenthesis
        self.tokens = []
        self.pending = []      # heredocs waiting for their body after the next newline
        self.awaiting = None   # the heredoc whose delimiter is the next word
        self.depth = 0
        self.subs = None       # substitutions of the word being read

    def run(self):
        s, n = self.s, len(self.s)
        while self.i < n:
            c = s[self.i]
            if c in " \t":
                self.i += 1
            elif s.startswith("\\\n", self.i):
                self.i += 2
            elif c == "\n":
                self.i += 1
                self.tokens.append("\n")
                self.read_heredoc_bodies()
            elif c == "#":
                end = s.find("\n", self.i)
                self.i = n if end < 0 else end
            else:
                op = self.operator()
                if op:
                    if op == ")" and self.nested and self.depth == 0:
                        self.i += 1
                        return self.i
                    if op == "(":
                        self.depth += 1
                    elif op == ")":
                        self.depth -= 1
                    self.i += len(op)
                    if op in HEREDOCS:
                        self.awaiting = Heredoc(op)
                        self.tokens.append(self.awaiting)
                    else:
                        self.tokens.append(op)
                    continue
                word = self.word()
                if self.awaiting is not None:
                    self.awaiting.delimiter = word.text
                    self.pending.append(self.awaiting)
                    self.awaiting = None
                elif (not word.quoted and not word.dynamic and word.text.isdigit()
                      and self.i < n and s[self.i] in "<>"):
                    continue  # a file descriptor number, as in 2>&1
                self.tokens.append(word)
        if self.nested:
            raise Unsure("unclosed $(")
        return self.i

    def operator(self):
        for op in OPERATORS:
            if self.s.startswith(op, self.i):
                return op
        return None

    def word(self):
        s, n = self.s, len(self.s)
        outer_subs, self.subs = self.subs, []
        out = []
        dynamic = quoted = False
        while self.i < n:
            c = s[self.i]
            if c in " \t\n;&|()<>":
                break
            if c == "\\":
                if self.i + 1 < n and s[self.i + 1] != "\n":
                    out.append(s[self.i + 1])
                self.i += 2
                quoted = True
            elif c == "'":
                end = s.find("'", self.i + 1)
                if end < 0:
                    raise Unsure("unclosed single quote")
                out.append(s[self.i + 1:end])
                self.i = end + 1
                quoted = True
            elif c == '"':
                self.i += 1
                dynamic = self.double_quoted(out) or dynamic
                quoted = True
            elif c == "$":
                dynamic = self.dollar(out, in_double_quotes=False) or dynamic
            elif c == "`":
                self.backtick()
                dynamic = True
            else:
                out.append(c)
                self.i += 1
        word = Word("".join(out), dynamic, quoted, self.subs)
        self.subs = outer_subs
        return word

    def double_quoted(self, out):
        s, n = self.s, len(self.s)
        dynamic = False
        while self.i < n:
            c = s[self.i]
            if c == '"':
                self.i += 1
                return dynamic
            if c == "\\" and self.i + 1 < n and s[self.i + 1] in '"\\$`\n':
                if s[self.i + 1] != "\n":
                    out.append(s[self.i + 1])
                self.i += 2
            elif c == "$":
                dynamic = self.dollar(out, in_double_quotes=True) or dynamic
            elif c == "`":
                self.backtick()
                dynamic = True
            else:
                out.append(c)
                self.i += 1
        raise Unsure("unclosed double quote")

    def dollar(self, out, in_double_quotes):
        """Reads an expansion starting at '$'. Returns True when its value is unknown."""
        s, n = self.s, len(self.s)
        nxt = s[self.i + 1] if self.i + 1 < n else ""
        if s.startswith("$((", self.i):
            self.i = self.skip_parentheses(self.i + 3, depth=2)
            return True
        if nxt == "(":
            sub = Lexer(s, self.i + 2, nested=True)
            self.i = sub.run()
            self.subs.append(sub)
            return True
        if nxt == "{":
            self.i = self.skip_braces(self.i + 2)
            return True
        if nxt == "'" and not in_double_quotes:
            j = self.i + 2
            buf = []
            while j < n and s[j] != "'":
                if s[j] == "\\" and j + 1 < n:
                    buf.append(s[j + 1])
                    j += 2
                else:
                    buf.append(s[j])
                    j += 1
            if j >= n:
                raise Unsure("unclosed $'")
            out.append("".join(buf))
            self.i = j + 1
            return False
        if nxt == '"' and not in_double_quotes:
            self.i += 1  # $"..." reads as "..."
            return False
        if nxt.isalpha() or nxt == "_":
            j = self.i + 1
            while j < n and (s[j].isalnum() or s[j] == "_"):
                j += 1
            out.append(s[self.i:j])
            self.i = j
            return True
        if nxt and (nxt.isdigit() or nxt in "@*#?$!-"):
            out.append(s[self.i:self.i + 2])
            self.i += 2
            return True
        out.append("$")
        self.i += 1
        return False

    def backtick(self):
        s, n = self.s, len(self.s)
        j = self.i + 1
        buf = []
        while j < n and s[j] != "`":
            if s[j] == "\\" and j + 1 < n:
                buf.append(s[j + 1] if s[j + 1] in "`\\$" else s[j:j + 2])
                j += 2
            else:
                buf.append(s[j])
                j += 1
        if j >= n:
            raise Unsure("unclosed backtick")
        sub = Lexer("".join(buf))
        sub.run()
        self.subs.append(sub)
        self.i = j + 1

    def skip_parentheses(self, j, depth):
        s, n = self.s, len(self.s)
        while j < n and depth:
            if s[j] == "(":
                depth += 1
            elif s[j] == ")":
                depth -= 1
            j += 1
        if depth:
            raise Unsure("unclosed $((")
        return j

    def skip_braces(self, j):
        s, n = self.s, len(self.s)
        depth = 1
        while j < n and depth:
            c = s[j]
            if c == "\\":
                j += 2
                continue
            if c == "'":
                end = s.find("'", j + 1)
                if end < 0:
                    raise Unsure("unclosed quote in ${")
                j = end + 1
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            j += 1
        if depth:
            raise Unsure("unclosed ${")
        return j

    def read_heredoc_bodies(self):
        s, n = self.s, len(self.s)
        for heredoc in self.pending:
            start = self.i
            while self.i < n:
                line_start = self.i
                end = s.find("\n", self.i)
                line = s[self.i:] if end < 0 else s[self.i:end]
                self.i = n if end < 0 else end + 1
                if (line.lstrip("\t") if heredoc.strip_tabs else line) == heredoc.delimiter:
                    heredoc.body = s[start:line_start]
                    break
            else:
                heredoc.body = s[start:]
        self.pending = []


class Command:
    """One simple command: its words, its redirection targets and its heredoc bodies."""
    __slots__ = ("words", "targets", "heredocs")

    def __init__(self):
        self.words, self.targets, self.heredocs = [], [], []


SUBSHELL_START, SUBSHELL_END = object(), object()


def parse(lexer):
    """The commands of a lexed line, in order, with markers where ( ) subshells start and end."""
    nodes = []
    command = Command()
    expect = None  # "target" after a redirection, "delimiter" after a heredoc

    def finish():
        nonlocal command
        if command.words or command.targets or command.heredocs:
            nodes.append(command)
        command = Command()

    for token in lexer.tokens:
        if isinstance(token, Word):
            if expect == "target":
                command.targets.append(token)
            elif expect is None:
                command.words.append(token)
            expect = None
        elif isinstance(token, Heredoc):
            command.heredocs.append(token)
            expect = "delimiter"
        elif token in ("(", ")"):
            finish()
            nodes.append(SUBSHELL_START if token == "(" else SUBSHELL_END)
            expect = None
        elif token in SEPARATORS:
            finish()
            expect = None
        else:
            expect = "target"  # a redirection
    finish()
    return nodes


def strip_prefix(words):
    """Drops reserved words, variable assignments and wrappers such as `env` and `time`.

    Returns the remaining words, and whether an assignment moves git to another repository."""
    moved = False
    i = 0
    while i < len(words):
        word = words[i]
        if word.dynamic:
            break
        text = word.text
        if text in RESERVED or text in PREFIXES:
            i += 1
        elif ASSIGNMENT.match(text):
            moved = moved or text.split("=", 1)[0].rstrip("+") in GIT_LAYOUT_VARIABLES
            i += 1
        elif text == "env":
            i += 1
            while i < len(words) and (words[i].text.startswith("-") or ASSIGNMENT.match(words[i].text)):
                if words[i].text in ("-C", "--chdir", "-S", "--split-string"):
                    raise Unsure("env changes the directory or splits a string")
                if words[i].text in ("-u", "--unset"):
                    i += 1
                elif ASSIGNMENT.match(words[i].text):
                    moved = moved or words[i].text.split("=", 1)[0] in GIT_LAYOUT_VARIABLES
                i += 1
        else:
            break
    return words[i:], moved


# ---------------------------------------------------------------------------------------------
# Following the command line


class RepoState:
    def __init__(self, top, staged, dirty, untracked):
        self.top = top
        self.staged = staged        # the index's journal differs from HEAD's
        self.dirty = dirty          # the working tree's journal differs from the index
        self.untracked = untracked  # the journal isn't tracked yet
        self.unsure = False
        self.head_has_journal = None


class Context:
    def __init__(self):
        self.repos = {}
        self.toplevels = {}
        self.problems = []
        self.journal_written = False  # an earlier command in the line may have written the journal
        self.dirstack = []


def git_output(directory, *args):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0")
    for name in GIT_LAYOUT_VARIABLES:
        env.pop(name, None)
    try:
        result = subprocess.run(["git", "-C", directory, *args], capture_output=True, text=True,
                                timeout=10, env=env)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout if result.returncode == 0 else None


def repo_state(directory, ctx):
    if directory not in ctx.toplevels:
        out = git_output(directory, "rev-parse", "--show-toplevel")
        ctx.toplevels[directory] = os.path.realpath(out.strip()) if out and out.strip() else None
    top = ctx.toplevels[directory]
    if top is None:
        return None
    if top in ctx.repos:
        return ctx.repos[top]
    if not os.path.isfile(os.path.join(top, MARKER)):
        ctx.repos[top] = None  # not a repository that keeps this journal
        return None
    status = git_output(top, "status", "--porcelain=v1", "--untracked-files=all", "--", JOURNAL)
    if status is None:
        raise Unsure("git status failed")
    x, y = (status[0], status[1]) if len(status) >= 2 else (" ", " ")
    state = RepoState(top, staged=x not in " ?", dirty=y != " ", untracked=(x, y) == ("?", "?"))
    ctx.repos[top] = state
    return state


def head_has_journal(state):
    """Whether HEAD changed the journal, against its first parent (so merges count too)."""
    if state.head_has_journal is None:
        if git_output(state.top, "rev-parse", "-q", "--verify", "HEAD^1") is not None:
            out = git_output(state.top, "diff", "--name-only", "HEAD^1", "HEAD", "--", JOURNAL)
        else:
            out = git_output(state.top, "diff-tree", "--no-commit-id", "--name-only", "-r",
                             "--root", "HEAD", "--", JOURNAL)
        state.head_has_journal = bool(out and out.strip())
    return state.head_has_journal


def path_covers(path, base, top, git_glob):
    """Whether one path (or a git glob) given relative to `base` covers the journal."""
    full = os.path.normpath(os.path.join(base, os.path.expanduser(path)))
    rel = os.path.relpath(full, top).replace(os.sep, "/")
    if rel == ".." or rel.startswith("../"):
        return False
    if git_glob and any(ch in path for ch in "*?["):
        return fnmatch.fnmatchcase(JOURNAL, rel)
    return rel == "." or rel == JOURNAL or JOURNAL.startswith(rel + "/")


def classify(word, directory, top):
    """('include' or 'exclude', covers) for one pathspec; covers is None when unknown."""
    text = word.text
    if text.startswith(":"):
        kind, base, rest = "include", directory, text[1:]
        if rest.startswith("("):
            end = rest.find(")")
            if end < 0:
                return kind, None
            magic = {m.strip() for m in rest[1:end].split(",")}
            if magic - {"top", "exclude", "literal", "glob"}:
                return kind, None
            if "exclude" in magic:
                kind = "exclude"
            if "top" in magic:
                base = top
            rest = rest[end + 1:]
        else:
            j = 0
            while j < len(rest) and rest[j] in "/!^":
                if rest[j] == "/":
                    base = top
                else:
                    kind = "exclude"
                j += 1
            if j < len(rest) and rest[j] == ":":
                j += 1
            rest = rest[j:]
        return kind, path_covers(rest or ".", base, top, git_glob=True)
    if not word.quoted and any(ch in text for ch in "*?["):
        # The shell expands an unquoted glob first; git sees the pattern only if nothing matches.
        matches = glob.glob(os.path.join(glob.escape(directory), text))
        if matches:
            return "include", any(path_covers(m, directory, top, git_glob=False) for m in matches)
    return "include", path_covers(text, directory, top, git_glob=True)


def pathspecs_cover_journal(words, directory, top):
    """True, False, or None when unknown, for the pathspecs of one git command."""
    includes, excludes = [], []
    for word in words:
        if word.dynamic:
            return None
        kind, covers = classify(word, directory, top)
        if covers is None:
            return None
        (includes if kind == "include" else excludes).append(covers)
    if not includes and not excludes:
        return False
    return (any(includes) if includes else True) and not any(excludes)


def names_journal(words):
    return any(JOURNAL_NAME in w.text for w in words)


def writes_journal(name, words, command):
    """Whether a command other than git may write the journal: by redirection, by naming it,
    or from a heredoc script that names it."""
    if names_journal(command.targets):
        return True
    if name in READ_ONLY:
        return False
    return names_journal(words[1:]) or any(JOURNAL_NAME in h.body for h in command.heredocs)


def change_directory(name, cwd, args, ctx):
    if name == "popd":
        return ctx.dirstack.pop() if ctx.dirstack else None
    operands = [w for w in args if w.dynamic or not w.text.startswith(("-", "+")) or w.text == "-"]
    if name == "pushd":
        ctx.dirstack.append(cwd)
    if cwd is None:
        return None
    if not operands:
        return None if name == "pushd" else os.path.expanduser("~")
    word = operands[0]
    if word.dynamic or word.text == "-":
        return None  # unknown from here on
    return os.path.realpath(os.path.join(cwd, os.path.expanduser(word.text)))


def shell_script(words):
    """The script of `bash -c '<script>'`, or None."""
    has_c = False
    i = 1
    while i < len(words):
        word = words[i]
        if word.dynamic:
            return None
        text = word.text
        if text in SHELL_OPTIONS_WITH_VALUE:
            i += 2
        elif text.startswith("--"):
            i += 1
        elif text[:1] in "-+" and len(text) > 1:
            has_c = has_c or "c" in text[1:]
            i += 1
        else:
            return text if has_c else None
    return None


def reads_stdin(words):
    """Whether a shell reads its script from stdin: no -c and no script file, or -s."""
    i = 1
    while i < len(words):
        text = words[i].text
        if words[i].dynamic:
            return False
        if text in SHELL_OPTIONS_WITH_VALUE:
            i += 2
            continue
        if text[:1] in "-+" and len(text) > 1 and not text.startswith("--"):
            if "s" in text[1:]:
                return True
            if "c" in text[1:]:
                return False
            i += 1
            continue
        if text.startswith("--"):
            i += 1
            continue
        return False  # a script file
    return True


def run_script(script, cwd, ctx):
    lexer = Lexer(script)
    lexer.run()
    walk(lexer, cwd, ctx)


def walk(lexer, cwd, ctx):
    saved = []
    for node in parse(lexer):
        if node is SUBSHELL_START:
            saved.append(cwd)
        elif node is SUBSHELL_END:
            if saved:
                cwd = saved.pop()
        else:
            cwd = run_command(node, cwd, ctx)
    return cwd


def run_command(command, cwd, ctx):
    # Command substitutions run first, each in a subshell of its own.
    for word in command.words + command.targets:
        for sub in word.subs:
            walk(sub, cwd, ctx)
    words, moved = strip_prefix(command.words)
    name = os.path.basename(words[0].text) if words and not words[0].dynamic else None
    if name == "git":
        if not moved and cwd is not None:
            git_command(words[1:], cwd, ctx)
        return cwd
    if name in ("cd", "pushd", "popd"):
        return change_directory(name, cwd, words[1:], ctx)
    if name in SHELLS:
        script = shell_script(words)
        if script is not None:
            run_script(script, cwd, ctx)
        elif reads_stdin(words):
            for heredoc in command.heredocs:
                run_script(heredoc.body, cwd, ctx)
    elif name == "eval" and not any(w.dynamic for w in words[1:]):
        run_script(" ".join(w.text for w in words[1:]), cwd, ctx)
    if writes_journal(name, words, command):
        ctx.journal_written = True
    return cwd


def git_command(args, cwd, ctx):
    directory = cwd
    i = 0
    while i < len(args):
        word = args[i]
        if word.dynamic:
            return
        text = word.text
        if text in ("--git-dir", "--work-tree") or text.startswith(("--git-dir=", "--work-tree=")):
            return  # another repository layout: can't tell
        if text == "-C":
            if i + 1 >= len(args) or args[i + 1].dynamic:
                return
            directory = os.path.realpath(os.path.join(directory, os.path.expanduser(args[i + 1].text)))
            i += 2
        elif text in GIT_OPTIONS_WITH_VALUE:
            i += 2
        elif text.startswith("-"):
            i += 1
        else:
            break
    if i >= len(args) or args[i].dynamic:
        return
    sub, rest = args[i].text, args[i + 1:]
    if sub in ("add", "stage", "commit"):
        state = repo_state(directory, ctx)
        if state is None or state.unsure:
            return
        if sub == "commit":
            git_commit(rest, directory, state, ctx)
        else:
            git_add(rest, directory, state, ctx)
    elif sub in GIT_INDEX_CHANGERS and not creates_branch_only(sub, rest):
        state = repo_state(directory, ctx)
        if state is not None:
            state.unsure = True  # the index may have changed: can't tell what's staged


def creates_branch_only(sub, rest):
    """`git checkout -b <name>` and `git switch -c <name>` keep the index and the files."""
    return (sub in ("checkout", "switch") and len(rest) == 2 and not rest[1].dynamic
            and rest[0].text in ("-b", "-B", "-c", "-C"))


def git_add(args, directory, state, ctx):
    mode = None  # "all" (-A) or "update" (-u)
    stages = True
    paths = []
    options_done = False
    for word in args:
        text = word.text
        if word.dynamic:
            state.unsure = True  # a path held in a variable: can't tell
            return
        if not options_done and text == "--":
            options_done = True
        elif not options_done and text.startswith("--"):
            name = text.split("=", 1)[0]
            if name in ("--dry-run", "--intent-to-add"):
                stages = False
            elif name in ("--patch", "--interactive", "--edit", "--pathspec-from-file"):
                state.unsure = True
                return
            elif name in ("--all", "--no-ignore-removal"):
                mode = "all"
            elif name == "--update":
                mode = "update"
        elif not options_done and text.startswith("-") and len(text) > 1:
            for ch in text[1:]:
                if ch in "nN":
                    stages = False
                elif ch in "pie":
                    state.unsure = True
                    return
                elif ch == "A":
                    mode = "all"
                elif ch == "u":
                    mode = "update"
        else:
            paths.append(word)
    if not stages:
        return
    if paths:
        covered = pathspecs_cover_journal(paths, directory, state.top)
        if covered is None:
            state.unsure = True
            return
    else:
        covered = mode is not None
    if not covered or (mode == "update" and state.untracked):
        return
    if state.dirty or ctx.journal_written:
        state.staged = True
        state.dirty = state.untracked = False
        ctx.journal_written = False


def git_commit(args, directory, state, ctx):
    all_files = amend = include = False
    paths = []
    options_done = False
    i = 0
    while i < len(args):
        word = args[i]
        text = word.text
        i += 1
        if options_done or not text.startswith("-") or text == "-":
            if word.dynamic:
                return  # a path held in a variable: can't tell
            paths.append(word)
            continue
        if text == "--":
            options_done = True
            continue
        if text.startswith("--"):
            name, eq, _ = text.partition("=")
            if name in COMMIT_NO_COMMIT or name in ("--patch", "--interactive", "--pathspec-from-file"):
                return  # no commit is made, or it can't be told
            if name in COMMIT_LONG_WITH_VALUE and not eq:
                i += 1
            if name == "--all":
                all_files = True
            elif name == "--amend":
                amend = True
            elif name == "--include":
                include = True
            continue
        for j, ch in enumerate(text[1:], start=1):
            if ch in COMMIT_SHORT_WITH_VALUE:
                if j == len(text) - 1:
                    i += 1  # the value is the next word
                break
            if ch in COMMIT_SHORT_OPTIONAL_VALUE:
                break
            if ch in "hzp":
                return  # -h shows help, -z implies --porcelain (a dry run), -p is interactive
            if ch == "a":
                all_files = True
            elif ch == "i":
                include = True
    changed = (state.dirty or ctx.journal_written) and not state.untracked
    if paths:
        covered = pathspecs_cover_journal(paths, directory, state.top)
        if covered is None:
            return
        if include:
            included = state.staged or (covered and changed)
        else:
            included = covered and (state.staged or changed)
    else:
        covered = False
        included = state.staged or (all_files and changed)
    if not included and amend and head_has_journal(state):
        included = True
    if not included:
        ctx.problems.append(" ".join(["git", "commit", *[w.text for w in args]]))
    # What the commit leaves for a later commit in the same command line.
    if paths and not include:
        if covered:
            state.staged = state.dirty = False
            ctx.journal_written = False
    else:
        state.staged = False
        if all_files or covered:
            state.dirty = False
            ctx.journal_written = False


def main():
    try:
        data = json.load(sys.stdin)
        command = (data.get("tool_input") or {}).get("command")
        if not isinstance(command, str) or "commit" not in command:
            return 0
        cwd = os.path.realpath(data.get("cwd") or os.getcwd())
        lexer = Lexer(command)
        lexer.run()
        ctx = Context()
        walk(lexer, cwd, ctx)
    except Exception:  # Unsure, or anything unexpected: never block on the hook's own doubt
        return 0
    if ctx.problems:
        sys.stderr.write(MESSAGE)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
