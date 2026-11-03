#!/usr/bin/env python3
"""Tests for tools/ci/ios_steps.py. Run: python3 tools/ci/ios_steps_test.py

Each test builds a scratch repository with only the files a step looks for, and runs the step
with a fake shell that records the commands and answers them from fixtures. The contact-sheet
tests run ImageMagick for real on a 2.1 render and a sample PNG when `montage` is installed (the
session has it; `ci`'s Linux runner doesn't, so there they skip, and the `ios` workflow's
evidence job installs it). The publish tests run real git against a scratch bare repository.
One test class reads .github/workflows/ios.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

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

RUNTIMES = {"runtimes": [
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-2", "version": "26.2",
     "platform": "iOS", "isAvailable": True, "name": "iOS 26.2",
     "supportedDeviceTypes": [
         {"name": "iPhone 16e", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16e"},
         {"name": "iPhone 17", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17"}]},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-5", "version": "26.5",
     "platform": "iOS", "isAvailable": True, "name": "iOS 26.5",
     "supportedDeviceTypes": [
         {"name": "iPhone 17", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17"},
         {"name": "iPhone 17 Pro", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"}]},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-4", "version": "26.4.1",
     "platform": "iOS", "isAvailable": True, "name": "iOS 26.4",
     "supportedDeviceTypes": [
         {"name": "iPhone 17", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17"}]},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.tvOS-26-5", "version": "26.5",
     "platform": "tvOS", "isAvailable": True, "name": "tvOS 26.5", "supportedDeviceTypes": []},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-27-0", "version": "27.0",
     "platform": "iOS", "isAvailable": False, "name": "iOS 27.0", "supportedDeviceTypes": []},
]}
IOS_18 = {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-18-6", "version": "18.6",
          "platform": "iOS", "isAvailable": True, "name": "iOS 18.6",
          "supportedDeviceTypes": [
              {"name": "iPhone 15", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-15"},
              {"name": "iPhone 16", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16"},
              {"name": "iPhone 16 Pro", "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"}]}
UDID = "A1B2C3D4-0000-1111-2222-333344445555"

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
        self.commands, self.envs = [], []
        self.answers = answers or []
        self.codes = codes or []
        self.effects = effects or []

    def run(self, cmd, env=None, log=None, cwd=None):
        self.commands.append(cmd)
        self.envs.append(env)
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

    def record(self, **values):
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
    def run_toolchain(self, xcode="Xcode 26.6\nBuild version 17F113\n",
                      swift="swift-driver version: 1.127.14.1 Apple Swift version 6.3.3 "
                            "(swiftlang-6.3.3.1.2 clang-1800.0.32.2)\nTarget: arm64-apple-macosx26.0\n",
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
        developer_dir = f"/Applications/Xcode_{toolchain.XCODE_VERSION}.app/Contents/Developer"
        self.assertTrue(all(env == {"DEVELOPER_DIR": developer_dir} for env in shell.envs))
        self.assertEqual(self.read_record()["swift"], toolchain.SWIFT_VERSION)
        with open(os.path.join(self.repo.out, "logs", "toolchain.txt")) as f:
            self.assertIn("Apple Swift version 6.3.3", f.read())

    def test_another_xcode_fails(self):
        for xcode in ["Xcode 26.5\nBuild version 17E1\n", "Xcode 26.60\n", ""]:
            with self.subTest(xcode=xcode):
                self.assertEqual(self.run_toolchain(xcode=xcode)[0], 1)

    def test_another_swift_fails(self):
        for swift in ["Apple Swift version 6.3.2 (swiftlang-6.3.2)", "Apple Swift version 6.3 (x)",
                      "Apple Swift version 6.3.31", "no version here"]:
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


class SimulatorTest(StepsTest):
    def shell(self, runtimes=RUNTIMES, after_download=None, devices=None, create=(0, UDID + "\n", ""),
              download_code=0, works_with=None):
        """after_download: the runtimes once a download that works has run; works_with: the
        download only works with these extra arguments (by default, any download works)."""
        state = {"downloaded": False}

        def list_runtimes(cmd):
            current = after_download if state["downloaded"] and after_download else runtimes
            return 0, json.dumps(current), ""

        def download(cmd):
            if works_with is None or all(a in cmd for a in works_with):
                state["downloaded"] = True
            return download_code
        return FakeShell(
            answers=[(starts("xcrun", "simctl", "list", "runtimes", "--json"), list_runtimes),
                     (starts("xcrun", "simctl", "list", "devices", "--json"),
                      (0, json.dumps({"devices": devices or {}}), "")),
                     (starts("xcrun", "simctl", "create"), create),
                     (starts("xcrun", "simctl", "list"), (0, "== Runtimes ==\niOS 26.5\n", ""))],
            codes=[(has("-downloadPlatform"), download)])

    def test_with_no_version_the_newest_ios_on_the_pinned_iphone(self):
        shell = self.shell()
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        create = next(c for c in shell.commands if c[:3] == ["xcrun", "simctl", "create"])
        self.assertEqual(create[3:], ["Tadayo iPhone 17", "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
                                      "com.apple.CoreSimulator.SimRuntime.iOS-26-5"])
        record = self.read_record()
        self.assertEqual((record["ios"], record["device"], record["udid"], record["requested"]),
                         ("26.5", "iPhone 17", UDID, None))
        self.assertIn(["xcrun", "simctl", "bootstatus", UDID, "-b"], shell.commands)
        self.assertFalse(any("-downloadPlatform" in c for c in shell.commands))

    def test_the_simulators_the_runner_offers_are_recorded(self):
        self.step("simulator", self.shell())
        with open(os.path.join(self.repo.out, "logs", "simulators.txt")) as f:
            text = f.read()
        self.assertIn("+ xcrun simctl list runtimes", text)
        self.assertIn("+ xcrun simctl list devices available", text)

    def test_an_installed_version_by_prefix(self):
        for requested, version in [("26.2", "26.2"), ("26.4", "26.4.1"), ("26", "26.5")]:
            with self.subTest(requested=requested):
                code, out = self.step("simulator", self.shell(), environ={"IOS_VERSION": requested})
                self.assertEqual(code, 0, out)
                self.assertEqual(self.read_record()["ios"], version)

    def test_a_missing_version_is_downloaded_and_takes_an_iphone_it_supports(self):
        after = {"runtimes": RUNTIMES["runtimes"] + [IOS_18]}
        shell = self.shell(after_download=after)
        code, out = self.step("simulator", shell, environ={"IOS_VERSION": "18.6"})
        self.assertEqual(code, 0, out)
        self.assertIn(["xcodebuild", "-downloadPlatform", "iOS", "-buildVersion", "18.6"], shell.commands)
        self.assertIn(["xcrun", "simctl", "runtime", "dyld_shared_cache", "update", "--all"], shell.commands)
        self.assertFalse(any("-architectureVariant" in c for c in shell.commands))
        record = self.read_record()
        self.assertEqual((record["ios"], record["device"], record["requested"]), ("18.6", "iPhone 16", "18.6"))

    def test_the_universal_variant_is_tried_when_the_plain_download_brings_nothing(self):
        after = {"runtimes": RUNTIMES["runtimes"] + [IOS_18]}
        shell = self.shell(after_download=after, works_with=["universal"])
        code, out = self.step("simulator", shell, environ={"IOS_VERSION": "18.6"})
        self.assertEqual(code, 0, out)
        downloads = [c for c in shell.commands if "-downloadPlatform" in c]
        self.assertEqual(downloads[1][-2:], ["-architectureVariant", "universal"])

    def test_the_download_s_exit_code_doesn_t_decide(self):
        # Xcode can fall back to another runtime and exit 0, or fail a proxy and say "not
        # available"; simctl is what's believed.
        after = {"runtimes": RUNTIMES["runtimes"] + [IOS_18]}
        code, out = self.step("simulator", self.shell(after_download=after, download_code=70),
                              environ={"IOS_VERSION": "18.6"})
        self.assertEqual(code, 0, out)
        for kwargs in [{"download_code": 0, "after_download": RUNTIMES}, {"download_code": 1}]:
            with self.subTest(**{k: str(v)[:20] for k, v in kwargs.items()}):
                shell = self.shell(**kwargs)
                code, _ = self.step("simulator", shell, environ={"IOS_VERSION": "18.6"})
                self.assertEqual(code, 1)
                self.assertEqual(len([c for c in shell.commands if "-downloadPlatform" in c]), 2)

    def test_a_version_that_isn_t_one_is_refused_before_any_command(self):
        for requested in ["18; rm -rf /", "eighteen", "18.6.1.1", "-h", "180"]:
            with self.subTest(requested=requested):
                shell = self.shell()
                code, out = self.step("simulator", shell, environ={"IOS_VERSION": requested})
                self.assertEqual((code, shell.commands), (1, []))

    def test_an_existing_device_is_reused(self):
        devices = {"com.apple.CoreSimulator.SimRuntime.iOS-26-5": [
            {"name": "iPhone 17 Pro", "udid": "X", "isAvailable": True},
            {"name": "iPhone 17", "udid": UDID, "isAvailable": True}]}
        shell = self.shell(devices=devices, create=(1, "", "should not be called"))
        code, out = self.step("simulator", shell)
        self.assertEqual(code, 0, out)
        self.assertFalse(any(c[:3] == ["xcrun", "simctl", "create"] for c in shell.commands))
        self.assertEqual(self.read_record()["udid"], UDID)

    def test_a_device_that_can_t_be_made_fails(self):
        for create in [(1, "", "Invalid device type"), (0, "not a udid\n", "")]:
            with self.subTest(create=create):
                self.assertEqual(self.step("simulator", self.shell(create=create))[0], 1)

    def test_unreadable_runtimes_fail(self):
        shell = FakeShell(answers=[(starts("xcrun", "simctl", "list", "runtimes", "--json"),
                                    (0, "not json", ""))])
        self.assertEqual(self.step("simulator", shell)[0], 1)


class PickTest(unittest.TestCase):
    def test_pick_runtime(self):
        runtimes = RUNTIMES["runtimes"]
        self.assertEqual(ios_steps.pick_runtime(runtimes, "")["version"], "26.5")
        self.assertEqual(ios_steps.pick_runtime(runtimes, "26.4.1")["version"], "26.4.1")
        self.assertIsNone(ios_steps.pick_runtime(runtimes, "27"))  # not available
        self.assertIsNone(ios_steps.pick_runtime(runtimes, "26.1"))
        self.assertIsNone(ios_steps.pick_runtime(runtimes, "2"))  # 26.x isn't version 2

    def test_pick_device_type(self):
        self.assertEqual(ios_steps.pick_device_type(IOS_18, "iPhone 17")["name"], "iPhone 16")
        self.assertEqual(ios_steps.pick_device_type(RUNTIMES["runtimes"][0], "iPhone 17")["name"], "iPhone 17")
        self.assertIsNone(ios_steps.pick_device_type({"supportedDeviceTypes": [{"name": "iPad (A16)"}]}, "iPhone 17"))


class BuildAndTestSteps(StepsTest):
    def setUp(self):
        super().setUp()
        self.repo.write("apps/ios/project.yml", "name: Tadayo\n")
        self.repo.mkdir("apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes")
        self.record(udid=UDID, ios="26.5", device="iPhone 17")

    def products(self, extension=True):
        app = os.path.join(self.repo.root, "_runner_temp", "DerivedData", "Build", "Products",
                           "Debug-iphonesimulator", "Tadayo.app")
        os.makedirs(os.path.join(app, "PlugIns", "TadayoShare.appex") if extension else app)

    def test_build_for_testing_on_the_simulator(self):
        shell = FakeShell(effects=[(has("build-for-testing"), lambda cmd: self.products())])
        code, out = self.step("build", shell)
        self.assertEqual(code, 0, out)
        cmd = shell.commands[0]
        self.assertEqual(cmd[:2], ["xcodebuild", "build-for-testing"])
        self.assertEqual(cmd[cmd.index("-project") + 1], "apps/ios/Tadayo.xcodeproj")
        self.assertEqual(cmd[cmd.index("-scheme") + 1], "Tadayo")
        self.assertEqual(cmd[cmd.index("-destination") + 1], f"platform=iOS Simulator,id={UDID}")

    def test_an_app_without_the_share_extension_fails(self):
        shell = FakeShell(effects=[(has("build-for-testing"), lambda cmd: self.products(False))])
        code, out = self.step("build", shell)
        self.assertEqual(code, 1)
        self.assertIn("TadayoShare.appex", out)

    def test_a_failed_build_fails(self):
        self.assertEqual(self.step("build", FakeShell(codes=[(has("build-for-testing"), 65)]))[0], 65)

    def test_no_simulator_no_build(self):
        os.remove(os.path.join(self.repo.out, "run.json"))
        shell = FakeShell()
        self.assertEqual((self.step("build", shell)[0], shell.commands), (1, []))

    def write_scheme(self, text):
        self.repo.write("apps/ios/Tadayo.xcodeproj/xcshareddata/xcschemes/Tadayo.xcscheme", text)

    def test_a_scheme_with_no_tests_passes_with_nothing_to_test(self):
        self.write_scheme(scheme())
        shell = FakeShell()
        code, out = self.step("test", shell)
        self.assertEqual((code, shell.commands), (0, []))
        self.assertIn("no tests yet", out)
        self.assertEqual(self.read_record()["tests"], "none")

    def test_a_missing_scheme_fails(self):
        self.assertEqual(self.step("test")[0], 1)

    def test_tests_run_with_snapshot_recording_off(self):
        self.write_scheme(scheme(("TadayoTests", False), ("TadayoSnapshotTests", False),
                                 ("TadayoUITests", False), ("Disabled", True)))
        shell = FakeShell()
        code, out = self.step("test", shell)
        self.assertEqual(code, 0, out)
        cmd, env = shell.commands[0], shell.envs[0]
        self.assertEqual(cmd[:2], ["xcodebuild", "test-without-building"])
        self.assertNotIn("-skip-testing", cmd)
        self.assertEqual(env["TEST_RUNNER_SNAPSHOT_TESTING_RECORD"], "never")
        self.assertEqual(env["TEST_RUNNER_SNAPSHOT_ARTIFACTS"], os.path.join(self.repo.out, "artifacts"))
        self.assertTrue(cmd[cmd.index("-resultBundlePath") + 1].endswith("Tests.xcresult"))
        self.assertEqual(self.read_record()["tests"], "passed")

    def test_a_compatibility_run_skips_the_snapshot_targets(self):
        self.write_scheme(scheme(("TadayoTests", False), ("TadayoSnapshotTests", False),
                                 ("TadayoUITests", False)))
        shell = FakeShell()
        code, out = self.step("test", shell, environ={"IOS_VERSION": "18.6"})
        self.assertEqual(code, 0, out)
        cmd = shell.commands[0]
        self.assertEqual([cmd[i + 1] for i, c in enumerate(cmd) if c == "-skip-testing"],
                         ["TadayoSnapshotTests"])

    def test_a_test_that_sets_its_own_record_mode_is_refused(self):
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        for line in ["assertSnapshot(of: v, as: .image, record: .all)",
                     "assertSnapshot(of: v, as: .image, record: true)",
                     "withSnapshotTesting(record: .missing) {",
                     "isRecording = true",
                     "setenv(\"SNAPSHOT_TESTING_RECORD\", \"all\", 1)",
                     ".snapshots(record: .failed)"]:
            with self.subTest(line=line):
                self.repo.write("apps/ios/TadayoSnapshotTests/HomeTests.swift", f"func t() {{\n  {line}\n}}\n")
                shell = FakeShell()
                code, out = self.step("test", shell)
                self.assertEqual((code, shell.commands), (1, []))
                self.assertIn("HomeTests.swift:2", out)

    def test_record_never_and_comments_are_fine(self):
        self.write_scheme(scheme(("TadayoSnapshotTests", False)))
        self.repo.write("apps/ios/TadayoSnapshotTests/HomeTests.swift",
                        "assertSnapshot(of: v, as: .image, record: .never)\n// record: .all is what local runs use\n")
        self.assertEqual(self.step("test", FakeShell())[0], 0)

    def test_failing_tests_fail_the_step(self):
        self.write_scheme(scheme(("TadayoTests", False)))
        code, _ = self.step("test", FakeShell(codes=[(has("test-without-building"), 65)]))
        self.assertEqual(code, 65)
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
        self.assertEqual(ios_steps.evidence_path("ios/b0-ios-check", SHA, ""), "ios/b0-ios-check/0123456/ios")
        self.assertEqual(ios_steps.evidence_path("main", SHA, "18.6"), "main/0123456/ios-18.6")
        for branch, sha, requested in [("", SHA, ""), ("a/../b", SHA, ""), ("/a", SHA, ""),
                                       ("a", "0123456", ""), ("a", SHA, "18;x")]:
            with self.subTest(branch=branch, sha=sha, requested=requested):
                with self.assertRaises(ValueError):
                    ios_steps.evidence_path(branch, sha, requested)

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


class CollectTest(StepsTest):
    def png(self, path, color="#336699"):
        full = os.path.join(self.repo.root, *path.split("/")) if not os.path.isabs(path) else path
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + color.encode())
        return full

    def entries(self):
        with open(os.path.join(self.repo.out, "snapshots.json")) as f:
            return {e["file"]: e for e in json.load(f)["entries"]}

    def test_committed_changed_and_new_snapshots(self):
        snaps = "apps/ios/TadayoSnapshotTests/__Snapshots__/UpcomingTests"
        self.png(f"{snaps}/testUpcoming.F02-upcoming.png")
        self.png(f"{snaps}/testUpcoming.F02-upcoming-dark.png")
        self.png(os.path.join(self.repo.out, "artifacts", "UpcomingTests", "testUpcoming.F02-upcoming-dark.png"), "#000")
        os.makedirs(os.path.join(self.repo.out, "Tests.xcresult"))

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
        entries = self.entries()
        self.assertEqual(set(entries), {"testUpcoming.F02-upcoming.png", "testUpcoming.F02-upcoming-dark.png",
                                        "testFriends.F01-friends.png"})
        committed = entries["testUpcoming.F02-upcoming.png"]
        self.assertEqual((committed["status"], committed["state"], committed["image"]),
                         ("committed", "F02-upcoming", f"{snaps}/testUpcoming.F02-upcoming.png"))
        changed = entries["testUpcoming.F02-upcoming-dark.png"]
        self.assertEqual((changed["status"], changed["reference"]),
                         ("changed", f"{snaps}/testUpcoming.F02-upcoming-dark.png"))
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, *changed["image"].split("/"))))
        new = entries["testFriends.F01-friends.png"]
        self.assertEqual((new["status"], new["state"], new["test"], new["reference"]),
                         ("new", "F01-friends", "FriendsTests", None))
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, *new["image"].split("/"))))
        # The manifest is kept with the logs, so the first run on the runner shows its shape.
        self.assertTrue(os.path.isfile(os.path.join(self.repo.out, "logs", "attachments-manifest.json")))

    def test_nothing_drawn_still_lists_the_committed_references(self):
        self.png("apps/ios/T/__Snapshots__/HomeTests/testHome.H01-open.png")
        code, _ = self.step("collect", FakeShell())
        self.assertEqual(code, 0)
        self.assertEqual([e["status"] for e in self.entries().values()], ["committed"])


class SheetsTest(StepsTest):
    """The B0 plan's slice 9 test, "the contact-sheet script on a 2.1 render and a sample PNG"."""

    def setUp(self):
        super().setUp()
        self.repo.copy(os.path.join(ROOT, *RENDER.split("/")), RENDER)
        self.repo.copy(os.path.join(ROOT, "design", "reference", "INVENTORY.md"), "design/reference/INVENTORY.md")
        self.environ.update({"GITHUB_REF_NAME": "ios/b0-ios-check", "GITHUB_SHA": SHA,
                             "GITHUB_EVENT_NAME": "push", "GITHUB_REPOSITORY": "beurni2/tadayo",
                             "GITHUB_SERVER_URL": "https://github.com", "GITHUB_RUN_ID": "42"})
        self.record(ios="26.5", device="iPhone 17", xcode="26.6", swift="6.3.3", tests="failed")
        os.makedirs(os.path.join(self.repo.out, "logs"))
        with open(os.path.join(self.repo.out, "logs", "test.log"), "w") as f:
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

    def stage(self):
        return os.path.join(self.repo.out, "evidence", "ios", "b0-ios-check", "0123456", "ios")

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
        self.assertTrue(os.path.isfile(os.path.join(self.stage(), "logs", "test.log")))
        with open(os.path.join(self.stage(), "index.md")) as f:
            index = f.read()
        self.assertIn("https://github.com/beurni2/tadayo/blob/evidence/ios/b0-ios-check/0123456/ios/sheets/F02-upcoming.jpg", index)
        self.assertIn("design/reference/2.1/F02-upcoming.png", index)
        self.assertIn("Tests: failed", index)

    @unittest.skipUnless(HAS_MAGICK, "ImageMagick isn't installed here; the evidence job installs it")
    def test_a_changed_snapshot_shows_the_render_its_reference_and_itself(self):
        reference = self.sample("apps/ios/S/__Snapshots__/XTests/testX.F02-upcoming.png", color="#888")
        self.snapshots([self.entry("F02-upcoming", "changed", reference=reference)])
        code, out = self.step("sheets", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        info = subprocess.run(["identify", "-format", "%w", os.path.join(self.stage(), "sheets", "F02-upcoming.jpg")],
                              capture_output=True, text=True, check=True).stdout
        self.assertEqual(int(info), 3 * (600 + 2 * 24))

    @unittest.skipUnless(HAS_MAGICK, "ImageMagick isn't installed here; the evidence job installs it")
    def test_a_state_with_no_render_shows_its_snapshot_alone_marked(self):
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
        self.assertIn("iOS 26.5 · iPhone 17\nios/b0-ios-check @ 0123456", labels[0])

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

    def test_a_compatibility_run_carries_logs_and_no_sheets(self):
        code, out, montaged, _ = self.run_sheets([self.entry("A02-email", "new")],
                                                 environ={"IOS_VERSION": "18.6"}, shell=FakeShell())
        self.assertEqual((code, montaged), (0, []))
        stage = os.path.join(self.repo.out, "evidence", "ios", "b0-ios-check", "0123456", "ios-18.6")
        self.assertTrue(os.path.isfile(os.path.join(stage, "logs", "test.log")))
        self.assertTrue(os.path.isfile(os.path.join(stage, "index.md")))

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
                    "image": "snapshots/X/gone.png", "reference": None},
                   self.entry("F02-upcoming", "new")]
        code, _, montaged, _ = self.run_sheets(entries)
        self.assertEqual((code, montaged), (1, ["F02-upcoming.jpg"]))
        code, _, _, _ = self.run_sheets([self.entry("F02-upcoming", "new")],
                                        shell=FakeShell(codes=[(starts("montage"), 1)]))
        self.assertEqual(code, 1)

    def test_no_snapshots_yet_still_publishes_the_logs(self):
        code, out, montaged, _ = self.run_sheets([])
        self.assertEqual((code, montaged), (0, []))
        with open(os.path.join(self.repo.out, "evidence.json")) as f:
            self.assertEqual(json.load(f)["path"], "ios/b0-ios-check/0123456/ios")

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
        self.stage_dir = os.path.join(self.repo.out, "evidence", *self.path.split("/"))
        os.makedirs(os.path.join(self.stage_dir, "sheets"))
        with open(os.path.join(self.stage_dir, "index.md"), "w") as f:
            f.write("# index\n")
        with open(os.path.join(self.stage_dir, "sheets", "A02-email.jpg"), "w") as f:
            f.write("jpeg")
        with open(os.path.join(self.repo.out, "evidence.json"), "w") as f:
            json.dump({"path": self.path, "stage": self.stage_dir}, f)
        self.environ.update({"EVIDENCE_REMOTE": "file://" + self.remote, "GITHUB_RUN_ID": "42",
                             "GITHUB_SHA": SHA})

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
        shell = FakeShell(codes=[(has("diff"), 0)])
        self.step("publish", shell, environ={"GITHUB_TOKEN": "ghs_secretvalue"})
        self.assertFalse([c for c in shell.commands if any("ghs_secretvalue" in a for a in c)])
        self.assertTrue(any(env and "GIT_CONFIG_VALUE_0" in env for env in shell.envs))
        self.assertFalse(any("ghs_secretvalue" in (env or {}).get("GIT_CONFIG_VALUE_0", "") for env in shell.envs))

    def test_the_same_evidence_twice_pushes_nothing_new(self):
        self.assertEqual(self.step("publish", ios_steps.Shell(self.repo.root))[0], 0)
        before = self.git("rev-parse", "evidence", cwd=self.remote)
        code, out = self.step("publish", ios_steps.Shell(self.repo.root))
        self.assertEqual(code, 0, out)
        self.assertIn("already on", out)
        self.assertEqual(self.git("rev-parse", "evidence", cwd=self.remote), before)

    def test_without_the_sheets_step_s_record_it_fails(self):
        os.remove(os.path.join(self.repo.out, "evidence.json"))
        self.assertEqual(self.step("publish", FakeShell())[0], 1)


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
        self.assertIn("    runs-on: macos-26", self.jobs["build"])

    def test_it_runs_on_the_paths_technical_design_names(self):
        on = self.text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        paths = re.findall(r"^      - '?([^'\n]+)'?$", on.split("paths:", 1)[1].split("workflow_dispatch", 1)[0], flags=re.M)
        self.assertEqual(paths, ["apps/ios/**", "packages/swift/**", "packages/contracts/**", "design/reference/**"])
        self.assertIn("    branches-ignore:\n      - evidence\n", on)
        self.assertIn("  workflow_dispatch:\n", on)

    def test_permissions_are_least_privilege(self):
        self.assertIn("\npermissions: {}\n", self.text)
        writes = [job for job, lines in self.jobs.items()
                  if any(re.match(r"^      contents: write(\s|$)", line) for line in lines)]
        self.assertEqual(writes, ["evidence"])
        for job, lines in self.jobs.items():
            with self.subTest(job=job):
                self.assertIn("    permissions:", lines)
        self.assertNotIn("secrets.", self.text)  # never a secret in ios (TECH-DESIGN section 9)

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


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(ios_steps.main(["ios_steps.py", "deploy"]), 2)
        self.assertIn("steps:", out.getvalue())


if __name__ == "__main__":
    unittest.main()
