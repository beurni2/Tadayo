#!/usr/bin/env python3
"""The steps of the `ios` workflow (docs/TECH-DESIGN.md sections 2, 3, 8 and 9; the B0 plan's
slice 9).

  python3 tools/ci/ios_steps.py <step>

.github/workflows/ios.yml stays thin: each of its steps calls one step here, where the logic and
its tests live (tools/ci/ios_steps_test.py). Its three jobs:

  gate      (Linux)     gate
  build     (xcode-27)  toolchain, xcodegen, simulator, build, test, collect
  evidence  (Linux)     imagemagick, sheets, publish

The steps:

  gate         The macOS job runs only when the branch has apps/ios/project.yml (PROJECT_SPEC):
               `ios.yml` reached main before the app did (ADR-025), so a push that changes
               packages/contracts/** would otherwise start a macOS run that fails at XcodeGen.
               Writes build=true or build=false to $GITHUB_OUTPUT. Slice 12 set REQUIRE_APP: the
               app is on main, so a branch without it fails here instead (T58).
  toolchain    Selects the pinned Xcode (toolchain.XCODE_VERSION, at /Applications/Xcode_<v>.app)
               for every later step, and fails unless `xcodebuild -version` says that Xcode and
               `xcrun swift --version` says toolchain.SWIFT_VERSION, the Swift `ci` tests the
               Swift packages with on Linux.
  xcodegen     Downloads XcodeGen toolchain.XCODEGEN_VERSION's release zip, fails unless its
               SHA-256 is toolchain.XCODEGEN_SHA256 and it reports that version, and generates
               the project from PROJECT_SPEC, failing if XcodeGen says its presets didn't load.
  simulator    Checks the snapshot runtime first (below), then records the simulators the
               runner offers (logs/simulators.txt) and the pinned Xcode's simulator SDK, and
               fails unless the first of toolchain.IOS_RUNTIMES shares the SDK's major and none
               is of a later major. Then, for each pinned runtime in order, it takes the available
               iOS runtime of that version that supports toolchain.SIMULATOR_DEVICE (pick_runtime:
               the `xcode-27` image has a second iOS 27.2 runtime, for iPhone Duo alone). One the
               runner hasn't got is fetched only when toolchain.IOS_DOWNLOADS lists it (iOS
               26.5, on every run): downloaded to a file with `xcodebuild -downloadPlatform iOS
               -buildVersion <v> -exportPath`, imported with `xcodebuild -importPlatform`, and
               the copy the download registers deleted, since the image moves a downloaded
               runtime's mount mid-run (Steps.download); it is read back from simctl, never
               assumed from an exit code, and only an imported image simctl says is Ready counts.
               Any other missing runtime fails the step, naming it. There is no other device: on
               each runtime it reuses or creates that device, and checks that simctl lists it on
               that runtime. It boots no device, so none runs beside the build (the test step
               boots each just before its pass), and writes each runtime's
               identifier, build, device and UDID to run.json and logs/simulators.txt, with the
               snapshot runtime (and, in simulators.txt, where it comes from). After a failed
               update of a downloaded runtime's shared cache, it copies what the builder left,
               and the system log's lines about it, into simulators.txt before anything runs
               again (Steps.cache_builder_output).
  build        `xcodebuild build-for-testing` of SCHEME, or `xcodebuild build` while the
               scheme has no test target (xcodebuild refuses build-for-testing then), with
               `-skipPackagePluginValidation` (ADR-028). It fails when the build log shows a
               package plugin toolchain.PACKAGE_PLUGINS doesn't allow, from another package or on
               another target, then unless the app holds the share extension, so both targets
               were built.
  test         `xcodebuild test-without-building` of the scheme's tests, when it has any, once
               on each of toolchain.IOS_RUNTIMES in order: each pass with its own destination,
               result bundle (Tests-<v>.xcresult) and logs, and every pass run even when one
               before it failed. Before each pass it boots that pass's device, shutting the one
               booted last down first; the pass on a runtime toolchain.IOS_DOWNLOADS
               lists writes where that runtime is (its bundle and its build's volumes) before
               and after it to its log, and says so if that changed. Every pass has
               swift-snapshot-testing's record mode `never` (a snapshot with no committed
               reference fails; TECH-DESIGN section 2). The test
               targets named *SnapshotTests (SNAPSHOT_TARGET_SUFFIX) run on the snapshot runtime
               alone, and only its pass gets the artifacts directory in OUT.
               It fails first if the snapshot runtime's file is missing or bad, or a Swift file
               under apps/ios sets a record mode of its own, which would override `never`
               (RECORDING); after the passes, if the run wrote a reference under a __Snapshots__
               folder all the same (a mode set some other way); and when any pass failed.
  The simulator step (after its check of the snapshot runtime), the build and each test pass
  sample the runner as they start, every SAMPLE_EVERY seconds, and as they end, in
  logs/runner.txt, the simulator step with the runner's hardware first, and say how long each
  took and the load averages then (Steps.sampling); each boot's log says how long it took. None
  of it decides a step, and each diagnostic command is stopped at a limit, so the samples cost
  a part at most about 40 seconds at its start and 45 at its end. After each pass, the crash
  and jetsam reports macOS wrote during it go to logs/crashes-<v>.txt, and after a failed pass
  the simulator's log lines about services that exited (Steps.crash_reports,
  Steps.service_exits; CRASH_FOLDERS), which decide nothing either.
  collect      Lists every snapshot in snapshots.json, with its state and status (below), and
               copies the images this run drew into OUT/snapshots/, a reference the run wrote
               itself included. The new ones come from the snapshot runtime's result bundle:
               run.json's `snapshots`, else snapshot_runtime(); when the file is missing or bad
               and run.json doesn't say, it says why and exports none. Runs even when a step before
               it failed, and always passes.
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
               states the branch touches; a run by hand carries the full set, for gates. The
               snapshots are the snapshot runtime's, and index.md has a line for each runtime
               and says which runtime the references are for and why. index.md lists, and
               run.json's `odd-draws` holds, each line of the snapshot runtime's test log that
               reads whole as the warning ScreenSnapshot.settled logs when a screen's drawing
               took a third draw or more (ODD_DRAW, odd_draw_holds), so the page beside the
               images shows it, not only the raw log: the glass on iOS 27.2 now and then draws a
               little different (docs/LIMITATIONS.md, 2026-11-14). A re-run still replaces the
               whole folder, and an earlier attempt's stay in the `evidence` branch's history.
               Any other line that looks like the warning, such as a failing test's message
               that quotes one or a line cut at a difference's boundary, is counted
               (`odd-draws-unread`), never copied.
               Neither fails the step. Every field
               of snapshots.json and every value of run.json is checked again here, since this
               job can write: an entry with a field, or fields together, that collect can't
               have written fails its row and is neither copied nor drawn; run.json is staged
               with only its checked values and the odd draws this job read; only the logs the
               steps write are copied, and any other entry in logs/ is counted, never named.
               Stages everything in the evidence
               job's own folder, beside OUT (WORK below). Writes index.md, which links every
               file and says which file each image belongs to. Fails, after staging the rest,
               when an entry fails its checks, an image is missing, a sheet couldn't be made,
               snapshots.json is missing or logs/ holds anything else.
  publish      Pushes what sheets staged (index.md, the sheets, the checked entries' snapshots,
               run.json's checked values and odd draws, and the steps' logs, as they are) to the
               `evidence` branch under <branch>/<short-sha>/ios/ (ios-full/ for a run by hand's
               full set), with the job's GITHUB_TOKEN.
               The folder comes from the run's environment, as in sheets, never from a file;
               nothing goes up unless sheets finished for that folder. Never forces: when the
               push is refused because another run pushed first, it fetches the branch again,
               puts its files back on top and retries. $EVIDENCE_REMOTE replaces the remote, for
               a scratch repository; by hand, run it only with one, since only the workflow's
               evidence job pushes to the real branch.

The snapshot runtime (snapshot_runtime): the snapshot tests run on one pinned runtime,
toolchain.SNAPSHOT_RUNTIME, the one the committed references are drawn on, and the app says so
with the file SNAPSHOT_RUNTIME_FILE holding exactly that version. A missing file, or anything
else there, fails `simulator` and `test` before any command, and `ci` on Linux, where
ios_steps_test.py reads the real file. So the file can name only the founder's runtime, and the
snapshot tests move to another runtime only with new references and a CI-configuration PR (T58).

Files pass between the macOS job's steps in OUT ($IOS_OUT, else $RUNNER_TEMP/ios-out), which the
job uploads as the artifact `ios-results` and the evidence job downloads to the same place:

  run.json        what the run used (RUN_KEYS): the Xcode, the Swift, the simulator SDK; for each
                  pinned runtime <v>, the runtime simctl gave, its build, the device, its UDID and
                  the pass's result; the snapshot runtime; the tests' overall result
  logs/           toolchain.txt, xcodegen.txt, simulators.txt, build.log, attachments-manifest.json,
                  runner.txt (the runner's samples), and test-<v>.log and test-summary-<v>.json
                  for each pinned runtime (LOG_NAMES)
  Tests-<v>.xcresult  each pass's result bundle; collect reads the snapshot runtime's
  artifacts/      swift-snapshot-testing's SNAPSHOT_ARTIFACTS on the snapshot runtime's pass: the
                  images that differ from their committed reference
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
             test passed is in the run's result, run.json and the snapshot runtime's
             logs/test-<v>.log)

Exit 0 when the step passes or is skipped, 1 when it fails, 2 on bad usage.

Tests: python3 tools/ci/ios_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import base64
import contextlib
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ElementTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import toolchain  # noqa: E402

REQUIRE_APP = True  # since slice 12 (T58): the gate fails on a branch without the app

PROJECT_SPEC = "apps/ios/project.yml"
IOS_DIR = "apps/ios"
SCHEME = "Tadayo"
APP_PRODUCT = "Tadayo.app"
SHARE_EXTENSION = "TadayoShare.appex"
SNAPSHOT_TARGET_SUFFIX = "SnapshotTests"
# The runtime the committed references are drawn on, which can only be toolchain.SNAPSHOT_RUNTIME
# (snapshot_runtime). collect reads only PNGs in folders under __Snapshots__, and XcodeGen
# excludes **/__Snapshots__, so the file is neither a snapshot nor a source.
SNAPSHOT_RUNTIME_FILE = "apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version"
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
# The keys the steps write in run.json: the only ones the evidence job reads or stages. Each
# pinned runtime <v> has its own: ios-<v> (the version simctl gave), runtime-<v> (its identifier),
# runtime-build-<v>, device-<v>, udid-<v> and tests-<v> (that pass's result).
RUNTIME_KEYS = ("ios", "runtime", "runtime-build", "device", "udid", "tests")
RUN_KEYS = ("xcode", "swift", "sdk", "snapshots", "tests") + tuple(
    f"{key}-{version}" for version in toolchain.IOS_RUNTIMES for key in RUNTIME_KEYS)
# Where the snapshot runtime comes from, as index.md and the labels say it.
SNAPSHOT_SOURCE = "the ios-version file"
# The line ScreenSnapshot.settled logs (apps/ios/TadayoSnapshotTests/ScreenSnapshots.swift) when a
# screen's drawing took a third draw or more, or didn't settle: its name, the draws' count, the
# start of each draw's SHA-256 and, for each draw that differs from the last, how. The sheets step
# copies each line that matches whole, in ASCII, and holds together (odd_draw_holds) into
# index.md, in a code span, and run.json: every part is bounded, and none can hold a backtick. A
# line with either mark that doesn't is counted: a quote of one, or a line cut or run into another.
ODD_DRAW_MARK = "warning: ScreenSnapshot "
ODD_DRAW_TAIL = "; against the last draw, "
_DIFFERENCE = ("(?:[0-9]{1,8} pixels in x [0-9]{1,5} to [0-9]{1,5}, y [0-9]{1,5} to [0-9]{1,5}, "
               "by at most [0-9]{1,3}/255|sizes differ, [0-9]{1,5} by [0-9]{1,5} and [0-9]{1,5} "
               "by [0-9]{1,5}|no pixel differs|not readable)")
ODD_DRAW = re.compile(
    r"warning: ScreenSnapshot [\w+-][\w.+-]{0,127}: (settled after|didn't settle in) "
    r"([0-9]{1,2}) draws, SHA-256 ([0-9a-f]{8}(?: [0-9a-f]{8}){1,15}); against the last draw, "
    r"(draw [0-9]{1,2}: " + _DIFFERENCE + r"(?:; draw [0-9]{1,2}: " + _DIFFERENCE + r"){0,15})",
    re.ASCII)
ODD_DRAW_NUMBER = re.compile(r"(?:^|; )draw ([0-9]{1,2}): ", re.ASCII)
ODD_DRAW_LARGEST = re.compile(r"by at most ([0-9]{1,3})/255", re.ASCII)
# index.md shows at most this many odd draws; run.json holds them all, each no longer than its
# line in the staged log.
ODD_DRAWS_SHOWN = 100
# `xcrun simctl runtime list -j`: a runtime downloaded as a MobileAsset has its image under
# ASSET_IMAGES; an imported one has its own (/Library/Developer/CoreSimulator/Cryptex/Images/ on
# the `xcode-27` image). Only iOS simulator images are looked at.
ASSET_IMAGES = "/System/Library/AssetsV2/"
SIMULATOR_PLATFORM = "com.apple.platform.iphonesimulator"
RUNNER_IMAGES_ISSUE = "actions/runner-images#14946"
# The runner's samples (Steps.sampling), in logs/runner.txt: at the start and the end of the
# simulator step, the build and each test pass, and every SAMPLE_EVERY seconds between. Each is
# the second of two `top` samples a second apart, since the first has no CPU use to show: the
# load averages, CPU and memory use, the disks' reads and writes since the runner's VM booted,
# and the eight busiest processes. The simulator step's first sample also has the runner's hardware
# (RUNNER_HOST). Only logged, never what decides a step: since about 13:25 UTC on 2026-11-20
# every step has run slower on both runner images, the build 2 to 4 times and iOS 26.5's pass
# more (docs/LIMITATIONS.md, 2026-11-20), and the logs didn't say what the runner was doing.
# Each command of the first and the last sample is given DIAG_TIMEOUT seconds and is then
# stopped, and the last waits JOIN_TIMEOUT at most for a sample in progress. So the samples cost
# a part at most DIAG_TIMEOUT at its start (twice that for the simulator step's first, with
# RUNNER_HOST) and JOIN_TIMEOUT + DIAG_TIMEOUT at its end. The samples in between run beside the
# work and cost it nothing, so each is given SAMPLE_TIMEOUT: in a saturated runner one took
# about 104 seconds (`ios` 44794160395), and a shorter limit would lose the samples where the
# runner first saturates. One still running when its part ends is written after the last.
SAMPLE_EVERY = 60
DIAG_TIMEOUT = 20
JOIN_TIMEOUT = DIAG_TIMEOUT + 5
SAMPLE_TIMEOUT = 120
RUNNER_SAMPLE = ["top", "-l", "2", "-s", "1", "-n", "8", "-o", "cpu", "-stats",
                 "pid,command,cpu,mem"]
RUNNER_HOST = ["sysctl", "hw.model", "machdep.cpu.brand_string", "hw.ncpu", "hw.memsize"]
LOAD_AVERAGES = re.compile(r"^Load Avg: ([0-9.]+), ([0-9.]+), ([0-9.]+)", re.M)
# A failed shared cache update names its builder's two output files in simctl's error
# (`stderrPath=...`, `stdoutPath=...`). Steps.cache_builder_output copies the end of each one
# under CACHE_FOLDER, and the system log's lines from simdiskimaged and the builder
# (cache_log), into logs/simulators.txt, CACHE_LINES lines of each at most. The system log is
# read from a minute before the update started, and given CACHE_LOG_TIMEOUT seconds.
CACHE_FOLDER = "/Library/Developer/CoreSimulator/Caches/dyld/"
CACHE_FILE = re.compile(r"\b(?:stderrPath|stdoutPath)=(/[^,}\s]+)")
CACHE_LINES = 200
CACHE_LOG_TIMEOUT = 60

# The crash and jetsam reports macOS wrote during a test pass, the simulator's own processes'
# among them, in logs/crashes-<v>.txt (Steps.crash_reports), written only when there is one. In
# every failure of `ArrivalFocusTests.testA03TakesTheFocusAsItReplacesA02Age` on iOS 27.2 whose
# own log the evidence branch holds (12 from 2026-11-22 to 2026-11-24), the host lost its XPC
# connection to the simulator's keyboard service during the test, and the field's editing ended
# with it; the logs never said which process ended, or why (docs/plans/ios-b1-intermittents.md).
# A report names the process, how it ended (a crash's exception and signal, a kill's namespace
# and reason, the processes a jetsam event killed) and nothing of the app's data. CRASH_REPORTS
# reports at most, each read from at most CRASH_BYTES bytes, and each field cut to CRASH_FIELD
# characters. Only logged, never what decides a step.
CRASH_FOLDERS = ("~/Library/Logs/DiagnosticReports", "/Library/Logs/DiagnosticReports")
CRASH_SUFFIXES = (".ips", ".crash", ".diag")
CRASH_REPORTS = 30
CRASH_BYTES = 2_000_000
CRASH_FIELD = 300
# A failed pass's crashes-<v>.txt also has the simulator's own log lines from launchd about the
# services that exited during the pass, which a process that ended with no report still leaves
# (`log show` in the device, given SERVICE_LOG_TIMEOUT seconds), SERVICE_LOG_LINES at most.
SERVICE_LOG_PREDICATE = ('eventMessage CONTAINS "exited due to" OR eventMessage CONTAINS '
                         '"exited with abnormal code" OR eventMessage CONTAINS[c] "jetsam"')
SERVICE_LOG_TIMEOUT = 90
SERVICE_LOG_LINES = 200


def crash_summary(text):
    """The lines of a report that say which process ended and how. A report in the .ips form is a
    JSON header line and then a JSON body; any other form, or one that doesn't parse, gives its
    first lines as they are."""
    def cut(value):
        value = value if isinstance(value, str) else json.dumps(value, sort_keys=True)
        return value if len(value) <= CRASH_FIELD else value[:CRASH_FIELD] + "…"
    first, _, rest = text.partition("\n")
    try:
        header = json.loads(first)
        body = json.loads(rest) if rest.strip() else {}
    except ValueError:
        return [cut(line) for line in text.splitlines()[:20]]
    if not isinstance(header, dict) or not isinstance(body, dict):
        return [cut(line) for line in text.splitlines()[:20]]
    lines = [f"{key}: {cut(header[key])}" for key in ("name", "app_name", "bug_type", "timestamp")
             if header.get(key) not in (None, "")]
    for key in ("procName", "procPath", "parentProc", "coalitionName", "exception",
                "termination", "asi", "ktriageinfo", "largestProcess", "reason"):
        if body.get(key) not in (None, "", [], {}):
            lines.append(f"{key}: {cut(body[key])}")
    killed = [p for p in body.get("processes") or [] if isinstance(p, dict) and p.get("reason")]
    for process in killed[:CRASH_REPORTS]:
        lines.append(f"killed: {cut(process.get('name', '?'))} ({cut(process['reason'])})")
    return lines


def cache_log(minutes):
    """`log show` of the last `minutes` minutes' lines from simdiskimaged and the builder."""
    return ["log", "show", "--last", f"{minutes}m", "--style", "compact", "--predicate",
            'process == "simdiskimaged" OR process BEGINSWITH "update_dyld"']

# The files the steps write in OUT's logs/: the only ones the evidence job copies or links. All
# top-level files: a folder in logs/ is a stray.
LOG_NAMES = ("toolchain.txt", "xcodegen.txt", "simulators.txt", "build.log",
             "attachments-manifest.json", "runner.txt") + tuple(
    name for version in toolchain.IOS_RUNTIMES
    for name in (f"test-{version}.log", f"test-summary-{version}.json"))
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
FAILED_COMMANDS = "The following build commands failed:"
UDID = re.compile(r"[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}")


class LogFilter:
    """Which lines of a build log to print: those SHOWN matches, and the list of commands
    xcodebuild says failed, its indented lines and its count. That list names the cause when no
    `error:` line does: a package build plugin Xcode won't run untrusted fails with only
    `Validate plug-in "OpenAPIGenerator" in package "swift-openapi-generator"` in it (ADR-028)."""

    def __init__(self):
        self.listing = False

    def show(self, line):
        if self.listing and (line.startswith("\t") or re.match(r"\([0-9]+ failures?\)", line)):
            return True
        self.listing = FAILED_COMMANDS in line
        return self.listing or bool(SHOWN.search(line))


# What Xcode writes about package plugins in a build log (`ios` runs 41958887177 and 41961456622):
# its activity lines (`Compile plug-in “P” in package “K”`, `Validate plug-in …` when it refuses
# one, `Apply build tool plug-in “P” to target “T” in package “k”`), the folders a plugin's
# executable and its output go to, and the target each build command belongs to.
PLUGIN_ACTIVITY = re.compile(r"[A-Z][A-Za-z ]* plug-in \u201c")
PLUGIN_BUILT = re.compile(r"(?:Compile|Validate) plug-in \u201c([^\u201d]+)\u201d in package "
                          r"\u201c([^\u201d]+)\u201d")
PLUGIN_APPLIED = re.compile(r"Apply [a-z ]*plug-in \u201c([^\u201d]+)\u201d to target "
                            r"\u201c([^\u201d]+)\u201d")
PLUGIN_OUTPUT = re.compile(r"BuildToolPluginIntermediates/[^/\s]+\.output/([^/\s]+)/([\w-]+)")
PLUGIN_EXECUTABLE = re.compile(r"PluginExecutables/([\w-]+)")
TARGET_BUILT = re.compile(r"\(in target '([^']+)' from project ")


def package_plugin_problems(lines, allowed):
    """What a build log shows of package plugins outside `allowed` ({plugin: (package, targets)},
    toolchain.PACKAGE_PLUGINS), each said once: a plugin it doesn't list, a listed one from another
    package or on another target, a line about a plug-in this can't read, and a listed target
    built with no line saying its plugin was applied to it. The last means Xcode words its lines
    differently now, and the rest of this check would find nothing (ADR-028)."""
    problems, applied, built = [], set(), set()

    def problem(text):
        if text not in problems:
            problems.append(text)

    def check(plugin, package=None, target=None):
        if plugin not in allowed:
            problem(f"{plugin}, which isn't listed")
        elif package is not None and package != allowed[plugin][0]:
            problem(f"{plugin} from {package}, not {allowed[plugin][0]}")
        elif target is not None and target not in allowed[plugin][1]:
            problem(f"{plugin} on {target}")

    for line in lines:
        text = line.strip()
        if PLUGIN_ACTIVITY.match(text):
            compiled, applied_to = PLUGIN_BUILT.match(text), PLUGIN_APPLIED.match(text)
            if compiled:
                check(compiled[1], package=compiled[2])
            elif applied_to:
                check(applied_to[1], target=applied_to[2])
                applied.add((applied_to[1], applied_to[2]))
            else:
                problem(f"a line about a plug-in this check can't read: {text[:160]}")
        for found in PLUGIN_OUTPUT.finditer(line):
            check(found[2], target=found[1])
        for found in PLUGIN_EXECUTABLE.finditer(line):
            check(found[1])
        built.update(found[1] for found in TARGET_BUILT.finditer(line))
    for plugin, (_, targets) in allowed.items():
        for target in targets:
            if target in built and (plugin, target) not in applied:
                problem(f"{target} was built, but no line says {plugin} was applied to it")
    return problems


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
                shown = LogFilter()
                for line in process.stdout:
                    f.write(line)
                    f.flush()  # a step killed by its timeout still leaves its log
                    if shown.show(line):
                        print(line.rstrip("\n"), flush=True)
                return process.wait()
        except FileNotFoundError:
            # A missing program fails its command, as in a shell, so the step can still record
            # what it has (ImageMagick's install failing leaves the sheets step without montage).
            print(f"ios: {cmd[0]} isn't installed", flush=True)
            return 127

    def capture(self, cmd, env=None, cwd=None, timeout=None):
        """Runs cmd and answers its exit code, output and errors. With a timeout, a command
        still running then is stopped and answers 124, as `timeout(1)` does, with the output it
        wrote before."""
        try:
            result = subprocess.run(cmd, cwd=cwd or self.root, env=self._env(env),
                                    capture_output=True, text=True, errors="replace",
                                    timeout=timeout)
        except FileNotFoundError:
            return 127, "", f"{cmd[0]} isn't installed"
        except subprocess.TimeoutExpired as stopped:
            # On POSIX the output so far comes as bytes, even with text=True.
            out = stopped.stdout or ""
            if isinstance(out, bytes):
                out = out.decode("utf-8", "replace")
            return 124, out, f"{cmd[0]} didn't finish in {timeout} s, so it was stopped"
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


def build_key(build):
    """A runtime's build ("24C55", "24C5057p") as something to compare: its runs of digits as
    numbers and its runs of letters as text, so 24B9 is newer than 24A335."""
    return tuple((0, int(p)) if p.isdigit() else (1, p)
                 for p in re.findall(r"[0-9]+|[A-Za-z]+", str(build or "")))


def snapshot_runtime(root):
    """The runtime the snapshot tests run on: toolchain.SNAPSHOT_RUNTIME, when SNAPSHOT_RUNTIME_FILE
    is a regular file holding exactly that version, with at most one line break after it.
    ValueError for anything else: no file, another version (26.5, the runtime the interim named
    before `ios/b0-snapshot-interim`, among them), a second line, a space, CRLF, a byte outside
    ASCII, an empty file, a link, a folder or anything else that isn't a regular file. So the file
    can name only the founder's runtime (T58)."""
    path = os.path.join(root, *SNAPSHOT_RUNTIME_FILE.split("/"))
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        raise ValueError(f"{SNAPSHOT_RUNTIME_FILE} is missing: it must hold "
                         f"{toolchain.SNAPSHOT_RUNTIME!r} (toolchain.SNAPSHOT_RUNTIME), the "
                         "runtime the committed references are drawn on") from None
    except OSError as error:
        raise ValueError(f"{SNAPSHOT_RUNTIME_FILE} can't be read ({error.strerror})") from None
    if not stat.S_ISREG(info.st_mode):
        raise ValueError(f"{SNAPSHOT_RUNTIME_FILE} isn't a regular file (a link, a folder or "
                         "another kind of file), so it can't say which runtime the snapshot tests "
                         "run on")
    try:
        with open(path, "rb") as f:
            content = f.read(64)
    except OSError as error:
        raise ValueError(f"{SNAPSHOT_RUNTIME_FILE} can't be read ({error.strerror})") from None
    expected = toolchain.SNAPSHOT_RUNTIME.encode("ascii")
    if content not in (expected, expected + b"\n"):
        raise ValueError(f"{SNAPSHOT_RUNTIME_FILE} holds {content[:24]!r}: it may hold only "
                         f"{toolchain.SNAPSHOT_RUNTIME!r} (toolchain.SNAPSHOT_RUNTIME) and one "
                         "line break")
    return toolchain.SNAPSHOT_RUNTIME


def odd_draw_holds(line):
    """Whether a line ODD_DRAW matches whole also holds together as `settled` writes one: a
    digest for each draw; the last two draws the same when it settled; each draw it measures
    numbered once and in order, before the last; every draw whose digest isn't the last's
    measured; and no difference by more than 255 or by nothing. The digests are the first 4
    bytes of each draw's SHA-256, so two that differ may share them: a measured draw whose digest
    is the last's, and the last two alike when it didn't settle, both hold. So a line cut at a
    difference's boundary, which the pattern alone would read, is counted instead; a line cut
    inside a last `sizes differ`'s height still reads, as a shorter height."""
    found = ODD_DRAW.fullmatch(line)
    if not found:
        return False
    what, count, digests, measured = found.groups()
    count, digests = int(count), digests.split(" ")
    if len(digests) != count:
        return False
    numbers = [int(n) for n in ODD_DRAW_NUMBER.findall(measured)]
    differing = {k + 1 for k in range(count) if digests[k] != digests[-1]}
    return ((what != "settled after" or digests[-1] == digests[-2])
            and numbers == sorted(set(numbers)) and all(1 <= n < count for n in numbers)
            and differing <= set(numbers)
            and all(1 <= int(m) <= 255 for m in ODD_DRAW_LARGEST.findall(measured)))


def odd_draws(lines):
    """(the lines that read whole as `settled`'s warning, how many other lines hold
    ODD_DRAW_MARK or ODD_DRAW_TAIL) of a test log. A line that looks like the warning but isn't
    one, such as a failing test's message that quotes one, or a line cut (odd_draw_holds) or run
    into another, is counted, never copied."""
    found, unread = [], 0
    for line in lines:
        line = line.rstrip("\r\n")
        if ODD_DRAW_MARK not in line and ODD_DRAW_TAIL not in line:
            continue
        if odd_draw_holds(line):
            found.append(line)
        else:
            unread += 1
    return found, unread


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


def runtimes_of(runtimes, version):
    """The available iOS runtimes of `version`, whatever devices they list: each whose version is
    `version` or a patch of it (same_version)."""
    matching = []
    for runtime in runtimes:
        if not runtime.get("isAvailable", False):
            continue
        if runtime.get("platform") != "iOS" and \
                not str(runtime.get("identifier", "")).startswith("com.apple.CoreSimulator.SimRuntime.iOS-"):
            continue
        if not same_version(runtime.get("version"), version):
            continue
        matching.append(runtime)
    return matching


def same_version(found, version):
    """Whether `found` is `version` or starts with it and a dot: 27.2 matches 27.2 and 27.2.1,
    never 27.20 or 27.3."""
    found = str(found or "")
    return found == version or found.startswith(version + ".")


def pick_runtime(runtimes, version, device):
    """The available iOS runtime of `version` (runtimes_of) that supports the device type named
    `device`, or None. One that doesn't list the device is passed over: the `xcode-27` image has
    a second iOS 27.2 runtime, for iPhone Duo alone. Of those left, the newest by version, then by
    build, then by identifier, so simctl's order never decides. ValueError when one of them shares
    its identifier with another runtime of that version: simctl finds a runtime's devices and
    creates one by its identifier, so the device couldn't be told to be on the runtime chosen."""
    matching = runtimes_of(runtimes, version)
    found = [r for r in matching if pick_device_type(r, device) is not None]
    identifiers = [str(r.get("identifier", "")) for r in matching]
    shared = sorted({str(r.get("identifier", "")) for r in found
                     if identifiers.count(str(r.get("identifier", ""))) > 1})
    if shared:
        twins = [f"{r.get('identifier')} (iOS {r.get('version')}, build {r.get('buildversion')}, "
                 f"{len(r.get('supportedDeviceTypes') or [])} device types)"
                 for r in matching if str(r.get("identifier", "")) in shared]
        raise ValueError(f"iOS {version}'s runtimes share an identifier, so simctl can't tell "
                         "them apart: " + "; ".join(twins))
    return max(found, key=lambda r: (version_key(r.get("version")), build_key(r.get("buildversion")),
                                     str(r.get("identifier", ""))), default=None)


def asset_copy(image):
    """Whether `simctl runtime list -j`'s `image` is a MobileAsset's (under ASSET_IMAGES)."""
    return str(image.get("path") or "").startswith(ASSET_IMAGES)


def imported_image(image, state):
    """Whether `simctl runtime list -j`'s `image` is an imported one, with a path outside
    ASSET_IMAGES, in `state`."""
    return bool(image.get("path")) and not asset_copy(image) and image.get("state") == state


def image_line(image):
    return (f"{image.get('identifier')} ({image.get('build')}): {image.get('state')} on "
            f"{image.get('mountPath')}")


def pick_device_type(runtime, preferred):
    """The device type named `preferred` when the runtime supports it, else None: there is no
    other device, since another would change the snapshots' size and every test's layout."""
    for device in runtime.get("supportedDeviceTypes") or []:
        if isinstance(device, dict) and device.get("name") == preferred:
            return device
    return None


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


def evidence_path(branch, sha, full=False):
    """<branch>/<short-sha>/ios/ for a push; ios-full/ for a run by hand that carries every
    snapshot (a gate's set), so neither replaces the other. Each holds every runtime's logs."""
    parts = [p for p in branch.split("/")]
    if not branch or any(p in ("", ".", "..") for p in parts):
        raise ValueError(f"can't make an evidence path from the branch {branch!r}")
    if not re.fullmatch(r"[0-9a-f]{40}", sha or ""):
        raise ValueError(f"not a full commit SHA: {sha!r}")
    return f"{branch}/{sha[:7]}/" + ("ios-full" if full else "ios")


def last_lines(lines, what):
    """`what`'s header, saying how many lines it has, and its last CACHE_LINES lines."""
    kept = lines[-CACHE_LINES:]
    said = f"{len(lines)} line" + ("" if len(lines) == 1 else "s")
    if len(kept) < len(lines):
        said += f", the last {len(kept)} here"
    return f"--- {what}: {said}" + (":\n" + "\n".join(kept) if kept else "")


def duration(seconds):
    """`seconds` as the logs say a time taken: "41 s", "14 min 3 s"."""
    minutes, seconds = divmod(max(0, int(round(seconds))), 60)
    return f"{minutes} min {seconds} s" if minutes else f"{seconds} s"


def magick_text(text):
    """Text safe for montage's -title and -label: % and a backslash start escapes, and a
    leading @ reads a file, so none of them may reach it as written."""
    text = text.replace("\\", "\\\\").replace("%", "%%")
    return (" " + text) if text.startswith("@") else text


def select(entries, mode, changed_paths):
    """The entries a run's evidence carries: all of them (`full`), or (`touched`) those this run
    drew (changed, new) and those whose committed reference or render the branch changed."""
    if mode == "full":
        return list(entries)
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
                 sleep=time.sleep, sample_every=SAMPLE_EVERY, clock=time.monotonic):
        self.root = root
        self.shell = shell
        self.environ = os.environ if environ is None else environ
        self.require_app = require_app
        self.sleep = sleep
        # None turns the runner's samples off (sampling); the clock times boots and steps.
        self.sample_every = sample_every
        self.clock = clock
        self._runner_log = threading.Lock()
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

    def log_size(self, name):
        try:
            return os.path.getsize(self.log(name))
        except OSError:
            return 0

    def runner_sample(self, label, host=False, timeout=DIAG_TIMEOUT):
        """Appends one sample of the runner (RUNNER_SAMPLE) to logs/runner.txt, headed by the time
        it ended and `label`, and with the runner's hardware (RUNNER_HOST) first when `host`, each
        command given `timeout` seconds. Returns its load averages, as text, or None when the
        sample doesn't show them."""
        lines = []
        if host:
            code, out, err = self.shell.capture(RUNNER_HOST, env=self.xcode_env(),
                                                timeout=timeout)
            lines.append((out + err).strip() or f"({RUNNER_HOST[0]} exited {code})")
        code, out, err = self.shell.capture(RUNNER_SAMPLE, env=self.xcode_env(), timeout=timeout)
        parts = out.split("Processes:")
        sample = "Processes:" + parts[-1] if code == 0 and len(parts) > 2 else out + err
        lines.append(sample.strip() or f"({RUNNER_SAMPLE[0]} exited {code})")
        stamp = time.strftime("%H:%M:%S", time.gmtime())
        with self._runner_log:
            self.write_log("runner.txt", f"--- {stamp} UTC, {label}\n" + "\n".join(lines))
        found = LOAD_AVERAGES.search(sample)
        return " ".join(found.groups()) if found else None

    @contextlib.contextmanager
    def sampling(self, step, label, host=False):
        """Samples the runner (runner_sample) as `label`'s work starts, every self.sample_every
        seconds while it runs, and as it ends, which the step's output says, with how long the
        work took and the load averages then. Each sample is written as it's taken, so a step
        stopped by its timeout keeps those taken. The samples in between are taken beside the
        work, each given SAMPLE_TIMEOUT; the first costs it at most DIAG_TIMEOUT a command, and
        the end at most JOIN_TIMEOUT, waiting for a sample in progress, and DIAG_TIMEOUT for the
        last. A sample still running then is written when it ends, after the last. Off when
        self.sample_every is None, as in the tests that check a step's commands."""
        if self.sample_every is None:
            yield
            return
        started = self.clock()
        self.runner_sample(f"{label}: start", host=host)
        stop = threading.Event()

        def every():
            while not stop.wait(self.sample_every):
                self.runner_sample(label, timeout=SAMPLE_TIMEOUT)
        thread = threading.Thread(target=every, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            thread.join(JOIN_TIMEOUT)
            took = duration(self.clock() - started)
            load = self.runner_sample(f"{label}: end, after {took}")
            print(f"ios: {step}: {label} took {took}; the runner's load averages then: "
                  f"{load or 'unread'} (logs/runner.txt)", flush=True)

    def boot(self, udid, version, log_name, step):
        """`simctl bootstatus -b`, which boots the device and waits until it has finished
        booting; its log says how long that took, and so does the step's output. Returns its exit
        code. No sample here: the pass's own samples (sampling) show the runner after the boot."""
        started = self.clock()
        code = self.shell.run(["xcrun", "simctl", "bootstatus", udid, "-b"],
                              env=self.xcode_env(), log=self.log(log_name))
        took = duration(self.clock() - started)
        said = f"iOS {version}'s simulator {udid} " + (
            f"booted in {took}" if code == 0 else f"didn't boot, after {took} (exit {code})")
        self.write_log(log_name, said)
        if code == 0:
            print(f"ios: {step}: {said} (logs/{log_name})", flush=True)
        return code

    def cache_builder_output(self, since, started):
        """After a failed shared cache update, which started at self.clock() `started` and
        whose output simulators.txt holds from byte `since`: the end of each of the builder's
        output files that simctl's error names (CACHE_FILE), when it's under CACHE_FOLDER and
        neither it nor any folder above it is a link, read as root when the runner's user can't
        (where root resolves the path first); what that folder holds, under the same rule; and
        the system log's lines from simdiskimaged and the builder since a minute before the
        update started (cache_log). Each at most CACHE_LINES lines, appended to simulators.txt;
        each command as root is given DIAG_TIMEOUT seconds, and the system log
        CACHE_LOG_TIMEOUT. Only logged: why the update fails for the runner's user, and now and
        then as root too, isn't known (docs/LIMITATIONS.md, 2026-11-19 and 2026-11-20)."""
        try:
            with open(self.log("simulators.txt"), "rb") as f:
                f.seek(since)
                said = f.read().decode("utf-8", "replace")
        except OSError:
            said = ""
        paths = list(dict.fromkeys(CACHE_FILE.findall(said)))
        readable = [p for p in paths if os.path.normpath(p) == p and p.startswith(CACHE_FOLDER)]
        for path in paths:
            # realpath resolves a link at every level the runner's user can reach; a folder it
            # can't search is resolved by root below, before root reads anything.
            if path not in readable or os.path.realpath(path) != path:
                self.write_log("simulators.txt", f"--- {path}: " + (
                    "a link or under one, so not read" if path in readable else
                    f"not under {CACHE_FOLDER}, so not read"))
                continue
            try:
                with open(path, "rb") as f:
                    text = f.read().decode("utf-8", "replace")
            except FileNotFoundError:
                self.write_log("simulators.txt", f"--- {path}: not there")
                continue
            except OSError as error:
                # Read as root, as the update with sudo runs, when the runner's user can't, and
                # only when root resolves the path to itself, so no link is followed as root.
                said = f"--- {path}: {error.strerror or error}, and as root: "
                resolve = ["sudo", "-n", "realpath", path]
                code, out, err = self.shell.capture(resolve, env=self.xcode_env(),
                                                    timeout=DIAG_TIMEOUT)
                if code != 0 or out.strip() != path:
                    self.write_log("simulators.txt", said + (
                        f"{(out + err).strip()[:200]} (exit {code})" if code != 0 else
                        "a link or under one, so not read"))
                    continue
                tail = ["sudo", "-n", "tail", "-n", str(CACHE_LINES), path]
                code, out, err = self.shell.capture(tail, env=self.xcode_env(),
                                                    timeout=DIAG_TIMEOUT)
                if code != 0:
                    self.write_log("simulators.txt",
                                   said + f"{(out + err).strip()[:200]} (exit {code})")
                    continue
                # tail answers the last lines only, so the file's own length isn't known.
                kept = out.splitlines()
                self.write_log("simulators.txt",
                               f"--- {path}, read as root (`{' '.join(tail[2:5])}`): its last "
                               f"{len(kept)} line" + ("" if len(kept) == 1 else "s")
                               + (":\n" + "\n".join(kept) if kept else ""))
                continue
            self.write_log("simulators.txt", last_lines(text.splitlines(), path))
        for folder in sorted({os.path.dirname(p) for p in readable}):
            if os.path.realpath(folder) != folder:
                # scandir would follow the link, to a folder outside CACHE_FOLDER.
                self.write_log("simulators.txt",
                               f"--- {folder}: a link or under one, so not listed")
                continue
            try:
                found = sorted((e.name, e.stat(follow_symlinks=False).st_size)
                               for e in os.scandir(folder))
                listing = "\n".join(f"{name} ({size} bytes)" for name, size in found) or "empty"
            except OSError as error:
                listing = error.strerror or str(error)
            self.write_log("simulators.txt", f"--- {folder}:\n{listing}")
        log = cache_log(int((self.clock() - started) // 60) + 2)
        code, out, err = self.shell.capture(log, env=self.xcode_env(), timeout=CACHE_LOG_TIMEOUT)
        self.write_log("simulators.txt", last_lines((out + err).splitlines(),
                                                    f"{' '.join(log)} (exit {code})"))
        print("ios: simulator: the shared cache builder's output and the system log's lines "
              "about it are in logs/simulators.txt", flush=True)

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
        kept, and the snapshot runtime only when it is toolchain.SNAPSHOT_RUNTIME, the only one
        the simulator step can write; anything else shows as unknown."""
        allowed = {"snapshots": (toolchain.SNAPSHOT_RUNTIME,)}
        return {k: v for k, v in self.run_record().items()
                if k in RUN_KEYS and isinstance(v, str) and FACT.fullmatch(v)
                and (k not in allowed or v in allowed[k])}

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

    def evidence_target(self):
        """(path on the evidence branch, mode), from the run's own environment alone: a run by
        hand's full set (`full`) or a push's touched set (`touched`). sheets and publish both use
        it, so neither takes the folder from a file."""
        mode = "full" if self.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch" else "touched"
        path = evidence_path(self.environ.get("GITHUB_REF_NAME", ""),
                             self.environ.get("GITHUB_SHA", ""), full=mode == "full")
        return path, mode

    def project(self):
        found = sorted(n for n in os.listdir(self.path(*IOS_DIR.split("/")))
                       if n.endswith(".xcodeproj"))
        if len(found) != 1:
            raise ValueError(f"expected one .xcodeproj in {IOS_DIR} after XcodeGen, found {found}")
        return f"{IOS_DIR}/{found[0]}"

    def udid(self, version):
        """The pinned runtime `version`'s device, from run.json."""
        udid = self.run_record().get(f"udid-{version}")
        if not isinstance(udid, str) or not udid:
            raise ValueError(f"no iOS {version} simulator in run.json: the simulator step didn't "
                             "finish")
        return udid

    def destination(self, version):
        return f"platform=iOS Simulator,id={self.udid(version)}"

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
        # The snapshot runtime's file first, before any command: a bad one fails the step at once.
        try:
            snapshots = snapshot_runtime(self.root)
        except ValueError as error:
            print(f"ios: simulator: {error}")
            return 1
        with self.sampling("simulator", "the simulator step", host=True):
            return self.simulators(snapshots)

    def simulators(self, snapshots):
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
        # The first runtime is the build's destination, so it shares the SDK's major; none may be
        # of a later major than the SDK's, which Xcode couldn't build for.
        pinned, major = toolchain.IOS_RUNTIMES, version_key(sdk)[:1]
        if version_key(pinned[0])[:1] != major or any(version_key(v)[:1] > major for v in pinned):
            print(f"ios: simulator: Xcode {toolchain.XCODE_VERSION}'s simulator SDK is iOS {sdk}: "
                  f"the first pinned runtime, iOS {pinned[0]}, must share its major, and none of "
                  f"{', '.join(pinned)} may be of a later one (toolchain.IOS_RUNTIMES)")
            return 1
        runtimes = self.runtimes()
        if runtimes is None:
            return 1
        device = toolchain.SIMULATOR_DEVICE
        values = {"sdk": sdk, "snapshots": snapshots}
        for version in pinned:
            try:
                runtime = pick_runtime(runtimes, version, device)
                if runtime is None and version not in toolchain.IOS_DOWNLOADS:
                    # The image keeps three runtimes per Xcode, so a later one may lack this one;
                    # it is never downloaded unseen (toolchain.IOS_DOWNLOADS).
                    print(f"ios: simulator: the runner has no iOS {version} runtime with the "
                          f"{device}, and iOS {version} isn't one a run may download "
                          "(toolchain.IOS_DOWNLOADS): the runner image has changed "
                          "(logs/simulators.txt)")
                    return 1
                if runtime is None:
                    runtime = self.download(version)
            except ValueError as error:
                print(f"ios: simulator: {error}")
                return 1
            if runtime is None:
                print(f"ios: simulator: no available iOS {version} runtime with the {device} "
                      "(logs/simulators.txt)")
                return 1
            device_type = pick_device_type(runtime, device)
            identifier = str(runtime.get("identifier") or "")
            if device_type is None or not device_type.get("identifier") or not identifier:
                print(f"ios: simulator: iOS {version}'s runtime doesn't list the {device} with "
                      "its identifier (toolchain.SIMULATOR_DEVICE)")
                return 1
            udid = self.existing_device(runtime, device_type["name"])
            if udid is None:
                code, out, err = self.shell.capture(
                    ["xcrun", "simctl", "create", f"Tadayo {device_type['name']}",
                     device_type["identifier"], identifier], env=env)
                udid = out.strip()
                if code != 0 or not UDID.fullmatch(udid):
                    print(f"ios: simulator: couldn't make a {device_type['name']} on iOS "
                          f"{version}: {(out + err).strip()}")
                    return 1
            # simctl lists each device under its runtime's identifier: the one found or made must
            # be on the runtime chosen.
            on = self.device_runtime(udid)
            if on != identifier:
                print(f"ios: simulator: the {device_type['name']} {udid} is on "
                      f"{on or 'no runtime simctl lists'}, not on iOS {version}'s {identifier}")
                return 1
            build = str(runtime.get("buildversion") or "")
            self.write_log("simulators.txt", f"iOS {version}: runtime {identifier}, build "
                                             f"{build or '?'}, version {runtime.get('version')}; "
                                             f"{device_type['name']} {udid}")
            values.update({f"ios-{version}": runtime.get("version"),
                           f"runtime-{version}": identifier,
                           f"runtime-build-{version}": build or None,
                           f"device-{version}": device_type["name"], f"udid-{version}": udid})
        # No device is booted here: the test step boots each pass's just before the pass, so no
        # simulator runs beside the build. In `ios` run 44794160395 the booted iOS 27.2
        # simulator's own services (its diagnosticd, apsd, BackgroundShortcutRunner, widgets)
        # were among the busiest processes all through a 20-minute build, on a runner whose
        # three CPUs showed no idle time in any sample of it (docs/LIMITATIONS.md, 2026-11-20).
        # xcodebuild builds for a device that is shut down.
        self.update_run_record(**values)
        self.write_log("simulators.txt", f"The snapshot tests run on iOS {snapshots} "
                                         f"({SNAPSHOT_SOURCE}).")
        print("ios: simulator: " + "; ".join(
            f"iOS {values[f'ios-{v}']} on {values[f'device-{v}']} ({values[f'udid-{v}']})"
            for v in pinned) + f"; the snapshot tests on iOS {snapshots} ({SNAPSHOT_SOURCE})")
        return 0

    def download(self, version):
        """Downloads iOS `version` to a file, imports it, and returns its runtime that supports
        toolchain.SIMULATOR_DEVICE, or None.

        Why a file and an import: a plain `-downloadPlatform` installs the runtime as a
        MobileAsset, and the `xcode-27` image moves a MobileAsset runtime's volume between two
        mounts while it runs (RUNNER_IMAGES_ISSUE); a test process loaded from the first stalls
        when it moves, and Xcode restarts the test runner a minute later. The download with
        `-exportPath` registers and mounts the MobileAsset copy as well, and the import adds an
        image of its own, on a second volume; the copy then turns unusable, and
        drop_asset_copies deletes it, so simctl lists no MobileAsset image of iOS `version`
        when the shared cache is updated and the devices are made. The copy's volume stays
        mounted, and a pass has loaded the runtime from either volume. In the runs that
        imported, neither volume moved and no pass stalled; why the import stops the moves isn't
        shown (`docs/LIMITATIONS.md`, 2026-11-13). So the step logs where the runtime is
        (runtime_place) once installed, and the test step before and after its pass. Only an
        imported image of the runtime that simctl says is Ready counts as installed, which
        proves the import ran: a MobileAsset one alone fails the step.

        Whether each step worked is read from simctl, not from xcodebuild's exit code: Xcode has
        been seen to fall back to the newest runtime when a version isn't available, and to
        print "not available for download" for a proxy failure. A plain download comes first,
        then the universal variant, which some Xcode 26 releases need (GitHub's own image
        installer asks for it); not when simctl lists iOS `version` after the plain one but
        without that device, which the universal variant wouldn't change. ValueError from
        pick_runtime."""
        env, device = self.xcode_env(), toolchain.SIMULATOR_DEVICE
        export = self.work_path("runtime-export")
        for variant in ([], ["-architectureVariant", "universal"]):
            print(f"ios: simulator: the runner has no iOS {version} simulator; downloading it"
                  + (" (universal variant)" if variant else ""))
            shutil.rmtree(export, ignore_errors=True)
            os.makedirs(export, exist_ok=True)
            code = self.shell.run(["xcodebuild", "-downloadPlatform", "iOS", "-buildVersion",
                                   version, "-exportPath", export] + variant, env=env,
                                  log=self.log("simulators.txt"))
            self.write_log("simulators.txt", f"(exit {code})")
            bundles = sorted(n for n in os.listdir(export) if n.endswith(".exportedBundle"))
            self.write_log("simulators.txt", "exported: " + (", ".join(bundles) or "nothing"))
            if len(bundles) == 1:
                bundle = os.path.join(export, bundles[0])
                code = self.shell.run(["xcodebuild", "-importPlatform", bundle], env=env,
                                      log=self.log("simulators.txt"))
                self.write_log("simulators.txt", f"(exit {code})")
                if self.imported(version) is False:
                    # The runner image of 2026-11-19 (xcode-27-arm64 20261119.0378, macOS 27.2)
                    # refuses the import to the runner's own user: "Requires elevated
                    # privileges: Copying a directory source requires sudo" (exit 70), where the
                    # image before it took it. So an import that left no image is run again
                    # as root, once for each download variant tried, which the runner's user
                    # may do without a password (`-n` fails rather than ask). sudo drops the
                    # environment, so the pinned Xcode is named on its line; `-H` gives root
                    # its own home, so nothing root makes lands in the runner user's Library,
                    # where a later step couldn't write over it. simctl's list still decides
                    # whether it worked (`docs/LIMITATIONS.md`, 2026-11-19).
                    print(f"ios: simulator: the import left no imported image of iOS {version}; "
                          "importing again with sudo")
                    code = self.shell.run(
                        ["sudo", "-n", "-H", "env", f"DEVELOPER_DIR={env['DEVELOPER_DIR']}",
                         "xcodebuild", "-importPlatform", bundle], env=env,
                        log=self.log("simulators.txt"))
                    self.write_log("simulators.txt", f"(exit {code})")
            images = self.drop_asset_copies(version)
            if images is None:
                return None
            listed = self.runtimes() or []
            runtime = pick_runtime(listed, version, device)
            if runtime is None and runtimes_of(listed, version):
                print(f"ios: simulator: simctl lists iOS {version} after the download, but no "
                      f"runtime of it with the {device} (logs/simulators.txt)")
                return None
            if runtime is not None:
                # One without an identifier fails the simulator step after this.
                if runtime.get("identifier"):
                    identifier = str(runtime["identifier"])
                    imported = [i for i in images if imported_image(i, "Ready")
                                and i.get("runtimeIdentifier") == identifier]
                    if not imported:
                        print(f"ios: simulator: simctl lists no imported image of iOS {version} "
                              f"({identifier}) that is Ready, and a downloaded one alone would "
                              f"move mid-run ({RUNNER_IMAGES_ISSUE}; logs/simulators.txt)")
                        return None
                    place = self.runtime_place(identifier, runtime.get("buildversion"))
                    self.write_log("simulators.txt", f"iOS {version}: imported image "
                                                     f"{image_line(imported[0])}; the runtime: "
                                                     f"{place or 'unreadable'}")
                    # As GitHub's image installer does after adding a runtime (there with
                    # --all), and as Apple's Xcode 26.1 notes advise before a first boot; only
                    # for this runtime, since the image's own already have theirs (`simctl help
                    # runtime`: `dyld_shared_cache update (<runtime> || --all)`). A failure here
                    # is logged and said, not fatal: the first boot then builds the cache, in the
                    # test step's time.
                    since, started = self.log_size("simulators.txt"), self.clock()
                    cache = self.shell.run(["xcrun", "simctl", "runtime", "dyld_shared_cache",
                                            "update", identifier], env=env,
                                           log=self.log("simulators.txt"))
                    self.write_log("simulators.txt", f"(exit {cache})")
                    if cache != 0:
                        self.cache_builder_output(since, started)
                        # On the runner image of 2026-11-19, where the import ran as root, the
                        # update exited 25 ("Child process exited with an error") and the pass
                        # on iOS 26.5 that followed ran slower and failed two keyboard tests
                        # that pass with the cache (`docs/LIMITATIONS.md`, 2026-11-19). Run
                        # once more as root, in the import's form, it answered "dyld shared
                        # cache is usable" and both tests passed. The two files of the
                        # builder's output that simctl names weren't there when looked for
                        # (`ios` run 44655516106), so why the runner's user can't build it
                        # isn't known. Any failed update is run again this way, whatever the
                        # image. Still not fatal: the tests say whether it mattered. Since
                        # 2026-11-20 the builder's own output is copied into the log after each
                        # failed update (cache_builder_output), before anything runs again.
                        print(f"ios: simulator: updating iOS {version}'s shared cache exited "
                              f"{cache}; updating it again with sudo")
                        since, started = self.log_size("simulators.txt"), self.clock()
                        cache = self.shell.run(
                            ["sudo", "-n", "-H", "env", f"DEVELOPER_DIR={env['DEVELOPER_DIR']}",
                             "xcrun", "simctl", "runtime", "dyld_shared_cache", "update",
                             identifier], env=env, log=self.log("simulators.txt"))
                        self.write_log("simulators.txt", f"(exit {cache})")
                        if cache != 0:
                            self.cache_builder_output(since, started)
                    if cache != 0:
                        print(f"ios: simulator: updating iOS {version}'s shared cache exited "
                              f"{cache}, so its first boot builds it (logs/simulators.txt)")
                return runtime
        print(f"ios: simulator: couldn't install iOS {version} (logs/simulators.txt)")
        return None

    def runtime_images(self):
        """`xcrun simctl runtime list -j`'s images of iOS simulator runtimes, as a list, written
        to logs/simulators.txt; None when it can't be read."""
        cmd = ["xcrun", "simctl", "runtime", "list", "-j"]
        code, out, err = self.shell.capture(cmd, env=self.xcode_env())
        self.write_log("simulators.txt", "+ " + " ".join(cmd) + "\n" + out + err)
        try:
            images = json.loads(out) if code == 0 else None
        except ValueError:
            images = None
        if not isinstance(images, dict):
            return None
        return [i for i in images.values()
                if isinstance(i, dict) and i.get("platformIdentifier") == SIMULATOR_PLATFORM]

    def imported(self, version):
        """Whether simctl lists an imported image of iOS `version` that is Ready; None when its
        list can't be read, which drop_asset_copies then says."""
        images = self.runtime_images()
        if images is None:
            return None
        return any(imported_image(i, "Ready") and same_version(i.get("version"), version)
                   for i in images)

    def drop_asset_copies(self, version):
        """Deletes the MobileAsset copies of iOS `version` once an imported image of it is Ready,
        and returns simctl's images of iOS `version` after, or None (said) when they can't be
        read. simctl has been seen to exit 30 on such a delete ("Removed the runtime, but did not
        reclaim its MobileAsset") with the copy gone from its list, so the list decides. A copy
        it still lists is said, not fatal: the one run that kept it listed (`-mount-c`) passed
        all but one hosted test, slowly, and the copy left the list during its iOS 27.2 pass."""
        images = self.runtime_images()
        if images is None:
            print("ios: simulator: can't read `xcrun simctl runtime list -j` "
                  "(logs/simulators.txt)")
            return None
        mine = [i for i in images if same_version(i.get("version"), version)]
        copies = [i for i in mine if asset_copy(i)]
        if not copies or not [i for i in mine if imported_image(i, "Ready")]:
            return mine
        for copy in copies:
            code = self.shell.run(["xcrun", "simctl", "runtime", "delete",
                                   str(copy.get("identifier"))], env=self.xcode_env(),
                                  log=self.log("simulators.txt"))
            self.write_log("simulators.txt", f"(exit {code})")
        images = self.runtime_images()
        if images is None:
            print("ios: simulator: can't read `xcrun simctl runtime list -j` "
                  "(logs/simulators.txt)")
            return None
        mine = [i for i in images if same_version(i.get("version"), version)]
        if [i for i in mine if asset_copy(i)]:
            print(f"ios: simulator: simctl still lists the downloaded copy of iOS {version} "
                  "beside the imported one, which the image may move mid-run "
                  f"({RUNNER_IMAGES_ISSUE}; logs/simulators.txt)")
        return mine

    def runtime_place(self, identifier, build):
        """Where the runtime `identifier` is, for the logs: the bundle `simctl list runtimes
        --json` gives for it, and the volumes `mount` lists for its build (named iOS_<build> on
        the `xcode-27` image), or None when either can't be read."""
        code, out, _ = self.shell.capture(["xcrun", "simctl", "list", "runtimes", "--json"],
                                          env=self.xcode_env())
        try:
            runtimes = json.loads(out)["runtimes"] if code == 0 else None
        except (ValueError, KeyError, TypeError):
            runtimes = None
        mounted, table, _ = self.shell.capture(["mount"], env=self.xcode_env())
        if not isinstance(runtimes, list) or mounted != 0:
            return None
        bundle = next((str(r.get("bundlePath") or "no bundle path") for r in runtimes
                       if isinstance(r, dict) and r.get("identifier") == identifier),
                      "not listed")
        volumes = set()
        for line in table.splitlines() if build else []:
            if " on " in line:
                point = line.split(" on ", 1)[1].split(" (", 1)[0]
                name = point.rsplit("/", 1)[-1]
                if name == f"iOS_{build}" or name.startswith(f"iOS_{build}_"):
                    volumes.add(point)
        return f"{bundle}; volumes: {', '.join(sorted(volumes)) or 'none'}"

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

    def devices(self):
        """`simctl list devices --json`'s devices, {runtime identifier: [device]}; {} when it
        can't be read."""
        code, out, _ = self.shell.capture(["xcrun", "simctl", "list", "devices", "--json"],
                                          env=self.xcode_env())
        try:
            devices = json.loads(out)["devices"] if code == 0 else {}
        except (ValueError, KeyError, TypeError):
            devices = {}
        return devices if isinstance(devices, dict) else {}

    def existing_device(self, runtime, name):
        devices = self.devices().get(runtime["identifier"], [])
        for device in devices if isinstance(devices, list) else []:
            if isinstance(device, dict) and device.get("name") == name and \
                    device.get("isAvailable", False):
                return device.get("udid")
        return None

    def device_runtime(self, udid):
        """The identifier of the runtime simctl lists the device `udid` under, or None."""
        for identifier, devices in self.devices().items():
            for device in devices if isinstance(devices, list) else []:
                if isinstance(device, dict) and device.get("udid") == udid:
                    return identifier
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
            # Built once, for the first runtime's device; the test step runs it on each runtime.
            project, destination = self.project(), self.destination(toolchain.IOS_RUNTIMES[0])
            targets = self.scheme_targets(project)
        except (OSError, ValueError, ElementTree.ParseError, KeyError) as error:
            print(f"ios: build: {error}")
            return 1
        # xcodebuild refuses build-for-testing for a scheme with no test target ("not currently
        # configured for the build-for-testing action"), as the app's first commits have.
        action = "build-for-testing" if targets else "build"
        # -skipPackagePluginValidation lets Xcode run the package build plugins in the graph
        # without asking a person to trust each one first, which CI can't do: TadayoAPI's client
        # is generated by the Swift OpenAPI Generator's plugin on every build (ADR-028).
        with self.sampling("build", "the build"):
            code = self.shell.run(["xcodebuild", action, "-project", project,
                                   "-scheme", SCHEME, "-destination", destination,
                                   "-derivedDataPath", self.derived_data(),
                                   "-skipPackagePluginValidation"],
                                  env=self.xcode_env(), log=self.log("build.log"))
        # The flag trusts every plugin in the graph, so the log is checked for the plugins Xcode
        # ran: only toolchain.PACKAGE_PLUGINS', from their package, on their targets.
        plugins = self.plugin_problems()
        if plugins:
            print("ios: build: the package plugins in logs/build.log aren't the ones "
                  "toolchain.PACKAGE_PLUGINS allows (ADR-028): " + "; ".join(plugins[:10]))
            return code or 1
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

    def plugin_problems(self):
        try:
            with open(self.log("build.log"), encoding="utf-8", errors="replace") as f:
                return package_plugin_problems(f, toolchain.PACKAGE_PLUGINS)
        except OSError as error:
            return [f"logs/build.log can't be read ({error.strerror})"]

    def test(self):
        # The snapshot runtime's file first, before any command, as in the simulator step.
        try:
            snapshots = snapshot_runtime(self.root)
        except ValueError as error:
            print(f"ios: test: {error}")
            return 1
        pinned = toolchain.IOS_RUNTIMES
        try:
            project = self.project()
            udids = {version: self.udid(version) for version in pinned}
            targets = self.scheme_targets(project)
        except (OSError, ValueError, ElementTree.ParseError, KeyError) as error:
            print(f"ios: test: {error}")
            return 1
        if snapshots not in pinned:
            # Never so with the pins ios_steps_test.py checks; else no pass would run them.
            print(f"ios: test: the snapshot runtime, iOS {snapshots}, isn't one of "
                  f"{', '.join(pinned)} (toolchain.IOS_RUNTIMES), so no pass would run the snapshot "
                  "tests")
            return 1
        recording = self.recording_tests()
        if recording:
            print("ios: test: these set swift-snapshot-testing's record mode themselves, which "
                  "would override CI's `never` (docs/TECH-DESIGN.md section 2: CI never records): "
                  + "; ".join(recording[:10]))
            return 1
        if not targets:
            print(f"ios: test: the scheme {SCHEME} has no tests yet, so there is nothing to test")
            self.update_run_record(tests="none", **{f"tests-{v}": "none" for v in pinned})
            return 0
        print(f"ios: test: the snapshot tests run on iOS {snapshots} ({SNAPSHOT_SOURCE})")
        artifacts = self.out_path("artifacts")
        os.makedirs(artifacts, exist_ok=True)
        # Each pass boots its own device: the simulator step boots none.
        results, failure, booted = {}, 0, None

        def record(version, result):
            # Each pass is recorded as it ends, so a step stopped by its timeout during a later
            # pass still shows the earlier passes' results.
            results[version] = result
            self.update_run_record(**{f"tests-{version}": result})
        for version in pinned:
            udid = udids[version]
            snapshot_pass = version == snapshots
            skipped = [] if snapshot_pass else \
                [t for t in targets if t.endswith(SNAPSHOT_TARGET_SUFFIX)]
            if skipped:
                print(f"ios: test: iOS {version} runs without the snapshot tests, which run on "
                      f"iOS {snapshots}: skipping {', '.join(skipped)}")
            if not [t for t in targets if t not in skipped]:
                print(f"ios: test: no test target is left to run on iOS {version}")
                record(version, "none")
                continue
            with self.sampling("test", f"the pass on iOS {version}"):
                code = self.test_pass(version, udid, booted, skipped, snapshot_pass, project,
                                      artifacts)
            booted = udid
            if code is None:
                print(f"ios: test: the iOS {version} simulator {udid} didn't boot "
                      f"(logs/test-{version}.log)")
                record(version, "failed")
                failure = failure or 1
                continue
            record(version, "passed" if code == 0 else "failed")
            if code != 0:
                failure = failure or code
                print(f"ios: test: tests failed on iOS {version} (logs/test-{version}.log, "
                      f"logs/test-summary-{version}.json)")
        ran = [r for r in results.values() if r != "none"]
        overall = "failed" if "failed" in ran else "passed" if ran else "none"
        self.update_run_record(tests=overall, **{f"tests-{v}": r for v, r in results.items()})
        # The backstop for a record mode RECORDING can't see, once, after every pass: under
        # `never`, nothing is written under __Snapshots__.
        recorded = self.recorded_snapshots()
        if recorded is None:
            print("ios: test: git couldn't say whether the run wrote a reference")
            return failure or 1
        if recorded:
            self.update_run_record(tests="failed")
            print("ios: test: the run wrote these references although CI never records (a "
                  "record mode set in code): " + "; ".join(sorted(recorded)[:10]))
            return failure or 1
        if failure:
            print("ios: test: " + ", ".join(f"iOS {v} {r}" for v, r in results.items()) + "; the "
                  "evidence job still publishes what they drew")
        return failure

    def test_pass(self, version, udid, booted, skipped, snapshot_pass, project, artifacts):
        """One pass of the tests on iOS `version`: boots its device first when it isn't the one
        booted, shutting that one down when there is one (one simulator at a time on the runner;
        a failed shutdown is logged, not fatal). Returns xcodebuild's exit code, or None when the
        device didn't boot."""
        log = self.log(f"test-{version}.log")
        if udid != booted:
            if booted is not None:
                self.shell.run(["xcrun", "simctl", "shutdown", booted], env=self.xcode_env(),
                               log=log)
            if self.boot(udid, version, f"test-{version}.log", "test") != 0:
                return None
        since = time.time()
        bundle = self.out_path(f"Tests-{version}.xcresult")
        shutil.rmtree(bundle, ignore_errors=True)
        cmd = ["xcodebuild", "test-without-building", "-project", project, "-scheme", SCHEME,
               "-destination", self.destination(version),
               "-derivedDataPath", self.derived_data(), "-resultBundlePath", bundle,
               "-skipPackagePluginValidation"]
        for target in skipped:
            cmd += ["-skip-testing", target]
        env = {"TEST_RUNNER_SNAPSHOT_TESTING_RECORD": "never"}
        if snapshot_pass:
            env["TEST_RUNNER_SNAPSHOT_ARTIFACTS"] = artifacts
        # The image moved a downloaded runtime mid-run before the import
        # (RUNNER_IMAGES_ISSUE): its pass's log says where it is, before and after, and the
        # step says so when that changed. Never what decides the pass.
        place = None
        if version in toolchain.IOS_DOWNLOADS:
            facts = self.run_record()
            where = (facts.get(f"runtime-{version}"), facts.get(f"runtime-build-{version}"))
            place = self.runtime_place(*where)
            self.write_log(f"test-{version}.log", f"iOS {version} before the pass: "
                                                  f"{place or 'unreadable'}")
        code = self.shell.run(cmd, env=self.xcode_env(env), log=log)
        if version in toolchain.IOS_DOWNLOADS:
            after = self.runtime_place(*where)
            self.write_log(f"test-{version}.log", f"iOS {version} after the pass: "
                                                  f"{after or 'unreadable'}")
            if place is not None and after is not None and after != place:
                print(f"ios: test: iOS {version}'s runtime moved during its pass "
                      f"({RUNNER_IMAGES_ISSUE}): {place} became {after} "
                      f"(logs/test-{version}.log)")
        _, summary, err = self.shell.capture(
            ["xcrun", "xcresulttool", "get", "test-results", "summary", "--path", bundle,
             "--compact"], env=self.xcode_env())
        self.write_log(f"test-summary-{version}.json", summary or err)
        self.crash_reports(version, since)
        if code != 0:
            self.service_exits(version, udid, since)
        return code

    def service_exits(self, version, udid, since):
        """Appends the simulator's log lines about services that exited since `since` (a
        time.time()) to logs/crashes-<version>.txt, SERVICE_LOG_LINES at most; says so when the
        log couldn't be read, and writes nothing when it has no such line."""
        start = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(since))
        code, out, err = self.shell.capture(
            ["xcrun", "simctl", "spawn", udid, "log", "show", "--style", "compact", "--start",
             start, "--predicate", SERVICE_LOG_PREDICATE], env=self.xcode_env(),
            timeout=SERVICE_LOG_TIMEOUT)
        lines = [line for line in out.splitlines()
                 if line.strip() and not line.startswith(("Timestamp", "Filtering the log"))]
        if code != 0:
            text = f"(the simulator's log couldn't be read: exit {code}: {err.strip()[:CRASH_FIELD]})"
        elif not lines:
            return
        else:
            more = len(lines) - SERVICE_LOG_LINES
            text = "\n".join(lines[:SERVICE_LOG_LINES]
                             + ([f"({more} more line(s) not kept)"] if more > 0 else []))
        self.write_log(f"crashes-{version}.txt",
                       "--- the simulator's log: services that exited during the pass\n" + text)

    def crash_reports(self, version, since):
        """Writes a summary of each crash or jetsam report in CRASH_FOLDERS changed at or after
        `since` (a time.time()) to logs/crashes-<version>.txt, CRASH_REPORTS at most, oldest
        first, and says in the step's output which processes they name. Writes nothing when there
        is none. A folder or report that can't be read is passed over, said in the log."""
        found, problems = [], []
        for folder in CRASH_FOLDERS:
            folder = os.path.expanduser(folder)
            try:
                names = os.listdir(folder)
            except FileNotFoundError:
                continue
            except OSError as error:
                problems.append(f"{folder}: {error.strerror or error}")
                continue
            for name in names:
                full = os.path.join(folder, name)
                try:
                    changed = os.stat(full).st_mtime
                except OSError:
                    continue
                if name.endswith(CRASH_SUFFIXES) and changed >= since:
                    found.append((changed, full))
        if not found and not problems:
            return
        found.sort()
        lines, named = [], []
        for changed, full in found[:CRASH_REPORTS]:
            stamp = time.strftime("%H:%M:%S", time.gmtime(changed))
            try:
                with open(full, encoding="utf-8", errors="replace") as f:
                    summary = crash_summary(f.read(CRASH_BYTES))
            except OSError as error:
                summary = [f"(unreadable: {error.strerror or error})"]
            lines.append(f"--- {stamp} UTC, {full}")
            lines.extend(summary)
            killed = [line[len("killed: "):].split(" (")[0] for line in summary
                      if line.startswith("killed: ")]
            named.append(next((line.split(": ", 1)[1] for line in summary
                               if line.startswith(("procName: ", "name: "))),
                              f"jetsam: {' '.join(killed)}" if killed
                              else os.path.basename(full)))
        if len(found) > CRASH_REPORTS:
            lines.append(f"({len(found) - CRASH_REPORTS} later report(s) not read)")
        lines.extend(f"(unreadable folder: {problem})" for problem in problems)
        self.write_log(f"crashes-{version}.txt", "\n".join(lines))
        if found:
            print(f"ios: test: {len(found)} crash or jetsam report(s) during the iOS {version} "
                  f"pass (logs/crashes-{version}.txt): {', '.join(named[:10])}")

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
        for test, name, source in self.new_snapshots(self.collected_runtime()):
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

    def collected_runtime(self):
        """The runtime whose pass ran the snapshot tests: run.json's `snapshots`, written by the
        simulator step, when it is toolchain.SNAPSHOT_RUNTIME; else snapshot_runtime()'s (the
        simulator step didn't finish). None, said, when the file is missing or bad: collect then
        exports nothing."""
        written = self.run_record().get("snapshots")
        if written == toolchain.SNAPSHOT_RUNTIME:
            return written
        try:
            return snapshot_runtime(self.root)
        except ValueError as error:
            print(f"ios: collect: {error}; so no result bundle is read for new snapshots")
            return None

    def new_snapshots(self, version):
        """(test, file name, exported path) for each snapshot the snapshot runtime's result
        bundle, Tests-<version>.xcresult, holds because it had no reference (swift-snapshot-testing
        attaches it under record mode `never`)."""
        if version is None:
            return []
        bundle = self.out_path(f"Tests-{version}.xcresult")
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
        # The snapshots are the snapshot runtime's, so the labels name it, its device and why it
        # is the references' runtime.
        snapshots = record.get("snapshots")
        drawn = (f"iOS {record.get(f'ios-{snapshots}', '?')} · {record.get(f'device-{snapshots}', '?')}"
                 if snapshots else "iOS ? · ?")
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
            run = (f"{drawn}\nreferences: {self.references(record)}\n"
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
        # The odd draws, from the snapshot runtime's test log as staged: the snapshot tests run
        # in no other pass (SNAPSHOT_TARGET_SUFFIX). None when the log isn't there.
        odd, unread, odd_log = None, 0, f"test-{snapshots}.log" if snapshots else None
        if odd_log and os.path.isfile(os.path.join(stage, "logs", odd_log)):
            with open(os.path.join(stage, "logs", odd_log), encoding="utf-8",
                      errors="replace") as f:
                odd, unread = odd_draws(f)
        if strays:
            notes.append(f"The build job's logs/ held {strays} other entr"
                         f"{'y' if strays == 1 else 'ies'}, not a log its steps write, so "
                         f"{'it is' if strays == 1 else 'they are'} left out and this step fails.")
        # run.json's checked values, never the file as the build job wrote it, and the odd
        # draws this job read.
        if os.path.isfile(self.out_path("run.json")):
            staged = dict(record)
            if odd is not None:
                staged.update({"odd-draws": odd, "odd-draws-unread": unread})
            with open(os.path.join(stage, "run.json"), "w", encoding="utf-8") as f:
                json.dump(staged, f, indent=2, sort_keys=True)
        left_out = len(good) - len(chosen)
        self.write_index(stage, path, mode, record, rows, left_out, notes,
                         (odd_log, odd, unread))
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
        if odd is not None:
            print(f"ios: sheets: {len(odd)} odd draw(s) in logs/{odd_log}"
                  + (f", and {unread} other line(s) like `{ODD_DRAW_MARK.strip()}`'s"
                     if unread else ""))
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
    def references(record):
        """Which runtime the committed references are for, and why, from run.json's checked
        values (run_facts): "iOS 27.2 (the ios-version file)"."""
        if not record.get("snapshots"):
            return "unknown: the simulator step didn't record their runtime"
        return f"iOS {record['snapshots']} ({SNAPSHOT_SOURCE})"

    @staticmethod
    def status_words(entry, note):
        words = {"changed": "changed in this run", "new": "new: no committed reference",
                 "committed": "the committed reference"}[entry["status"]]
        return f"{words}\n{note}" if note else words

    def write_index(self, stage, path, mode, record, rows, left_out, notes,
                    odd=(None, None, 0)):
        """index.md. odd: (the snapshot runtime's test log, the odd draws read from it or None
        when it isn't staged, how many other lines name the warning)."""
        server = self.environ.get("GITHUB_SERVER_URL", "https://github.com")
        repo = self.environ.get("GITHUB_REPOSITORY", "")
        base = f"{server}/{repo}/blob/{EVIDENCE_BRANCH}/{urllib.parse.quote(path)}"
        run = (f"{server}/{repo}/actions/runs/{self.environ['GITHUB_RUN_ID']}"
               if self.environ.get("GITHUB_RUN_ID") else "this run")
        what = {"touched": "the states this branch touches", "full": "every snapshot (a run by "
                "hand, for a gate)"}[mode]
        snapshots = record.get("snapshots")
        lines = [f"# {path}", "",
                 f"The `ios` workflow's evidence for `{self.environ.get('GITHUB_SHA', '')}` "
                 f"({run}).", "",
                 # Each value passed FACT, which has no backtick, and sits in a code span; a
                 # pinned version passed the pins' tests.
                 f"- Xcode `{record.get('xcode', '?')}`, Swift `{record.get('swift', '?')}`, "
                 f"simulator SDK `{record.get('sdk', '?')}`"]
        for version in toolchain.IOS_RUNTIMES:
            which = ("with the snapshot tests" if version == snapshots else
                     "without the snapshot tests" if snapshots else "the snapshot tests unknown")
            lines.append(f"- iOS `{record.get(f'ios-{version}', version)}` on "
                         f"`{record.get(f'device-{version}', '?')}`: tests "
                         f"`{record.get(f'tests-{version}', 'not run')}`, {which}")
        references = (f"iOS `{snapshots}` ({SNAPSHOT_SOURCE})" if snapshots else
                      "unknown: the simulator step didn't record their runtime")
        odd_log, odd, unread = odd
        if odd_log is None:
            odd_draws_line = "unknown: the simulator step didn't record the snapshot runtime"
        elif odd is None:
            odd_draws_line = f"unknown: no `logs/{odd_log}`"
        else:
            odd_draws_line = (f"{len(odd) or 'none'} in `logs/{odd_log}`"
                              + (", below" if odd else ""))
            if unread:
                odd_draws_line += (f"; {unread} other line(s) there look like "
                                   f"`{ODD_DRAW_MARK.strip()}` but don't read as one")
        lines += [f"- References: {references}",
                  f"- Tests: `{record.get('tests', 'not run')}`",
                  f"- Odd draws: {odd_draws_line}",
                  f"- Carries {what}; {left_out} snapshot(s) not carried", ""]
        lines += [f"{n}" for n in notes] + ([""] if notes else [])
        if odd:
            # Each line matched ODD_DRAW whole, so none holds a backtick.
            lines += ["Odd draws: each a screen whose drawing took a third draw or more "
                      "(`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, "
                      "2026-11-14). One odd draw passes; a second, or no two draws alike, fails "
                      "the test.", ""]
            lines += [f"- `{line}`" for line in odd[:ODD_DRAWS_SHOWN]]
            if len(odd) > ODD_DRAWS_SHOWN:
                lines.append(f"- and {len(odd) - ODD_DRAWS_SHOWN} more, in run.json and "
                             f"`logs/{odd_log}`")
            lines.append("")
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
