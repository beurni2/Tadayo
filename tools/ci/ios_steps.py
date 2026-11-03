#!/usr/bin/env python3
"""The steps of the `ios` workflow (docs/TECH-DESIGN.md sections 2, 3, 8 and 9; the B0 plan's
slice 9).

  python3 tools/ci/ios_steps.py <step>

.github/workflows/ios.yml stays thin: each of its steps calls one step here, where the logic and
its tests live (tools/ci/ios_steps_test.py). Its three jobs:

  gate      (Linux)     gate
  build     (macos-26)  toolchain, xcodegen, simulator, build, test, collect
  evidence  (Linux)     imagemagick, sheets, publish

The steps:

  gate         The macOS job runs only when the branch has apps/ios/project.yml (PROJECT_SPEC):
               `ios.yml` reached main before the app did (ADR-025), so a push that changes
               packages/contracts/** would otherwise start a macOS run that fails at XcodeGen.
               Writes build=true or build=false to $GITHUB_OUTPUT. Slice 12 sets REQUIRE_APP, and
               then a branch without the app fails here instead (T58).
  toolchain    Selects the pinned Xcode (toolchain.XCODE_VERSION, at /Applications/Xcode_<v>.app)
               for every later step, and fails unless `xcodebuild -version` says that Xcode and
               `xcrun swift --version` says toolchain.SWIFT_VERSION, the Swift `ci` tests the
               Swift packages with on Linux.
  xcodegen     Downloads XcodeGen toolchain.XCODEGEN_VERSION's release zip, fails unless its
               SHA-256 is toolchain.XCODEGEN_SHA256 and it reports that version, and generates
               the project from PROJECT_SPEC, failing if XcodeGen says its presets didn't load.
  simulator    Records the simulators the runner offers (logs/simulators.txt), then picks one:
               with no $IOS_VERSION, the newest iOS runtime installed whose major is at most
               the pinned Xcode's simulator SDK's (a newer Xcode's runtimes can sit on the same
               image, and the snapshots' iOS mustn't change under them); with one ("18", "18.6",
               "26.2"), the newest installed runtime of that version, downloaded first with
               `xcodebuild -downloadPlatform iOS -buildVersion` when the runner hasn't got it
               (docs/TECH-DESIGN.md section 8: the pre-gate runs on older iOS), and read back
               from simctl, never assumed from the download's exit code. The device is
               toolchain.SIMULATOR_DEVICE when that runtime supports it, else the newest plain
               "iPhone <n>" it supports. It boots the device and writes it to run.json.
  build        `xcodebuild build-for-testing` of SCHEME, or `xcodebuild build` while the
               scheme has no test target (xcodebuild refuses build-for-testing then), then fails
               unless the app holds the share extension, so both targets were built.
  test         `xcodebuild test-without-building` of the scheme's tests, when it has any, with
               swift-snapshot-testing's record mode `never` (a snapshot with no committed
               reference fails; TECH-DESIGN section 2) and its artifacts directory in OUT. It
               fails first if a Swift file under apps/ios sets a record mode of its own, which
               would override `never` (RECORDING), and after the tests if the run wrote a
               reference under a __Snapshots__ folder all the same (a mode set some other way).
               A run with $IOS_VERSION is a compatibility run: it skips the test targets named
               *SnapshotTests (SNAPSHOT_TARGET_SUFFIX), since snapshots use the newest iOS
               (TECH-DESIGN section 8).
  collect      Lists every snapshot in snapshots.json, with its state and status (below), and
               copies the images this run drew into OUT/snapshots/, a reference the run wrote
               itself included. Runs even when a step before it failed.
  imagemagick  Installs ImageMagick on the Linux runner, which doesn't have it.
  sheets       Makes the contact sheets (docs/DESIGN-HANDOFF.md, "Snapshot comparison"): per
               state, the render on the left, from design/reference/screens/ if it is there,
               else from design/reference/2.1/; the committed reference in the middle when this
               run's snapshot differs from it; this run's snapshot on the right. A state with no
               render shows its snapshot alone (TECH-DESIGN section 2), with a note: an inventory
               state's is "built from spec, awaiting render" (T46); a -dark or -xl variant that
               has no inventory row of its own while its base state has one says it is judged
               against book p26's rules (design/reference/INVENTORY.md); anything else says it
               isn't an inventory state. JPEG (TECH-DESIGN section 3). A push carries only the
               states the branch touches; a run by hand with no $IOS_VERSION carries the full
               set, for gates; a compatibility run carries no sheets, only its logs. Every field
               of snapshots.json and every value of run.json is checked again here, since this
               job can write: an entry with a field, or fields together, that collect can't
               have written fails its row and is neither copied nor drawn; run.json is staged
               with only its checked values; only the logs the steps write are copied, and any
               other entry in logs/ is counted, never named. Stages everything in the evidence
               job's own folder, beside OUT (WORK below). Writes index.md, which links every
               file and says which file each image belongs to. Fails, after staging the rest,
               when an entry fails its checks, an image is missing, a sheet couldn't be made,
               snapshots.json is missing or logs/ holds anything else.
  publish      Pushes what sheets staged (index.md, the sheets, the checked entries' snapshots,
               run.json's checked values and the steps' logs, as they are) to the
               `evidence` branch under <branch>/<short-sha>/ios/ (ios-full/ for a run by hand's
               full set, ios-<version>/ for a compatibility run), with the job's GITHUB_TOKEN.
               The folder comes from the run's environment, as in sheets, never from a file;
               nothing goes up unless sheets finished for that folder. Never forces: when the
               push is refused because another run pushed first, it fetches the branch again,
               puts its files back on top and retries. $EVIDENCE_REMOTE replaces the remote, for
               a scratch repository; by hand, run it only with one, since only the workflow's
               evidence job pushes to the real branch.

Files pass between the macOS job's steps in OUT ($IOS_OUT, else $RUNNER_TEMP/ios-out), which the
job uploads as the artifact `ios-results` and the evidence job downloads to the same place:

  run.json        what the run used: the Xcode, the simulator, the tests' result
  logs/           toolchain.txt, xcodegen.txt, simulators.txt, build.log, test.log,
                  test-summary.json, attachments-manifest.json (LOG_NAMES)
  artifacts/      swift-snapshot-testing's SNAPSHOT_ARTIFACTS: the images that differ from their
                  committed reference
  snapshots/      the images this run drew that differ from, or have no, committed reference
  snapshots.json  every snapshot, each {state, test, file, status, image, reference}

The evidence job keeps its own files in WORK, ios-evidence/ beside OUT, never in OUT, where the
artifact lands: stage/<path>/ (what publish pushes), evidence.json (sheets finished, for that
path) and branch/ (publish's clone of the `evidence` branch).

A snapshot's state is its swift-snapshot-testing name: the tests call
`assertSnapshot(of:as:named:)` with the inventory state (`named: "F02-upcoming-dark"`), and the
library writes `<test name>.<named>.png`, so the state is the text after the file name's first dot
(docs/DESIGN-HANDOFF.md: every snapshot test is named after its inventory state). Its status:

  changed    this run drew it, and it differs from its committed reference
  new        this run drew it, and it has no committed reference; swift-snapshot-testing attaches
             it to the result bundle, and collect exports it with xcresulttool
  committed  its committed reference, which this run didn't report as different (whether its
             test passed is in the run's result, run.json and logs/test.log)

Exit 0 when the step passes or is skipped, 1 when it fails, 2 on bad usage.

Tests: python3 tools/ci/ios_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ElementTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import toolchain  # noqa: E402

REQUIRE_APP = False  # slice 12 turns this on (T58)

PROJECT_SPEC = "apps/ios/project.yml"
IOS_DIR = "apps/ios"
SCHEME = "Tadayo"
APP_PRODUCT = "Tadayo.app"
SHARE_EXTENSION = "TadayoShare.appex"
SNAPSHOT_TARGET_SUFFIX = "SnapshotTests"
XCODEGEN_URL = "https://github.com/yonaskolb/XcodeGen/releases/download/{version}/xcodegen.zip"
INVENTORY = "design/reference/INVENTORY.md"
RENDER_DIRS = ("design/reference/screens", "design/reference/2.1")
EVIDENCE_BRANCH = "evidence"
PUSH_ATTEMPTS = 5
FONTS = ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/dejavu/DejaVuSans.ttf")
AWAITING_RENDER = "built from spec, awaiting render"

VERSION = re.compile(r"^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$")
STATE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
# A file or folder name as swift-snapshot-testing and Swift files have them (`\w` is Unicode's
# word characters, as the library keeps; `+` as in `HomeView+Snapshots.swift`), never `.` or `..`,
# and never a character markdown or ImageMagick reads: the evidence job writes names from the
# build job's snapshots.json into index.md and the sheets' labels.
PLAIN = re.compile(r"[\w+-][\w.+-]*")
# A value of run.json that reaches index.md or a label: a version, a device's name, a result.
# index.md shows each in a code span, so GitHub never makes a link of one.
FACT = re.compile(r"[\w.() -]{1,64}")
# The keys the steps write in run.json: the only ones the evidence job reads or stages.
RUN_KEYS = ("xcode", "swift", "ios", "runtime", "device", "udid", "requested", "sdk", "tests")
# The files the steps write in OUT's logs/: the only ones the evidence job copies or links.
LOG_NAMES = ("toolchain.txt", "xcodegen.txt", "simulators.txt", "build.log", "test.log",
             "test-summary.json", "attachments-manifest.json")
# Xcode adds "_<n>_<UUID>" to an attachment's suggested name when it exports it: at the end of a
# name without a dot ("Launch Screen_0_<UUID>.png", Xcode 26.2), and before the last dot of a
# dotted one ("a.b_0_<UUID>.png", Xcode 27.1). It is stripped wherever it is.
EXPORT_SUFFIX = re.compile(r"_[0-9]+_[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}")
# A test that sets its own record mode would override CI's `never` (swift-snapshot-testing reads
# the environment last), so the test step refuses one: `record:` with a Bool (true is .all, false
# is .missing) or .all, .missing or .failed; any assignment to `isRecording`; the deprecated global
# `record = ...`; the environment variable. `record: .never` is allowed. A computed mode
# (`record: mode`) gets past this, so the test step also fails when the run wrote a reference.
RECORDING = re.compile(r"\brecord\s*:\s*(true\b|false\b|\.(all|missing|failed)\b)|"
                       r"\bisRecording\s*=(?!=)|^\s*(SnapshotTesting\.)?record\s*=(?!=)|"
                       r"SNAPSHOT_TESTING_RECORD")
SHOWN = re.compile(r"error:|warning:|\*\* [A-Z ]+ \*\*|Test Case .*(failed|passed)|"
                   r"Executed [0-9]+ test|Test Suite .*(failed|passed)|✘|Testing failed")


class Shell:
    """Runs commands in the repository. The tests replace it with a recording fake."""

    def __init__(self, root):
        self.root = root

    def run(self, cmd, env=None, log=None, cwd=None):
        """Runs cmd. With a log file, writes all of its output there and prints only the lines
        that say what happened (SHOWN), so a 10 MB build log stays readable on GitHub."""
        print("+ " + " ".join(cmd), flush=True)
        try:
            if log is None:
                return subprocess.run(cmd, cwd=cwd or self.root, env=self._env(env)).returncode
            os.makedirs(os.path.dirname(log), exist_ok=True)
            with open(log, "a", encoding="utf-8") as f:
                f.write("+ " + " ".join(cmd) + "\n")
                f.flush()
                process = subprocess.Popen(cmd, cwd=cwd or self.root, env=self._env(env),
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           text=True, errors="replace")
                for line in process.stdout:
                    f.write(line)
                    f.flush()  # a step killed by its timeout still leaves its log
                    if SHOWN.search(line):
                        print(line.rstrip("\n"), flush=True)
                return process.wait()
        except FileNotFoundError:
            # A missing program fails its command, as in a shell, so the step can still record
            # what it has (ImageMagick's install failing leaves the sheets step without montage).
            print(f"ios: {cmd[0]} isn't installed", flush=True)
            return 127

    def capture(self, cmd, env=None, cwd=None):
        try:
            result = subprocess.run(cmd, cwd=cwd or self.root, env=self._env(env),
                                    capture_output=True, text=True, errors="replace")
        except FileNotFoundError:
            return 127, "", f"{cmd[0]} isn't installed"
        return result.returncode, result.stdout, result.stderr

    @staticmethod
    def _env(extra):
        if not extra:
            return None
        env = dict(os.environ)
        env.update(extra)
        return env


# Pure helpers, tested on their own.

def version_key(version):
    return tuple(int(p) for p in re.findall(r"[0-9]+", version or ""))


def state_of(file_name):
    """The inventory state in a swift-snapshot-testing file name, or None when the snapshot has
    no `named:` (the library numbers it instead) or the name isn't a plain state name."""
    stem = file_name[:-4] if file_name.endswith(".png") else file_name
    if "." not in stem:
        return None
    named = stem.split(".", 1)[1]
    if named.isdigit() or not STATE.match(named):
        return None
    return named


def kept_image(test, name):
    """Where collect keeps an image this run drew, in OUT: snapshots/<test, made plain>/<name>."""
    return f"snapshots/{re.sub(r'[^A-Za-z0-9._-]', '_', test)}/{name}"


def read_inventory(text):
    """The states named in design/reference/INVENTORY.md's tables: each row whose second cell is
    one backticked name."""
    states = set()
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) > 1:
            found = re.fullmatch(r"`([A-Za-z0-9][A-Za-z0-9-]*)`", cells[1])
            if found:
                states.add(found.group(1))
    return states


def render_for(root, state):
    """The state's render, repository-relative: design/reference/screens/ wins over 2.1/."""
    if not state:
        return None
    for directory in RENDER_DIRS:
        path = f"{directory}/{state}.png"
        if os.path.isfile(os.path.join(root, *path.split("/"))):
            return path
    return None


def no_render_note(state, inventory):
    """What a sheet with no render says about it."""
    if state in inventory:
        return AWAITING_RENDER
    base = re.sub(r"-(dark|xl)$", "", state or "")
    if state and base != state and base in inventory:
        return "no render of its own: judged against book p26 (design/reference/INVENTORY.md)"
    return "not a state in design/reference/INVENTORY.md"


def pick_runtime(runtimes, requested, newest_major=None):
    """The newest available iOS runtime, or the newest whose version is `requested` or starts
    with it (18 matches 18.6; 18.6 matches 18.6 and 18.6.1). With no version requested and
    newest_major given (the pinned Xcode's simulator SDK's major), a runtime of a later major is
    passed over: a newer Xcode's runtimes can sit on the same image."""
    found = []
    for runtime in runtimes:
        if not runtime.get("isAvailable", False):
            continue
        if runtime.get("platform") != "iOS" and \
                not str(runtime.get("identifier", "")).startswith("com.apple.CoreSimulator.SimRuntime.iOS-"):
            continue
        version = str(runtime.get("version", ""))
        if requested and version != requested and not version.startswith(requested + "."):
            continue
        if not requested and newest_major is not None and \
                version_key(version)[:1] > (newest_major,):
            continue
        found.append(runtime)
    return max(found, key=lambda r: version_key(r.get("version")), default=None)


def pick_device_type(runtime, preferred):
    """The preferred device type when the runtime supports it, else the newest plain
    "iPhone <n>" it supports; None when the runtime lists none."""
    supported = [d for d in runtime.get("supportedDeviceTypes", []) if d.get("name")]
    for device in supported:
        if device["name"] == preferred:
            return device
    plain = [d for d in supported if re.fullmatch(r"iPhone [0-9]+", d["name"])]
    return max(plain, key=lambda d: version_key(d["name"]), default=None)


def scheme_test_targets(scheme_path, container):
    """The test targets a shared .xcscheme runs: its TestAction's testables that aren't skipped,
    or the targets of its default test plan (container: the folder the project is in)."""
    root = ElementTree.parse(scheme_path).getroot()
    action = root.find("TestAction")
    if action is None:
        return []
    names = [ref.get("BlueprintName") for testable in action.iter("TestableReference")
             if testable.get("skipped", "NO") != "YES"
             for ref in testable.iter("BuildableReference") if ref.get("BlueprintName")]
    plans = list(action.iter("TestPlanReference"))
    plans = [p for p in plans if p.get("default", "NO") == "YES"] or plans[:1]
    for plan in plans:
        path = os.path.join(container, plan.get("reference", "").split(":", 1)[-1])
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        names += [t["target"]["name"] for t in data.get("testTargets", [])
                  if t.get("enabled", True) and t.get("target", {}).get("name")]
    return sorted(set(names))


def snapshot_file_from_attachment(name):
    """The snapshot file name an exported attachment stands for, or None when the attachment
    isn't a snapshot swift-snapshot-testing attached for want of a reference (it names those
    after the file, `<test name>.<named>.png`; its failure diffs are named reference, failure
    and difference)."""
    stem = EXPORT_SUFFIX.sub("", name or "")
    if not stem.endswith(".png"):
        return None
    while stem.endswith(".png"):
        stem = stem[:-4]
    if "." not in stem or "/" in stem:
        return None
    return stem + ".png"


def evidence_path(branch, sha, requested, full=False):
    """<branch>/<short-sha>/ios/ for a push; ios-full/ for a run by hand that carries every
    snapshot (a gate's set), so neither replaces the other; ios-<version>/ for a compatibility
    run."""
    parts = [p for p in branch.split("/")]
    if not branch or any(p in ("", ".", "..") for p in parts):
        raise ValueError(f"can't make an evidence path from the branch {branch!r}")
    if not re.fullmatch(r"[0-9a-f]{40}", sha or ""):
        raise ValueError(f"not a full commit SHA: {sha!r}")
    if requested and not VERSION.match(requested):
        raise ValueError(f"not an iOS version: {requested!r}")
    return f"{branch}/{sha[:7]}/" + (f"ios-{requested}" if requested else
                                     "ios-full" if full else "ios")


def magick_text(text):
    """Text safe for montage's -title and -label: % and a backslash start escapes, and a
    leading @ reads a file, so none of them may reach it as written."""
    text = text.replace("\\", "\\\\").replace("%", "%%")
    return (" " + text) if text.startswith("@") else text


def select(entries, mode, changed_paths):
    """The entries a run's evidence carries: all of them (`full`), none (`none`), or (`touched`)
    those this run drew (changed, new) and those whose committed reference or render the branch
    changed."""
    if mode == "full":
        return list(entries)
    if mode == "none":
        return []
    changed = set(changed_paths)
    chosen = []
    for entry in entries:
        renders = {f"{d}/{entry.get('state')}.png" for d in RENDER_DIRS} if entry.get("state") else set()
        if entry["status"] in ("changed", "new") or entry.get("reference") in changed \
                or renders & changed:
            chosen.append(entry)
    return chosen


def sheet_name(entry, taken):
    base = entry.get("state") or re.sub(r"[^A-Za-z0-9._-]", "_", entry["file"][:-4])
    name = base
    if name in taken:
        name = f"{base}--{re.sub(r'[^A-Za-z0-9._-]', '_', entry.get('test') or 'test')}"
    n = 2
    while name in taken:
        name = f"{base}--{n}"
        n += 1
    taken.add(name)
    return name


class Steps:
    def __init__(self, root, shell, environ=None, out=None, require_app=REQUIRE_APP,
                 sleep=time.sleep):
        self.root = root
        self.shell = shell
        self.environ = os.environ if environ is None else environ
        self.require_app = require_app
        self.sleep = sleep
        if out:
            self.out = out
        elif self.environ.get("IOS_OUT"):
            self.out = self.environ["IOS_OUT"]
        else:
            self.out = os.path.join(self.environ.get("RUNNER_TEMP") or "/tmp", "ios-out")
        # The evidence job's own files, beside OUT and never in it: OUT is where the build job's
        # artifact is downloaded, so nothing in it can stand in for what sheets staged.
        self.work = os.path.join(os.path.dirname(os.path.abspath(self.out)), "ios-evidence")

    # Helpers

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def out_path(self, *parts):
        return os.path.join(self.out, *parts)

    def work_path(self, *parts):
        return os.path.join(self.work, *parts)

    def stage_path(self, path):
        return self.work_path("stage", *path.split("/"))

    def log(self, name):
        return self.out_path("logs", name)

    def write_log(self, name, text):
        os.makedirs(self.out_path("logs"), exist_ok=True)
        with open(self.log(name), "a", encoding="utf-8") as f:
            f.write(text if text.endswith("\n") else text + "\n")

    def run_record(self):
        try:
            with open(self.out_path("run.json"), encoding="utf-8") as f:
                record = json.load(f)
        except (OSError, ValueError):
            return {}
        return record if isinstance(record, dict) else {}

    def run_facts(self):
        """run.json's values for index.md, the sheets' labels and the stage's run.json: the build
        job wrote them, so only the keys the steps write (RUN_KEYS) with plain text (FACT) are
        kept; anything else shows as unknown."""
        return {k: v for k, v in self.run_record().items()
                if k in RUN_KEYS and isinstance(v, str) and FACT.fullmatch(v)}

    def update_run_record(self, **values):
        record = self.run_record()
        record.update(values)
        os.makedirs(self.out, exist_ok=True)
        with open(self.out_path("run.json"), "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2, sort_keys=True)

    def developer_dir(self):
        return f"/Applications/Xcode_{toolchain.XCODE_VERSION}.app/Contents/Developer"

    def xcode_installed(self):
        return os.path.isdir(self.developer_dir())

    def xcode_env(self, extra=None):
        env = {"DEVELOPER_DIR": self.developer_dir()}
        env.update(extra or {})
        return env

    def requested_version(self):
        requested = (self.environ.get("IOS_VERSION") or "").strip()
        if requested and not VERSION.match(requested):
            raise ValueError(f"IOS_VERSION {requested!r} isn't an iOS version like 18, 18.6 or 26.2")
        return requested

    def evidence_target(self):
        """(path on the evidence branch, mode), from the run's own environment alone: a
        compatibility run's (`none`), a run by hand's full set (`full`) or a push's touched set
        (`touched`). sheets and publish both use it, so neither takes the folder from a file."""
        requested = self.requested_version()
        if requested:
            mode = "none"
        elif self.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
            mode = "full"
        else:
            mode = "touched"
        path = evidence_path(self.environ.get("GITHUB_REF_NAME", ""),
                             self.environ.get("GITHUB_SHA", ""), requested, full=mode == "full")
        return path, mode

    def project(self):
        found = sorted(n for n in os.listdir(self.path(*IOS_DIR.split("/")))
                       if n.endswith(".xcodeproj"))
        if len(found) != 1:
            raise ValueError(f"expected one .xcodeproj in {IOS_DIR} after XcodeGen, found {found}")
        return f"{IOS_DIR}/{found[0]}"

    def destination(self):
        udid = self.run_record().get("udid")
        if not udid:
            raise ValueError("no simulator in run.json: the simulator step didn't finish")
        return f"platform=iOS Simulator,id={udid}"

    def derived_data(self):
        return os.path.join(os.path.dirname(self.out.rstrip("/")) or self.out, "DerivedData")

    def output(self, key, value):
        target = self.environ.get("GITHUB_OUTPUT")
        if target:
            with open(target, "a", encoding="utf-8") as f:
                f.write(f"{key}={value}\n")
        print(f"ios: {key}={value}")

    # The gate (Linux)

    def gate(self):
        if os.path.isfile(self.path(*PROJECT_SPEC.split("/"))):
            print(f"ios: gate: {PROJECT_SPEC} is here, so the app is built")
            self.output("build", "true")
            return 0
        self.output("build", "false")
        if self.require_app:
            print(f"ios: gate: {PROJECT_SPEC} is missing, and from slice 12 the app must be here "
                  "(T58)")
            return 1
        print(f"ios: gate: {PROJECT_SPEC} isn't on this branch yet (the app arrives in the ios "
              "lane's first slice), so the macOS job is skipped")
        return 0

    # The build (macOS)

    def toolchain(self):
        os.makedirs(self.out_path("logs"), exist_ok=True)
        developer_dir = self.developer_dir()
        if not self.xcode_installed():
            print(f"ios: toolchain: Xcode {toolchain.XCODE_VERSION} isn't on this runner at "
                  f"{developer_dir} (tools/ci/toolchain.py)")
            return 1
        code, xcode, err = self.shell.capture(["xcodebuild", "-version"], env=self.xcode_env())
        self.write_log("toolchain.txt", xcode + err)
        first = xcode.strip().splitlines()[0] if xcode.strip() else ""
        if code != 0 or first != f"Xcode {toolchain.XCODE_VERSION}":
            print(f"ios: toolchain: expected Xcode {toolchain.XCODE_VERSION}, got {first or err.strip()!r}")
            return 1
        code, swift, err = self.shell.capture(["xcrun", "swift", "--version"], env=self.xcode_env())
        self.write_log("toolchain.txt", swift + err)
        found = re.search(r"Swift version ([0-9]+\.[0-9]+(?:\.[0-9]+)?)", swift + err)
        version = found.group(1) if found else None
        if code != 0 or version != toolchain.SWIFT_VERSION:
            print(f"ios: toolchain: expected Swift {toolchain.SWIFT_VERSION} in Xcode "
                  f"{toolchain.XCODE_VERSION}, the Swift `ci` tests the packages with, got "
                  f"{version or (swift + err).strip()!r}")
            return 1
        self.update_run_record(xcode=toolchain.XCODE_VERSION, swift=version)
        print(f"ios: toolchain: Xcode {toolchain.XCODE_VERSION}, Swift {version}")
        return 0

    def xcodegen(self):
        scratch = os.path.join(os.path.dirname(self.out.rstrip("/")) or self.out, "xcodegen")
        shutil.rmtree(scratch, ignore_errors=True)
        os.makedirs(scratch)
        archive = os.path.join(scratch, "xcodegen.zip")
        url = XCODEGEN_URL.format(version=toolchain.XCODEGEN_VERSION)
        if self.shell.run(["curl", "--fail", "--silent", "--show-error", "--location",
                           "--retry", "3", "--output", archive, url]) != 0:
            print(f"ios: xcodegen: couldn't download {url}")
            return 1
        digest = hashlib.sha256()
        try:
            with open(archive, "rb") as f:
                for block in iter(lambda: f.read(1 << 20), b""):
                    digest.update(block)
        except OSError as error:
            print(f"ios: xcodegen: couldn't read the download: {error}")
            return 1
        if digest.hexdigest() != toolchain.XCODEGEN_SHA256:
            print(f"ios: xcodegen: {url} has SHA-256 {digest.hexdigest()}, not the pinned "
                  f"{toolchain.XCODEGEN_SHA256} (tools/ci/toolchain.py); not running it")
            return 1
        if self.shell.run(["unzip", "-q", archive, "-d", scratch]) != 0:
            print("ios: xcodegen: couldn't unzip the release")
            return 1
        binary = os.path.join(scratch, "xcodegen", "bin", "xcodegen")
        code, out, err = self.shell.capture([binary, "--version"])
        self.write_log("xcodegen.txt", out + err)
        if code != 0 or out.strip() != f"Version: {toolchain.XCODEGEN_VERSION}":
            print(f"ios: xcodegen: expected `Version: {toolchain.XCODEGEN_VERSION}`, got "
                  f"{(out + err).strip()!r}")
            return 1
        log = self.log("xcodegen.txt")
        code = self.shell.run([binary, "generate", "--spec", PROJECT_SPEC, "--project", IOS_DIR],
                              env=self.xcode_env(), log=log)
        if code != 0:
            print(f"ios: xcodegen: generating the project from {PROJECT_SPEC} failed "
                  "(logs/xcodegen.txt)")
            return code
        # XcodeGen only prints a warning when it can't find its setting presets, and the project
        # then lacks their build settings, so a warning fails the step.
        with open(log, encoding="utf-8", errors="replace") as f:
            missing = [line.strip() for line in f if re.search(r"settings found|Error parsing", line)]
        if missing:
            print("ios: xcodegen: its setting presets didn't load: " + "; ".join(missing[:5]))
            return 1
        return 0

    def simulator(self):
        try:
            requested = self.requested_version()
        except ValueError as error:
            print(f"ios: simulator: {error}")
            return 1
        env = self.xcode_env()
        for cmd in (["xcrun", "simctl", "list", "runtimes"],
                    ["xcrun", "simctl", "list", "devices", "available"]):
            code, out, err = self.shell.capture(cmd, env=env)
            self.write_log("simulators.txt", "+ " + " ".join(cmd) + "\n" + out + err)
        code, sdk, err = self.shell.capture(["xcrun", "--sdk", "iphonesimulator",
                                             "--show-sdk-version"], env=env)
        sdk = sdk.strip()
        self.write_log("simulators.txt", f"+ xcrun --sdk iphonesimulator --show-sdk-version\n"
                                         f"{sdk}{err}")
        if code != 0 or not VERSION.match(sdk):
            print(f"ios: simulator: can't read Xcode {toolchain.XCODE_VERSION}'s simulator SDK: "
                  f"{(sdk + err).strip()[:200]!r}")
            return 1
        runtimes = self.runtimes()
        if runtimes is None:
            return 1
        runtime = pick_runtime(runtimes, requested, newest_major=version_key(sdk)[0])
        if runtime is None and requested:
            runtime = self.download(requested)
        if runtime is None:
            print(f"ios: simulator: no available iOS {requested or ''} runtime".replace("  ", " "))
            return 1
        device_type = pick_device_type(runtime, toolchain.SIMULATOR_DEVICE)
        if device_type is None:
            print(f"ios: simulator: iOS {runtime.get('version')} lists no iPhone it supports")
            return 1
        udid = self.existing_device(runtime, device_type["name"])
        if udid is None:
            code, out, err = self.shell.capture(
                ["xcrun", "simctl", "create", f"Tadayo {device_type['name']}",
                 device_type["identifier"], runtime["identifier"]], env=env)
            udid = out.strip()
            if code != 0 or not re.fullmatch(r"[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}", udid):
                print(f"ios: simulator: couldn't make a {device_type['name']}: {(out + err).strip()}")
                return 1
        if self.shell.run(["xcrun", "simctl", "bootstatus", udid, "-b"], env=env,
                          log=self.log("simulators.txt")) != 0:
            print(f"ios: simulator: {udid} didn't boot (logs/simulators.txt)")
            return 1
        self.update_run_record(ios=runtime.get("version"), runtime=runtime.get("identifier"),
                               device=device_type["name"], udid=udid, requested=requested or None,
                               sdk=sdk)
        print(f"ios: simulator: iOS {runtime.get('version')} on {device_type['name']} ({udid})")
        return 0

    def download(self, requested):
        """Downloads and installs iOS `requested`, and returns its runtime, or None. Whether it
        worked is read from simctl, not from xcodebuild's exit code: Xcode has been seen to fall
        back to the newest runtime when a version isn't available, and to print "not available
        for download" for a proxy failure. A plain download comes first, then the universal
        variant, which some Xcode 26 releases need (GitHub's own image installer asks for it)."""
        env = self.xcode_env()
        for variant in ([], ["-architectureVariant", "universal"]):
            print(f"ios: simulator: the runner has no iOS {requested} simulator; downloading it"
                  + (" (universal variant)" if variant else ""))
            code = self.shell.run(["xcodebuild", "-downloadPlatform", "iOS", "-buildVersion",
                                   requested] + variant, env=env, log=self.log("simulators.txt"))
            self.write_log("simulators.txt", f"(exit {code})")
            runtime = pick_runtime(self.runtimes() or [], requested)
            if runtime is not None:
                # As GitHub's image installer does after adding a runtime, and as Apple's Xcode
                # 26.1 notes advise before a first boot. A failure here is logged, not fatal.
                self.shell.run(["xcrun", "simctl", "runtime", "dyld_shared_cache", "update",
                                "--all"], env=env, log=self.log("simulators.txt"))
                return runtime
        print(f"ios: simulator: couldn't install iOS {requested} (logs/simulators.txt)")
        return None

    def runtimes(self):
        code, out, err = self.shell.capture(["xcrun", "simctl", "list", "runtimes", "--json"],
                                            env=self.xcode_env())
        try:
            runtimes = json.loads(out)["runtimes"] if code == 0 else None
        except (ValueError, KeyError, TypeError):
            runtimes = None
        if not isinstance(runtimes, list):
            print(f"ios: simulator: can't read `simctl list runtimes --json`: {(out + err)[:500]}")
            return None
        return runtimes

    def existing_device(self, runtime, name):
        code, out, _ = self.shell.capture(["xcrun", "simctl", "list", "devices", "--json"],
                                          env=self.xcode_env())
        try:
            devices = json.loads(out)["devices"].get(runtime["identifier"], []) if code == 0 else []
        except (ValueError, KeyError, TypeError, AttributeError):
            devices = []
        for device in devices:
            if device.get("name") == name and device.get("isAvailable", False):
                return device.get("udid")
        return None

    def scheme_targets(self, project):
        """The test targets of the shared scheme SCHEME that XcodeGen wrote into project."""
        scheme = self.path(*project.split("/"), "xcshareddata", "xcschemes", f"{SCHEME}.xcscheme")
        if not os.path.isfile(scheme):
            raise ValueError(f"no shared scheme {SCHEME} in {project} (XcodeGen writes it "
                             "when project.yml declares it)")
        return scheme_test_targets(scheme, self.path(*IOS_DIR.split("/")))

    def build(self):
        try:
            project, destination = self.project(), self.destination()
            targets = self.scheme_targets(project)
        except (OSError, ValueError, ElementTree.ParseError, KeyError) as error:
            print(f"ios: build: {error}")
            return 1
        # xcodebuild refuses build-for-testing for a scheme with no test target ("not currently
        # configured for the build-for-testing action"), as the app's first commits have.
        action = "build-for-testing" if targets else "build"
        code = self.shell.run(["xcodebuild", action, "-project", project,
                               "-scheme", SCHEME, "-destination", destination,
                               "-derivedDataPath", self.derived_data()],
                              env=self.xcode_env(), log=self.log("build.log"))
        if code != 0:
            print(f"ios: build: xcodebuild {action} failed (logs/build.log)")
            return code
        products = os.path.join(self.derived_data(), "Build", "Products")
        apps = [os.path.join(products, d, APP_PRODUCT) for d in sorted(os.listdir(products))
                if d.endswith("-iphonesimulator")] if os.path.isdir(products) else []
        apps = [a for a in apps if os.path.isdir(a)]
        if not apps:
            print(f"ios: build: no {APP_PRODUCT} in {products}")
            return 1
        missing = [a for a in apps if not os.path.isdir(os.path.join(a, "PlugIns", SHARE_EXTENSION))]
        if missing:
            print(f"ios: build: {APP_PRODUCT} doesn't hold {SHARE_EXTENSION}, so the share "
                  "extension wasn't built into the app")
            return 1
        print(f"ios: build: {APP_PRODUCT} with {SHARE_EXTENSION}")
        return 0

    def test(self):
        try:
            project, destination = self.project(), self.destination()
            requested = self.requested_version()
            targets = self.scheme_targets(project)
        except (OSError, ValueError, ElementTree.ParseError, KeyError) as error:
            print(f"ios: test: {error}")
            return 1
        recording = self.recording_tests()
        if recording:
            print("ios: test: these set swift-snapshot-testing's record mode themselves, which "
                  "would override CI's `never` (docs/TECH-DESIGN.md section 2: CI never records): "
                  + "; ".join(recording[:10]))
            return 1
        if not targets:
            print(f"ios: test: the scheme {SCHEME} has no tests yet, so there is nothing to test")
            self.update_run_record(tests="none")
            return 0
        skipped = [t for t in targets if requested and t.endswith(SNAPSHOT_TARGET_SUFFIX)]
        if skipped:
            print(f"ios: test: iOS {requested} is a compatibility run, so the snapshot targets "
                  f"are skipped: {', '.join(skipped)}")
        if not [t for t in targets if t not in skipped]:
            print("ios: test: no test target is left to run")
            self.update_run_record(tests="none")
            return 0
        bundle = self.out_path("Tests.xcresult")
        shutil.rmtree(bundle, ignore_errors=True)
        artifacts = self.out_path("artifacts")
        os.makedirs(artifacts, exist_ok=True)
        cmd = ["xcodebuild", "test-without-building", "-project", project, "-scheme", SCHEME,
               "-destination", destination, "-derivedDataPath", self.derived_data(),
               "-resultBundlePath", bundle]
        for target in skipped:
            cmd += ["-skip-testing", target]
        code = self.shell.run(cmd, env=self.xcode_env({
            "TEST_RUNNER_SNAPSHOT_TESTING_RECORD": "never",
            "TEST_RUNNER_SNAPSHOT_ARTIFACTS": artifacts}), log=self.log("test.log"))
        _, summary, err = self.shell.capture(
            ["xcrun", "xcresulttool", "get", "test-results", "summary", "--path", bundle,
             "--compact"], env=self.xcode_env())
        self.write_log("test-summary.json", summary or err)
        self.update_run_record(tests="passed" if code == 0 else "failed")
        if code != 0:
            print("ios: test: tests failed (logs/test.log, logs/test-summary.json); the evidence "
                  "job still publishes what they drew")
            return code
        # The backstop for a record mode RECORDING can't see: under `never`, nothing is written
        # under __Snapshots__.
        recorded = self.recorded_snapshots()
        if recorded is None:
            print("ios: test: git couldn't say whether the run wrote a reference")
            return 1
        if recorded:
            self.update_run_record(tests="failed")
            print("ios: test: the run wrote these references although CI never records (a "
                  "record mode set in code): " + "; ".join(sorted(recorded)[:10]))
            return 1
        return 0

    def recorded_snapshots(self):
        """{path: "new" or "changed"} for each PNG under a __Snapshots__ folder in apps/ios that
        the working tree adds or changes, which only a run that recorded does; None when git
        can't tell."""
        code, out, _ = self.shell.capture(["git", "status", "--porcelain", "-z",
                                           "--untracked-files=all", "--", IOS_DIR])
        if code != 0:
            return None
        found, items = {}, out.split("\0")
        index = 0
        while index < len(items):
            item = items[index]
            index += 1
            if len(item) < 4:
                continue
            status, path = item[:2], item[3:]
            if status[0] in "RC":
                index += 1  # a rename's or copy's second path is its old one
            if "/__Snapshots__/" in f"/{path}" and path.endswith(".png"):
                found[path] = "new" if status in ("??", "A ") else "changed"
        return found

    def recording_tests(self):
        """file:line for each Swift line under apps/ios that sets a record mode other than
        `never`."""
        found = []
        for directory, _, files in sorted(os.walk(self.path(*IOS_DIR.split("/")))):
            for name in sorted(files):
                if not name.endswith(".swift"):
                    continue
                full = os.path.join(directory, name)
                with open(full, encoding="utf-8", errors="replace") as f:
                    for number, line in enumerate(f, 1):
                        if RECORDING.search(line.split("//", 1)[0]):
                            found.append(f"{os.path.relpath(full, self.root)}:{number}")
        return found

    def collect(self):
        entries, by_key = [], {}
        # A reference the run wrote itself (the test step fails such a run) isn't a committed
        # one: it is kept as this run's image, `new`, or `changed` against the committed file.
        recorded = self.recorded_snapshots()
        if recorded is None:
            print("ios: collect: git couldn't say which references are committed; listing all")
            recorded = {}
        for directory, _, files in sorted(os.walk(self.path(*IOS_DIR.split("/")))):
            if os.path.basename(os.path.dirname(directory)) != "__Snapshots__":
                continue
            for name in sorted(files):
                if not name.endswith(".png"):
                    continue
                full = os.path.join(directory, name)
                reference = os.path.relpath(full, self.root).replace(os.sep, "/")
                entry = {"state": state_of(name), "test": os.path.basename(directory),
                         "file": name, "status": "committed", "image": reference,
                         "reference": reference}
                written = recorded.get(reference)
                if written:
                    entry.update(status=written, image=self.keep(full, entry["test"], name),
                                 reference=reference if written == "changed" else None)
                by_key[(entry["test"], name)] = entry
                entries.append(entry)
        artifacts = self.out_path("artifacts")
        for directory, _, files in sorted(os.walk(artifacts)):
            for name in sorted(files):
                if not name.endswith(".png"):
                    continue
                test = os.path.relpath(directory, artifacts).replace(os.sep, "/")
                image = self.keep(os.path.join(directory, name), test, name)
                entry = by_key.get((test, name))
                if entry is None:
                    entry = {"state": state_of(name), "test": test, "file": name,
                             "reference": None}
                    entries.append(entry)
                entry.update(status="changed", image=image)
        for test, name, source in self.new_snapshots():
            if any(e["file"] == name and e["status"] != "committed" for e in entries):
                continue
            entries.append({"state": state_of(name), "test": test, "file": name,
                            "status": "new", "image": self.keep(source, test, name),
                            "reference": None})
        os.makedirs(self.out, exist_ok=True)
        with open(self.out_path("snapshots.json"), "w", encoding="utf-8") as f:
            json.dump({"entries": entries}, f, indent=2, sort_keys=True)
        counts = {s: sum(1 for e in entries if e["status"] == s)
                  for s in ("changed", "new", "committed")}
        print(f"ios: collect: {len(entries)} snapshot(s): {counts['changed']} changed, "
              f"{counts['new']} new, {counts['committed']} committed")
        return 0

    def keep(self, source, test, name):
        image = kept_image(test, name)
        os.makedirs(os.path.dirname(self.out_path(*image.split("/"))), exist_ok=True)
        shutil.copyfile(source, self.out_path(*image.split("/")))
        return image

    def new_snapshots(self):
        """(test, file name, exported path) for each snapshot the result bundle holds because it
        had no reference (swift-snapshot-testing attaches it under record mode `never`)."""
        bundle = self.out_path("Tests.xcresult")
        if not os.path.isdir(bundle):
            return []
        exported = self.out_path("attachments")
        shutil.rmtree(exported, ignore_errors=True)
        os.makedirs(exported)
        code, out, err = self.shell.capture(
            ["xcrun", "xcresulttool", "export", "attachments", "--path", bundle,
             "--output-path", exported], env=self.xcode_env())
        try:
            with open(os.path.join(exported, "manifest.json"), encoding="utf-8") as f:
                manifest = json.load(f)
            os.makedirs(self.out_path("logs"), exist_ok=True)
            shutil.copyfile(os.path.join(exported, "manifest.json"),
                            self.log("attachments-manifest.json"))
        except (OSError, ValueError):
            print(f"ios: collect: couldn't export the result bundle's attachments: "
                  f"{(out + err).strip()[:500]}")
            return []
        found = []
        for test in manifest if isinstance(manifest, list) else []:
            test_id = str(test.get("testIdentifier") or "")
            group = test_id.split("/", 1)[0] or "tests"
            for attachment in test.get("attachments") or []:
                name = snapshot_file_from_attachment(
                    attachment.get("suggestedHumanReadableName") or "")
                source = os.path.join(exported, attachment.get("exportedFileName") or "")
                if name and os.path.isfile(source):
                    found.append((group, name, source))
        return found

    # The evidence (Linux)

    def imagemagick(self):
        if shutil.which("montage") and shutil.which("convert"):
            code = 0
        else:
            code = self.shell.run(["sudo", "apt-get", "update", "-q"]) or self.shell.run(
                ["sudo", "apt-get", "install", "-y", "-q", "--no-install-recommends",
                 "imagemagick", "fonts-dejavu-core"])
        if code == 0:
            code = self.shell.run(["convert", "-version"])
        if code != 0:
            print("ios: imagemagick: couldn't install ImageMagick")
        return code

    def changed_paths(self):
        """The paths this branch changed: since where it left origin/main, or on main since the
        commit before. None when git can't tell."""
        on_main = self.environ.get("GITHUB_REF_NAME") == "main"
        cmd = ["git", "rev-parse", "HEAD^1"] if on_main else ["git", "merge-base", "origin/main", "HEAD"]
        code, out, _ = self.shell.capture(cmd)
        base = out.strip()
        if code != 0 or not re.fullmatch(r"[0-9a-f]{40,64}", base):
            return None
        code, out, _ = self.shell.capture(["git", "diff", "--name-only", "--no-renames", "-z",
                                           base, "HEAD"])
        return None if code != 0 else [p for p in out.split("\0") if p]

    def sheets(self):
        # Whatever an earlier run on this runner left: the evidence job's own folder is rebuilt.
        shutil.rmtree(self.work, ignore_errors=True)
        try:
            path, mode = self.evidence_target()
        except ValueError as error:
            print(f"ios: sheets: {error}")
            return 1
        record = self.run_facts()
        changed, notes, checked = [], [], []
        try:
            with open(self.out_path("snapshots.json"), encoding="utf-8") as f:
                listed = json.load(f)["entries"]
            if not isinstance(listed, list):
                raise ValueError("entries isn't a list")
            checked = [self.checked_entry(e) for e in listed]
            list_missing = False
        except (OSError, ValueError, KeyError, TypeError):
            list_missing = True
            notes.append("The build job's collect step didn't finish, so this run's snapshot "
                         "list is missing: the snapshots it drew and the states this branch "
                         "touches aren't here.")
        if mode == "touched":
            changed = self.changed_paths()
            if changed is None:
                notes.append("Couldn't compare this branch with main, so only the snapshots this "
                             "run drew (changed, new) are here.")
                changed = []
        good = [entry for entry, problems in checked if not problems]
        chosen = select(good, mode, changed)
        carried = {id(entry) for entry in chosen}
        stage = self.stage_path(path)
        os.makedirs(stage)
        try:
            with open(self.path(*INVENTORY.split("/")), encoding="utf-8") as f:
                inventory = read_inventory(f.read())
        except OSError:
            inventory = set()
        # A row: (entry, sheet name, sheet, kept snapshot, the no-render note, what failed).
        rows, failed, taken = [], 0, set()
        for entry, problems in checked:
            if not problems and id(entry) not in carried:
                continue
            render = render_for(self.root, entry["state"])
            note = None if render else no_render_note(entry["state"], inventory)
            if problems:
                # Whatever mode: an entry collect can't have written is neither copied nor drawn.
                rows.append((entry, None, None, None, note,
                             "its entry failed this job's checks: " + ", ".join(problems)))
                failed += 1
                continue
            name = sheet_name(entry, taken)
            snapshot = self.image_path(entry["image"])
            if not os.path.isfile(snapshot):
                rows.append((entry, name, None, None, note, "its image is missing from this run"))
                failed += 1
                continue
            kept = f"snapshots/{name}.png"
            os.makedirs(os.path.join(stage, "snapshots"), exist_ok=True)
            shutil.copyfile(snapshot, os.path.join(stage, *kept.split("/")))
            # A state with no render shows its snapshot alone (TECH-DESIGN section 2,
            # docs/DESIGN-HANDOFF.md), so the committed reference sits between a render and the
            # snapshot only when there is a render.
            panels = [("Render", render, self.path(*render.split("/")))] if render else []
            if render and entry["status"] == "changed" and entry["reference"] and \
                    os.path.isfile(self.path(*entry["reference"].split("/"))):
                panels.append(("Before", "the committed reference",
                               self.path(*entry["reference"].split("/"))))
            # The title is the state alone, which fits a one-tile sheet at the title's double
            # size; the run's details go under the snapshot, a line each, at the label's size.
            run = (f"iOS {record.get('ios', '?')} · {record.get('device', '?')}\n"
                   f"{self.environ.get('GITHUB_REF_NAME', '')} @ "
                   f"{self.environ.get('GITHUB_SHA', '')[:7]}")
            panels.append(("Snapshot", f"{self.status_words(entry, note)}\n{run}", snapshot))
            title = entry["state"] or entry["file"]
            sheet = f"sheets/{name}.jpg"
            os.makedirs(os.path.join(stage, "sheets"), exist_ok=True)
            if self.shell.run(montage_command(title, panels, os.path.join(stage, *sheet.split("/")))) != 0:
                rows.append((entry, name, None, kept, note, "ImageMagick couldn't make its sheet"))
                failed += 1
                continue
            rows.append((entry, name, sheet, kept, note, None))
        # Only the logs the steps write, each a regular file; anything else in logs/ is counted,
        # never named, since a name is the build job's text.
        logs, strays = self.out_path("logs"), 0
        for name in sorted(os.listdir(logs)) if os.path.isdir(logs) else []:
            source = os.path.join(logs, name)
            if name in LOG_NAMES and os.path.isfile(source) and not os.path.islink(source):
                os.makedirs(os.path.join(stage, "logs"), exist_ok=True)
                shutil.copyfile(source, os.path.join(stage, "logs", name))
            else:
                strays += 1
        if strays:
            notes.append(f"The build job's logs/ held {strays} other entr"
                         f"{'y' if strays == 1 else 'ies'}, not a log its steps write, so "
                         f"{'it is' if strays == 1 else 'they are'} left out and this step fails.")
        # run.json's checked values, never the file as the build job wrote it.
        if os.path.isfile(self.out_path("run.json")):
            with open(os.path.join(stage, "run.json"), "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2, sort_keys=True)
        left_out = len(good) - len(chosen)
        self.write_index(stage, path, mode, record, rows, left_out, notes)
        # Written last, so publish knows this step finished for this run's folder.
        with open(self.work_path("evidence.json"), "w", encoding="utf-8") as f:
            json.dump({"path": path}, f)
        print(f"ios: sheets: {len(rows) - failed} sheet(s) for {path} ({mode}); {left_out} "
              "snapshot(s) this run doesn't carry")
        if list_missing:
            print("ios: sheets: no snapshots.json: the build job's collect step didn't finish")
        if strays:
            print(f"ios: sheets: {strays} entr{'y' if strays == 1 else 'ies'} in logs/ that no "
                  "step writes, left out")
        return 1 if failed or list_missing or strays else 0

    def checked_entry(self, entry):
        """(entry, problems) for an entry of snapshots.json, which the macOS job wrote: this job
        can write, so every field is checked again. The state is a plain state name or none; the
        test a path of plain names (PLAIN) or none; the file a plain name ending .png; the
        status changed, new or committed; the image under OUT's snapshots/ or a __Snapshots__
        folder in apps/ios (contained); the reference in such a folder, or none. A field that
        fails is set to None and named in problems, and sheets fails the entry's row. When every
        field passes, they must also fit together as collect writes them, else "pairing" is
        named: the state is the file's (state_of); a committed image is its own reference; a
        changed or new image is where collect keeps it (kept_image); a reference is the file's,
        in its test's folder; a new snapshot has none."""
        if not isinstance(entry, dict):
            return dict.fromkeys(("state", "test", "file", "status", "image", "reference")), \
                ["the entry isn't an object"]
        checks = {
            "state": lambda v: v is None or isinstance(v, str) and STATE.fullmatch(v),
            "test": lambda v: v is None or isinstance(v, str) and
            all(PLAIN.fullmatch(part) for part in v.split("/")),
            "file": lambda v: isinstance(v, str) and PLAIN.fullmatch(v) and v.endswith(".png"),
            "status": lambda v: v in ("changed", "new", "committed"),
            "image": lambda v: self.contained(v) is not None,
            "reference": lambda v: v is None or self.contained(v) is not None and
            not v.startswith("snapshots/"),
        }
        checked, problems = {}, []
        for field, ok in checks.items():
            value = entry.get(field)
            if ok(value):
                checked[field] = value
            else:
                checked[field] = None
                problems.append(field)
        if not problems:
            state, test, file = checked["state"], checked["test"], checked["file"]
            status, image, reference = checked["status"], checked["image"], checked["reference"]
            kept = test is not None and image == kept_image(test, file)
            in_place = reference is None or reference.split("/")[-2:] == [test, file]
            # A reference is never under snapshots/ (its own check), so neither is a committed
            # image that is its own reference.
            fits = {"committed": image == reference, "changed": kept,
                    "new": kept and reference is None}[status]
            if state != state_of(file) or not in_place or not fits:
                problems.append("pairing")
        return checked, problems

    def contained(self, image):
        """image, when each of its parts is a plain name (PLAIN) and it resolves, symbolic links
        followed, to a path under OUT's snapshots/ (`snapshots/...`) or inside a __Snapshots__
        folder in apps/ios; else None."""
        if not isinstance(image, str) or not all(PLAIN.fullmatch(p) for p in image.split("/")):
            return None
        in_out = image.startswith("snapshots/")
        base = os.path.realpath(self.out_path("snapshots") if in_out
                                else self.path(*IOS_DIR.split("/")))
        full = os.path.realpath(self.image_path(image))
        if full == base or os.path.commonpath([full, base]) != base:
            return None
        if not in_out and "__Snapshots__" not in os.path.relpath(full, base).split(os.sep)[:-1]:
            return None
        return image

    def image_path(self, image):
        if image.startswith("snapshots/"):
            return self.out_path(*image.split("/"))
        return self.path(*image.split("/"))

    @staticmethod
    def status_words(entry, note):
        words = {"changed": "changed in this run", "new": "new: no committed reference",
                 "committed": "the committed reference"}[entry["status"]]
        return f"{words}\n{note}" if note else words

    def write_index(self, stage, path, mode, record, rows, left_out, notes):
        server = self.environ.get("GITHUB_SERVER_URL", "https://github.com")
        repo = self.environ.get("GITHUB_REPOSITORY", "")
        base = f"{server}/{repo}/blob/{EVIDENCE_BRANCH}/{urllib.parse.quote(path)}"
        run = (f"{server}/{repo}/actions/runs/{self.environ['GITHUB_RUN_ID']}"
               if self.environ.get("GITHUB_RUN_ID") else "this run")
        what = {"touched": "the states this branch touches", "full": "every snapshot (a run by "
                "hand, for a gate)", "none": "no sheets: a compatibility run, which skips the "
                "snapshot tests"}[mode]
        lines = [f"# {path}", "",
                 f"The `ios` workflow's evidence for `{self.environ.get('GITHUB_SHA', '')}` "
                 f"({run}).", "",
                 # Each value passed FACT, which has no backtick, and sits in a code span.
                 f"- Xcode `{record.get('xcode', '?')}`, Swift `{record.get('swift', '?')}`, "
                 f"iOS `{record.get('ios', '?')}` on `{record.get('device', '?')}`",
                 f"- Tests: `{record.get('tests', 'not run')}`",
                 f"- Carries {what}; {left_out} snapshot(s) not carried", ""]
        lines += [f"{n}" for n in notes] + ([""] if notes else [])
        if rows:
            # File: where the image belongs in the repository, its committed reference's path
            # or, for a new snapshot, its test class and file name (the reference goes in that
            # class's file's __Snapshots__ folder).
            lines += ["| State | Status | File | Render | Sheet | Snapshot |",
                      "|---|---|---|---|---|---|"]
            # Every name here passed checked_entry, so none can break the table.
            for entry, name, sheet, kept, note, failure in rows:
                render = render_for(self.root, entry["state"]) or (note or "none")
                sheet_link = f"[{name}.jpg]({base}/{sheet})" if sheet else (failure or "none")
                kept_link = f"[{name}.png]({base}/{kept})" if kept else "none"
                target = entry["reference"] or f"{entry['test'] or '?'}/{entry['file'] or '?'}"
                lines.append(f"| `{entry['state'] or entry['file'] or '?'}` | "
                             f"{entry['status'] or '?'} | `{target}` | {render} | {sheet_link} | "
                             f"{kept_link} |")
            lines.append("")
        # Only LOG_NAMES are staged, so these names are the steps' own.
        if os.path.isdir(os.path.join(stage, "logs")):
            lines += ["Logs: " + ", ".join(f"[{n}]({base}/logs/{urllib.parse.quote(n)})"
                                           for n in sorted(os.listdir(os.path.join(stage, "logs")))), ""]
        with open(os.path.join(stage, "index.md"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    def publish(self):
        # The folder comes from the run's environment, as in sheets, and the files from what
        # sheets staged in the evidence job's own folder: never from a file in OUT, where the
        # build job's artifact was downloaded.
        try:
            path, _ = self.evidence_target()
        except ValueError as error:
            print(f"ios: publish: {error}")
            return 1
        stage = self.stage_path(path)
        try:
            with open(self.work_path("evidence.json"), encoding="utf-8") as f:
                finished = json.load(f)
        except (OSError, ValueError):
            finished = None
        if not isinstance(finished, dict) or finished.get("path") != path or \
                not os.path.isdir(stage):
            print(f"ios: publish: the sheets step didn't finish for {path}, so nothing goes up")
            return 1
        token = self.environ.get("GITHUB_TOKEN")
        url = self.environ.get("EVIDENCE_REMOTE") or (
            f"{self.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/"
            f"{self.environ.get('GITHUB_REPOSITORY', '')}.git")
        env = {"GIT_TERMINAL_PROMPT": "0"}
        if token:
            # The token goes to git through the environment, never on a command line or into
            # .git/config (git's GIT_CONFIG_COUNT).
            basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
            env.update({"GIT_CONFIG_COUNT": "1",
                        "GIT_CONFIG_KEY_0": "http.extraheader",
                        "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {basic}"})
        clone = self.work_path("branch")
        shutil.rmtree(clone, ignore_errors=True)
        if self.shell.run(["git", "clone", "--quiet", "--depth", "1", "--filter=blob:none",
                           "--sparse", "--single-branch", "--branch", EVIDENCE_BRANCH, url, clone],
                          env=env) != 0:
            print(f"ios: publish: couldn't clone the `{EVIDENCE_BRANCH}` branch")
            return 1
        git = ["git", "-C", clone, "-c", "user.name=github-actions[bot]",
               "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com"]
        if self.shell.run(git + ["sparse-checkout", "set", "--no-cone", f"/{path}/"], env=env) != 0:
            return 1
        message = (f"evidence: {path}\n\nThe ios workflow's run "
                   f"{self.environ.get('GITHUB_RUN_ID', '?')} for {self.environ.get('GITHUB_SHA', '?')}.")
        for attempt in range(1, PUSH_ATTEMPTS + 1):
            target = os.path.join(clone, *path.split("/"))
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(stage, target)
            if self.shell.run(git + ["add", "--sparse", "--all", "--", path], env=env) != 0:
                return 1
            if self.shell.run(git + ["diff", "--cached", "--quiet"], env=env) == 0:
                print(f"ios: publish: {path} is already on `{EVIDENCE_BRANCH}` as it is")
                return 0
            if self.shell.run(git + ["commit", "--quiet", "-m", message], env=env) != 0:
                return 1
            if self.shell.run(git + ["push", "--quiet", "origin",
                                     f"HEAD:refs/heads/{EVIDENCE_BRANCH}"], env=env) == 0:
                print(f"ios: publish: pushed {path} to `{EVIDENCE_BRANCH}`; index: "
                      f"{self.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/"
                      f"{self.environ.get('GITHUB_REPOSITORY', '')}/blob/{EVIDENCE_BRANCH}/"
                      f"{urllib.parse.quote(path)}/index.md")
                return 0
            if attempt == PUSH_ATTEMPTS:
                break
            print(f"ios: publish: push {attempt} refused; fetching `{EVIDENCE_BRANCH}` again")
            self.sleep(2 ** attempt)
            if self.shell.run(git + ["fetch", "--quiet", "--depth", "1", "--filter=blob:none",
                                     "origin", EVIDENCE_BRANCH], env=env) != 0 or \
                    self.shell.run(git + ["reset", "--quiet", "--hard", "FETCH_HEAD"], env=env) != 0:
                print(f"ios: publish: couldn't fetch `{EVIDENCE_BRANCH}` again")
                return 1
        print(f"ios: publish: `{EVIDENCE_BRANCH}` refused {PUSH_ATTEMPTS} pushes; nothing forced")
        return 1


def montage_command(title, panels, output):
    """ImageMagick's montage: one tile per (heading, words, image path) panel, side by side, each
    fitted in 600×1300 so a 1x render and a 3x snapshot show at the same size; JPEG."""
    font = next((f for f in FONTS if os.path.isfile(f)), None)
    cmd = ["montage"] + (["-font", font] if font else []) + [
        "-pointsize", "20", "-background", "#ffffff", "-fill", "#1a1a1a",
        "-title", magick_text(title)]
    for heading, words, image in panels:
        # png: makes ImageMagick read each file as a PNG, whatever its contents claim to be.
        cmd += ["-label", magick_text(f"{heading}\n{words}"), "png:" + os.path.abspath(image)]
    cmd += ["-tile", f"{len(panels)}x1", "-geometry", "600x1300+24+24", "-quality", "82",
            "jpg:" + os.path.abspath(output)]
    return cmd


STEPS = {
    "gate": Steps.gate, "toolchain": Steps.toolchain, "xcodegen": Steps.xcodegen,
    "simulator": Steps.simulator, "build": Steps.build, "test": Steps.test,
    "collect": Steps.collect, "imagemagick": Steps.imagemagick, "sheets": Steps.sheets,
    "publish": Steps.publish,
}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/ios_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(HERE))
    return STEPS[argv[1]](Steps(root, Shell(root)))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
