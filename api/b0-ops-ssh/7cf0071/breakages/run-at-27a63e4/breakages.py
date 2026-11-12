#!/usr/bin/env python3
# PR #41's deliberate breakages (api/b0-ops-ssh): each one exact change of text in tools/ops/src/on-machine.ts,
# fly.ts (forDevApp) or run.ts, the tests that must catch it, run with the file changed, a verdict, and the file
# restored whatever happens. A breakage counts as caught only if its command fails AND the output holds the words
# registered for it (the start of a test's own name, mostly), so a change that merely breaks the build isn't counted.
#
# usage: breakages.py [--check] [--only NAME ...]
#   --check   only count the anchors: each text to change must occur the stated number of times
#   --only    run just these (results.json and summary.txt keep the rest)
# environment: BREAK_ROOT (a detached worktree of the branch's head), BREAK_OUT (where the evidence goes).
import hashlib, json, os, re, subprocess, sys

ROOT = os.environ.get("BREAK_ROOT", "/home/user/tadayo-ssh-breakages")
S = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("BREAK_OUT", f"{S}/out")
NODE = "export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH; "


def ops(*files):
    return NODE + f"cd {ROOT}/tools/ops && npx vitest run {' '.join(files)}"


def one(path, old, new, count=1):
    return (path, old, new, count)


B = []


def m(name, path, old, new, words, command=None, count=1):
    B.append((name, [one(path, old, new, count)], [command or T], words))


def mm(name, patches, words, command=None):
    B.append((name, patches, [command or T], words))


ONM = "tools/ops/src/on-machine.ts"
FLY = "tools/ops/src/fly.ts"
RUN = "tools/ops/src/run.ts"
T = ops("src/on-machine.test.ts", "src/run-remote.test.ts", "src/main.test.ts", "src/fly.test.ts")

FIRST = "runs the command in the API's started Machine, as one string"
TIME = "gives the session the tunnel's bound, the connection and the command's time"
FAILED = "fails with the command's exit code, after saying what it printed"
SIGNAL = "names the signal when one ended the command"
COLOUR = "reads flyctl's line in colour"
NOSTATUS = "fails when the session ended without an exit status"
AGENT = "says every line of flyctl's failure to start its agent"
TUNNEL = "removes the peer the agent made before its one check of the tunnel failed"
EMPTY = "reads flyctl's failure as its own though it ends with an empty line"
OTHER = "reads any other exit code as flyctl's failure"
TIMEOUT = "fails after saying what came back when the session ran out of time"
IMITATION = "gives a line the Machine printed that looks like flyctl's no weight"
EVERY = "removes every new peer named for this runner, and never one that was there before"
NOEMAIL = "takes a new peer named for this runner whatever follows the host"
STRANGER = "leaves a new peer not named for this runner, but fails the run"
NONAME = "never says a peer's name, which holds the token's email"
STILL = "fails a session that worked when a peer of this run's is still there"
RELIST = "counts a peer as removed when flyctl failed after removing it"
NONE = "fails when the session reached the Machine and no new peer of this run's is found"
AFTER = "fails when the peers can't be listed after the session, or their list read"
FIRSTLIST = "starts no session when the peers can't be listed first"
ORG = "starts no session when the token's organization can't be told"
BOTH = "throws the command's failure, not the peer's, when both went wrong"
SLUGNAME = "puts the host in it as flyctl does"
PREFIX = "takes a name as one this host's session makes when it starts interactive-<host>-"
FENCE = "takes the organization's WireGuard peers only to list them"
# Tests added after the first run (at 6fe4988), which showed these paths untested:
BEFORE = "says that the session makes a peer, and how to remove one by hand, before the session starts"
BESIDE = "says a new peer not named for this runner too when one of this run's is still there"
NOSTART = "goes on with the clean-up when a removal's flyctl can't be started"
UNREACHED = "says no peer of this run's is listed after a session that failed short of the Machine"
ONLYFAILED = "counts as left only a peer whose removal failed and a new list still shows"

# ---- The session: its call, its time, its output and how its ending is read
m("ssh-no-machine", ONM, '"ssh", "console", "-a", DEV_APP, "--machine", target.id, "-q", "-C"', '"ssh", "console", "-a", DEV_APP, "-q", "-C"', FIRST)
m("ssh-not-quiet", ONM, '"--machine", target.id, "-q", "-C"', '"--machine", target.id, "-C"', FIRST)
m("ssh-command-as-words", ONM, '"-C", input.command.join(" ")]', '"-C", ...input.command]', FIRST)
m("ssh-no-time-limit", ONM, "    { timeoutMs: SESSION_MS },\n", "    {},\n", TIME)
m("ssh-tunnel-seconds-cut", ONM, "export const TUNNEL_SECONDS = 240;", "export const TUNNEL_SECONDS = 180;", TIME)
m("stdout-unsaid", ONM, "  for (const line of linesOf(result.stdout)) say(line);\n", "", FIRST)
m("stderr-last-line-said", ONM, "  for (const line of flyctlFailed ? errors.slice(0, -1) : errors) say(line);", "  for (const line of errors) say(line);", FAILED)
m("colour-kept", ONM, '  const last = (errors.at(-1) ?? "").replace(COLOUR, "");', '  const last = errors.at(-1) ?? "";', COLOUR)
m("trailing-empty-line-kept", ONM, '  const trimmed = text.replace(/\\n+$/, "");', '  const trimmed = text.replace(/\\n$/, "");', EMPTY)
m("exit-0-error-line-taken-as-flyctl", ONM, "  const flyctlFailed = !result.timedOut && result.code !== 0 && FLYCTL_ERROR.test(last);", "  const flyctlFailed = !result.timedOut && FLYCTL_ERROR.test(last);", IMITATION)
m("timeout-error-line-taken-as-flyctl", ONM, "  const flyctlFailed = !result.timedOut && result.code !== 0 && FLYCTL_ERROR.test(last);", "  const flyctlFailed = result.code !== 0 && FLYCTL_ERROR.test(last);", TIMEOUT)
m("exited-any-exit-code", ONM, "  const exited = result.code === 1 && flyctlFailed ? EXITED.exec(last) : null;", "  const exited = flyctlFailed ? EXITED.exec(last) : null;", OTHER)
m("exited-signal-unread", ONM, "(\\d+)(?: from signal (\\w+))?(?:\\. Reason was: .*)?$/;", "(\\d+)(?:\\. Reason was: .*)?$/;", SIGNAL)
m("exited-reason-unread", ONM, "(\\d+)(?: from signal (\\w+))?(?:\\. Reason was: .*)?$/;", "(\\d+)(?: from signal (\\w+))?$/;", SIGNAL)
m("signal-unnamed", ONM, '    const signal = exited[2] === undefined ? "" : `, ended by signal ${exited[2]}`;', '    const signal = "";', SIGNAL)
m("no-status-unread", ONM, "  const noStatus = result.code === 1 && flyctlFailed && last === NO_STATUS;", "  const noStatus = false;", NOSTATUS)
m("no-status-any-exit-code", ONM, "  const noStatus = result.code === 1 && flyctlFailed && last === NO_STATUS;", "  const noStatus = flyctlFailed && last === NO_STATUS;", OTHER)
m("timeout-unseen", ONM, "  if (result.timedOut) {\n    failure = new OpsError(", "  if (false) {\n    failure = new OpsError(", TIMEOUT)
m("timeout-command-unmentioned", ONM, ", and the command may still be running on the Machine`", "`", TIMEOUT)
m("flyctl-failure-by-why", ONM, "    const reason = flyctlFailed ? `exit code ${String(result.code)}: ${last}` : why(result);", "    const reason = why(result);", IMITATION)
m("tunnel-hint-dropped", ONM, '        ? "; flyctl checks a new tunnel only once, for at most five seconds, so running the script again may work"\n        : "";', '        ? ""\n        : "";', TUNNEL)
m("tunnel-hint-always", ONM, "      flyctlFailed && TUNNEL_UNAVAILABLE.test(last)\n", "      flyctlFailed\n", "re:" + re.escape(AGENT) + "|" + re.escape(EMPTY))
m("exit-0-failed", ONM, "  } else if (result.code !== 0) {\n    const reason", "  } else {\n    const reason", "re:" + re.escape(FIRST) + "|" + re.escape(EVERY))

# ---- Before the session: the organization, the first list, the line about the peer
m("org-failure-unexplained", ONM, "    throw new OpsError(\n      `${error.message}, so no SSH session is started: the WireGuard peer one makes couldn't be removed`,\n    );", "    throw error;", ORG)
mm("org-failure-starts-session", [one(ONM, "  let org: string;\n  try {\n    org = await onlyOrganization(fly, label);\n  } catch (error) {", "  let org = \"tadayo-org\";\n  try {\n    await onlyOrganization(fly, label);\n  } catch (error) {"),
    one(ONM, "    if (!(error instanceof OpsError)) throw error;\n    throw new OpsError(\n      `${error.message}, so no SSH session is started: the WireGuard peer one makes couldn't be removed`,\n    );\n", "    if (!(error instanceof OpsError)) throw error;\n")], ORG)
m("first-list-failure-starts-session", ONM, '  const before = await listPeers(fly, org);\n  if ("reason" in before) {', '  const before = await listPeers(fly, org);\n  if ("reason" in before && false) {', FIRSTLIST)
m("first-list-reason-unsaid", ONM, "flyctl couldn't list the organization's WireGuard peers (${before.reason}), so no SSH session is started", "flyctl couldn't list the organization's WireGuard peers, so no SSH session is started", FIRSTLIST)
m("making-line-dropped", ONM, "  note(\n    `${label}: the SSH session makes a WireGuard peer in ${org}, which this run removes after it; if the run is cancelled or cut off first, ${byHandFor(org, host)}`,\n  );\n", "", FIRST)
mm("making-line-after-session", [one(ONM, "  note(\n    `${label}: the SSH session makes a WireGuard peer in ${org}, which this run removes after it; if the run is cancelled or cut off first, ${byHandFor(org, host)}`,\n  );\n", ""),
    one(ONM, "    { timeoutMs: SESSION_MS },\n  );\n", "    { timeoutMs: SESSION_MS },\n  );\n  note(\n    `${label}: the SSH session makes a WireGuard peer in ${org}, which this run removes after it; if the run is cancelled or cut off first, ${byHandFor(org, host)}`,\n  );\n")], BEFORE)
m("making-line-without-prefix", ONM, "removes one; this run's names start with interactive-${hostSlug(host)}-`;", "removes one`;", FIRST)
m("host-not-this-runner", ONM, "  const host = input.host ?? hostname();", '  const host = input.host ?? "localhost";', "re:holds back the environment's token from a line a script says|runs itself on the API's Machine|asks the Management API from here")

# ---- Which peers are this run's
m("prefix-no-dash", ONM, "  return slug !== \"\" && name.startsWith(`interactive-${slug}-`);", "  return slug !== \"\" && name.startsWith(`interactive-${slug}`);", PREFIX)
m("prefix-empty-host", ONM, "  return slug !== \"\" && name.startsWith(`interactive-${slug}-`);", "  return name.startsWith(`interactive-${slug}-`);", PREFIX)
m("prefix-any-interactive", ONM, "  return slug !== \"\" && name.startsWith(`interactive-${slug}-`);", '  return slug !== "" && name.startsWith("interactive-");', STRANGER)  # the first run, at 6fe4988, registered EVERY, whose test has the laptop's peer there before the session
m("prefix-needs-email", ONM, "  return slug !== \"\" && name.startsWith(`interactive-${slug}-`);", "  return slug !== \"\" && name.startsWith(`interactive-${slug}-`) && !name.startsWith(`interactive-${slug}--`);", NOEMAIL)
m("host-slug-whole-name", ONM, '(host.split(".")[0] ?? "").replace(', "host.replace(", SLUGNAME)
m("host-slug-underscore-kept", ONM, ".replace(/[^a-zA-Z0-9\\\\-]/g, \"-\");", ".replace(/[^a-zA-Z0-9\\\\-_]/g, \"-\");", SLUGNAME)
m("before-not-subtracted", ONM, "  const fresh = [...after.names].filter((name) => !session.before.has(name));", "  const fresh = [...after.names];", EVERY)
m("strangers-unsaid", ONM, "    strangers === 0\n      ? undefined", "    true\n      ? undefined", STRANGER)
m("strangers-miscounted", ONM, "  const strangers = fresh.length - ours.length;", "  const strangers = fresh.length;", STRANGER)
m("strangers-pass-beside-ours", ONM, "  note(`${label}: removed the WireGuard peer this run made`);\n  return unknown;", "  note(`${label}: removed the WireGuard peer this run made`);\n  return undefined;", STRANGER)
m("strangers-unsaid-when-ours-left", ONM, "    if (unknown !== undefined) note(unknown);\n", "", BESIDE)
m("strangers-named", ONM, ' : ""}: ${byHand}`;', ' : ""}: ${byHand} (${fresh.filter((name) => !sessionPeerOf(name, host)).join(", ")})`;', STRANGER)
m("none-found-when-not-reached", ONM, "    return session.reached\n      ?", "    return true\n      ?", "re:" + re.escape(AGENT) + "|" + re.escape(UNREACHED))
m("none-found-never", ONM, "    return session.reached\n      ?", "    return false\n      ?", NONE)
m("reached-without-exit-0", ONM, "  const reached = result.code === 0 || exited !== null || noStatus;", "  const reached = exited !== null || noStatus;", NONE)
m("reached-without-exit-status", ONM, "  const reached = result.code === 0 || exited !== null || noStatus;", "  const reached = result.code === 0 || noStatus;", NONE)
m("reached-without-no-status", ONM, "  const reached = result.code === 0 || exited !== null || noStatus;", "  const reached = result.code === 0 || exited !== null;", NONE)

# ---- The lists
m("after-list-reason-unsaid", ONM, "flyctl couldn't list the organization's WireGuard peers (${after.reason}), so the one this run may have made", "flyctl couldn't list the organization's WireGuard peers, so the one this run may have made", AFTER)
m("list-exit-code-ignored", ONM, "  const names = listed.code === 0 ? peerNames(jsonOf(listed)) : undefined;", "  const names = peerNames(jsonOf(listed));", "re:" + re.escape(AFTER) + "|" + re.escape(FIRSTLIST))
m("list-entry-without-name-skipped", ONM, '    if (typeof name !== "string") return undefined;', '    if (typeof name !== "string") continue;', "re:" + re.escape(AFTER) + "|" + re.escape(FIRSTLIST))
m("list-reason-without-why", ONM, "  return { reason: listed.code === 0 ? \"its answer isn't a list it can read\" : why(listed) };", "  return { reason: \"its answer isn't a list it can read\" };", "re:" + re.escape(AFTER) + "|" + re.escape(FIRSTLIST))
m("list-call-without-json", ONM, '  const listed = await attempt(fly, ["wireguard", "list", org, "--json"]);', '  const listed = await attempt(fly, ["wireguard", "list", org]);', FIRST)
m("attempt-throws", ONM, "  } catch (error) {\n    return { unmade:", "  } catch (error) {\n    throw error;\n    return { unmade:", NOSTART)

# ---- The removals and the new list
m("removal-of-another-org", ONM, '    const removed = await attempt(fly, ["wireguard", "remove", org, name]);', '    const removed = await attempt(fly, ["wireguard", "remove", "personal", name]);', FIRST)
m("removal-failure-unsaid", ONM, "    note(`${label}: flyctl's removal of a WireGuard peer this run made ${ending}`);", "    if (false) note(`${label}: flyctl's removal of a WireGuard peer this run made ${ending}`);", STILL)
m("removal-timeout-as-exit-code", ONM, '        : removed.timedOut\n          ? "ran out of time"', '        : false\n          ? "ran out of time"', STILL)
m("removal-name-said", ONM, "flyctl's removal of a WireGuard peer this run made ${ending}`);", "flyctl's removal of a WireGuard peer this run made (${name}) ${ending}`);", NONAME)
m("removal-flyctl-words-said", ONM, ': `ended with exit code ${String(removed.code)}`;', ": `ended with ${why(removed)}`;", NONAME)
m("removal-failure-ignored", ONM, '    if (!("unmade" in removed) && removed.code === 0) continue;', "    continue;", STILL)
m("relist-skipped", ONM, "  if (left > 0) {\n    const again", "  if (false) {\n    const again", "re:" + re.escape(RELIST) + "|" + re.escape(STILL))
m("relist-ignored", ONM, '    if (!("reason" in again)) left = failed.filter((name) => again.names.has(name)).length;', '    if (!("reason" in again)) left = failed.length;', RELIST)
m("relist-failure-counts-none", ONM, '    if (!("reason" in again)) left = failed.filter((name) => again.names.has(name)).length;', '    left = "reason" in again ? 0 : failed.filter((name) => again.names.has(name)).length;', RELIST)
m("left-count-unsaid", ONM, "  if (left > 0) {\n    if (unknown", "  if (false) {\n    if (unknown", STILL)
m("removed-line-dropped", ONM, "  note(`${label}: removed the WireGuard peer this run made`);\n", "", FIRST)

# ---- What happens after the clean-up
m("cleanup-only-after-success", ONM, "  const leftover = await removeThisRunsPeers(fly, { label, host, org, before: before.names, reached }, note);", "  const leftover = failure === undefined ? await removeThisRunsPeers(fly, { label, host, org, before: before.names, reached }, note) : undefined;", FAILED)
m("leftover-unsaid-after-failure", ONM, "    if (leftover !== undefined) note(leftover);\n    throw failure;", "    throw failure;", BOTH)
m("leftover-over-failure", ONM, "    if (leftover !== undefined) note(leftover);\n    throw failure;", "    throw new OpsError(leftover ?? failure.message);", BOTH)
m("leftover-passes", ONM, "  if (leftover !== undefined) throw new OpsError(leftover);", "", "re:" + re.escape(STILL) + "|" + re.escape(NONE))

# ---- run.ts: the runner's lines about the peer kept apart from the Machine's report
m("notes-read-as-the-machine", RUN, "    note: ctx.say,\n", "    note: (line) => {\n      heard.push(line);\n      ctx.say(line);\n    },\n", "re:says what the project may hold when nothing came back|says nothing of what the project may hold")

# ---- fly.ts forDevApp: the two WireGuard shapes and no other
m("fence-any-wireguard", FLY, '    return (verb === "list" && last === "--json") || (verb === "remove" && SESSION_PEER.test(last));', "    return true;", FENCE)
m("fence-list-without-json", FLY, '(verb === "list" && last === "--json")', '(verb === "list")', FENCE)
m("fence-remove-any-name", FLY, '(verb === "remove" && SESSION_PEER.test(last))', '(verb === "remove" && last !== "")', FENCE)
m("fence-peer-any-tail", FLY, "const SESSION_PEER = /^interactive-[A-Za-z0-9-]+$/;", "const SESSION_PEER = /^interactive-/;", FENCE)
m("fence-org-unchecked", FLY, "    if (args.length !== 4 || !SLUG.test(org)) return false;", "    if (args.length !== 4) return false;", FENCE)
m("fence-length-unchecked", FLY, "    if (args.length !== 4 || !SLUG.test(org)) return false;", "    if (!SLUG.test(org)) return false;", FENCE)
m("fence-slug-loose", FLY, "export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;", "export const SLUG = /^[A-Za-z0-9-]+$/;", FENCE)
m("fence-wireguard-refused", FLY, '  if (args[0] === "wireguard") {', '  if (args[0] === "wireguard" && false) {', FIRST)

# ---- The fifth commit's (the second review's findings): a call that wasn't made, the word after a session short of the Machine, the new list's narrowing
m("unmade-removal-as-exit-code", ONM, '      "unmade" in removed\n        ? "couldn\'t be started"', '      false\n        ? "couldn\'t be started"', NOSTART)
m("unmade-list-ignored", ONM, "  if (\"unmade\" in listed) return { reason: `the call wasn't made: ${listed.unmade}` };\n", "", "re:" + re.escape(AFTER) + "|" + re.escape(FIRSTLIST))
m("unreached-none-unsaid", ONM, "      : `${label}: no new WireGuard peer named for this runner is listed, so none was removed; if the session made one before it failed, ${byHand}`;", "      : undefined;", "re:" + re.escape(UNREACHED) + "|" + re.escape(AGENT))
m("strangers-maybe-ours-beside", ONM, '${ours.length === 0 ? ", though this run\'s may be among them" : ""}', ", though this run's may be among them", "re:" + re.escape(STRANGER) + "|" + re.escape(BESIDE))
m("strangers-never-maybe-ours", ONM, '${ours.length === 0 ? ", though this run\'s may be among them" : ""}', "", STRANGER)
m("relist-counts-all-ours", ONM, "left = failed.filter((name) => again.names.has(name)).length;", "left = ours.filter((name) => again.names.has(name)).length;", ONLYFAILED)


def digest():
    out = subprocess.run(["git", "diff", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout
    h = hashlib.sha256(out.encode())
    for path in sorted(untracked.split()):
        with open(os.path.join(ROOT, path), "rb") as f:
            h.update(path.encode() + f.read())
    return h.hexdigest()


def caught(output, code, words):
    if code == 0:
        return False
    if words.startswith("re:"):
        return re.search(words[3:], output) is not None
    return words in output


def main(argv):
    check = "--check" in argv
    only = []
    if "--only" in argv:
        only = argv[argv.index("--only") + 1:]
    names = [b[0] for b in B]
    if len(set(names)) != len(names):
        raise SystemExit("duplicate names: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    if check:
        bad = 0
        for name, patches, _commands, _words in B:
            texts = {}
            for path, old, new, count in patches:
                text = texts.get(path) or open(os.path.join(ROOT, path)).read()
                if text.count(old) != count:
                    bad += 1
                    print(f"{name}: {path}: the text occurs {text.count(old)} times, not {count}: {old[:70]!r}")
                texts[path] = text.replace(old, new)
        print(f"{len(B)} breakages, {bad} anchors wrong")
        return 1 if bad else 0
    os.makedirs(OUT, exist_ok=True)
    before = digest()
    results = []
    for index, (name, patches, commands, words) in enumerate(B, 1):
        if only and name not in only:
            continue
        saved = {}
        try:
            for path, old, new, count in patches:
                full = os.path.join(ROOT, path)
                if full not in saved:
                    saved[full] = open(full).read()
                text = open(full).read()
                if text.count(old) != count:
                    raise SystemExit(f"{name}: {path}: the text to change occurs {text.count(old)} times, not {count}")
                open(full, "w").write(text.replace(old, new))
            output, code = "", 0
            for command in commands:
                run = subprocess.run(["bash", "-c", command], cwd=ROOT, capture_output=True, text=True, timeout=1200)
                output += run.stdout + run.stderr
                code = code or (1 if run.returncode != 0 else 0)
        finally:
            for full, text in saved.items():
                open(full, "w").write(text)
        verdict = caught(output, code, words)
        keep = [l for l in output.splitlines() if re.search(r"×|FAIL|Test Files|Tests |Error|expected|AssertionError", l)]
        with open(f"{OUT}/{index:03d}-{name}.txt", "w") as f:
            f.write(
                f"breakage: {name}\npatch: {json.dumps([(p, o, n, c) for p, o, n, c in patches], indent=1)}\n"
                f"command: {' ; '.join(commands)}\nexit: {code}\nexpected words: {words}\ncaught: {verdict}\n\n"
                + "\n".join(keep[:200]) + "\n"
            )
        results.append((index, name, code, verdict))
        print(f"{index:03d} {name}: exit {code}, caught {verdict}", flush=True)
    after = digest()
    print("worktree restored" if before == after else "WORKTREE CHANGED", flush=True)
    store = f"{OUT}/results.json"
    merged = json.load(open(store)) if os.path.exists(store) else {}
    for index, name, code, verdict in results:
        merged[name] = {"index": index, "exit": code, "caught": verdict}
    json.dump(merged, open(store, "w"), indent=1, sort_keys=True)
    with open(f"{OUT}/summary.txt", "w") as f:
        for name, r in sorted(merged.items(), key=lambda item: item[1]["index"]):
            f.write(f"{r['index']:03d} {'CAUGHT' if r['caught'] else 'MISSED'} {name} (exit {r['exit']})\n")
        f.write("worktree restored\n" if before == after else "WORKTREE CHANGED\n")
    return 0 if before == after else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
