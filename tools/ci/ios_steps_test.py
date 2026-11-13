#!/usr/bin/env python3
"""Tests for tools/ci/ios_steps.py. Run: python3 tools/ci/ios_steps_test.py

Each test builds a scratch repository with only the files a step looks for, and runs the step
with a fake shell that records the commands and answers them from fixtures. Two of the
contact-sheet tests run ImageMagick for real on a 2.1 render and a sample PNG when `montage` is
installed (the session has it; `ci`'s Linux runner doesn't, so there those two skip, and the
`ios` workflow's evidence job installs it); the others read the montage commands a fake shell
records, and run everywhere. The publish tests run real git against a scratch bare repository.
One test class reads .github/workflows/ios.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import base64
import contextlib
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ios_steps  # noqa: E402
import toolchain  # noqa: E402

HAS_MAGICK = bool(shutil.which("montage") and shutil.which("identify"))
SHA = "0123456789abcdef0123456789abcdef01234567"
RENDER = "design/reference/2.1/F02-upcoming.png"

IPHONE_17 = "com.apple.CoreSimulator.SimDeviceType.iPhone-17"
IPHONES = [{"name": "iPhone 17", "identifier": IPHONE_17},
           {"name": "iPhone 17e", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17e"},
           {"name": "iPhone 18 Pro", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro"}]
DUO = [{"name": "iPhone Duo", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo"}]


def runtime(version, identifier, build, devices, platform="iOS", available=True):
    return {"identifier": f"com.apple.CoreSimulator.SimRuntime.{identifier}", "version": version,
            "buildversion": build, "platform": platform, "isAvailable": available,
            "name": f"{platform} {version}", "supportedDeviceTypes": devices}


# The `xcode-27` image's runtimes (its README, image 20261104.0337.1): iOS 27.0, 27.1 for iPhone
# Duo alone, and two iOS 27.2 runtimes, one with the iPhones and one with iPhone Duo alone; no
# iOS 26. The twin is listed first and has the later build, so only the device check passes it
# over.
IOS_27_2 = runtime("27.2", "iOS-27-2", "24C55", IPHONES)
TWIN = runtime("27.2", "iOS-27-2-Duo", "24C60", DUO)
RUNTIMES = {"runtimes": [
    runtime("27.0", "iOS-27-0", "24A335", IPHONES),
    runtime("27.1", "iOS-27-1", "24B80", DUO),
    TWIN,
    IOS_27_2,
    runtime("27.2", "tvOS-27-2", "24K55", [], platform="tvOS"),
]}
# What the download brings.
IOS_26_5 = runtime("26.5", "iOS-26-5", "23F77", IPHONES[:1] + [
    {"name": "iPhone 17 Pro", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"}])
WITH_26_5 = {"runtimes": RUNTIMES["runtimes"] + [IOS_26_5]}
UDID = "A1B2C3D4-0000-1111-2222-333344445555"  # the iOS 27.2 device
UDID_26 = "B1B2C3D4-0000-1111-2222-333344445555"  # the iOS 26.5 device
UDIDS = {IOS_27_2["identifier"]: UDID, IOS_26_5["identifier"]: UDID_26}


def image(identifier, version, build, path, runtime_identifier, state="Ready", mount=None,
          platform="com.apple.platform.iphonesimulator"):
    # One of `xcrun simctl runtime list -j`'s images, with the fields the `xcode-27` image gave
    # (ios/b0-xcode27-mount-c2/afb0c09/ios-full/logs/simulators.txt on `evidence`).
    return {"identifier": identifier, "version": version, "build": build, "path": path,
            "runtimeIdentifier": runtime_identifier, "state": state, "platformIdentifier": platform,
            "kind": "Patchable Cryptex Disk Image",
            "mountPath": mount or f"/private/var/run/com.apple.security.cryptexd/mnt/iOS_{build}"}


ASSETS = "/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/"
# The image's own: iOS 27.2 and its twin, and a watchOS one, all MobileAssets.
IMAGES = {i["identifier"]: i for i in (
    image("E1DD20F7-3587-45DF-BBC1-4A9AD795D88A", "27.2", "24C55", ASSETS + "7a06.asset/AssetData",
          IOS_27_2["identifier"]),
    image("D66DFD74-1994-4EEA-973E-6B92DE9ACC88", "27.2", "24C60", ASSETS + "246a.asset/AssetData",
          TWIN["identifier"]),
    image("AD96431F-C55F-40A3-A333-07491E62421A", "26.5", "23R118",
          "/System/Library/AssetsV2/com_apple_MobileAsset_watchOSSimulatorRuntime/3aff.asset/AssetData",
          "com.apple.CoreSimulator.SimRuntime.watchOS-26-5", platform="com.apple.platform.watchsimulator"))}
# What the download registers (a MobileAsset), and what the import does (an image of its own).
COPY_ID, IMPORTED_ID = "F8943C8B-7F78-4C8E-A9A7-223FD5FA573C", "9545C4C0-AD0A-411D-B966-829F99FF3189"
COPY = image(COPY_ID, "26.5", "23F77", ASSETS + "8a13.asset/AssetData", IOS_26_5["identifier"],
             mount="/Library/Developer/CoreSimulator/Volumes/iOS_23F77")
IMPORTED = image(IMPORTED_ID, "26.5", "23F77", "/Library/Developer/CoreSimulator/Cryptex/Images/" + IMPORTED_ID,
                 IOS_26_5["identifier"], mount="/private/var/run/com.apple.security.cryptexd/mnt/iOS_23F77_1")
BUNDLE = "iphonesimulator_26.5_23F77.exportedBundle"
CRYPTEX = "/private/var/run/com.apple.security.cryptexd/mnt/"
# `mount`'s lines once both volumes are up (the copy's, then the import's), with others around.
MOUNTS = "\n".join([
    "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
    f"/dev/disk10s1 on {CRYPTEX}com.apple.iPhoneOS.SimulatorRuntime-v24.2.8117.0.0rjKwj (apfs, sealed, local, read-only, journaled, nobrowse)",
    f"/dev/disk6s1 on {CRYPTEX}iOS_23F77 (apfs, sealed, local, nodev, nosuid, read-only, journaled, noatime, nobrowse)",
    f"/dev/disk30s1 on {CRYPTEX}iOS_23F77_1 (apfs, sealed, local, nodev, nosuid, read-only, journaled, noatime, nobrowse)",
    f"/dev/disk31s1 on {CRYPTEX}iOS_23F770 (apfs, sealed, local, read-only, journaled, nobrowse)"]) + "\n"
RUNTIME_BUNDLE = CRYPTEX + "iOS_23F77/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 26.5.simruntime"
DEVELOPER_DIR = f"/Applications/Xcode_{toolchain.XCODE_VERSION}.app/Contents/Developer"
# What ios-version may hold besides exactly 27.2 and one optional line break: each must fail.
BAD_IOS_VERSIONS = [b"26.5", b"26.5\n", b"27.2\n\n", b"27.2 \n", b" 27.2\n", b"27.2\t", b"27.2\r\n",
                    b"27.2\r", b"27.2\nx", b"27.2\n27.2\n", b"", b"\n", b"27.20\n", b"27\n", b"27.2.0\n",
                    b"27.2\x00", b"\xef\xbb\xbf27.2\n", "\uff12\uff17.\uff12\n".encode(), b"27.2\xa0",
                    b"27.2\n" + b"\n" * 100]

SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "2600" version = "1.7">
   <BuildAction parallelizeBuildables = "YES"></BuildAction>
   <TestAction buildConfiguration = "Debug">
      <Testables>
{testables}
      </Testables>
   </TestAction>
</Scheme>
"""
TESTABLE = """         <TestableReference skipped = "{skipped}">
            <BuildableReference BuildableIdentifier = "primary" BlueprintName = "{name}"
               BuildableName = "{name}.xctest" ReferencedContainer = "container:Tadayo.xcodeproj">
            </BuildableReference>
         </TestableReference>"""


def scheme(*testables):
    return SCHEME.format(testables="\n".join(
        TESTABLE.format(name=name, skipped="YES" if skipped else "NO")
        for name, skipped in testables))


class FakeShell:
    """Records every command. Answers `capture` from `answers`, a list of (predicate, result)
    tried in order, where a result is (code, stdout, stderr) or a function of the command; `run`
    from `codes` the same way, calling `effects` first so a test can make a command's files."""

    def __init__(self, answers=None, codes=None, effects=None):
        self.commands, self.envs, self.logs = [], [], []
        self.answers = answers or []
        self.codes = codes or []
        self.effects = effects or []

    def run(self, cmd, env=None, log=None, cwd=None):
        self.commands.append(cmd)
        self.envs.append(env)
        self.logs.append(log)
        for matches, effect in self.effects:
            if matches(cmd):
                effect(cmd)
        for matches, code in self.codes:
            if matches(cmd):
                return code(cmd) if callable(code) else code
        return 0

    def capture(self, cmd, env=None, cwd=None):
        self.commands.append(cmd)
        self.envs.append(env)
        self.logs.append(None)
        for matches, result in self.answers:
            if matches(cmd):
                return result(cmd) if callable(result) else result
        return 0, "", ""


def starts(*prefix):
    return lambda cmd: list(cmd[:len(prefix)]) == list(prefix)


def has(word):
    return lambda cmd: word in cmd


class Repo:
    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="ios-steps-")
        self.out = os.path.join(self.root, "_runner_temp", "ios-out")
        self.work = os.path.join(self.root, "_runner_temp", "ios-evidence")

    def write(self, path, text):
        full = os.path.join(self.root, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        mode = "wb" if isinstance(text, bytes) else "w"
        with open(full, mode) as f:
            f.write(text)
        return full

    def copy(self, source, path):
        full = os.path.join(self.root, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        shutil.copyfile(source, full)
        return full

    def mkdir(self, path):
        os.makedirs(os.path.join(self.root, *path.split("/")), exist_ok=True)

    def remove(self):
        shutil.rmtree(self.root, ignore_errors=True)


class StepsTest(unittest.TestCase):
    def setUp(self):
        self.repo = Repo()
        self.addCleanup(self.repo.remove)
        self.environ = {"RUNNER_TEMP": os.path.join(self.repo.root, "_runner_temp")}

    def steps(self, shell=None, environ=None, require_app=False):
        env = dict(self.environ)
        env.update(environ or {})
        steps = ios_steps.Steps(self.repo.root, shell or FakeShell(), environ=env,
                                require_app=require_app, sleep=lambda s: None)
        return steps

    def step(self, name, shell=None, environ=None, require_app=False):
        steps = self.steps(shell, environ, require_app)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = getattr(steps, name)()
        return code, out.getvalue()

    def record(self, values=None, **more):
        values = dict(values or {}, **more)
        os.makedirs(self.repo.out, exist_ok=True)
        with open(os.path.join(self.repo.out, "run.json"), "w") as f:
            json.dump(values, f)

    def read_record(self):
        with open(os.path.join(self.repo.out, "run.json")) as f:
            return json.load(f)


# The gate: the B0 plan's slice 9 test, "the first job's skip on a branch without
# apps/ios/project.yml".

class GateTest(StepsTest):
    def gate(self, require_app=False):
        output = os.path.join(self.repo.root, "_github_output")
        code, out = self.step("gate", environ={"GITHUB_OUTPUT": output}, require_app=require_app)
        with open(output) as f:
            return code, out, f.read()

    def test_a_branch_without_the_app_skips_the_macos_job(self):
        code, out, written = self.gate()
        self.assertEqual(code, 0)
        self.assertEqual(written, "build=false\n")
        self.assertIn("skipped", out)

    def test_a_branch_with_the_app_builds_it(self):
        self.repo.write("apps/ios/project.yml", "name: Tadayo\n")
        code, _, written = self.gate()
        self.assertEqual((code, written), (0, "build=true\n"))

    def test_a_folder_named_like_the_spec_is_not_the_app(self):
        self.repo.mkdir("apps/ios/project.yml")
        self.assertEqual(self.gate()[2], "build=false\n")

    def test_from_slice_12_a_branch_without_the_app_fails(self):
        code, out, written = self.gate(require_app=True)
        self.assertEqual((code, written), (1, "build=false\n"))
        self.assertIn("T58", out)

    def test_from_slice_12_a_branch_with_the_app_builds_it(self):
        self.repo.write("apps/ios/project.yml", "name: Tadayo\n")
        self.assertEqual(self.gate(require_app=True)[:1], (0,))

    def test_slice_12_has_not_turned_it_on_yet(self):
        self.assertFalse(ios_steps.REQUIRE_APP)


class ToolchainTest(StepsTest):
    def run_toolchain(self, xcode="Xcode 27.2\nBuild version 27B52\n",
                      swift="swift-driver version: 1.148.6 Apple Swift version 6.4.2 "
                            "(swiftlang-6.4.2.1.3 clang-1900.0.36.1)\nTarget: arm64-apple-macosx27.0\n",
                      installed=True):
        shell = FakeShell(answers=[(starts("xcodebuild", "-version"), (0, xcode, "")),
                                   (starts("xcrun", "swift", "--version"), (0, swift, ""))])
        steps = self.steps(shell)
        out = io.StringIO()
        with mock.patch.object(ios_steps.Steps, "xcode_installed", return_value=installed), \
                contextlib.redirect_stdout(out):
            code = steps.toolchain()
        return code, out.getvalue(), shell

    def test_the_pinned_xcode_and_swift_pass(self):
        code, out, shell = self.run_toolchain()
        self.assertEqual(code, 0, out)
        self.assertTrue(all(env == {"DEVELOPER_DIR": DEVELOPER_DIR} for env in shell.envs))
        self.assertEqual((self.read_record()["xcode"], self.read_record()["swift"]), ("27.2", "6.4.2"))
        with open(os.path.join(self.repo.out, "logs", "toolchain.txt")) as f:
            self.assertIn("Apple Swift version 6.4.2", f.read())

    def test_another_xcode_fails(self):
        # The image's default, 27.1, among them: Xcode is selected by its path, never by default.
        for xcode in ["Xcode 27.1\nBuild version 27A9275\n", "Xcode 27.20\n", "Xcode 26.6\n", ""]:
            with self.subTest(xcode=xcode):
                self.assertEqual(self.run_toolchain(xcode=xcode)[0], 1)

    def test_another_swift_fails(self):
        for swift in ["Apple Swift version 6.4.1 (swiftlang-6.4.1)", "Apple Swift version 6.4 (x)",
                      "Apple Swift version 6.4.21", "Apple Swift version 6.3.3", "no version here"]:
            with self.subTest(swift=swift):
                code, out, _ = self.run_toolchain(swift=swift)
                self.assertEqual(code, 1)
                self.assertIn(toolchain.SWIFT_VERSION, out)

    def test_a_runner_without_the_pinned_xcode_fails_before_running_it(self):
        code, out, shell = self.run_toolchain(installed=False)
        self.assertEqual(code, 1)
        self.assertEqual(shell.commands, [])
        self.assertIn("toolchain.py", out)


class XcodegenTest(StepsTest):
    def run_xcodegen(self, payload, generate_code=0, version=None, generate_says=""):
        def download(cmd):
            with open(cmd[cmd.index("--output") + 1], "wb") as f:
                f.write(payload)

        def generate(cmd):
            with open(os.path.join(self.repo.out, "logs", "xcodegen.txt"), "a") as f:
                f.write(generate_says)
        shell = FakeShell(effects=[(starts("curl"), download), (has("generate"), generate)],
                          codes=[(has("generate"), generate_code)],
                          answers=[(has("--version"), (0, (version or f"Version: {toolchain.XCODEGEN_VERSION}") + "\n", ""))])
        with mock.patch.object(toolchain, "XCODEGEN_SHA256", hashlib.sha256(b"release").hexdigest()):
            code, out = self.step("xcodegen", shell)
        return code, out, shell

    def test_the_pinned_release_generates_the_project(self):
        code, out, shell = self.run_xcodegen(b"release")
        self.assertEqual(code, 0, out)
        url = f"https://github.com/yonaskolb/XcodeGen/releases/download/{toolchain.XCODEGEN_VERSION}/xcodegen.zip"
        self.assertEqual(shell.commands[0][-1], url)
        self.assertEqual(shell.commands[1][:2], ["unzip", "-q"])
        self.assertEqual(shell.commands[2][1:], ["--version"])
        generate = shell.commands[-1]
        self.assertTrue(generate[0].endswith("/xcodegen/bin/xcodegen"))
        self.assertEqual(generate[1:], ["generate", "--spec", "apps/ios/project.yml", "--project", "apps/ios"])

    def test_a_download_with_another_hash_never_runs(self):
        code, out, shell = self.run_xcodegen(b"something else")
        self.assertEqual(code, 1)
        self.assertEqual([c[0] for c in shell.commands], ["curl"])
        self.assertIn("not the pinned", out)

    def test_a_failed_download_fails(self):
        shell = FakeShell(codes=[(starts("curl"), 22)])
        code, _ = self.step("xcodegen", shell)
        self.assertEqual((code, len(shell.commands)), (1, 1))

    def test_a_failed_generation_fails(self):
        self.assertNotEqual(self.run_xcodegen(b"release", generate_code=1)[0], 0)

    def test_another_version_never_generates(self):
        code, out, shell = self.run_xcodegen(b"release", version="Version: 2.45.0")
        self.assertEqual(code, 1)
        self.assertFalse(any("generate" in c for c in shell.commands))

    def test_presets_that_didn_t_load_fail(self):
        # XcodeGen only prints these and carries on, so the project would lack their settings.
        for says in ['No "iOS" settings found\n', 'Error parsing "base" settings\n']:
            with self.subTest(says=says):
                code, out, _ = self.run_xcodegen(b"release", generate_says=says)
                self.assertEqual(code, 1)
                self.assertIn("presets", out)

    def test_the_pin_is_a_sha_256(self):
        self.assertRegex(toolchain.XCODEGEN_SHA256, r"^[0-9a-f]{64}$")
        self.assertRegex(toolchain.XCODEGEN_VERSION, r"^[0-9]+\.[0-9]+\.[0-9]+$")


class PinsTest(unittest.TestCase):
    """The founder's decision of 2026-11-13 in toolchain.py, and the pins agreeing with each
    other and with the app."""

    def test_the_founder_s_runtimes(self):
        self.assertEqual((toolchain.XCODE_VERSION, toolchain.SWIFT_VERSION), ("27.2", "6.4.2"))
        self.assertEqual(toolchain.IOS_RUNTIMES, ("27.2", "26.5"))
        self.assertEqual(toolchain.IOS_DOWNLOADS, ("26.5",))
        self.assertEqual((toolchain.SNAPSHOT_RUNTIME, toolchain.SNAPSHOT_RUNTIME_INTERIM), ("27.2", "26.5"))
        self.assertEqual(toolchain.SIMULATOR_DEVICE, "iPhone 17")

    def test_the_runtimes_are_versions_each_once_the_first_of_the_xcode_s_major(self):
        runtimes = toolchain.IOS_RUNTIMES
        self.assertTrue(runtimes)
        self.assertEqual(len(set(runtimes)), len(runtimes))
        for version in runtimes:
            with self.subTest(version=version):
                self.assertRegex(version, ios_steps.VERSION)
        self.assertEqual(ios_steps.version_key(runtimes[0])[:1], ios_steps.version_key(toolchain.XCODE_VERSION)[:1])

    def test_a_run_downloads_only_pinned_runtimes(self):
        self.assertTrue(set(toolchain.IOS_DOWNLOADS) <= set(toolchain.IOS_RUNTIMES))

    def test_the_snapshot_runtimes_are_pinned_runtimes(self):
        # Else no pass would run the snapshot tests.
        self.assertIn(toolchain.SNAPSHOT_RUNTIME, toolchain.IOS_RUNTIMES)
        self.assertIn(toolchain.SNAPSHOT_RUNTIME_INTERIM, toolchain.IOS_RUNTIMES)

    def test_every_runtime_is_at_or_above_the_app_s_minimum(self):
        # apps/ios/project.yml's deploymentTarget, read from the file: 17.0 now, 26.0 once the
        # app's PR raises it. A runtime below it couldn't install the app.
        with open(os.path.join(ROOT, *ios_steps.PROJECT_SPEC.split("/")), encoding="utf-8") as f:
            found = re.search(r'^  deploymentTarget:\n    iOS: "?([0-9.]+)"?\s*$', f.read(), flags=re.M)
        self.assertIsNotNone(found, "apps/ios/project.yml's deploymentTarget")
        for version in toolchain.IOS_RUNTIMES:
            with self.subTest(version=version):
                self.assertGreaterEqual(ios_steps.version_key(version), ios_steps.version_key(found.group(1)))


class SnapshotRuntimeTest(StepsTest):
    def write(self, content):
        return self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)

    def test_the_repository_s_own_file(self):
        # The real tree, as test_the_inventory_s_states reads the real INVENTORY: a bad file
        # fails here, so it fails `ci` on Linux, the required check, and not only `ios`. Until
        # the app's PR adds the file, the interim; after it, the founder's runtime.
        self.assertIn(ios_steps.snapshot_runtime(ROOT), [("26.5", "interim"), ("27.2", "file")])

    def test_no_file_is_the_interim_and_exactly_27_2_is_the_file(self):
        self.assertEqual(ios_steps.snapshot_runtime(self.repo.root), ("26.5", "interim"))
        for content in (b"27.2", b"27.2\n"):
            with self.subTest(content=content):
                self.write(content)
                self.assertEqual(ios_steps.snapshot_runtime(self.repo.root), ("27.2", "file"))

    def test_anything_else_fails(self):
        # 26.5 among them: the file can name only the founder's runtime.
        for content in BAD_IOS_VERSIONS:
            with self.subTest(content=content):
                self.write(content)
                with self.assertRaises(ValueError) as raised:
                    ios_steps.snapshot_runtime(self.repo.root)
                self.assertIn(ios_steps.SNAPSHOT_RUNTIME_FILE, str(raised.exception))

    def test_only_a_regular_file_counts(self):
        path = os.path.join(self.repo.root, *ios_steps.SNAPSHOT_RUNTIME_FILE.split("/"))
        good = self.repo.write("elsewhere/ios-version", b"27.2\n")
        os.makedirs(os.path.dirname(path))
        for make in (lambda: os.symlink(good, path), lambda: os.mkdir(path), lambda: os.mkfifo(path),
                     lambda: os.symlink(os.path.join(self.repo.root, "missing"), path)):
            with self.subTest(make=make):
                make()
                with self.assertRaises(ValueError) as raised:
                    ios_steps.snapshot_runtime(self.repo.root)
                self.assertIn("isn't a regular file", str(raised.exception))
                if os.path.isdir(path) and not os.path.islink(path):
                    os.rmdir(path)
                else:
                    os.remove(path)

    def test_a_snapshots_folder_that_is_a_file_fails(self):
        # Only a missing file is the interim: here lstat fails with "not a directory".
        self.repo.write(os.path.dirname(ios_steps.SNAPSHOT_RUNTIME_FILE), b"27.2\n")
        with self.assertRaises(ValueError) as raised:
            ios_steps.snapshot_runtime(self.repo.root)
        self.assertIn(f"{ios_steps.SNAPSHOT_RUNTIME_FILE} can't be read", str(raised.exception))

    def test_a_file_that_can_t_be_opened_fails(self):
        # A good file that can't be read isn't the interim either. The session runs as root, so
        # open() is made to refuse it rather than chmod.
        path = self.write(b"27.2\n")
        real_open = open

        def refusing(file, *args, **kwargs):
            if os.fspath(file) == path:
                raise PermissionError(13, "Permission denied", file)
            return real_open(file, *args, **kwargs)
        with mock.patch("builtins.open", refusing), self.assertRaises(ValueError) as raised:
            ios_steps.snapshot_runtime(self.repo.root)
        self.assertIn(f"{ios_steps.SNAPSHOT_RUNTIME_FILE} can't be read (Permission denied)", str(raised.exception))


class SimulatorTest(StepsTest):
    def assert_pinned(self, shell):
        # Every command, the SDK's read and a download among them, runs with the pinned Xcode,
        # not the image's default, which could be another whose SDK would let its runtimes in.
        pinned = {"DEVELOPER_DIR": DEVELOPER_DIR}
        self.assertTrue(shell.commands)
        self.assertEqual([(c, e) for c, e in zip(shell.commands, shell.envs, strict=True) if e != pinned], [])

    def shell(self, runtimes=RUNTIMES, after_download=None, devices=None, create=None,
              download_code=0, works_with=None, sdk=(0, "27.2\n", ""), listed_under=None, boot_code=0,
              cache_code=0, bundles=(BUNDLE,), imports=True, imported=None, import_code=0, deletes=True,
              delete_code=30, images_code=0, images=None, after_delete=None, mounts=MOUNTS):
        """after_download: the runtimes once a download that works has run; works_with: the
        download only works with these extra arguments (by default, any download works);
        devices: what simctl lists before a device is made; create: what `simctl create`
        answers, when not a new device, which is listed under the runtime it was made on (or
        listed_under, when given). A download that works registers COPY and writes `bundles`
        to its -exportPath; an import then registers `imported` (IMPORTED by default) unless
        `imports` is false, and COPY becomes unusable, as on the runner; `simctl runtime delete`
        takes an image off the list when `deletes`, exiting delete_code either way (30, as on
        the runner); images_code is `simctl runtime list -j`'s exit code, and `images` the
        image's own images (IMAGES by default); after_delete, when given, is what that list
        answers once a delete has run, (code, images of iOS 26.5); `mounts` is `mount`'s table."""
        state = {"downloaded": False, "imported": False, "deleted": [],
                 "devices": json.loads(json.dumps(devices or {}))}

        def list_runtimes(cmd):
            current = after_download if state["downloaded"] and after_download else runtimes
            return 0, json.dumps(current), ""

        def download(cmd):
            if works_with is None or all(a in cmd for a in works_with):
                state["downloaded"] = True
                for name in bundles:
                    os.makedirs(os.path.join(cmd[cmd.index("-exportPath") + 1], name))
            return download_code

        def import_platform(cmd):
            if imports and state["downloaded"]:
                state["imported"] = True
            return import_code

        def list_images(cmd):
            if after_delete is not None and state["deleted"]:
                code, mine = after_delete
                return code, json.dumps(dict(IMAGES, **{i["identifier"]: i for i in mine})), ""
            found = dict(IMAGES if images is None else images)
            if state["downloaded"]:
                found[COPY_ID] = dict(COPY, state="Unusable" if state["imported"] else "Ready")
            if state["imported"]:
                found[(imported or IMPORTED)["identifier"]] = imported or IMPORTED
            for identifier in state["deleted"]:
                found.pop(identifier, None)
            return images_code, json.dumps(found), ""

        def delete(cmd):
            if deletes:
                state["deleted"].append(cmd[-1])
            return delete_code

        def make(cmd):
            if create is not None:
                return create
            udid = UDIDS.get(cmd[5]) or "C0000000-0000-0000-0000-" + hashlib.sha256(cmd[5].encode()).hexdigest()[:12].upper()
            state["devices"].setdefault(listed_under or cmd[5], []).append(
                {"name": cmd[3], "udid": udid, "isAvailable": True, "state": "Shutdown"})
            return 0, udid + "\n", ""
        return FakeShell(
            answers=[(starts("xcrun", "simctl", "list", "runtimes", "--json"), list_runtimes),
                     (starts("xcrun", "simctl", "list", "devices", "--json"),
                      lambda cmd: (0, json.dumps({"devices": state["devices"]}), "")),
                     (starts("xcrun", "simctl", "create"), make),
                     (starts("xcrun", "simctl", "list"), (0, "== Runtimes ==\niOS 27.2\n", "")),
                     (starts("xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"), sdk),
                     (starts("xcrun", "simctl", "runtime", "list", "-j"), list_images),
                     (starts("mount"), (0, mounts, ""))],
            codes=[(has("-downloadPlatform"), download), (has("-importPlatform"), import_platform),
                   (starts("xcrun", "simctl", "runtime", "delete"), delete),
                   (has("bootstatus"), boot_code), (has("dyld_shared_cache"), cache_code)])

    def creates(self, shell):
        return [c[3:] for c in shell.commands if c[:3] == ["xcrun", "simctl", "create"]]

    def downloads(self, shell):
        return [c for c in shell.commands if "-downloadPlatform" in c]

    def export(self):
        return os.path.join(self.repo.work, "runtime-export")

    def download(self, *variant):
        return ["xcodebuild", "-downloadPlatform", "iOS", "-buildVersion", "26.5", "-exportPath",
                self.export(), *variant]

    def imports(self, shell):
        return [c for c in shell.commands if "-importPlatform" in c]

    def deletes(self, shell):
        return [c for c in shell.commands if c[:4] == ["xcrun", "simctl", "runtime", "delete"]]

    def simulators_log(self):
        with open(os.path.join(self.repo.out, "logs", "simulators.txt")) as f:
            return f.read()

    def runtime_keys(self):
        return {k: v for k, v in self.read_record().items() if k not in ("xcode", "swift")}

    def test_prepares_the_runtimes_in_order_and_downloads_only_26_5(self):
        shell = self.shell(after_download=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.creates(shell), [["Tadayo iPhone 17", IPHONE_17, IOS_27_2["identifier"]],
                                               ["Tadayo iPhone 17", IPHONE_17, IOS_26_5["identifier"]]])
        self.assertEqual(self.downloads(shell), [self.download()])
        # In order: 27.2's device is made before 26.5 is downloaded.
        create_27 = shell.commands.index(["xcrun", "simctl", "create", "Tadayo iPhone 17", IPHONE_17,
                                          IOS_27_2["identifier"]])
        self.assertLess(create_27, shell.commands.index(self.downloads(shell)[0]))
        # The new runtime's shared cache, never every runtime's (`--all`).
        self.assertEqual([c for c in shell.commands if "dyld_shared_cache" in c],
                         [["xcrun", "simctl", "runtime", "dyld_shared_cache", "update", IOS_26_5["identifier"]]])
        self.assertEqual(self.runtime_keys(), {
            "sdk": "27.2", "snapshots": "26.5", "snapshots-source": "interim",
            "ios-27.2": "27.2", "runtime-27.2": IOS_27_2["identifier"], "runtime-build-27.2": "24C55",
            "device-27.2": "iPhone 17", "udid-27.2": UDID,
            "ios-26.5": "26.5", "runtime-26.5": IOS_26_5["identifier"], "runtime-build-26.5": "23F77",
            "device-26.5": "iPhone 17", "udid-26.5": UDID_26})
        self.assertIn(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"], shell.commands)
        self.assert_pinned(shell)

    def test_26_5_is_downloaded_to_a_file_imported_and_its_copy_deleted(self):
        # The `xcode-27` image moves a runtime it downloaded as a MobileAsset between two mounts
        # mid-run (actions/runner-images#14946); an imported image stays where it is mounted.
        shell = self.shell(after_download=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.downloads(shell), [self.download()])
        self.assertEqual(self.imports(shell), [["xcodebuild", "-importPlatform", os.path.join(self.export(), BUNDLE)]])
        # Only the copy the download registered: not the image's own MobileAssets, of iOS 27.2
        # or of another platform (IMAGES), nor the imported image.
        self.assertEqual(self.deletes(shell), [["xcrun", "simctl", "runtime", "delete", COPY_ID]])
        # In order: the download, its import, the copy's delete, then the shared cache.
        order = [shell.commands.index(c) for c in (
            self.download(), self.imports(shell)[0], self.deletes(shell)[0],
            ["xcrun", "simctl", "runtime", "dyld_shared_cache", "update", IOS_26_5["identifier"]])]
        self.assertEqual(order, sorted(order))
        # simctl exited 30 for the delete, as on the runner, but no longer lists the copy.
        self.assertNotIn("still lists", out)
        text = self.simulators_log()
        self.assertIn(f"exported: {BUNDLE}", text)
        # The runtime's bundle and its build's two volumes, the copy's and the import's, never
        # another build's (iOS_23F770).
        self.assertIn(f"iOS 26.5: imported image {IMPORTED_ID} (23F77): Ready on {CRYPTEX}iOS_23F77_1; "
                      f"the runtime: no bundle path; volumes: {CRYPTEX}iOS_23F77, {CRYPTEX}iOS_23F77_1\n", text)
        self.assertIn("+ xcrun simctl runtime list -j", text)
        # Each step's exit code is logged after it: the import's 0 and the delete's 30.
        # (The fake shell logs no command: the import's exit follows the export's line.)
        self.assertIn(f"exported: {BUNDLE}\n(exit 0)\n", text)
        self.assertRegex(text, r"\(exit 30\)\n\+ xcrun simctl runtime list -j\n")
        self.assert_pinned(shell)
        # With the runtime's bundle listed, the line names it.
        listed = {"runtimes": RUNTIMES["runtimes"] + [dict(IOS_26_5, bundlePath=RUNTIME_BUNDLE)]}
        os.remove(os.path.join(self.repo.out, "logs", "simulators.txt"))
        self.assertEqual(self.step("simulator", self.shell(after_download=listed))[0], 0)
        self.assertIn(f"the runtime: {RUNTIME_BUNDLE}; volumes: ", self.simulators_log())

    def test_a_downloaded_copy_alone_fails(self):
        # Nothing exported, or an import that didn't take: simctl lists iOS 26.5 from the
        # MobileAsset alone, which would move mid-run. It fails, naming why, and the universal
        # variant isn't tried: the download itself worked.
        for kwargs in ({"bundles": ()}, {"imports": False}, {"bundles": (BUNDLE, "other.exportedBundle")}):
            with self.subTest(**{k: str(v) for k, v in kwargs.items()}):
                shell = self.shell(after_download=WITH_26_5, **kwargs)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn(f"simctl lists no imported image of iOS 26.5 ({IOS_26_5['identifier']}) "
                              "that is Ready", out)
                self.assertIn("actions/runner-images#14946", out)
                self.assertEqual(self.downloads(shell), [self.download()])
                self.assertEqual(len(self.imports(shell)), 1 if kwargs.get("bundles") == (BUNDLE,) or "imports" in kwargs else 0)
                # The copy is the only image of it, so it is kept.
                self.assertEqual(self.deletes(shell), [])
                self.assertFalse(any("dyld_shared_cache" in c or "bootstatus" in c for c in shell.commands))
                self.assertFalse(os.path.isfile(os.path.join(self.repo.out, "run.json")))

    def test_the_import_s_exit_code_doesn_t_decide(self):
        # As for the download: simctl's list is believed, whatever xcodebuild exits.
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, import_code=1))
        self.assertEqual(code, 0, out)
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, import_code=0, imports=False))
        self.assertEqual(code, 1)
        self.assertIn("simctl lists no imported image of iOS 26.5", out)

    def test_what_simctl_lists_after_the_delete_decides(self):
        # The list read again after the delete is the one checked: there the imported image is
        # no longer Ready, or it can't be read.
        shell = self.shell(after_download=WITH_26_5, after_delete=(0, [dict(IMPORTED, state="Unusable")]))
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 1)
        self.assertIn("simctl lists no imported image of iOS 26.5", out)
        self.assertFalse(any("dyld_shared_cache" in c or "bootstatus" in c for c in shell.commands))
        shell = self.shell(after_download=WITH_26_5, after_delete=(1, []))
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 1)
        self.assertIn("can't read `xcrun simctl runtime list -j`", out)
        self.assertEqual(len(self.deletes(shell)), 1)
        self.assertFalse(any("dyld_shared_cache" in c or "bootstatus" in c for c in shell.commands))

    def test_an_imported_image_that_isn_t_ready_or_isn_t_the_runtime_s_fails(self):
        for imported in (dict(IMPORTED, state="Unusable"), dict(IMPORTED, state="Mounting"),
                         dict(IMPORTED, runtimeIdentifier="com.apple.CoreSimulator.SimRuntime.iOS-26-4"),
                         dict(IMPORTED, path=None)):
            with self.subTest(imported={k: imported[k] for k in ("state", "runtimeIdentifier", "path")}):
                shell = self.shell(after_download=WITH_26_5, imported=imported)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn("simctl lists no imported image of iOS 26.5", out)
                self.assertFalse(any("dyld_shared_cache" in c or "bootstatus" in c for c in shell.commands))
        # Not Ready, the copy isn't deleted either: it is then the only image of iOS 26.5.
        shell = self.shell(after_download=WITH_26_5, imported=dict(IMPORTED, state="Unusable"))
        self.step("simulator", shell)
        self.assertEqual(self.deletes(shell), [])

    def test_a_copy_simctl_still_lists_is_said_but_not_fatal(self):
        # The import holds the runtime; only the first boot may be slower (`-mount-c`'s run).
        for delete_code in (30, 0):
            with self.subTest(delete_code=delete_code):
                shell = self.shell(after_download=WITH_26_5, deletes=False, delete_code=delete_code)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 0, out)
                self.assertIn("simctl still lists the downloaded copy of iOS 26.5 beside the imported one, "
                              "which the image may move mid-run (actions/runner-images#14946", out)
                self.assertEqual(self.deletes(shell), [["xcrun", "simctl", "runtime", "delete", COPY_ID]])
                self.assertIn(f"iOS 26.5: imported image {IMPORTED_ID} (23F77)", self.simulators_log())
                self.assertNotIn(f"imported image {COPY_ID}", self.simulators_log())
                os.remove(os.path.join(self.repo.out, "logs", "simulators.txt"))
        # Deleted with exit 0, nothing is said either.
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, delete_code=0))
        self.assertEqual(code, 0, out)
        self.assertNotIn("still lists", out)

    def test_unreadable_images_fail(self):
        for images_code in (1, 64):
            with self.subTest(images_code=images_code):
                shell = self.shell(after_download=WITH_26_5, images_code=images_code)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn("can't read `xcrun simctl runtime list -j`", out)
                self.assertEqual(self.downloads(shell), [self.download()])
                self.assertFalse(any("dyld_shared_cache" in c or "bootstatus" in c for c in shell.commands))
        shell = FakeShell()
        shell.answers = [(starts("xcrun", "simctl", "runtime", "list", "-j"), (0, "[]", ""))]
        steps = self.steps(shell)
        self.assertIsNone(steps.runtime_images())

    def test_a_patch_release_s_images_count(self):
        # simctl may name 26.5.1 for the pin 26.5, as it does for runtimes (same_version).
        after = {"runtimes": RUNTIMES["runtimes"] + [dict(IOS_26_5, version="26.5.1")]}
        shell = self.shell(after_download=after, imported=dict(IMPORTED, version="26.5.1"))
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.deletes(shell), [["xcrun", "simctl", "runtime", "delete", COPY_ID]])
        # Never 26.50's.
        shell = self.shell(after_download=WITH_26_5, imported=dict(IMPORTED, version="26.50"))
        self.assertEqual(self.step("simulator", shell)[0], 1)

    def test_a_bundle_left_in_the_export_folder_isn_t_imported(self):
        # Each download starts from an empty folder, so only what it exported is imported.
        os.makedirs(os.path.join(self.export(), "stale.exportedBundle"))
        shell = self.shell(after_download=WITH_26_5, bundles=())
        self.assertEqual(self.step("simulator", shell)[0], 1)
        self.assertEqual(self.imports(shell), [])
        self.assertFalse(os.path.exists(os.path.join(self.export(), "stale.exportedBundle")))

    def test_with_the_file_the_snapshots_are_27_2_s(self):
        self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, "27.2\n")
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5))
        self.assertEqual(code, 0, out)
        self.assertEqual((self.read_record()["snapshots"], self.read_record()["snapshots-source"]), ("27.2", "file"))

    def test_records_the_versions_simctl_gives_not_the_pins(self):
        # Patch releases under the pins: the record says what simctl gave.
        before = {"runtimes": [dict(r, version="27.2.1") if r is IOS_27_2 else r for r in RUNTIMES["runtimes"]]}
        after = {"runtimes": before["runtimes"] + [dict(IOS_26_5, version="26.5.1")]}
        code, out = self.step("simulator", self.shell(runtimes=before, after_download=after))
        self.assertEqual(code, 0, out)
        record = self.read_record()
        self.assertEqual((record["ios-27.2"], record["ios-26.5"]), ("27.2.1", "26.5.1"))

    def test_a_26_5_the_runner_has_is_used_without_a_download(self):
        shell = self.shell(runtimes=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.downloads(shell), [])
        self.assertEqual([c for c in shell.commands if "dyld_shared_cache" in c], [])
        self.assertEqual(self.read_record()["runtime-26.5"], IOS_26_5["identifier"])

    def test_boots_only_the_first_runtime_s_device(self):
        shell = self.shell(after_download=WITH_26_5)
        self.assertEqual(self.step("simulator", shell)[0], 0)
        boots = [c for c in shell.commands if "bootstatus" in c or c[:3] == ["xcrun", "simctl", "boot"]]
        self.assertEqual(boots, [["xcrun", "simctl", "bootstatus", UDID, "-b"]])
        # After both devices are made.
        last_create = max(i for i, c in enumerate(shell.commands) if c[:3] == ["xcrun", "simctl", "create"])
        self.assertGreater(shell.commands.index(boots[0]), last_create)

    def test_a_device_that_doesn_t_boot_fails(self):
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, boot_code=1))
        self.assertEqual(code, 1)
        self.assertIn(f"{UDID} didn't boot", out)
        self.assertFalse(os.path.isfile(os.path.join(self.repo.out, "run.json")))

    def test_takes_the_27_2_runtime_that_supports_the_iphone_17(self):
        # The twin is listed first and has the later build; it holds iPhone Duo alone.
        self.assertEqual(self.step("simulator", self.shell(after_download=WITH_26_5))[0], 0)
        record = self.read_record()
        self.assertEqual((record["runtime-27.2"], record["runtime-build-27.2"]), (IOS_27_2["identifier"], "24C55"))

    def test_a_newer_runtime_on_the_image_isn_t_taken(self):
        # The cap it replaces kept a newer Xcode's runtime out: now each runtime is pinned, so
        # iOS 27.3 (expected with Xcode 27.3 beta's image) and a 27.20 are never taken for 27.2.
        newer = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-3", version="27.3",
                     buildversion="24D5020n")
        decoy = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-20", version="27.20",
                     buildversion="24Z1")
        runtimes = {"runtimes": [newer, decoy] + RUNTIMES["runtimes"]}
        shell = self.shell(runtimes=runtimes, after_download={"runtimes": runtimes["runtimes"] + [IOS_26_5]})
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual((self.read_record()["ios-27.2"], self.read_record()["runtime-27.2"]),
                         ("27.2", IOS_27_2["identifier"]))

    def test_a_missing_27_2_fails_without_a_download(self):
        # The image keeps three runtimes per Xcode: a later one may drop 27.2's, and the run then
        # fails, naming it, rather than download it unseen (toolchain.IOS_DOWNLOADS). Only the
        # twin left, which lacks the iPhone 17, is the same.
        others = [r for r in RUNTIMES["runtimes"] if r["version"] != "27.2" or r["platform"] != "iOS"]
        for runtimes in (others, others + [TWIN]):
            with self.subTest(runtimes=[r["identifier"] for r in runtimes]):
                shell = self.shell(runtimes={"runtimes": runtimes}, after_download=WITH_26_5)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn("no iOS 27.2 runtime with the iPhone 17", out)
                self.assertIn("toolchain.IOS_DOWNLOADS", out)
                self.assertEqual((self.downloads(shell), self.creates(shell)), ([], []))
                self.assertFalse(any("bootstatus" in c for c in shell.commands))

    def test_fails_naming_a_runtime_it_can_t_get(self):
        # The download didn't work, or brought nothing simctl lists, whatever its exit code.
        for kwargs in ({}, {"download_code": 1}, {"after_download": RUNTIMES, "download_code": 0}):
            with self.subTest(**{k: str(v)[:20] for k, v in kwargs.items()}):
                shell = self.shell(**kwargs)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn("no available iOS 26.5 runtime with the iPhone 17", out)
                self.assertEqual(len(self.downloads(shell)), 2)
                self.assertFalse(any("bootstatus" in c for c in shell.commands))

    def test_fails_when_a_runtime_lacks_the_device(self):
        # No other iPhone stands in: it would change the snapshots' size and every layout.
        without = dict(IOS_26_5, supportedDeviceTypes=[
            {"name": "iPhone 16", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16"},
            {"name": "iPhone 17 Pro", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"}])
        shell = self.shell(after_download={"runtimes": RUNTIMES["runtimes"] + [without]})
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 1)
        self.assertIn("no available iOS 26.5 runtime with the iPhone 17", out)
        self.assertEqual([c[-1] for c in self.creates(shell)], [IOS_27_2["identifier"]])
        # The plain download installed iOS 26.5 without it: the universal variant, several
        # gigabytes more, would list the same devices, so it isn't tried, and the step says why.
        self.assertEqual(self.downloads(shell), [self.download()])
        self.assertIn("simctl lists iOS 26.5 after the download, but no runtime of it with the iPhone 17", out)
        self.assertNotIn("couldn't install", out)
        self.assertFalse(any("dyld_shared_cache" in c for c in shell.commands))
        # Unavailable, it isn't one simctl lists as installed, so the universal variant is tried.
        shell = self.shell(after_download={"runtimes": RUNTIMES["runtimes"] + [dict(without, isAvailable=False)]})
        self.assertEqual(self.step("simulator", shell)[0], 1)
        self.assertEqual(len(self.downloads(shell)), 2)

    def test_fails_when_a_pinned_major_is_above_the_sdk_s(self):
        # The first pinned runtime shares the SDK's major, and none is of a later one.
        for sdk, pins in (("26.5", ("27.2", "26.5")), ("27.2", ("27.2", "28.0")), ("27.2", ("26.5", "27.2"))):
            with self.subTest(sdk=sdk, pins=pins), mock.patch.object(toolchain, "IOS_RUNTIMES", pins):
                shell = self.shell(sdk=(0, sdk + "\n", ""), after_download=WITH_26_5)
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn("toolchain.IOS_RUNTIMES", out)
                self.assertNotIn(["xcrun", "simctl", "list", "runtimes", "--json"], shell.commands)
                self.assertEqual((self.downloads(shell), self.creates(shell)), ([], []))

    def test_a_twin_sharing_the_identifier_fails(self):
        # simctl finds a runtime's devices and makes one by its identifier (critique 5).
        twin = dict(TWIN, identifier=IOS_27_2["identifier"])
        shell = self.shell(runtimes={"runtimes": [twin, IOS_27_2]}, after_download=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 1)
        self.assertIn("share an identifier", out)
        self.assertIn("24C60", out)
        self.assertEqual(self.creates(shell), [])

    def test_a_device_that_isn_t_on_its_runtime_fails(self):
        # simctl lists the device it made under another runtime, or under none.
        for shell in (self.shell(after_download=WITH_26_5, listed_under="com.apple.CoreSimulator.SimRuntime.iOS-27-0"),
                      self.shell(after_download=WITH_26_5, create=(0, UDID + "\n", ""))):
            with self.subTest(shell=len(self.creates(shell))):
                code, out = self.step("simulator", shell)
                self.assertEqual(code, 1)
                self.assertIn(f"not on iOS 27.2's {IOS_27_2['identifier']}", out)
                self.assertFalse(any("bootstatus" in c for c in shell.commands))

    def test_an_unreadable_sdk_fails(self):
        for sdk in [(1, "", "xcrun: error"), (0, "\n", ""), (0, "iphonesimulator\n", "")]:
            with self.subTest(sdk=sdk):
                self.assertEqual(self.step("simulator", self.shell(sdk=sdk))[0], 1)

    def test_the_simulators_the_runner_offers_and_the_ones_taken_are_recorded(self):
        self.step("simulator", self.shell(after_download=WITH_26_5))
        with open(os.path.join(self.repo.out, "logs", "simulators.txt")) as f:
            text = f.read()
        self.assertIn("+ xcrun simctl list runtimes", text)
        self.assertIn("+ xcrun simctl list devices available", text)
        self.assertIn(f"iOS 27.2: runtime {IOS_27_2['identifier']}, build 24C55, version 27.2; iPhone 17 {UDID}", text)
        self.assertIn(f"iOS 26.5: runtime {IOS_26_5['identifier']}, build 23F77, version 26.5; iPhone 17 {UDID_26}", text)
        self.assertIn("The snapshot tests run on iOS 26.5 (interim, no ios-version file).", text)

    def test_the_universal_variant_is_tried_when_the_plain_download_brings_nothing(self):
        shell = self.shell(after_download=WITH_26_5, works_with=["universal"])
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.downloads(shell), [self.download(), self.download("-architectureVariant", "universal")])
        self.assertIn(["xcrun", "simctl", "runtime", "dyld_shared_cache", "update", IOS_26_5["identifier"]],
                      shell.commands)
        self.assert_pinned(shell)

    def test_a_failed_shared_cache_update_is_logged_and_said_but_not_fatal(self):
        # Nothing has shown that simctl takes the runtime's identifier there: when it doesn't, the
        # run goes on, and the first boot of iOS 26.5 builds the cache, in the test step's time.
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, cache_code=1))
        self.assertEqual(code, 0, out)
        self.assertIn("updating iOS 26.5's shared cache exited 1, so its first boot builds it", out)
        with open(os.path.join(self.repo.out, "logs", "simulators.txt")) as f:
            self.assertEqual(f.read().count("(exit 1)"), 1)
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5))
        self.assertEqual(code, 0, out)
        self.assertNotIn("shared cache", out)

    def test_the_download_s_exit_code_doesn_t_decide(self):
        # Xcode can fall back to another runtime and exit 0, or fail a proxy and say "not
        # available"; simctl is what's believed.
        code, out = self.step("simulator", self.shell(after_download=WITH_26_5, download_code=70))
        self.assertEqual(code, 0, out)
        self.assertEqual(self.read_record()["ios-26.5"], "26.5")

    def test_a_bad_ios_version_fails_before_any_command(self):
        for content in BAD_IOS_VERSIONS[:6]:
            with self.subTest(content=content):
                self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)
                shell = self.shell(after_download=WITH_26_5)
                code, out = self.step("simulator", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn(ios_steps.SNAPSHOT_RUNTIME_FILE, out)

    def test_a_stray_ios_version_variable_is_ignored(self):
        # The workflow's input is gone: a variable left in the environment changes nothing.
        shell = self.shell(after_download=WITH_26_5)
        code, out = self.step("simulator", shell, environ={"IOS_VERSION": "18.6"})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.downloads(shell), [self.download()])
        self.assertNotIn("requested", self.read_record())

    def test_an_existing_device_is_reused(self):
        devices = {IOS_27_2["identifier"]: [
            {"name": "iPhone 17 Pro", "udid": "X", "isAvailable": True},
            {"name": "iPhone 17", "udid": UDID, "isAvailable": True}],
            TWIN["identifier"]: [{"name": "iPhone 17", "udid": "D0000000-0000-0000-0000-000000000000",
                                  "isAvailable": True}]}
        shell = self.shell(devices=devices, after_download=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        # 27.2's is reused; 26.5's, downloaded, is made.
        self.assertEqual(self.creates(shell), [["Tadayo iPhone 17", IPHONE_17, IOS_26_5["identifier"]]])
        self.assertEqual((self.read_record()["udid-27.2"], self.read_record()["udid-26.5"]), (UDID, UDID_26))

    def test_an_unavailable_device_is_not_reused(self):
        # simctl keeps a device whose runtime went away, unavailable; it couldn't boot.
        stale = "E0000000-0000-0000-0000-000000000000"
        devices = {IOS_27_2["identifier"]: [{"name": "iPhone 17", "udid": stale, "isAvailable": False}]}
        shell = self.shell(devices=devices, after_download=WITH_26_5)
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.creates(shell)[0], ["Tadayo iPhone 17", IPHONE_17, IOS_27_2["identifier"]])
        self.assertEqual(self.read_record()["udid-27.2"], UDID)
        self.assertNotIn(stale, json.dumps(self.read_record()))

    def test_a_device_that_can_t_be_made_fails(self):
        for create in [(1, "", "Invalid device type"), (0, "not a udid\n", "")]:
            with self.subTest(create=create):
                code, out = self.step("simulator", self.shell(create=create, after_download=WITH_26_5))
                self.assertEqual(code, 1)
                self.assertIn("on iOS 27.2", out)

    def test_unreadable_runtimes_fail(self):
        shell = FakeShell(answers=[(starts("xcrun", "simctl", "list", "runtimes", "--json"),
                                    (0, "not json", "")),
                                   (starts("xcrun", "--sdk"), (0, "27.2\n", ""))])
        self.assertEqual(self.step("simulator", shell)[0], 1)


class PickTest(unittest.TestCase):
    def pick(self, runtimes, version="27.2", device="iPhone 17"):
        return ios_steps.pick_runtime(runtimes, version, device)

    def test_the_iphones_27_2_not_the_twin(self):
        runtimes = RUNTIMES["runtimes"]
        self.assertEqual(self.pick(runtimes), IOS_27_2)
        self.assertEqual(self.pick(runtimes, device="iPhone Duo"), TWIN)
        self.assertIsNone(self.pick([TWIN]))
        self.assertIsNone(self.pick(runtimes, "27.1"))  # iPhone Duo alone
        self.assertEqual(self.pick(runtimes, "27.0")["version"], "27.0")
        self.assertIsNone(self.pick(runtimes, "26.5"))  # not on the image
        self.assertEqual(self.pick(runtimes + [IOS_26_5], "26.5"), IOS_26_5)

    def test_a_newer_runtime_on_the_image_is_never_taken_for_27_2(self):
        # The cap's replacement (critique 6a): iOS 27.3, as the image with Xcode 27.3 beta may
        # carry it, and a 27.20 decoy.
        newer = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-3", version="27.3",
                     buildversion="24D5020n")
        decoy = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-20", version="27.20",
                     buildversion="24Z1")
        self.assertEqual(self.pick([newer, decoy] + RUNTIMES["runtimes"]), IOS_27_2)
        self.assertIsNone(self.pick([newer, decoy, TWIN]))
        self.assertIsNone(self.pick([IOS_27_2], "2"))  # 27.2 isn't version 2
        # A patch release of 27.2 is 27.2's.
        patch = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-1", version="27.2.1",
                     buildversion="24C70")
        self.assertEqual(self.pick([newer, decoy, patch] + RUNTIMES["runtimes"]), patch)

    def test_an_unavailable_or_another_platform_s_runtime_isn_t_taken(self):
        self.assertIsNone(self.pick([dict(IOS_27_2, isAvailable=False)]))
        self.assertIsNone(self.pick([dict(IOS_27_2, platform="tvOS",
                                          identifier="com.apple.CoreSimulator.SimRuntime.tvOS-27-2")]))
        # A simctl that gives no platform: the identifier says iOS.
        unnamed = {k: v for k, v in IOS_27_2.items() if k != "platform"}
        self.assertEqual(self.pick([unnamed]), unnamed)

    def test_the_newest_by_version_then_by_build(self):
        a = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-a", buildversion="24B335")
        c = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-c", buildversion="24C9")
        for runtimes in ([a, c], [c, a]):
            with self.subTest(order=[r["buildversion"] for r in runtimes]):
                self.assertEqual(self.pick(runtimes), c)  # C9 is after B335
        # By build_key, not as text, where "24C9" would come after "24C55".
        # Its identifier sorts before c's, so the identifier tie-break can't stand in for the build.
        c55 = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-b", buildversion="24C55")
        for runtimes in ([c, c55], [c55, c]):
            with self.subTest(order=[r["buildversion"] for r in runtimes]):
                self.assertEqual(self.pick(runtimes), c55)
        self.assertGreater(ios_steps.build_key("24C55"), ios_steps.build_key("24C9"))
        self.assertGreater(ios_steps.build_key("24D5020n"), ios_steps.build_key("24C55"))

    def test_a_tie_goes_to_the_same_runtime_whatever_simctl_s_order(self):
        # The same version and build under two identifiers: the identifier decides, never which
        # simctl lists first, so the same image always gives the same runtime.
        a = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-a")
        b = dict(IOS_27_2, identifier="com.apple.CoreSimulator.SimRuntime.iOS-27-2-b")
        for runtimes in ([a, b], [b, a]):
            with self.subTest(order=[r["identifier"][-1] for r in runtimes]):
                self.assertEqual(self.pick(runtimes), b)

    def test_a_shared_identifier_raises(self):
        # The twin sharing the iPhones' identifier, or two runtimes with the iPhone 17 sharing
        # one: simctl couldn't tell them apart (critique 5).
        twin = dict(TWIN, identifier=IOS_27_2["identifier"])
        again = dict(IOS_27_2, buildversion="24C61")
        for runtimes in ([twin, IOS_27_2], [IOS_27_2, again]):
            with self.subTest(runtimes=runtimes):
                with self.assertRaises(ValueError) as raised:
                    self.pick(runtimes)
                for runtime in runtimes:
                    self.assertIn(f"build {runtime['buildversion']}", str(raised.exception))
                self.assertIn(IOS_27_2["identifier"], str(raised.exception))
        # Runtimes of other versions, or none with the device, aren't this one's business.
        self.assertEqual(self.pick([IOS_27_2, dict(TWIN, version="27.1", identifier=IOS_27_2["identifier"])]),
                         IOS_27_2)
        self.assertEqual(self.pick([TWIN, dict(TWIN, buildversion="24C61"), IOS_27_2]), IOS_27_2)

    def test_pick_device_type(self):
        self.assertEqual(ios_steps.pick_device_type(IOS_27_2, "iPhone 17")["identifier"], IPHONE_17)
        # No other iPhone stands in, however close.
        self.assertIsNone(ios_steps.pick_device_type(
            {"supportedDeviceTypes": [{"name": "iPhone 16"}, {"name": "iPhone 17 Pro"}]}, "iPhone 17"))
        self.assertIsNone(ios_steps.pick_device_type(TWIN, "iPhone 17"))
        self.assertIsNone(ios_steps.pick_device_type({}, "iPhone 17"))
        self.assertIsNone(ios_steps.pick_device_type({"supportedDeviceTypes": ["iPhone 17", None]}, "iPhone 17"))


def on(udid):
    """A predicate for the test pass on the device `udid`."""
    return lambda cmd: "test-without-building" in cmd and f"platform=iOS Simulator,id={udid}" in cmd


class BuildAndTestSteps(StepsTest):
    def setUp(self):
        super().setUp()
        self.repo.write("apps/ios/project.yml", "name: Tadayo\n")
        self.repo.mkdir("apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes")
        self.write_scheme(scheme(("TadayoTests", False)))
        self.record({"udid-27.2": UDID, "ios-27.2": "27.2", "device-27.2": "iPhone 17",
                     "udid-26.5": UDID_26, "ios-26.5": "26.5", "device-26.5": "iPhone 17",
                     "snapshots": "26.5", "snapshots-source": "interim"})

    def products(self, extension=True, log=("** TEST BUILD SUCCEEDED **\n",)):
        app = os.path.join(self.repo.root, "_runner_temp", "DerivedData", "Build", "Products",
                           "Debug-iphonesimulator", "Tadayo.app")
        os.makedirs(os.path.join(app, "PlugIns", "TadayoShare.appex") if extension else app)
        os.makedirs(os.path.join(self.repo.out, "logs"), exist_ok=True)
        with open(os.path.join(self.repo.out, "logs", "build.log"), "w", encoding="utf-8") as f:
            f.writelines(log)

    def passes(self, shell):
        """Each test pass's (command, environment, log)."""
        return [(c, e, log) for c, e, log in zip(shell.commands, shell.envs, shell.logs, strict=True)
                if c[:2] == ["xcodebuild", "test-without-building"]]

    def results(self):
        return {k: v for k, v in self.read_record().items() if k == "tests" or k.startswith("tests-")}

    def log(self, name):
        return os.path.join(self.repo.out, "logs", name)

    def test_build_for_testing_on_the_first_runtime_s_simulator(self):
        shell = FakeShell(effects=[(has("build-for-testing"), lambda cmd: self.products())])
        code, out = self.step("build", shell)
        self.assertEqual(code, 0, out)
        cmd = shell.commands[0]
        self.assertEqual(cmd[:2], ["xcodebuild", "build-for-testing"])
        self.assertEqual(cmd[cmd.index("-project") + 1], "apps/ios/Tadayo.xcodeproj")
        self.assertEqual(cmd[cmd.index("-scheme") + 1], "Tadayo")
        self.assertEqual(cmd[cmd.index("-destination") + 1], f"platform=iOS Simulator,id={UDID}")
        self.assertIn("-skipPackagePluginValidation", cmd)
        self.assertEqual(len(shell.commands), 1)  # built once

    def test_a_scheme_with_no_tests_still_lets_package_plugins_run(self):
        self.write_scheme(scheme())
        shell = FakeShell(effects=[(starts("xcodebuild", "build"), lambda cmd: self.products())])
        self.assertEqual(self.step("build", shell)[0], 0)
        self.assertIn("-skipPackagePluginValidation", shell.commands[0])

    def test_the_generator_on_tadayoapi_builds(self):
        shell = FakeShell(effects=[(has("build-for-testing"),
                                    lambda cmd: self.products(log=PackagePluginsTest.GENERATOR))])
        code, out = self.step("build", shell)
        self.assertEqual(code, 0, out)

    def test_a_plugin_outside_the_list_fails_the_build(self):
        other = "Apply build tool plug-in “Linter” to target “TadayoCore” in package “tadayocore”\n"
        shell = FakeShell(effects=[(has("build-for-testing"),
                                    lambda cmd: self.products(log=PackagePluginsTest.GENERATOR + [other]))])
        code, out = self.step("build", shell)
        self.assertEqual(code, 1)
        self.assertIn("toolchain.PACKAGE_PLUGINS", out)
        self.assertIn("Linter, which isn't listed", out)

    def test_a_build_log_that_cant_be_read_fails(self):
        shell = FakeShell(effects=[(has("build-for-testing"), lambda cmd: (
            self.products(), os.remove(os.path.join(self.repo.out, "logs", "build.log"))))])
        code, out = self.step("build", shell)
        self.assertEqual(code, 1)
        self.assertIn("logs/build.log can't be read", out)

    def test_an_app_without_the_share_extension_fails(self):
        shell = FakeShell(effects=[(has("build-for-testing"), lambda cmd: self.products(False))])
        code, out = self.step("build", shell)
        self.assertEqual(code, 1)
        self.assertIn("TadayoShare.appex", out)

    def test_a_failed_build_fails(self):
        self.assertEqual(self.step("build", FakeShell(codes=[(has("build-for-testing"), 65)]))[0], 65)

    def test_no_simulator_no_build(self):
        # run.json's keys before the change (one `udid`) aren't read either.
        for record in (None, {"udid": UDID, "ios": "26.5"}):
            with self.subTest(record=record):
                os.remove(os.path.join(self.repo.out, "run.json"))
                if record:
                    self.record(record)
                shell = FakeShell()
                code, out = self.step("build", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn("no iOS 27.2 simulator in run.json", out)
                self.record({})

    def test_a_scheme_with_no_tests_is_built_without_testing(self):
        # xcodebuild refuses build-for-testing for a scheme with no test target, as the check
        # branch's minimal app and the app's first commits have.
        self.write_scheme(scheme())
        shell = FakeShell(effects=[(starts("xcodebuild", "build"), lambda cmd: self.products())])
        code, out = self.step("build", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(shell.commands[0][:2], ["xcodebuild", "build"])
        self.assertEqual(len(shell.commands), 1)
        code, out = self.step("test", FakeShell())
        self.assertEqual(code, 0, out)
        self.assertIn("no tests yet", out)

    def test_only_skipped_testables_is_no_tests(self):
        self.write_scheme(scheme(("Disabled", True)))
        shell = FakeShell(effects=[(starts("xcodebuild", "build"), lambda cmd: self.products())])
        self.assertEqual(self.step("build", shell)[0], 0)
        self.assertEqual(shell.commands[0][1], "build")

    def write_scheme(self, text):
        self.repo.write("apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes/Tadayo.xcscheme", text)

    def test_a_scheme_with_no_tests_passes_with_nothing_to_test(self):
        self.write_scheme(scheme())
        shell = FakeShell()
        code, out = self.step("test", shell)
        self.assertEqual((code, shell.commands), (0, []))
        self.assertIn("no tests yet", out)
        self.assertEqual(self.results(), {"tests": "none", "tests-27.2": "none", "tests-26.5": "none"})

    def test_a_missing_scheme_fails(self):
        os.remove(os.path.join(self.repo.root, *"apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes/Tadayo.xcscheme".split("/")))
        for step in ("build", "test"):
            with self.subTest(step=step):
                shell = FakeShell()
                code, out = self.step(step, shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn("no shared scheme", out)

    def test_a_missing_runtime_s_simulator_fails_before_any_command(self):
        record = self.read_record()
        del record["udid-26.5"]
        self.record(record)
        shell = FakeShell()
        code, out = self.step("test", shell)
        self.assertEqual((code, shell.commands), (1, []))
        self.assertIn("no iOS 26.5 simulator in run.json", out)

    def test_a_pass_on_each_runtime_in_order(self):
        # Distinct destinations, result bundles and logs; recording off on each.
        self.write_scheme(scheme(("TadayoTests", False), ("TadayoSnapshotTests", False),
                                 ("TadayoUITests", False), ("Disabled", True)))
        shell = FakeShell()
        code, out = self.step("test", shell)
        self.assertEqual(code, 0, out)
        passes = self.passes(shell)
        bundles = [os.path.join(self.repo.out, f"Tests-{v}.xcresult") for v in ("27.2", "26.5")]
        self.assertEqual([c[c.index("-destination") + 1] for c, _, _ in passes],
                         [f"platform=iOS Simulator,id={UDID}", f"platform=iOS Simulator,id={UDID_26}"])
        self.assertEqual([c[c.index("-resultBundlePath") + 1] for c, _, _ in passes], bundles)
        self.assertEqual([log for _, _, log in passes], [self.log("test-27.2.log"), self.log("test-26.5.log")])
        for cmd, env, _ in passes:
            self.assertIn("-skipPackagePluginValidation", cmd)
            self.assertEqual(env["TEST_RUNNER_SNAPSHOT_TESTING_RECORD"], "never")
            self.assertEqual(env["DEVELOPER_DIR"], DEVELOPER_DIR)
        summaries = [c for c in shell.commands if c[:3] == ["xcrun", "xcresulttool", "get"]]
        self.assertEqual([c[c.index("--path") + 1] for c in summaries], bundles)
        for version in ("27.2", "26.5"):
            self.assertTrue(os.path.isfile(self.log(f"test-summary-{version}.json")), version)
        self.assertFalse(os.path.exists(self.log("test.log")))
        self.assertEqual(self.results(), {"tests": "passed", "tests-27.2": "passed", "tests-26.5": "passed"})

    def test_the_snapshot_targets_run_on_the_snapshot_runtime_alone(self):
        # The interim (no ios-version file) is 26.5, the second pass; with the file, 27.2. Only
        # that pass has the artifacts directory.
        self.write_scheme(scheme(("TadayoTests", False), ("TadayoSnapshotTests", False),
                                 ("TadayoShareSnapshotTests", False), ("TadayoUITests", False)))
        artifacts = os.path.join(self.repo.out, "artifacts")
        for content, snapshots in ((None, "26.5"), (b"27.2\n", "27.2")):
            with self.subTest(snapshots=snapshots):
                if content:
                    self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)
                shell = FakeShell()
                code, out = self.step("test", shell)
                self.assertEqual(code, 0, out)
                self.assertIn(f"the snapshot tests run on iOS {snapshots}", out)
                passes = self.passes(shell)
                self.assertEqual(len(passes), 2)
                for (cmd, env, _), version in zip(passes, ("27.2", "26.5"), strict=True):
                    skipped = [cmd[i + 1] for i, c in enumerate(cmd) if c == "-skip-testing"]
                    if version == snapshots:
                        self.assertEqual(skipped, [], version)
                        self.assertEqual(env["TEST_RUNNER_SNAPSHOT_ARTIFACTS"], artifacts)
                    else:
                        self.assertEqual(sorted(skipped), ["TadayoShareSnapshotTests", "TadayoSnapshotTests"],
                                         version)
                        self.assertNotIn("TEST_RUNNER_SNAPSHOT_ARTIFACTS", env)

    def test_a_failed_pass_still_runs_the_next_and_fails_the_step(self):
        for failing, code, results in (
                ([UDID], 65, {"tests": "failed", "tests-27.2": "failed", "tests-26.5": "passed"}),
                ([UDID_26], 70, {"tests": "failed", "tests-27.2": "passed", "tests-26.5": "failed"}),
                ([UDID, UDID_26], 65, {"tests": "failed", "tests-27.2": "failed", "tests-26.5": "failed"})):
            with self.subTest(failing=failing):
                shell = FakeShell(codes=[(on(udid), 65 if udid == UDID else 70) for udid in failing])
                found, out = self.step("test", shell)
                self.assertEqual(found, code)
                self.assertEqual(len(self.passes(shell)), 2)
                self.assertEqual(self.results(), results)
                self.assertIn("the evidence job still publishes what they drew", out)

    def test_each_pass_is_recorded_as_it_ends(self):
        # A step stopped by its timeout during the second pass keeps the first pass's result.
        class Stopped(Exception):
            pass

        def stop(cmd):
            raise Stopped
        with self.assertRaises(Stopped):
            self.step("test", FakeShell(codes=[(on(UDID_26), stop)]))
        self.assertEqual(self.results(), {"tests-27.2": "passed"})
        # A pass with nothing to run is recorded as it ends too.
        self.record({k: v for k, v in self.read_record().items() if k != "tests" and not k.startswith("tests-")})
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        with self.assertRaises(Stopped):
            self.step("test", FakeShell(codes=[(on(UDID_26), stop)]))
        self.assertEqual(self.results(), {"tests-27.2": "none"})

    def test_between_passes_the_device_is_shut_down_and_the_next_booted(self):
        shell = FakeShell()
        self.assertEqual(self.step("test", shell)[0], 0)
        seen = [(c[:2] if c[0] == "xcodebuild" else c, log) for c, log in zip(shell.commands, shell.logs, strict=True)
                if c[0] == "xcodebuild" or c[:2] == ["xcrun", "simctl"]]
        # iOS 26.5, downloaded (toolchain.IOS_DOWNLOADS), has where it is read before and after
        # its pass, once booted (with `mount`, which this list leaves out); iOS 27.2, the
        # image's own, doesn't.
        images = (["xcrun", "simctl", "list", "runtimes", "--json"], None)
        self.assertEqual(seen, [
            (["xcodebuild", "test-without-building"], self.log("test-27.2.log")),
            (["xcrun", "simctl", "shutdown", UDID], self.log("test-26.5.log")),
            (["xcrun", "simctl", "bootstatus", UDID_26, "-b"], self.log("test-26.5.log")),
            images,
            (["xcodebuild", "test-without-building"], self.log("test-26.5.log")),
            images])

    def test_a_downloaded_runtime_s_pass_logs_where_it_is(self):
        # actions/runner-images#14946: the pass's log says where iOS 26.5's runtime is (its
        # bundle and its build's volumes) before and after it, and the step says so when that
        # changed. It never decides the pass's result.
        self.record(dict(self.read_record(), **{"runtime-26.5": IOS_26_5["identifier"], "runtime-build-26.5": "23F77"}))
        listed = json.dumps({"runtimes": [dict(IOS_26_5, bundlePath=RUNTIME_BUNDLE)]})
        volumes = RUNTIME_BUNDLE.replace(CRYPTEX + "iOS_23F77", "/Library/Developer/CoreSimulator/Volumes/iOS_23F77")
        moved_bundle = json.dumps({"runtimes": [dict(IOS_26_5, bundlePath=volumes)]})
        moved_mount = MOUNTS.replace(f"{CRYPTEX}iOS_23F77 ", "/Library/Developer/CoreSimulator/Volumes/iOS_23F77 ")
        here = f"{RUNTIME_BUNDLE}; volumes: {CRYPTEX}iOS_23F77, {CRYPTEX}iOS_23F77_1"
        cases = [
            ("still", [(0, listed, "")] * 2, [(0, MOUNTS, "")] * 2, here, None),
            ("bundle moved", [(0, listed, ""), (0, moved_bundle, "")], [(0, MOUNTS, "")] * 2, here,
             f"{volumes}; volumes: {CRYPTEX}iOS_23F77, {CRYPTEX}iOS_23F77_1"),
            ("volume moved", [(0, listed, "")] * 2, [(0, MOUNTS, ""), (0, moved_mount, "")], here,
             f"{RUNTIME_BUNDLE}; volumes: /Library/Developer/CoreSimulator/Volumes/iOS_23F77, {CRYPTEX}iOS_23F77_1"),
            # A read that fails after the pass is unreadable, not a move.
            ("after unreadable", [(0, listed, ""), (1, "", "simctl: error")], [(0, MOUNTS, "")] * 2, here, None),
            ("mount unreadable", [(0, listed, "")] * 2, [(0, MOUNTS, ""), (1, "", "")], here, None),
        ]
        for name, lists, mounts, before, after in cases:
            with self.subTest(name):
                lists, mounts = iter(lists), iter(mounts)
                shell = FakeShell(answers=[(starts("xcrun", "simctl", "list", "runtimes", "--json"), lambda cmd: next(lists)),
                                           (starts("mount"), lambda cmd: next(mounts))])
                code, out = self.step("test", shell)
                self.assertEqual(code, 0, out)
                self.assertEqual(self.results(), {"tests": "passed", "tests-27.2": "passed", "tests-26.5": "passed"})
                with open(self.log("test-26.5.log")) as f:
                    text = f.read()
                os.remove(self.log("test-26.5.log"))
                unreadable = name.endswith("unreadable")
                self.assertIn(f"iOS 26.5 before the pass: {before}\n", text)
                self.assertIn(f"iOS 26.5 after the pass: {'unreadable' if unreadable else after or before}\n", text)
                self.assertEqual("runtime moved during its pass (actions/runner-images#14946)" in out, after is not None)
                if after is not None:
                    self.assertIn(f": {before} became {after} (logs/test-26.5.log)", out)
                # iOS 27.2, the image's own, has no such lines.
                self.assertFalse(os.path.isfile(self.log("test-27.2.log")))
        # Unreadable both times: said in the log, nothing else.
        code, out = self.step("test", FakeShell())
        self.assertEqual(code, 0, out)
        with open(self.log("test-26.5.log")) as f:
            text = f.read()
        self.assertIn("iOS 26.5 before the pass: unreadable\n", text)
        self.assertIn("iOS 26.5 after the pass: unreadable\n", text)
        self.assertNotIn("moved during its pass", out)

    def test_a_failed_shutdown_is_logged_and_a_failed_boot_fails_its_pass(self):
        shell = FakeShell(codes=[(starts("xcrun", "simctl", "shutdown"), 1)])
        self.assertEqual(self.step("test", shell)[0], 0)
        self.assertEqual(len(self.passes(shell)), 2)
        shell = FakeShell(codes=[(starts("xcrun", "simctl", "bootstatus"), 1)])
        code, out = self.step("test", shell)
        self.assertEqual(code, 1)
        self.assertIn(f"the iOS 26.5 simulator {UDID_26} didn't boot", out)
        self.assertEqual(len(self.passes(shell)), 1)
        self.assertEqual(self.results(), {"tests": "failed", "tests-27.2": "passed", "tests-26.5": "failed"})

    def test_a_pass_with_no_target_left_is_none_and_boots_nothing(self):
        # A scheme of snapshot tests alone: the other runtime's pass has nothing to run.
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        shell = FakeShell()
        self.assertEqual(self.step("test", shell)[0], 0)
        self.assertEqual([c[c.index("-destination") + 1] for c, _, _ in self.passes(shell)],
                         [f"platform=iOS Simulator,id={UDID_26}"])
        # 27.2's device, booted by the simulator step, is shut down for 26.5's.
        self.assertIn(["xcrun", "simctl", "shutdown", UDID], shell.commands)
        self.assertEqual(self.results(), {"tests": "passed", "tests-27.2": "none", "tests-26.5": "passed"})
        self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, "27.2\n")
        shell = FakeShell()
        self.assertEqual(self.step("test", shell)[0], 0)
        self.assertEqual(len(self.passes(shell)), 1)
        self.assertFalse([c for c in shell.commands if c[:2] == ["xcrun", "simctl"]])
        self.assertEqual(self.results(), {"tests": "passed", "tests-27.2": "passed", "tests-26.5": "none"})

    def test_a_stale_bundle_is_removed_before_its_pass(self):
        # xcodebuild refuses a -resultBundlePath that already exists.
        for version in ("27.2", "26.5"):
            self.repo.write(f"_runner_temp/ios-out/Tests-{version}.xcresult/Info.plist", "stale")
        seen = []
        shell = FakeShell(effects=[(has("test-without-building"), lambda cmd: seen.append(
            (cmd[cmd.index("-resultBundlePath") + 1], os.path.exists(cmd[cmd.index("-resultBundlePath") + 1]))))])
        code, out = self.step("test", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(seen, [(os.path.join(self.repo.out, f"Tests-{v}.xcresult"), False) for v in ("27.2", "26.5")])

    def test_an_unpinned_snapshot_runtime_fails_before_any_command(self):
        # Never so with the pins PinsTest checks; were it so, no pass would run the snapshot tests.
        for name, value, content in (("SNAPSHOT_RUNTIME_INTERIM", "26.4", None),
                                     ("SNAPSHOT_RUNTIME", "27.3", b"27.3\n")):
            with self.subTest(name=name), mock.patch.object(toolchain, name, value):
                if content:
                    self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)
                shell = FakeShell()
                code, out = self.step("test", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn(f"the snapshot runtime, iOS {value}, isn't one of 27.2, 26.5", out)

    def test_the_backstop_runs_once_after_every_pass(self):
        for codes in ([], [(has("test-without-building"), 65)]):
            with self.subTest(failing=bool(codes)):
                shell = FakeShell(codes=codes)
                self.step("test", shell)
                status = [i for i, c in enumerate(shell.commands) if c[:2] == ["git", "status"]]
                last = max(i for i, c in enumerate(shell.commands) if c[:2] == ["xcodebuild", "test-without-building"])
                self.assertEqual(len(status), 1)
                self.assertGreater(status[0], last)
                # Every untracked file by its own path: without --untracked-files=all, git shows a
                # new __Snapshots__/<Test>/ folder as the folder, and a reference recorded into
                # it would get past the backstop.
                self.assertEqual(shell.commands[status[0]],
                                 ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", "apps/ios"])

    def test_a_bad_ios_version_fails_before_any_command(self):
        for content in BAD_IOS_VERSIONS[:6]:
            with self.subTest(content=content):
                self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)
                shell = FakeShell()
                code, out = self.step("test", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn(ios_steps.SNAPSHOT_RUNTIME_FILE, out)

    def test_a_stray_ios_version_variable_is_ignored(self):
        self.write_scheme(scheme(("TadayoTests", False), ("TadayoSnapshotTests", False)))
        expected = FakeShell()
        self.step("test", expected)
        shell = FakeShell()
        self.assertEqual(self.step("test", shell, environ={"IOS_VERSION": "18.6"})[0], 0)
        self.assertEqual(shell.commands, expected.commands)

    def test_a_test_that_sets_its_own_record_mode_is_refused(self):
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        for line in ["assertSnapshot(of: v, as: .image, record: .all)",
                     "assertSnapshot(of: v, as: .image, record: true)",
                     "withSnapshotTesting(record: .missing) {",
                     "isRecording = true",
                     "setenv(\"SNAPSHOT_TESTING_RECORD\", \"all\", 1)",
                     ".snapshots(record: .failed)",
                     # A Bool maps to a mode too: false is .missing, which also overrides never.
                     "assertSnapshot(of: v, as: .image, record: false)",
                     "isRecording = false",
                     "withSnapshotTesting(record: false) {",
                     "@Suite(.snapshots(record: false))",
                     "record = true",
                     "SnapshotTesting.record = true",
                     "SnapshotTesting.isRecording = false"]:
            with self.subTest(line=line):
                self.repo.write("apps/ios/TadayoSnapshotTests/HomeTests.swift", f"func t() {{\n  {line}\n}}\n")
                shell = FakeShell()
                code, out = self.step("test", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn("HomeTests.swift:2", out)

    def test_record_never_and_comments_are_fine(self):
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        self.repo.write("apps/ios/TadayoSnapshotTests/HomeTests.swift",
                        "assertSnapshot(of: v, as: .image, record: .never)\n// record: .all is what local runs use\n"
                        "let record = false\nif isRecording == true {}\n")
        self.assertEqual(self.step("test", FakeShell())[0], 0)

    def test_a_run_that_wrote_a_reference_fails_whatever_set_the_mode(self):
        # A computed mode (`record: mode`) gets past RECORDING; under never, nothing is written.
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        written = "?? apps/ios/T/__Snapshots__/HomeTests/testHome.H01-open.png\0" \
                  "?? apps/ios/Tadayo.xcodeproj/project.pbxproj\0?? apps/ios/Tadayo/Generated/icon.png\0"
        code, out = self.step("test", FakeShell(answers=[(starts("git", "status"), (0, written, ""))]))
        self.assertEqual(code, 1)
        self.assertIn("testHome.H01-open.png", out)
        self.assertNotIn("project.pbxproj", out)
        self.assertNotIn("icon.png", out)  # only a __Snapshots__ folder holds references
        self.assertEqual(self.read_record()["tests"], "failed")
        elsewhere = "?? apps/ios/Tadayo/Generated/icon.png\0 M apps/ios/Tadayo/Info.plist\0"
        self.assertEqual(self.step("test", FakeShell(answers=[(starts("git", "status"), (0, elsewhere, ""))]))[0], 0)
        changed = " M apps/ios/T/__Snapshots__/HomeTests/testHome.H01-open.png\0"
        self.assertEqual(self.step("test", FakeShell(answers=[(starts("git", "status"), (0, changed, ""))]))[0], 1)
        self.assertEqual(self.step("test", FakeShell(answers=[(starts("git", "status"), (128, "", "fatal"))]))[0], 1)
        # A failed pass that also wrote one: the backstop still says so, and the step fails.
        code, out = self.step("test", FakeShell(answers=[(starts("git", "status"), (0, written, ""))],
                                                codes=[(has("test-without-building"), 65)]))
        self.assertEqual(code, 65)
        self.assertIn("testHome.H01-open.png", out)
        self.assertEqual(self.read_record()["tests"], "failed")

    def test_a_test_plan_s_targets(self):
        self.write_scheme(SCHEME.format(testables="").replace(
            "<Testables>", '<TestPlans><TestPlanReference reference = "container:Tadayo.xctestplan" '
            'default = "YES"></TestPlanReference></TestPlans><Testables>'))
        self.repo.write("apps/ios/Tadayo.xctestplan", json.dumps({"testTargets": [
            {"target": {"name": "TadayoSnapshotTests"}}, {"target": {"name": "Off"}, "enabled": False}]}))
        scheme_path = os.path.join(self.repo.root, "apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes/Tadayo.xcscheme")
        self.assertEqual(ios_steps.scheme_test_targets(scheme_path, os.path.join(self.repo.root, "apps/ios")),
                         ["TadayoSnapshotTests"])


class LogFilterTest(unittest.TestCase):
    # The end of `ios` run 41958887177's build log, lines 116 to 127 as the run wrote them
    # (ios/b0-plugins-check at ab8968c), where Xcode refused the OpenAPI generator's plugin and
    # no line said `error:`.
    UNTRUSTED_PLUGIN = [
        "Prepare packages\n",
        "\n",
        "Validate plug-in \u201cOpenAPIGenerator\u201d in package \u201cswift-openapi-generator\u201d\n",
        "\n",
        "** TEST BUILD FAILED **\n",
        "\n",
        "\n",
        "The following build commands failed:\n",
        "\tValidate plug-in \u201cOpenAPIGenerator\u201d in package \u201cswift-openapi-generator\u201d\n",
        "\teyJibHVlcHJpbnRQcm92aWRlcl9wcm92aWRlckZpbGVQYXRoU3RyaW5nIjoiXC9Vc2Vyc1wvcnVubmVyXC93b3JrXC9U"
        "YWRheW9cL1RhZGF5b1wvYXBwc1wvaW9zXC9UYWRheW8ueGNvZGVwcm9qIiwidHlwZSI6eyJibHVlcHJpbnRQcm92aWRl"
        "ciI6e319fQ==\n",
        "\tBuilding project Tadayo for testing with scheme Tadayo\n",
        "(3 failures)\n",
    ]
    SHOWN = [
        "** TEST BUILD FAILED **\n",
        "The following build commands failed:\n",
        "\tValidate plug-in \u201cOpenAPIGenerator\u201d in package \u201cswift-openapi-generator\u201d\n",
        UNTRUSTED_PLUGIN[9],
        "\tBuilding project Tadayo for testing with scheme Tadayo\n",
        "(3 failures)\n",
    ]
    # Indented lines outside the list, as a build log has them, and a compiler error.
    ELSEWHERE = ["\tcd /Users/runner/work\n", "    export PATH=/usr/bin\n",
                 "/a.swift:3:1: error: x\n", "\tnote\n"]

    def shown(self, lines):
        log_filter = ios_steps.LogFilter()
        return [line for line in lines if log_filter.show(line)]

    def test_the_commands_that_failed_are_printed_with_the_list(self):
        self.assertEqual(self.shown(self.UNTRUSTED_PLUGIN), self.SHOWN)

    def test_indented_lines_elsewhere_stay_in_the_log_only(self):
        self.assertEqual(self.shown(self.ELSEWHERE), ["/a.swift:3:1: error: x\n"])

    def test_shell_run_prints_what_the_filter_shows_and_logs_every_line(self):
        # Shell.run itself, on a real process: what it prints is LogFilter's choice, and the log
        # holds every line.
        root = tempfile.mkdtemp(prefix="ios-shell-")
        self.addCleanup(shutil.rmtree, root, True)
        log = os.path.join(root, "logs", "build.log")
        lines = self.ELSEWHERE + self.UNTRUSTED_PLUGIN
        script = os.path.join(root, "xcodebuild.py")
        with open(script, "w", encoding="utf-8") as f:
            f.write("import sys\nsys.stdout.buffer.write(" + repr("".join(lines).encode("utf-8"))
                    + ")\nsys.exit(65)\n")
        cmd = [sys.executable, "-I", script]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = ios_steps.Shell(root).run(cmd, env={"LC_ALL": "C.UTF-8"}, log=log)
        self.assertEqual(code, 65)
        printed = out.getvalue().splitlines(keepends=True)
        self.assertEqual(printed[0], "+ " + " ".join(cmd) + "\n")
        self.assertEqual(printed[1:], ["/a.swift:3:1: error: x\n"] + self.SHOWN)
        with open(log, encoding="utf-8") as f:
            self.assertEqual(f.read(), "+ " + " ".join(cmd) + "\n" + "".join(lines))


class PackagePluginsTest(unittest.TestCase):
    # Lines 116 to 125, 9509 and 9515 of `ios` run 41961456622's build log (ios/b0-plugins-check
    # at a45fa23), where Xcode compiled the generator's plugin, applied it to TadayoAPI, and
    # compiled the client it wrote.
    GENERATOR = [
        "Prepare packages\n",
        "\n",
        "Compile plug-in \u201cOpenAPIGenerator\u201d in package \u201cswift-openapi-generator\u201d\n",
        "[debug]: Compiling plugin to executable at /Users/runner/work/_temp/DerivedData/Build/"
        "Products/PluginExecutables/OpenAPIGenerator\n",
        "[debug]: Using compiler /Applications/Xcode_26.6.app/Contents/Developer/Toolchains/"
        "XcodeDefault.xctoolchain/usr/bin/swiftc\n",
        "[debug]: Plugin compilation output directory '/Users/runner/work/_temp/DerivedData/Build/"
        "Products/PluginExecutables'\n",
        "[debug]: Computed hash of plugin compilation inputs: "
        "832f7c5c083aa44273f22e3f930a7b0fdba1c41bef4e72ed5b2195387dd3aa5b\n",
        "\n",
        "\n",
        "Apply build tool plug-in \u201cOpenAPIGenerator\u201d to target \u201cTadayoAPI\u201d in package "
        "\u201ctadayoapi\u201d\n",
        "SwiftDriver TadayoAPI normal arm64 com.apple.xcode.tools.swift.compiler (in target "
        "'TadayoAPI' from project 'TadayoAPI')\n",
        "SwiftCompile normal arm64 /Users/runner/work/_temp/DerivedData/Build/Intermediates.noindex/"
        "BuildToolPluginIntermediates/tadayoapi.output/TadayoAPI/OpenAPIGenerator/GeneratedSources/"
        "Client.swift (in target 'TadayoAPI' from project 'TadayoAPI')\n",
    ]

    def problems(self, lines, allowed=None):
        return ios_steps.package_plugin_problems(lines, allowed or toolchain.PACKAGE_PLUGINS)

    def test_the_list_is_the_generator_on_tadayoapi(self):
        self.assertEqual(toolchain.PACKAGE_PLUGINS,
                         {"OpenAPIGenerator": ("swift-openapi-generator", ("TadayoAPI",))})

    def test_the_generator_on_tadayoapi_is_allowed(self):
        self.assertEqual(self.problems(self.GENERATOR), [])

    def test_a_build_with_no_plugin_is_allowed(self):
        self.assertEqual(self.problems(["Prepare packages\n", "** BUILD SUCCEEDED **\n"]), [])

    def test_the_refused_generator_is_still_the_listed_one(self):
        self.assertEqual(self.problems(LogFilterTest.UNTRUSTED_PLUGIN), [])

    def test_a_plugin_the_list_doesnt_name_fails(self):
        self.assertEqual(self.problems([
            "Compile plug-in \u201cLinter\u201d in package \u201cswift-lint-plugin\u201d\n",
            "Apply build tool plug-in \u201cLinter\u201d to target \u201cTadayoCore\u201d in package "
            "\u201ctadayocore\u201d\n"]), ["Linter, which isn't listed"])

    def test_the_generator_on_another_target_fails(self):
        self.assertEqual(self.problems(self.GENERATOR + [
            "Apply build tool plug-in \u201cOpenAPIGenerator\u201d to target \u201cTadayoCore\u201d in package "
            "\u201ctadayocore\u201d\n"]), ["OpenAPIGenerator on TadayoCore"])

    def test_a_plugin_of_the_same_name_from_another_package_fails(self):
        self.assertEqual(self.problems([
            "Compile plug-in \u201cOpenAPIGenerator\u201d in package \u201cswift-openapi-generator-fork\u201d\n"]),
            ["OpenAPIGenerator from swift-openapi-generator-fork, not swift-openapi-generator"])

    def test_a_plugins_folders_are_read_without_its_lines(self):
        # Xcode may word its lines differently: the folders a plugin's executable and its output
        # go to still name it.
        self.assertEqual(self.problems([
            "[debug]: Compiling plugin to executable at /Users/runner/work/_temp/DerivedData/Build/"
            "Products/PluginExecutables/Linter\n",
            "SwiftCompile normal arm64 /Users/runner/work/_temp/DerivedData/Build/Intermediates.noindex/"
            "BuildToolPluginIntermediates/tadayocore.output/TadayoCore/OpenAPIGenerator/x.swift "
            "(in target 'TadayoCore' from project 'TadayoCore')\n"]),
            ["Linter, which isn't listed", "OpenAPIGenerator on TadayoCore"])

    def test_a_line_about_a_plug_in_this_cant_read_fails(self):
        line = "Run prebuild plug-in \u201cOpenAPIGenerator\u201d for \u201cTadayoAPI\u201d\n"
        self.assertEqual(self.problems([line]),
                         ["a line about a plug-in this check can't read: " + line.strip()])

    def test_tadayoapi_built_with_no_line_about_its_plugin_fails(self):
        # Then Xcode no longer writes the lines this check reads, and it would pass on nothing.
        self.assertEqual(self.problems(self.GENERATOR[11:12]),
                         ["TadayoAPI was built, but no line says OpenAPIGenerator was applied to it"])

    def test_each_problem_is_said_once(self):
        line = "Apply build tool plug-in \u201cLinter\u201d to target \u201cTadayoCore\u201d in package \u201ct\u201d\n"
        self.assertEqual(self.problems([line, line]), ["Linter, which isn't listed"])


class StateTest(unittest.TestCase):
    def test_state_of(self):
        self.assertEqual(ios_steps.state_of("testUpcoming.F02-upcoming-dark.png"), "F02-upcoming-dark")
        self.assertEqual(ios_steps.state_of("test_upcoming.F02-upcoming.png"), "F02-upcoming")
        self.assertIsNone(ios_steps.state_of("testUpcoming.1.png"))
        self.assertIsNone(ios_steps.state_of("testUpcoming.png"))
        self.assertIsNone(ios_steps.state_of("testUpcoming.F02 upcoming.png"))

    def test_the_inventory_s_states(self):
        with open(os.path.join(ROOT, "design", "reference", "INVENTORY.md"), encoding="utf-8") as f:
            states = ios_steps.read_inventory(f.read())
        self.assertIn("F02-upcoming", states)
        self.assertIn("H01-open-dark", states)
        self.assertNotIn("brand-tokens", states)
        self.assertGreaterEqual(len(states), 149)

    def test_attachment_names(self):
        uuid = "8E4A1F2B-1C3D-4E5F-8A9B-0C1D2E3F4A5B"
        self.assertEqual(ios_steps.snapshot_file_from_attachment("testUpcoming.F02-upcoming.png"),
                         "testUpcoming.F02-upcoming.png")
        self.assertEqual(ios_steps.snapshot_file_from_attachment(f"testUpcoming.F02-upcoming_0_{uuid}.png"),
                         "testUpcoming.F02-upcoming.png")
        self.assertEqual(ios_steps.snapshot_file_from_attachment(f"testUpcoming.F02-upcoming.png_12_{uuid}.png"),
                         "testUpcoming.F02-upcoming.png")
        for name in ["reference.png", f"failure_1_{uuid}.png", "difference", "Screenshot.jpeg", "", None,
                     f"Launch Screen_0_{uuid}.png", f"a.loaded_0_{uuid}.elements"]:
            with self.subTest(name=name):
                self.assertIsNone(ios_steps.snapshot_file_from_attachment(name))

    def test_evidence_path(self):
        # One folder a run, each runtime's logs in it: the ios-<version>/ folders have ended.
        self.assertEqual(ios_steps.evidence_path("ios/b0-ios-check", SHA), "ios/b0-ios-check/0123456/ios")
        self.assertEqual(ios_steps.evidence_path("main", SHA, full=True), "main/0123456/ios-full")
        for branch, sha in [("", SHA), ("a/../b", SHA), ("/a", SHA), ("a/", SHA), ("a", "0123456"),
                            ("a", SHA.upper()), ("a", None)]:
            with self.subTest(branch=branch, sha=sha):
                with self.assertRaises(ValueError):
                    ios_steps.evidence_path(branch, sha)

    def test_magick_text(self):
        self.assertEqual(ios_steps.magick_text("50% done"), "50%% done")
        self.assertEqual(ios_steps.magick_text("@/etc/passwd"), " @/etc/passwd")
        self.assertEqual(ios_steps.magick_text("a\\nb"), "a\\\\nb")

    def test_no_render_notes(self):
        inventory = {"F02-upcoming", "A02-email"}
        self.assertEqual(ios_steps.no_render_note("A02-email", inventory), "built from spec, awaiting render")
        self.assertIn("book p26", ios_steps.no_render_note("A02-email-dark", inventory))
        self.assertIn("book p26", ios_steps.no_render_note("A02-email-xl", inventory))
        self.assertIn("not a state", ios_steps.no_render_note("Z99-nothing", inventory))
        self.assertIn("not a state", ios_steps.no_render_note(None, inventory))
        # A -dark or -xl state that is an inventory row of its own is awaiting its render.
        self.assertEqual(ios_steps.no_render_note("A02-email-xl", inventory | {"A02-email-xl"}),
                         "built from spec, awaiting render")

    def test_a_missing_program_is_a_failed_command(self):
        shell = ios_steps.Shell(ROOT)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(shell.run(["tadayo-no-such-program"]), 127)
            log = os.path.join(tempfile.mkdtemp(prefix="ios-steps-"), "x.log")
            self.addCleanup(shutil.rmtree, os.path.dirname(log), True)
            self.assertEqual(shell.run(["tadayo-no-such-program"], log=log), 127)
        self.assertEqual(shell.capture(["tadayo-no-such-program"])[0], 127)


class EvidenceTargetTest(StepsTest):
    def target(self, **environ):
        environ = dict({"GITHUB_REF_NAME": "ios/b0-xcode27-check", "GITHUB_SHA": SHA}, **environ)
        return self.steps(environ=environ).evidence_target()

    def test_a_push_s_folder_and_a_run_by_hand_s(self):
        self.assertEqual(self.target(GITHUB_EVENT_NAME="push"), ("ios/b0-xcode27-check/0123456/ios", "touched"))
        self.assertEqual(self.target(GITHUB_EVENT_NAME="workflow_dispatch"),
                         ("ios/b0-xcode27-check/0123456/ios-full", "full"))

    def test_a_stray_ios_version_is_ignored(self):
        # The workflow's input is gone: a variable of that name left in a runner's environment
        # neither makes an ios-<version>/ folder nor fails the step.
        for value in ("18.6", "26.5", "18; rm -rf /", " "):
            with self.subTest(value=value):
                self.assertEqual(self.target(GITHUB_EVENT_NAME="push", IOS_VERSION=value),
                                 ("ios/b0-xcode27-check/0123456/ios", "touched"))
                self.assertEqual(self.target(GITHUB_EVENT_NAME="workflow_dispatch", IOS_VERSION=value),
                                 ("ios/b0-xcode27-check/0123456/ios-full", "full"))


class CollectTest(StepsTest):
    def png(self, path, color="#336699"):
        full = os.path.join(self.repo.root, *path.split("/")) if not os.path.isabs(path) else path
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + color.encode())
        return full

    def entries(self):
        with open(os.path.join(self.repo.out, "snapshots.json")) as f:
            listed = json.load(f)["entries"]
        # Whatever collect writes, the evidence job's checks let through (Steps.checked_entry).
        for entry in listed:
            self.assertEqual(self.steps().checked_entry(entry)[1], [], entry)
        return {e["file"]: e for e in listed}

    def test_committed_changed_and_new_snapshots(self):
        # A test file's folder as Swift names one (`UpcomingView+Snapshots.swift`), which collect
        # keeps under a plain name.
        snaps = "apps/ios/TadayoSnapshotTests/__Snapshots__/Upcoming+Snapshots"
        self.png(f"{snaps}/testUpcoming.F02-upcoming.png")
        self.png(f"{snaps}/testUpcoming.F02-upcoming-dark.png")
        self.png(os.path.join(self.repo.out, "artifacts", "Upcoming+Snapshots", "testUpcoming.F02-upcoming-dark.png"), "#000")
        self.record(snapshots="26.5")
        os.makedirs(os.path.join(self.repo.out, "Tests-26.5.xcresult"))

        def export(cmd):
            target = cmd[cmd.index("--output-path") + 1]
            self.png(os.path.join(target, "A1.png"))
            self.png(os.path.join(target, "A2.png"))
            with open(os.path.join(target, "manifest.json"), "w") as f:
                json.dump([{"testIdentifier": "FriendsTests/testFriends()", "attachments": [
                    {"exportedFileName": "A1.png", "suggestedHumanReadableName": "testFriends.F01-friends_0_8E4A1F2B-1C3D-4E5F-8A9B-0C1D2E3F4A5B.png",
                     "isAssociatedWithFailure": True},
                    {"exportedFileName": "A2.png", "suggestedHumanReadableName": "reference_0_8E4A1F2B-1C3D-4E5F-8A9B-0C1D2E3F4A5B.png",
                     "isAssociatedWithFailure": True}]}], f)
            return 0, "", ""
        shell = FakeShell(answers=[(starts("xcrun", "xcresulttool", "export", "attachments"), export)])
        code, out = self.step("collect", shell)
        self.assertEqual(code, 0, out)
        export_cmd = next(c for c in shell.commands if c[:4] == ["xcrun", "xcresulttool", "export", "attachments"])
        self.assertEqual(export_cmd[export_cmd.index("--path") + 1], os.path.join(self.repo.out, "Tests-26.5.xcresult"))
        entries = self.entries()
        self.assertEqual(set(entries), {"testUpcoming.F02-upcoming.png", "testUpcoming.F02-upcoming-dark.png",
                                        "testFriends.F01-friends.png"})
        committed = entries["testUpcoming.F02-upcoming.png"]
        self.assertEqual((committed["status"], committed["state"], committed["image"]),
                         ("committed", "F02-upcoming", f"{snaps}/testUpcoming.F02-upcoming.png"))
        changed = entries["testUpcoming.F02-upcoming-dark.png"]
        self.assertEqual((changed["status"], changed["reference"], changed["image"]),
                         ("changed", f"{snaps}/testUpcoming.F02-upcoming-dark.png",
                          "snapshots/Upcoming_Snapshots/testUpcoming.F02-upcoming-dark.png"))
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, *changed["image"].split("/"))))
        new = entries["testFriends.F01-friends.png"]
        self.assertEqual((new["status"], new["state"], new["test"], new["reference"]),
                         ("new", "F01-friends", "FriendsTests", None))
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, *new["image"].split("/"))))
        # The manifest is kept with the logs, so the first run on the runner shows its shape.
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, "logs", "attachments-manifest.json")))

    def test_a_reference_the_run_wrote_isn_t_committed(self):
        snaps = "apps/ios/T/__Snapshots__/HomeTests"
        self.png(f"{snaps}/testHome.H01-open.png")
        self.png(f"{snaps}/testHome.H01-open-dark.png")
        self.png(f"{snaps}/testHome.H01-open-xl.png")
        status = (f"?? {snaps}/testHome.H01-open-dark.png\0 M {snaps}/testHome.H01-open-xl.png\0")
        code, out = self.step("collect", FakeShell(answers=[(starts("git", "status"), (0, status, ""))]))
        self.assertEqual(code, 0, out)
        entries = self.entries()
        self.assertEqual(entries["testHome.H01-open.png"]["status"], "committed")
        new, changed = entries["testHome.H01-open-dark.png"], entries["testHome.H01-open-xl.png"]
        self.assertEqual((new["status"], new["reference"]), ("new", None))
        self.assertEqual((changed["status"], changed["reference"]), ("changed", f"{snaps}/testHome.H01-open-xl.png"))
        for entry in (new, changed):
            self.assertTrue(entry["image"].startswith("snapshots/"))
            self.assertTrue(os.path.isfile(os.path.join(self.repo.out, *entry["image"].split("/"))))

    def test_nothing_drawn_still_lists_the_committed_references(self):
        self.png("apps/ios/T/__Snapshots__/HomeTests/testHome.H01-open.png")
        code, _ = self.step("collect", FakeShell())
        self.assertEqual(code, 0)
        self.assertEqual([e["status"] for e in self.entries().values()], ["committed"])

    def exported(self, shell):
        return [c[c.index("--path") + 1] for c in shell.commands
                if c[:4] == ["xcrun", "xcresulttool", "export", "attachments"]]

    def test_new_snapshots_come_from_the_snapshot_runtime_s_bundle(self):
        # run.json's `snapshots` when the simulator step wrote a pinned runtime there; else the
        # ios-version file's, as snapshot_runtime() reads it.
        for version in ("27.2", "26.5"):
            os.makedirs(os.path.join(self.repo.out, f"Tests-{version}.xcresult"))
        for written, content, expected in (("27.2", None, "27.2"), ("26.5", b"27.2\n", "26.5"),
                                           (None, None, "26.5"), (None, b"27.2\n", "27.2"),
                                           ("99.9", None, "26.5"), (["27.2"], b"27.2", "27.2")):
            with self.subTest(written=written, content=content):
                self.record({} if written is None else {"snapshots": written})
                path = os.path.join(self.repo.root, *ios_steps.SNAPSHOT_RUNTIME_FILE.split("/"))
                if content is None:
                    if os.path.exists(path):
                        os.remove(path)
                else:
                    self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, content)
                shell = FakeShell()
                code, out = self.step("collect", shell)
                self.assertEqual(code, 0, out)
                self.assertEqual(self.exported(shell), [os.path.join(self.repo.out, f"Tests-{expected}.xcresult")])

    def test_a_bad_file_with_nothing_in_run_json_exports_nothing_and_passes(self):
        # The simulator step failed on the file before it wrote `snapshots`: collect can't say
        # which pass drew, so it reads no bundle, says why, and still lists the references.
        self.png("apps/ios/T/__Snapshots__/HomeTests/testHome.H01-open.png")
        for version in ("27.2", "26.5"):
            os.makedirs(os.path.join(self.repo.out, f"Tests-{version}.xcresult"))
        self.repo.write(ios_steps.SNAPSHOT_RUNTIME_FILE, "26.5\n")
        shell = FakeShell()
        code, out = self.step("collect", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.exported(shell), [])
        self.assertIn(ios_steps.SNAPSHOT_RUNTIME_FILE, out)
        self.assertIn("no result bundle is read", out)
        self.assertEqual([e["status"] for e in self.entries().values()], ["committed"])


# What the build job's steps write in run.json, but the overall `tests`.
FACTS = {"xcode": "27.2", "swift": "6.4.2", "sdk": "27.2", "snapshots": "26.5", "snapshots-source": "interim",
         "ios-27.2": "27.2", "runtime-27.2": IOS_27_2["identifier"], "runtime-build-27.2": "24C55",
         "device-27.2": "iPhone 17", "udid-27.2": UDID, "tests-27.2": "passed",
         "ios-26.5": "26.5", "runtime-26.5": IOS_26_5["identifier"], "runtime-build-26.5": "23F77",
         "device-26.5": "iPhone 17", "udid-26.5": UDID_26, "tests-26.5": "failed"}
# index.md's lines about the run, under its title and first sentence, for FACTS.
RUN_LINES = ["- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`",
             "- iOS `27.2` on `iPhone 17`: tests `passed`, without the snapshot tests",
             "- iOS `26.5` on `iPhone 17`: tests `failed`, with the snapshot tests",
             "- References: iOS `26.5` (interim, no ios-version file)"]


class SheetsTest(StepsTest):
    """The B0 plan's slice 9 test, "the contact-sheet script on a 2.1 render and a sample PNG"."""

    def setUp(self):
        super().setUp()
        self.repo.copy(os.path.join(ROOT, *RENDER.split("/")), RENDER)
        self.repo.copy(os.path.join(ROOT, "design", "reference", "INVENTORY.md"), "design/reference/INVENTORY.md")
        self.environ.update({"GITHUB_REF_NAME": "ios/b0-ios-check", "GITHUB_SHA": SHA,
                             "GITHUB_EVENT_NAME": "push", "GITHUB_REPOSITORY": "beurni2/tadayo",
                             "GITHUB_SERVER_URL": "https://github.com", "GITHUB_RUN_ID": "42"})
        self.record(FACTS, tests="failed")
        os.makedirs(os.path.join(self.repo.out, "logs"))
        with open(os.path.join(self.repo.out, "logs", "test-26.5.log"), "w") as f:
            f.write("** TEST FAILED **\n")

    def sample(self, path, size="1179x2556", color="#2b4a6f"):
        full = os.path.join(self.repo.out, *path.split("/")) if path.startswith("snapshots/") \
            else os.path.join(self.repo.root, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if HAS_MAGICK:
            subprocess.run(["convert", "-size", size, f"xc:{color}", "png:" + full], check=True)
        else:
            with open(full, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n")
        return path

    def snapshots(self, entries):
        with open(os.path.join(self.repo.out, "snapshots.json"), "w") as f:
            json.dump({"entries": entries}, f)

    def entry(self, state, status, image=None, reference=None):
        file = f"testX.{state}.png"
        return {"state": state, "test": "XTests", "file": file, "status": status,
                "image": image or self.sample(f"snapshots/XTests/{file}"), "reference": reference}

    def stage(self, folder="ios"):
        return os.path.join(self.repo.work, "stage", "ios", "b0-ios-check", "0123456", folder)

    def finished(self):
        with open(os.path.join(self.repo.work, "evidence.json")) as f:
            return json.load(f)

    def index(self, folder="ios"):
        with open(os.path.join(self.stage(folder), "index.md")) as f:
            return f.read()

    def git_diff(self, paths, base=SHA):
        return FakeShell(answers=[
            (starts("git", "merge-base"), (0, base + "\n", "")),
            (starts("git", "rev-parse"), (0, base + "\n", "")),
            (starts("git", "diff"), (0, "\0".join(paths), ""))])

    @unittest.skipUnless(HAS_MAGICK, "ImageMagick isn't installed here; the evidence job installs it")
    def test_a_2_1_render_beside_a_sample_snapshot(self):
        self.snapshots([self.entry("F02-upcoming", "new")])
        shell = ios_steps.Shell(self.repo.root)
        code, out = self.step("sheets", shell)
        self.assertEqual(code, 0, out)
        sheet = os.path.join(self.stage(), "sheets", "F02-upcoming.jpg")
        info = subprocess.run(["identify", "-format", "%m %w %h", sheet], capture_output=True,
                              text=True, check=True).stdout.split()
        self.assertEqual(info[0], "JPEG")
        width, height = int(info[1]), int(info[2])
        self.assertEqual(width, 2 * (600 + 2 * 24))  # two tiles: the render and the snapshot
        self.assertGreater(height, 1300)
        self.assertTrue(os.path.isfile(os.path.join(self.stage(), "snapshots", "F02-upcoming.png")))
        self.assertTrue(os.path.isfile(os.path.join(self.stage(), "logs", "test-26.5.log")))
        with open(os.path.join(self.stage(), "index.md")) as f:
            index = f.read()
        self.assertIn("https://github.com/beurni2/tadayo/blob/evidence/ios/b0-ios-check/0123456/ios/sheets/F02-upcoming.jpg", index)
        self.assertIn("design/reference/2.1/F02-upcoming.png", index)
        self.assertIn("- Tests: `failed`", index)

    @unittest.skipUnless(HAS_MAGICK, "ImageMagick isn't installed here; the evidence job installs it")
    def test_a_changed_snapshot_shows_the_render_its_reference_and_itself(self):
        reference = self.sample("apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png", color="#888")
        self.snapshots([self.entry("F02-upcoming", "changed", reference=reference)])
        code, out = self.step("sheets", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        info = subprocess.run(["identify", "-format", "%w", os.path.join(self.stage(), "sheets", "F02-upcoming.jpg")],
                              capture_output=True, text=True, check=True).stdout
        self.assertEqual(int(info), 3 * (600 + 2 * 24))

    def test_a_state_with_no_render_shows_its_snapshot_alone_marked(self):  # runs in ci too
        self.snapshots([self.entry("A02-email", "new")])
        shell = FakeShell()
        code, out = self.step("sheets", shell)
        self.assertEqual(code, 0, out)
        montage = next(c for c in shell.commands if c[0] == "montage")
        self.assertIn("-tile", montage)
        self.assertEqual(montage[montage.index("-tile") + 1], "1x1")
        labels = [montage[i + 1] for i, c in enumerate(montage) if c == "-label"]
        self.assertEqual(len(labels), 1)
        self.assertIn("built from spec, awaiting render", labels[0])
        # A one-tile sheet is 648 pixels wide: the title, drawn at twice the labels' size, is the
        # state alone, and the run's details are lines of the snapshot's label.
        self.assertEqual(montage[montage.index("-title") + 1], "A02-email")
        # The snapshot runtime's iOS and device, and which runtime the references are for.
        self.assertIn("iOS 26.5 · iPhone 17\nreferences: iOS 26.5 (interim, no ios-version file)\n"
                      "ios/b0-ios-check @ 0123456", labels[0])

    def test_a_changed_snapshot_s_sheet_has_three_panels(self):  # without ImageMagick, so in ci too
        reference = self.sample("apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png", color="#888")
        self.repo.copy(os.path.join(ROOT, *RENDER.split("/")), "design/reference/2.1/H01-open.png")
        committed = self.sample("apps/ios/S/__Snapshots__/XTests/testX.H01-open.png")
        self.snapshots([self.entry("F02-upcoming", "changed", reference=reference),
                        self.entry("H01-open", "committed", image=committed, reference=committed)])
        shell = FakeShell()
        code, out = self.step("sheets", shell, environ={"GITHUB_EVENT_NAME": "workflow_dispatch"})
        self.assertEqual(code, 0, out)
        changed, same = [c for c in shell.commands if c[0] == "montage"]
        self.assertEqual(changed[changed.index("-tile") + 1], "3x1")
        self.assertEqual([changed[i + 1].split("\n")[0] for i, c in enumerate(changed) if c == "-label"],
                         ["Render", "Before", "Snapshot"])
        self.assertIn("png:" + os.path.abspath(os.path.join(self.repo.root, *reference.split("/"))), changed)
        # A committed snapshot has no Before panel: its reference is its image.
        self.assertEqual(same[same.index("-tile") + 1], "2x1")
        self.assertEqual([same[i + 1].split("\n")[0] for i, c in enumerate(same) if c == "-label"],
                         ["Render", "Snapshot"])

    def test_a_changed_snapshot_with_no_render_is_shown_alone(self):  # in ci too
        # TECH-DESIGN section 2 and docs/DESIGN-HANDOFF.md: a state with no render shows the
        # snapshot alone, marked; its committed reference isn't drawn beside it.
        for state, note in (("A02-email", "built from spec, awaiting render"),
                            ("A02-email-dark", "judged against book p26")):
            with self.subTest(state=state):
                reference = self.sample(f"apps/ios/S/__Snapshots__/XTests/testX.{state}.png", color="#888")
                self.snapshots([self.entry(state, "changed", reference=reference)])
                shell = FakeShell()
                self.assertEqual(self.step("sheets", shell)[0], 0)
                montage = next(c for c in shell.commands if c[0] == "montage")
                self.assertEqual(montage[montage.index("-tile") + 1], "1x1")
                labels = [montage[i + 1] for i, c in enumerate(montage) if c == "-label"]
                self.assertEqual([label.split("\n")[0] for label in labels], ["Snapshot"])
                self.assertIn(note, labels[0])
                self.assertNotIn("png:" + os.path.abspath(os.path.join(self.repo.root, *reference.split("/"))),
                                 montage)

    def test_the_index_says_which_file_each_image_belongs_to(self):
        reference = self.sample("apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png")
        self.snapshots([self.entry("F02-upcoming", "changed", reference=reference),
                        self.entry("A02-email", "new")])
        self.assertEqual(self.step("sheets", FakeShell())[0], 0)
        with open(os.path.join(self.stage(), "index.md")) as f:
            index = f.read()
        self.assertIn("| `F02-upcoming` | changed | `apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png` |", index)
        self.assertIn("| `A02-email` | new | `XTests/testX.A02-email.png` |", index)

    def test_paths_from_the_build_job_are_checked_again(self):
        # snapshots.json comes from the macOS job; this job can write, so it trusts no path in it.
        # Each entry is one collect could write but for the fields named beside it, and fails
        # exactly those: no other check can hide one that lets its field through.
        steps = self.steps()
        outside = self.repo.write("secret.txt", "not evidence")
        self.repo.write("apps/ios/T/testB.A02-email.png", "not evidence")  # in apps/ios, in no __Snapshots__ folder
        self.repo.write("apps/ios/T/x.png", "not evidence")
        self.repo.write("apps/ios/Tadayo/Info.plist", "not evidence")
        self.repo.mkdir("apps/ios/T/__Snapshots__/XTests")
        folder = os.path.join(self.repo.root, "apps", "ios", "T", "__Snapshots__", "XTests")
        os.symlink(outside, os.path.join(folder, "testF.A02-email.png"))  # a link out of the repository
        os.symlink(os.path.join(self.repo.root, "apps", "ios", "T", "x.png"),
                   os.path.join(folder, "testG.A02-email.png"))  # a link out of the folder, into apps/ios

        def new(file, **fields):
            return dict({"state": ios_steps.state_of(file), "test": "X", "file": file, "status": "new",
                         "image": f"snapshots/X/{file}", "reference": None}, **fields)

        def committed(file, image):
            return {"state": ios_steps.state_of(file), "test": "XTests", "file": file,
                    "status": "committed", "image": image, "reference": image}
        both = ["image", "reference"]
        cases = [
            (new("testA.A02-email.png", image="snapshots/../../../secret.txt"), ["image"]),
            (committed("testB.A02-email.png", "apps/ios/T/testB.A02-email.png"), both),
            (committed("testC.A02-email.png", "apps/ios/T/__Snapshots__/../../../secret.txt"), both),
            (committed("testD.A02-email.png", "apps/ios/T/__Snapshots__/../../Tadayo/Info.plist"), both),
            (committed("testE.A02-email.png", "apps/ios/T/__Snapshots__/../x.png"), both),
            (committed("testF.A02-email.png", "apps/ios/T/__Snapshots__/XTests/testF.A02-email.png"), both),
            (committed("testG.A02-email.png", "apps/ios/T/__Snapshots__/XTests/testG.A02-email.png"), both),
            (new("testH.A02-email.png", image="/" + outside.lstrip("/")), ["image"]),
            (dict(self.entry("F01-friends", "changed"), reference="secret.txt"), ["reference"]),
            (dict(self.entry("F02-upcoming", "changed"), reference="apps/ios/T/__Snapshots__/../../Tadayo/Info.plist"),
             ["reference"]),
            (dict(self.entry("H01-open", "changed"), reference="snapshots/XTests/testX.H01-open.png"), ["reference"]),
            (new("testX.A.png", state="../" * 7 + "planted"), ["state"]),
            # Names that would write markdown of their own into index.md, or crash the step.
            (new("a` | [Open the fix](https://example.invalid) |\n# Gate passed\n`.png", image="snapshots/X/m.png"),
             ["file"]),
            (new("testI.A02-email.png", test="X` | [Open](https://example.invalid)"), ["test"]),
            # Each whole value is checked, not only its start: no `/` to split on, a line break.
            (new("testK.A02-email.png", test="X` | [Open](x.md) | `"), ["test"]),
            (new("testL.A02-email.png", test="X\n# Gate passed"), ["test"]),
            (new("testN.A02-email.png", state="A02-email\n"), ["state"]),
            (dict(self.entry("F03-x", "changed"), reference="apps/ios/X/__Snapshots__/a` [Open](https://example.invalid).png"),
             ["reference"]),
            (new("x\ud800.png", image="snapshots/X/s.png"), ["file"]),
            (new("testJ.A02-email.png", status="passed"), ["status"]),
            ("not an entry", ["the entry isn't an object"])]
        for entry, expected in cases:
            with self.subTest(entry=entry):
                self.assertEqual(steps.checked_entry(entry)[1], expected)
        entries = [entry for entry, _ in cases]
        shell = FakeShell()
        self.snapshots(entries)
        code, out = self.step("sheets", shell, environ={"GITHUB_EVENT_NAME": "workflow_dispatch"})
        self.assertEqual(code, 1, out)
        stage = self.stage("ios-full")
        copied = [os.path.join(d, n) for d, _, ns in os.walk(stage) for n in ns]
        for path in copied:
            with open(path, "rb") as f:
                self.assertNotIn(b"not evidence", f.read(), path)
        planted = [os.path.join(d, n) for d, _, ns in os.walk(self.repo.root) for n in ns if n.startswith("planted")]
        self.assertEqual(planted, [])
        self.assertEqual([c for c in shell.commands if c[0] == "montage"], [])  # every entry failed
        index = self.index("ios-full")
        self.assertNotIn("example.invalid", index)
        self.assertNotIn("[Open]", index)
        self.assertEqual([line for line in index.splitlines() if line.startswith("#")],
                         ["# ios/b0-ios-check/0123456/ios-full"])
        self.assertEqual(index.count("its entry failed this job's checks"), len(entries))
        self.assertTrue(os.path.isfile(outside))

    def test_only_what_collect_writes_gets_through(self):
        steps = self.steps()
        self.repo.mkdir("apps/ios/T/__Snapshots__/HomeView+Snapshots")
        for image in ("snapshots/XTests/testX.F02-upcoming.png", "snapshots/Home_Tests/testé.F02-upcoming.png",
                      "apps/ios/T/__Snapshots__/HomeView+Snapshots/testHome.F02-upcoming.png"):
            with self.subTest(image=image):
                self.assertEqual(steps.contained(image), image)
        for image in ("snapshots", "snapshots/", "apps/ios/T/__Snapshots__", "apps/ios/T/__Snapshots__/",
                      "apps/ios/T/./__Snapshots__/x.png", "apps/ios//T/__Snapshots__/x.png", "", None, 3,
                      "apps/ios/T/__Snapshots__/x\0.png", "apps/ios/T/__Snapshots__/a b.png"):
            with self.subTest(image=image):
                self.assertIsNone(steps.contained(image))
        # A link anywhere else is followed and refused, even into another __Snapshots__ folder.
        outside = self.repo.write("elsewhere/__Snapshots__/x.png", "not evidence")
        os.makedirs(os.path.join(self.repo.out, "snapshots", "X"), exist_ok=True)
        os.symlink(outside, os.path.join(self.repo.out, "snapshots", "X", "out.png"))
        os.symlink(outside, os.path.join(self.repo.root, "apps", "ios", "T", "__Snapshots__", "far.png"))
        os.symlink(os.path.join(self.repo.out, "snapshots"), os.path.join(self.repo.out, "snapshots", "X", "up"))
        for image in ("snapshots/X/out.png", "apps/ios/T/__Snapshots__/far.png", "snapshots/X/up"):
            with self.subTest(image=image):
                self.assertIsNone(steps.contained(image))
        entry, problems = steps.checked_entry(self.entry("F02-upcoming", "new"))
        self.assertEqual(problems, [])
        self.assertEqual(entry["state"], "F02-upcoming")
        entry, problems = steps.checked_entry({"state": None, "test": "XTests", "file": "testX.1.png",
                                               "status": "new", "reference": None,
                                               "image": self.sample("snapshots/XTests/testX.1.png")})
        self.assertEqual(problems, [])  # an unnamed snapshot, numbered by the library, is collect's own

    def test_an_entry_s_fields_must_fit_together_as_collect_writes_them(self):
        steps = self.steps()
        ran = self.sample("snapshots/XTests/testX.F02-upcoming.png")
        committed = self.sample("apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png")
        other = self.sample("apps/ios/S/__Snapshots__/YTests/testY.F02-upcoming.png")  # another test's
        mine = self.sample("apps/ios/S/__Snapshots__/XTests/testX.A02-email.png")  # another state's
        twin = self.sample("apps/ios/S/__Snapshots__/YTests/testX.F02-upcoming.png")  # its name, another test's
        unnamed = self.sample("apps/ios/S/__Snapshots__/XTests/testX.1.png")  # numbered: no state

        def entry(status, image, reference, **fields):
            return dict(self.entry("F02-upcoming", status, image=image, reference=reference), **fields)
        good = [entry("committed", committed, committed), entry("changed", ran, committed),
                entry("changed", ran, None), entry("new", ran, None),
                # A test in a folder of its own: collect keeps its image under a plain name.
                entry("new", self.sample("snapshots/Sub_XTests/testX.F02-upcoming.png"), None, test="Sub/XTests")]
        bad = [entry("committed", ran, committed),  # a committed image is its own reference, in apps/ios
               entry("committed", committed, other), entry("committed", committed, None),
               entry("changed", committed, committed),  # a changed or new image is this run's, in OUT
               entry("new", committed, None),
               entry("new", ran, committed),  # a new snapshot has no committed reference
               # Names and paths that don't fit: another state's or another test's committed file
               # shown as this one's, an image this run drew kept somewhere collect doesn't keep it.
               entry("committed", other, other), entry("changed", ran, other), entry("changed", ran, mine),
               entry("committed", mine, mine), entry("committed", twin, twin), entry("changed", ran, twin),
               entry("committed", committed, committed, state="A02-email"),
               entry("new", ran, None, state=None),  # a named file's state is its name's
               dict(entry("committed", unnamed, unnamed), file="testX.1.png"),  # an unnamed file has none
               entry("new", ran, None, state="A02-email"), entry("new", ran, None, test="YTests"),
               entry("new", self.sample("snapshots/XTests/testX.A02-email.png"), None),
               entry("changed", self.sample("snapshots/Other/testX.F02-upcoming.png"), committed)]
        for fields in good + bad:
            with self.subTest(fields=fields):
                checked, problems = steps.checked_entry(fields)
                self.assertEqual(problems, [] if fields in good else ["pairing"])
                self.assertEqual(checked, fields)  # each field passed on its own
        self.snapshots(bad)
        shell = FakeShell()
        code, out = self.step("sheets", shell, environ={"GITHUB_EVENT_NAME": "workflow_dispatch"})
        self.assertEqual(code, 1, out)
        self.assertEqual([c for c in shell.commands if c[0] == "montage"], [])
        self.assertFalse(os.path.isdir(os.path.join(self.stage("ios-full"), "snapshots")))
        self.assertEqual(self.index("ios-full").count("its entry failed this job's checks: pairing |"), len(bad))

    def test_run_json_s_values_are_checked_too(self):
        self.snapshots([self.entry("F02-upcoming", "new")])
        facts = dict(FACTS)
        # Each fails FACT on one count only: line breaks, a tab, a trailing line break, length, a
        # backtick (which would end index.md's code span).
        for tests in ("failed\n# Gate passed\n[Open](https://example.invalid)",
                      "failed\n\nGate A passed\n---", "failed\n", "failed\t", "f" * 65,
                      "failed` www.phish.example `x"):
            with self.subTest(tests=tests):
                # A key no step writes isn't kept either, whatever its value: the keys from
                # before two runtimes among them.
                self.record(facts, tests=tests, **{"Gate A passed": "yes", "notes": "plain", "ios": "26.5",
                                                   "device": "iPhone 17", "udid": UDID, "requested": "18.6"})
                self.assertEqual(self.step("sheets", FakeShell())[0], 0)
                index = self.index()
                self.assertNotIn("example.invalid", index)
                self.assertNotIn("Gate A passed", index)
                self.assertNotIn("phish", index)
                self.assertEqual(index.splitlines()[4:10], RUN_LINES + ["- Tests: `not run`",
                                                                        "- Carries the states this branch "
                                                                        "touches; 0 snapshot(s) not carried"])
                # The stage's run.json holds the checked values, never the file as written.
                with open(os.path.join(self.stage(), "run.json")) as f:
                    self.assertEqual(json.load(f), facts)
        # A value FACT lets through is shown in a code span, so GitHub never makes it a link.
        self.record(facts, **{"device-26.5": "www.phish.example", "tests": "www.phish.example"})
        self.assertEqual(self.step("sheets", FakeShell())[0], 0)
        self.assertEqual(self.index().splitlines()[6], "- iOS `26.5` on `www.phish.example`: tests `failed`, "
                                                       "with the snapshot tests")
        self.assertEqual(self.index().splitlines()[8], "- Tests: `www.phish.example`")
        with open(os.path.join(self.stage(), "run.json")) as f:  # every key the steps write
            self.assertEqual(json.load(f), dict(facts, **{"device-26.5": "www.phish.example",
                                                          "tests": "www.phish.example"}))
        with open(os.path.join(self.repo.out, "run.json"), "w") as f:
            json.dump(["not", "an", "object"], f)
        code, out = self.step("sheets", FakeShell())
        self.assertEqual(code, 0, out)
        self.assertIn("- Xcode `?`, Swift `?`, simulator SDK `?`", self.index())
        with open(os.path.join(self.stage(), "run.json")) as f:
            self.assertEqual(json.load(f), {})

    def test_the_snapshot_runtime_must_be_pinned_and_its_source_one_there_is(self):
        # This job can write, so run.json's `snapshots` is kept only when it is a pinned runtime,
        # and `snapshots-source` only when it is snapshot_runtime's (critique 6d); each passes
        # FACT, so only this check keeps it out.
        self.snapshots([self.entry("F02-upcoming", "new")])
        for key, value in (("snapshots", "26.4"), ("snapshots", "27.20"), ("snapshots", "18.6"),
                           ("snapshots-source", "manual"), ("snapshots-source", "File")):
            with self.subTest(key=key, value=value):
                self.record(FACTS, **{key: value})
                self.assertEqual(self.step("sheets", FakeShell())[0], 0)
                with open(os.path.join(self.stage(), "run.json")) as f:
                    staged = json.load(f)
                self.assertNotIn(key, staged)
                self.assertNotIn(value, next(line for line in self.index().splitlines()
                                             if line.startswith("- References: ")))
                self.assertEqual(staged, {k: v for k, v in FACTS.items() if k != key})
        self.record(FACTS, snapshots="26.4")
        self.step("sheets", FakeShell())
        self.assertEqual(self.index().splitlines()[5:8], [
            "- iOS `27.2` on `iPhone 17`: tests `passed`, the snapshot tests unknown",
            "- iOS `26.5` on `iPhone 17`: tests `failed`, the snapshot tests unknown",
            "- References: unknown: the simulator step didn't record their runtime"])

    def test_the_index_has_a_line_per_runtime_and_says_which_the_references_are_for(self):
        self.snapshots([])
        self.assertEqual(self.step("sheets", FakeShell())[0], 0)
        self.assertEqual(self.index().splitlines()[4:9], RUN_LINES + ["- Tests: `failed`"])
        self.record(FACTS, snapshots="27.2", tests="passed", **{"snapshots-source": "file", "tests-26.5": "passed"})
        self.assertEqual(self.step("sheets", FakeShell())[0], 0)
        self.assertEqual(self.index().splitlines()[5:9], [
            "- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests",
            "- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests",
            "- References: iOS `27.2` (the ios-version file)",
            "- Tests: `passed`"])
        # The simulator step didn't finish: each pinned runtime still has its line.
        self.record(xcode="27.2", swift="6.4.2")
        self.assertEqual(self.step("sheets", FakeShell())[0], 0)
        self.assertEqual(self.index().splitlines()[4:9], [
            "- Xcode `27.2`, Swift `6.4.2`, simulator SDK `?`",
            "- iOS `27.2` on `?`: tests `not run`, the snapshot tests unknown",
            "- iOS `26.5` on `?`: tests `not run`, the snapshot tests unknown",
            "- References: unknown: the simulator step didn't record their runtime",
            "- Tests: `not run`"])

    def test_the_index_and_the_label_show_the_versions_simctl_gave(self):
        # pick_runtime takes a patch release for its pin, so the evidence says which one ran.
        self.snapshots([self.entry("A02-email", "new")])
        self.record(FACTS, **{"ios-27.2": "27.2.1", "ios-26.5": "26.5.1"})
        shell = FakeShell()
        self.assertEqual(self.step("sheets", shell)[0], 0)
        self.assertEqual(self.index().splitlines()[5:7], [
            "- iOS `27.2.1` on `iPhone 17`: tests `passed`, without the snapshot tests",
            "- iOS `26.5.1` on `iPhone 17`: tests `failed`, with the snapshot tests"])
        montage = next(c for c in shell.commands if c[0] == "montage")
        self.assertIn("iOS 26.5.1 · iPhone 17\n", montage[montage.index("-label") + 1])

    def test_the_label_names_the_snapshot_runtime_s_device(self):
        # The other runtime's device has another name, so the label can't take it.
        self.snapshots([self.entry("A02-email", "new")])
        for facts, drawn in (({"device-27.2": "iPhone Air"},
                              "iOS 26.5 · iPhone 17\nreferences: iOS 26.5 (interim, no ios-version file)\n"),
                             ({"device-26.5": "iPhone Air", "snapshots": "27.2", "snapshots-source": "file"},
                              "iOS 27.2 · iPhone 17\nreferences: iOS 27.2 (the ios-version file)\n")):
            with self.subTest(facts=facts):
                self.record(FACTS, **facts)
                shell = FakeShell()
                self.assertEqual(self.step("sheets", shell)[0], 0)
                montage = next(c for c in shell.commands if c[0] == "montage")
                label = montage[montage.index("-label") + 1]
                self.assertIn(drawn, label)
                self.assertNotIn("iPhone Air", label)

    def test_only_the_steps_logs_go_up_and_anything_else_fails_the_step(self):
        # logs/ comes from the build job too: a name of its own is the build job's text.
        self.snapshots([self.entry("F02-upcoming", "new")])
        logs = os.path.join(self.repo.out, "logs")
        outside = self.repo.write("secret.txt", "not evidence")
        # test.log and test-summary.json were logs before two runtimes; now no step writes them.
        for name in ("a] __Every snapshot matches its render. Gate 0 passed__ [b.txt", "README.md",
                     "test.log", "test-summary.json", "toolchain.txt"):
            with open(os.path.join(logs, name), "w") as f:
                f.write("Gate 0 passed\n" if name != "toolchain.txt" else "Xcode 27.2\n")
        os.makedirs(os.path.join(logs, "xcodegen.txt"))  # a step's name, but a folder
        os.symlink(outside, os.path.join(logs, "build.log"))  # a step's name, but not a file it wrote
        code, out = self.step("sheets", FakeShell())
        self.assertEqual(code, 1, out)
        self.assertEqual(sorted(os.listdir(os.path.join(self.stage(), "logs"))), ["test-26.5.log", "toolchain.txt"])
        index = self.index()
        self.assertNotIn("Gate 0 passed", index)
        self.assertNotIn("README", index)
        self.assertIn("The build job's logs/ held 6 other entries, not a log its steps write, so they are "
                      "left out and this step fails.", index)
        base = "https://github.com/beurni2/tadayo/blob/evidence/ios/b0-ios-check/0123456/ios/logs"
        self.assertIn(f"Logs: [test-26.5.log]({base}/test-26.5.log), [toolchain.txt]({base}/toolchain.txt)\n",
                      index)
        # The rest still goes up.
        self.assertTrue(os.path.isfile(os.path.join(self.stage(), "snapshots", "F02-upcoming.png")))
        self.assertEqual(self.finished(), {"path": "ios/b0-ios-check/0123456/ios"})

    def test_a_missing_snapshot_list_is_said_and_fails_after_the_rest(self):
        code, out = self.step("sheets", FakeShell())
        self.assertEqual(code, 1)
        with open(os.path.join(self.stage(), "index.md")) as f:
            self.assertIn("collect step didn't finish", f.read())
        self.assertTrue(os.path.isfile(os.path.join(self.stage(), "logs", "test-26.5.log")))
        self.assertEqual(self.finished(), {"path": "ios/b0-ios-check/0123456/ios"})

    def test_without_imagemagick_the_rest_still_goes_up(self):
        # The imagemagick step failed: montage isn't there, so each sheet fails, and the logs,
        # every snapshot and the index still reach the evidence branch.
        states = ["A02-email", "A03-code", "F02-upcoming"]
        self.snapshots([self.entry(state, "new") for state in states])
        shell = FakeShell(codes=[(starts("montage"), 127)])
        code, out = self.step("sheets", shell)
        self.assertEqual(code, 1)
        self.assertEqual(len([c for c in shell.commands if c[0] == "montage"]), len(states))
        index = self.index()
        for state in states:
            with self.subTest(state=state):
                self.assertTrue(os.path.isfile(os.path.join(self.stage(), "snapshots", f"{state}.png")))
        # The Render column still says what the sheet would have: T46's mark for a state with
        # no render; the Sheet column says what failed.
        self.assertIn("| `A02-email` | new | `XTests/testX.A02-email.png` | built from spec, awaiting render | "
                      "ImageMagick couldn't make its sheet | [A02-email.png](", index)
        self.assertIn("| `F02-upcoming` | new | `XTests/testX.F02-upcoming.png` | design/reference/2.1/F02-upcoming.png | "
                      "ImageMagick couldn't make its sheet |", index)

    def test_screens_wins_over_2_1(self):
        self.repo.copy(os.path.join(ROOT, *RENDER.split("/")), "design/reference/screens/F02-upcoming.png")
        self.assertEqual(ios_steps.render_for(self.repo.root, "F02-upcoming"),
                         "design/reference/screens/F02-upcoming.png")
        os.remove(os.path.join(self.repo.root, "design", "reference", "screens", "F02-upcoming.png"))
        self.assertEqual(ios_steps.render_for(self.repo.root, "F02-upcoming"), RENDER)
        self.assertIsNone(ios_steps.render_for(self.repo.root, "A02-email"))

    def test_every_image_is_read_as_png_and_written_as_jpeg(self):
        cmd = ios_steps.montage_command("t", [("Render", "x", "/a/r.png"), ("Snapshot", "y", "/a/s.png")], "/o/s.jpg")
        inputs = [cmd[i + 2] for i, c in enumerate(cmd) if c == "-label"]
        self.assertEqual(inputs, ["png:/a/r.png", "png:/a/s.png"])
        self.assertEqual(cmd[-1], "jpg:/o/s.jpg")

    def run_sheets(self, entries, environ=None, shell=None):
        self.snapshots(entries)
        shell = shell or self.git_diff([])
        code, out = self.step("sheets", shell, environ=environ)
        sheets_dir = os.path.join(self.stage(), "sheets")
        made = sorted(os.listdir(sheets_dir)) if os.path.isdir(sheets_dir) else []
        montages = [c for c in shell.commands if c[0] == "montage"]
        return code, out, [os.path.basename(c[-1]) for c in montages], made

    def test_a_push_carries_only_the_states_the_branch_touches(self):
        ref = "apps/ios/S/__Snapshots__/XTests/testX.{}.png"
        entries = [self.entry("F02-upcoming", "committed", image=self.sample(ref.format("F02-upcoming")),
                              reference=ref.format("F02-upcoming")),
                   self.entry("F01-friends", "committed", image=self.sample(ref.format("F01-friends")),
                              reference=ref.format("F01-friends")),
                   self.entry("H01-open", "committed", image=self.sample(ref.format("H01-open")),
                              reference=ref.format("H01-open")),
                   self.entry("A02-email", "new"),
                   self.entry("G01-create", "changed")]
        shell = self.git_diff([ref.format("F01-friends"), "design/reference/screens/H01-open.png", "README.md"])
        code, out, montaged, _ = self.run_sheets(entries, shell=shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(montaged), ["A02-email.jpg", "F01-friends.jpg",
                                            "G01-create.jpg", "H01-open.jpg"])
        with open(os.path.join(self.stage(), "index.md")) as f:
            self.assertIn("1 snapshot(s) not carried", f.read())
        self.assertIn(["git", "merge-base", "origin/main", "HEAD"], shell.commands)

    def test_on_main_the_branch_is_compared_with_the_commit_before(self):
        shell = self.git_diff([])
        self.run_sheets([self.entry("A02-email", "new")], environ={"GITHUB_REF_NAME": "main"}, shell=shell)
        self.assertIn(["git", "rev-parse", "HEAD^1"], shell.commands)

    def test_a_run_by_hand_carries_the_full_set(self):
        ref = "apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png"
        entries = [self.entry("F02-upcoming", "committed", image=self.sample(ref), reference=ref)]
        _, _, montaged, _ = self.run_sheets(entries, environ={"GITHUB_EVENT_NAME": "workflow_dispatch"},
                                            shell=FakeShell())
        self.assertEqual(montaged, ["F02-upcoming.jpg"])
        # In its own folder, so a push's touched set of the same commit can't replace it.
        self.assertEqual(self.finished(), {"path": "ios/b0-ios-check/0123456/ios-full"})

    def test_every_runtime_s_logs_go_up_in_the_run_s_one_folder(self):
        # A stray IOS_VERSION makes no ios-<version>/ folder and drops no sheet.
        for name in ("test-27.2.log", "test-summary-27.2.json", "test-summary-26.5.json"):
            with open(os.path.join(self.repo.out, "logs", name), "w") as f:
                f.write("{}\n")
        code, out, montaged, _ = self.run_sheets([self.entry("A02-email", "new")],
                                                 environ={"IOS_VERSION": "18.6"}, shell=FakeShell())
        self.assertEqual((code, montaged), (0, ["A02-email.jpg"]), out)
        logs = ["test-26.5.log", "test-27.2.log", "test-summary-26.5.json", "test-summary-27.2.json"]
        self.assertEqual(sorted(os.listdir(os.path.join(self.stage(), "logs"))), logs)
        self.assertFalse(os.path.exists(self.stage("ios-18.6")))
        base = "https://github.com/beurni2/tadayo/blob/evidence/ios/b0-ios-check/0123456/ios/logs"
        self.assertIn("Logs: " + ", ".join(f"[{n}]({base}/{n})" for n in logs) + "\n", self.index())
        self.assertTrue(set(logs) <= set(ios_steps.LOG_NAMES))

    def test_when_git_can_t_compare_only_drawn_snapshots_go_up_and_the_index_says_so(self):
        ref = "apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png"
        entries = [self.entry("F02-upcoming", "committed", image=self.sample(ref), reference=ref),
                   self.entry("A02-email", "new")]
        shell = FakeShell(answers=[(starts("git"), (128, "", "fatal"))])
        code, _, montaged, _ = self.run_sheets(entries, shell=shell)
        self.assertEqual((code, montaged), (0, ["A02-email.jpg"]))
        with open(os.path.join(self.stage(), "index.md")) as f:
            self.assertIn("Couldn't compare this branch with main", f.read())

    def test_a_missing_image_or_a_failed_sheet_fails_the_step_after_the_rest(self):
        entries = [{"state": "A02-email", "test": "X", "file": "testX.A02-email.png", "status": "new",
                    "image": "snapshots/X/testX.A02-email.png", "reference": None},  # never drawn
                   self.entry("F02-upcoming", "new")]
        code, _, montaged, _ = self.run_sheets(entries)
        self.assertEqual((code, montaged), (1, ["F02-upcoming.jpg"]))
        self.assertIn("| `A02-email` | new | `X/testX.A02-email.png` | built from spec, awaiting render | "
                      "its image is missing from this run |", self.index())
        code, _, _, _ = self.run_sheets([self.entry("F02-upcoming", "new")],
                                        shell=FakeShell(codes=[(starts("montage"), 1)]))
        self.assertEqual(code, 1)

    def test_no_snapshots_yet_still_publishes_the_logs(self):
        code, out, montaged, _ = self.run_sheets([])
        self.assertEqual((code, montaged), (0, []))
        self.assertEqual(self.finished(), {"path": "ios/b0-ios-check/0123456/ios"})

    def test_two_snapshots_of_one_state_get_two_sheets(self):
        first, second = self.entry("F02-upcoming", "new"), self.entry("F02-upcoming", "new")
        second["test"] = "OtherTests"
        second["image"] = self.sample("snapshots/OtherTests/testX.F02-upcoming.png")
        _, _, montaged, _ = self.run_sheets([first, second])
        self.assertEqual(montaged, ["F02-upcoming.jpg", "F02-upcoming--OtherTests.jpg"])


class PublishTest(StepsTest):
    """Real git: a scratch bare repository stands in for GitHub."""

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout

    def setUp(self):
        super().setUp()
        self.remote = os.path.join(self.repo.root, "_remote.git")
        self.git("init", "--quiet", "--bare", self.remote)
        self.git("config", "uploadpack.allowFilter", "true", cwd=self.remote)
        seed = os.path.join(self.repo.root, "_seed")
        self.git("init", "--quiet", "-b", "evidence", seed)
        os.makedirs(os.path.join(seed, "ios", "b0-brand-ref", "a16bf78", "design"))
        with open(os.path.join(seed, "ios", "b0-brand-ref", "a16bf78", "design", "x.jpg"), "w") as f:
            f.write("earlier evidence")
        self.identity = ["-c", "user.name=t", "-c", "user.email=t@example.com"]
        self.git("add", "-A", cwd=seed)
        self.git(*self.identity, "commit", "--quiet", "-m", "seed", cwd=seed)
        self.git("push", "--quiet", self.remote, "evidence", cwd=seed)
        self.seed = seed
        self.path = "ios/b0-ios-check/0123456/ios"
        self.stage_dir = os.path.join(self.repo.work, "stage", *self.path.split("/"))
        os.makedirs(os.path.join(self.stage_dir, "sheets"))
        with open(os.path.join(self.stage_dir, "index.md"), "w") as f:
            f.write("# index\n")
        with open(os.path.join(self.stage_dir, "sheets", "A02-email.jpg"), "w") as f:
            f.write("jpeg")
        self.finish(self.path)
        self.environ.update({"EVIDENCE_REMOTE": "file://" + self.remote, "GITHUB_RUN_ID": "42",
                             "GITHUB_SHA": SHA, "GITHUB_REF_NAME": "ios/b0-ios-check",
                             "GITHUB_EVENT_NAME": "push"})

    def finish(self, path):
        """What sheets writes last, in the evidence job's own folder."""
        with open(os.path.join(self.repo.work, "evidence.json"), "w") as f:
            json.dump({"path": path}, f)

    def remote_files(self):
        return set(self.git("ls-tree", "-r", "--name-only", "evidence", cwd=self.remote).split())

    def test_pushes_its_folder_and_keeps_the_rest(self):
        code, out = self.step("publish", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        self.assertEqual(self.remote_files(), {"ios/b0-brand-ref/a16bf78/design/x.jpg",
                                               f"{self.path}/index.md", f"{self.path}/sheets/A02-email.jpg"})
        log = self.git("log", "--format=%an|%s", "evidence", cwd=self.remote).splitlines()
        self.assertEqual(log[0], f"github-actions[bot]|evidence: {self.path}")

    def test_a_refused_push_fetches_again_and_never_forces(self):
        shell = ios_steps.Shell(self.repo.root)
        real_run = shell.run
        pushes = []

        def run(cmd, env=None, log=None, cwd=None):
            if "push" in cmd:
                pushes.append(cmd)
                if len(pushes) == 1:  # another run pushes first
                    with open(os.path.join(self.seed, "other.txt"), "w") as f:
                        f.write("another run")
                    self.git("add", "-A", cwd=self.seed)
                    self.git(*self.identity, "commit", "--quiet", "-m", "another run", cwd=self.seed)
                    self.git("push", "--quiet", self.remote, "evidence", cwd=self.seed)
            return real_run(cmd, env=env, log=log, cwd=cwd)
        shell.run = run
        code, out = self.step("publish", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(len(pushes), 2)
        self.assertIn("other.txt", self.remote_files())
        self.assertIn(f"{self.path}/index.md", self.remote_files())
        for push in pushes:
            self.assertFalse([a for a in push if a.startswith("--force") or a == "-f" or a.startswith("+")])
        subjects = self.git("log", "--format=%s", "evidence", cwd=self.remote).splitlines()
        self.assertEqual(subjects, [f"evidence: {self.path}", "another run", "seed"])

    def test_gives_up_after_the_attempts_without_forcing(self):
        shell = FakeShell(codes=[(has("push"), 1), (has("diff"), 1)])
        code, out = self.step("publish", shell)
        self.assertEqual(code, 1)
        pushes = [c for c in shell.commands if "push" in c]
        self.assertEqual(len(pushes), ios_steps.PUSH_ATTEMPTS)
        self.assertIn("nothing forced", out)

    def test_the_token_never_reaches_a_command_line(self):
        del self.environ["EVIDENCE_REMOTE"]  # the URL the workflow builds, not the scratch remote
        # Every push refused, so each attempt's commit, push, fetch and reset is seen.
        shell = FakeShell(codes=[(has("diff"), 1), (has("push"), 1)])
        token = "ghs_secretvalue"
        basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
        self.step("publish", shell, environ={"GITHUB_TOKEN": token, "GITHUB_REPOSITORY": "beurni2/tadayo"})
        for word in ("clone", "commit", "push", "fetch", "reset"):
            self.assertTrue([c for c in shell.commands if word in c], word)
        self.assertIn("https://github.com/beurni2/tadayo.git", next(c for c in shell.commands if "clone" in c))
        self.assertFalse([c for c in shell.commands if any(token in a or basic in a for a in c)])
        header = {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.extraheader",
                  "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {basic}"}
        for cmd, env in zip(shell.commands, shell.envs):
            self.assertEqual({k: v for k, v in (env or {}).items() if k.startswith("GIT_CONFIG_")}, header, cmd)
        # And git itself reads it as the header it sends.
        found = subprocess.run(["git", "config", "--get-all", "http.extraheader"], capture_output=True,
                               text=True, cwd=self.repo.root, env=dict(os.environ, **shell.envs[0]))
        self.assertEqual(found.stdout.strip(), f"AUTHORIZATION: basic {basic}")

    def test_the_same_evidence_twice_pushes_nothing_new(self):
        self.assertEqual(self.step("publish", ios_steps.Shell(self.repo.root))[0], 0)
        before = self.git("rev-parse", "evidence", cwd=self.remote)
        code, out = self.step("publish", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        self.assertIn("already on", out)
        self.assertEqual(self.git("rev-parse", "evidence", cwd=self.remote), before)

    def test_without_the_sheets_step_s_record_it_fails(self):
        os.remove(os.path.join(self.repo.work, "evidence.json"))
        shell = FakeShell()
        self.assertEqual(self.step("publish", shell)[0], 1)
        self.assertEqual(shell.commands, [])

    def test_its_folder_comes_from_the_run_never_from_a_file(self):
        # OUT is where the build job's artifact lands: an evidence.json or a staged folder in it
        # is never what publish pushes, and a record of another folder isn't this run's.
        planted = os.path.join(self.repo.out, "evidence", "gates")
        os.makedirs(planted)
        with open(os.path.join(planted, "gate-a.pdf"), "w") as f:
            f.write("planted")
        with open(os.path.join(self.repo.out, "evidence.json"), "w") as f:
            json.dump({"path": "gates", "stage": planted}, f)
        code, out = self.step("publish", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        self.assertEqual(self.remote_files(), {"ios/b0-brand-ref/a16bf78/design/x.jpg",
                                               f"{self.path}/index.md", f"{self.path}/sheets/A02-email.jpg"})
        for record in ({"path": "gates"}, {"path": "ios/b0-ios-check/0123456/ios-full"}, ["x"], "x"):
            with self.subTest(record=record):
                with open(os.path.join(self.repo.work, "evidence.json"), "w") as f:
                    json.dump(record, f)
                shell = FakeShell()
                self.assertEqual(self.step("publish", shell)[0], 1)
                self.assertEqual(shell.commands, [])
        self.finish(self.path)
        shutil.rmtree(self.stage_dir)
        self.assertEqual(self.step("publish", FakeShell())[0], 1)  # recorded, but nothing staged


def workflow():
    with open(os.path.join(ROOT, ".github", "workflows", "ios.yml"), encoding="utf-8") as f:
        return f.read()


def jobs_of(text):
    """{job id: its lines}, from the top-level `jobs:` block."""
    lines = text.splitlines()
    jobs, current = {}, None
    for line in lines[lines.index("jobs:") + 1:]:
        if line and not line.startswith(" ") and not line.startswith("#"):
            break
        job = re.match(r"^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$", line)
        if job:
            current = job.group(1)
            jobs[current] = []
        elif current:
            jobs[current].append(line)
    return jobs


class WorkflowFileTest(unittest.TestCase):
    """ios.yml stays thin, and keeps the rules of docs/TECH-DESIGN.md section 9."""

    def setUp(self):
        self.text = workflow()
        self.jobs = jobs_of(self.text)

    def test_every_run_calls_a_step_here(self):
        runs = re.findall(r"^\s+(?:- )?run: (.*)$", self.text, flags=re.M)
        self.assertTrue(runs)
        for run in runs:
            with self.subTest(run=run):
                found = re.fullmatch(r"python3 tools/ci/ios_steps\.py ([a-z]+)", run.strip())
                self.assertIsNotNone(found, "a run: that isn't one ios_steps.py step")
                self.assertIn(found.group(1), ios_steps.STEPS)

    def test_the_jobs_and_their_steps(self):
        self.assertEqual(list(self.jobs), ["gate", "build", "evidence"])

        def steps(job):
            return re.findall(r"ios_steps\.py ([a-z]+)", "\n".join(self.jobs[job]))
        self.assertEqual(steps("gate"), ["gate"])
        self.assertEqual(steps("build"), ["toolchain", "xcodegen", "simulator", "build", "test", "collect"])
        self.assertEqual(steps("evidence"), ["imagemagick", "sheets", "publish"])
        # GitHub's Xcode 27 image on its standard runner, never xcode-27-xlarge (toolchain.py).
        self.assertEqual([line for line in self.jobs["build"] if line.startswith("    runs-on:")],
                         ["    runs-on: xcode-27"])

    def test_it_runs_on_the_paths_technical_design_names(self):
        on = self.text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        paths = re.findall(r"^      - '?([^'\n]+)'?$", on.split("paths:", 1)[1].split("workflow_dispatch", 1)[0], flags=re.M)
        self.assertEqual(paths, ["apps/ios/**", "packages/swift/**", "packages/contracts/**", "design/reference/**"])
        self.assertIn("    branches-ignore:\n      - evidence\n", on)
        self.assertIn("  workflow_dispatch:\n", on)

    def permissions_of(self, lines):
        """A job's `permissions:` block as {scope: level}; a line it can't read fails the test."""
        block = {}
        for line in lines[lines.index("    permissions:") + 1:]:
            if not line.strip() or line.strip().startswith("#"):
                continue
            if not line.startswith("      "):
                break
            found = re.fullmatch(r"      ([a-z-]+): *(['\"]?)([a-z-]+)\2 *(?:#.*)?", line)
            self.assertIsNotNone(found, f"a permissions line this test can't read: {line!r}")
            block[found.group(1)] = found.group(3)
        return block

    def test_permissions_are_least_privilege(self):
        self.assertIn("\npermissions: {}\n", self.text)
        self.assertNotRegex(self.text, r"(?:read|write)-all")
        self.assertEqual({job: self.permissions_of(lines) for job, lines in self.jobs.items()},
                         {"gate": {"contents": "read"}, "build": {"contents": "read"},
                          "evidence": {"contents": "write"}})
        self.assertNotIn("secrets.", self.text)  # never a secret in ios (TECH-DESIGN section 9)

    def step_block(self, needle):
        """The one step whose lines hold needle (which may end in a line break), as text: the
        file cut before each step and each job, so a step's block never runs into the next."""
        blocks = re.split(r"\n(?=      - |  [a-z]|[a-z])", self.text)
        found = [b for b in blocks if b.startswith("      - ") and needle in b + "\n"]
        self.assertEqual(len(found), 1, needle)
        return found[0]

    def test_the_gate_decides_whether_the_build_runs(self):
        # The B0 plan's slice 9 test, "the first job's skip": the step's output reaches both jobs.
        gate = "\n".join(self.jobs["gate"]) + "\n"
        # The gate sees only its sparse checkout, so it must hold the file the gate looks for.
        self.assertIn("          sparse-checkout-cone-mode: false\n", gate)
        sparse = re.search(r"\n          sparse-checkout: \|\n((?:            \S[^\n]*\n)+)", gate)
        self.assertIsNotNone(sparse)
        self.assertEqual(sorted(sparse.group(1).split()), sorted(["/tools/ci/", "/" + ios_steps.PROJECT_SPEC]))
        self.assertIn("    outputs:\n      build: ${{ steps.gate.outputs.build }}\n", gate)
        self.assertIn("      - id: gate\n        run: python3 tools/ci/ios_steps.py gate\n", gate)
        self.assertIn("    needs: gate", self.jobs["build"])
        self.assertIn("    if: needs.gate.outputs.build == 'true'", self.jobs["build"])
        self.assertIn("    needs: [gate, build]", self.jobs["evidence"])
        self.assertIn("    if: ${{ !cancelled() && needs.gate.outputs.build == 'true' }}", self.jobs["evidence"])

    def test_what_a_failed_step_drew_still_reaches_the_evidence_branch(self):
        for needle in ("run: python3 tools/ci/ios_steps.py collect", "uses: actions/upload-artifact@",
                       "run: python3 tools/ci/ios_steps.py publish"):
            with self.subTest(step=needle):
                self.assertIn("if: ${{ !cancelled() }}", self.step_block(needle))
        self.assertIn("if: ${{ !cancelled() && steps.results.outcome == 'success' }}",
                      self.step_block("run: python3 tools/ci/ios_steps.py sheets"))
        self.assertIn("id: results", self.step_block("uses: actions/download-artifact@"))
        self.assertNotIn("continue-on-error", self.text)

    def test_a_step_that_hangs_times_out_before_the_job(self):
        # A step's timeout fails the step, and the job goes on to the steps that run anyway; the
        # job's own timeout cancels it, and then nothing reaches the evidence branch.
        for job_id, steps in (("build", ("toolchain", "xcodegen", "simulator", "build", "test", "collect")),
                              ("evidence", ("imagemagick",))):
            lines = "\n".join(self.jobs[job_id])
            job = int(re.search(r"^    timeout-minutes: ([0-9]+)$", lines, flags=re.M).group(1))
            total = 0
            for step in steps:
                with self.subTest(step=step):
                    block = self.step_block(f"ios_steps.py {step}\n")
                    self.assertIn(block, lines)
                    found = re.search(r"timeout-minutes: ([0-9]+)", block)
                    self.assertIsNotNone(found)
                    total += int(found.group(1))
            # The build's checkout and upload, or the evidence's checkout, download, sheets and
            # publish, fit after them.
            self.assertLessEqual(total + 10, job, job_id)

    def test_each_step_has_its_timeout_and_the_job_its_backstop(self):
        # The values the change set: the simulator step downloads iOS 26.5 on every run, and the
        # test step runs a pass on each pinned runtime, so neither may be cut; the job's own is
        # the steps' sum and 10 for the checkout and the upload, and no more, or it would stop
        # being a backstop for a hang the steps' timeouts miss.
        expected = {"toolchain": 5, "xcodegen": 5, "simulator": 35, "build": 25, "test": 50, "collect": 5}
        for step, minutes in expected.items():
            with self.subTest(step=step):
                block = self.step_block(f"ios_steps.py {step}\n")
                self.assertEqual(re.findall(r"timeout-minutes: ([0-9]+)", block), [str(minutes)])
        self.assertEqual(re.findall(r"(?m)^    timeout-minutes: ([0-9]+)$", "\n".join(self.jobs["build"])),
                         [str(sum(expected.values()) + 10)])

    def test_no_ios_version_is_asked_for_or_read(self):
        # Every run tests every pinned runtime: a run by hand takes no input, and no job has an
        # IOS_VERSION that ios_steps.py would read.
        for word in ("ios_version", "IOS_VERSION", "inputs."):
            with self.subTest(word=word):
                self.assertNotIn(word, self.text)
        self.assertNotRegex(self.text, r"(?m)^\s+inputs:")
        on = self.text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertTrue(on.endswith("\n  workflow_dispatch:\n"), on)

    def test_each_kind_of_run_has_its_own_group(self):
        # A push's and a run by hand's full set: neither cancels the other's evidence.
        top = self.text.split("\njobs:\n", 1)[0]
        self.assertIn("\nconcurrency:\n  group: ios-${{ github.ref == 'refs/heads/main' && github.sha || "
                      "github.ref }}-${{ github.event_name == 'workflow_dispatch' && 'full' || 'push' }}\n"
                      "  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n", top)
        # And one other, the evidence job's, which makes the pushes take turns, exactly so.
        self.assertEqual(len(re.findall(r"^ *concurrency:", self.text, flags=re.M)), 2)
        self.assertIn("\n    concurrency:\n      group: ios-evidence\n      cancel-in-progress: false\n",
                      "\n" + "\n".join(self.jobs["evidence"]) + "\n")

    def test_publish_has_the_job_s_token_and_nothing_else_does(self):
        self.assertIn("env:\n          GITHUB_TOKEN: ${{ github.token }}",
                      self.step_block("run: python3 tools/ci/ios_steps.py publish"))
        self.assertEqual(self.text.count("github.token"), 1)

    def test_actions_are_pinned_to_commits(self):
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertTrue(uses)
        for use in uses:
            with self.subTest(use=use):
                self.assertRegex(use, r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}$")

    def test_checkouts_keep_no_credentials(self):
        checkouts = self.text.count("uses: actions/checkout@")
        self.assertEqual(self.text.count("persist-credentials: false"), checkouts)

    def test_the_evidence_push_is_serialised(self):
        evidence = "\n".join(self.jobs["evidence"])
        self.assertRegex(evidence, r"concurrency:\n\s+group: [^\n]+\n\s+cancel-in-progress: false")

    def test_actionlint_is_told_of_the_xcode_27_label_and_nothing_else(self):
        # actionlint 1.7.12's list of GitHub's labels predates `xcode-27`, which only this file
        # adds; no other label, and no other setting that could turn a rule off.
        with open(os.path.join(ROOT, ".github", "actionlint.yaml"), encoding="utf-8") as f:
            text = f.read()
        lines = [line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]
        self.assertEqual(lines, ["self-hosted-runner:", "  labels:", "    - xcode-27"])
        self.assertIn("    runs-on: xcode-27", self.jobs["build"])


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(ios_steps.main(["ios_steps.py", "deploy"]), 2)
        self.assertIn("steps:", out.getvalue())


if __name__ == "__main__":
    unittest.main()
