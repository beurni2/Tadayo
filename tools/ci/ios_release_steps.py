#!/usr/bin/env python3
"""The steps of the `ios-release` workflow (docs/TECH-DESIGN.md sections 2 and 9; the B0 plan's
slice 12): the archive, the checks of what it holds, and the upload to TestFlight.

  python3 tools/ci/ios_release_steps.py <step>

.github/workflows/ios-release.yml stays thin: each of its steps calls one step here. The run is
started by hand, on a chosen branch, with two inputs that reach the steps as environment
variables, never as text in a command:

  RELEASE_ENVIRONMENT  dev (the Dev configuration: a release build that points at dev, with the
                       Lab and its fixture photographs) or prod (the Release configuration).
  RELEASE_UPLOAD       true: sign the archive for App Store Connect and upload it. false: a dry
                       run, which archives and checks and touches nothing at Apple; the
                       workflow gives it no key, and the steps that would use one skip.

A prod archive is built and checked, and never uploaded: prod's first upload waits for the
founder's ask and a change to this file in its own PR (CLAUDE.md, "Git": anything in prod).

  step       what it does
  plan       Reads the inputs and what an upload needs, says what the run will do, and fails
             before any build when something is missing or misshapen.
  toolchain  ios_steps.py's: the pinned Xcode and its Swift (tools/ci/toolchain.py).
  xcodegen   ios_steps.py's: the pinned XcodeGen makes the project from apps/ios/project.yml.
  archive    `xcodebuild archive` for a generic iPhone, in the environment's configuration, with
             the run's build number. No Apple account takes part: the archive is signed ad hoc
             (CODE_SIGN_IDENTITY=-), which keeps the targets' entitlements in the signature
             for the export to re-sign with. The package plugins in its log are checked as the
             `ios` build's are (ADR-028).
  check      Reads the archived app, and fails unless: the app and the share extension have their
             bundle ids, the run's build number and the environment's name; the app names its
             icon (CFBundleIconName) and holds the 120-pixel iPhone icon file App Store Connect
             asks for (ITMS-90022; docs/LIMITATIONS.md, 2026-11-01); the share extension's
             activation rule is the dictionary apps/ios/project.yml declares, never a predicate
             string; both carry the app group in their entitlements; and the fixture
             photographs are all there in a dev archive and none of them in a prod one (T46;
             TECH-DESIGN section 4, "The Lab").
  export     Upload runs only. `xcodebuild -exportArchive` to a folder, signed by Xcode's
             automatic signing with the App Store Connect API key (a distribution certificate
             Apple holds, and Xcode-managed profiles). Then reads the exported app's
             entitlements: the team's application identifier, the app group, no get-task-allow.
             What is uploaded next is signed the same way from the same archive.
  upload     Upload runs only. `xcodebuild -exportArchive` with `destination: upload`.

The build number is `<run number>.<run attempt>`, so every run, and every re-run, uploads a
number App Store Connect hasn't seen.

The key. ASC_KEY_P8 is written to a file only for the length of one xcodebuild command, in a
folder of the runner's temporary directory, readable by its owner alone, and removed whether the
command passes or fails. No step prints it, and no file with it is uploaded as an artifact. When
a command fails, the end of its log is printed; the log holds the key's path and ids, never its
text.

Exit 0 when the step passes or is skipped, 1 when it fails, 2 on bad usage.

Tests: python3 tools/ci/ios_release_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import json
import os
import plistlib
import re
import shutil
import struct
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ios_steps  # noqa: E402
import toolchain  # noqa: E402

CONFIGURATIONS = {"dev": "Dev", "prod": "Release"}
UPLOADS = ("dev",)  # the environments a run may upload
APP_ID = "app.tadayo"
SHARE_ID = "app.tadayo.share"
APP_GROUP = "group.app.tadayo"
ICON_NAME = "AppIcon"
ICON_PIXELS = 120
FIXTURES = "apps/ios/Fixtures/Fixtures.xcassets"
# An image of the app's own catalog, in every archive: it shows the listing was read.
OWN_IMAGE = "Wordmark"
# The share extension's activation rule, as apps/ios/project.yml declares it (spec 10; the new
# direction's decision 6 keeps the six). A string here would be a predicate, and TRUEPREDICATE is
# refused by App Store review.
ACTIVATION_RULE = {"NSExtensionActivationSupportsImageWithMaxCount": 6,
                   "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
                   "NSExtensionActivationSupportsText": True}
TEAM_ID = re.compile(r"[A-Z0-9]{10}")
KEY_ID = re.compile(r"[A-Z0-9]{10}")
ISSUER_ID = re.compile(r"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")
RUN_NUMBER = re.compile(r"[1-9][0-9]{0,8}")
KEY_START = "-----BEGIN PRIVATE KEY-----"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
LOG_TAIL = 80


# Pure helpers, tested on their own.

def png_size(data):
    """(width, height) of a PNG, or None. Xcode writes an app's PNGs with a chunk of its own
    before IHDR, so the chunks are walked until IHDR."""
    if not data.startswith(PNG_SIGNATURE):
        return None
    at = len(PNG_SIGNATURE)
    while at + 8 <= len(data):
        length, kind = struct.unpack(">I4s", data[at:at + 8])
        if kind == b"IHDR":
            if length < 8 or at + 16 > len(data):
                return None
            return struct.unpack(">II", data[at + 8:at + 16])
        at += 12 + length
    return None


def asset_names(listing):
    """The names in `xcrun assetutil --info`'s JSON: a list of objects, each asset's with a
    "Name". Raises ValueError when it isn't that."""
    entries = json.loads(listing)
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        raise ValueError("the listing isn't a list of objects")
    names = {e["Name"] for e in entries if isinstance(e.get("Name"), str)}
    if not names:
        raise ValueError("the listing names no asset")
    return names


def fixture_problems(environment, names, files, fixtures):
    """What's wrong with an archive's fixture photographs: `names` from its compiled catalog,
    `files` every file name in the app, `fixtures` the image sets of FIXTURES."""
    if not fixtures:
        return [f"{FIXTURES} holds no image set, so there is nothing to look for"]
    problems = []
    if OWN_IMAGE not in names:
        problems.append(f"the catalog's listing doesn't name {OWN_IMAGE}, the app's own image, "
                        "so it wasn't read as it is written")
    found = sorted(f for f in fixtures if f in names)
    loose = sorted(f for f in files if any(f.startswith(name) for name in fixtures))
    if environment == "prod":
        if found:
            problems.append("a prod archive holds fixture photographs (T46): " + ", ".join(found))
        if loose:
            problems.append("a prod archive holds fixture files (T46): " + ", ".join(loose))
    else:
        missing = sorted(set(fixtures) - set(found))
        if missing:
            problems.append("a dev archive must hold every fixture photograph, which is also how "
                            "this check shows it can see one: missing " + ", ".join(missing))
    return problems


def bundle_problems(info, bundle_id, build, environment=None):
    """What's wrong with a bundle's Info.plist values."""
    problems = []
    if info.get("CFBundleIdentifier") != bundle_id:
        problems.append(f"its bundle id is {info.get('CFBundleIdentifier')!r}, not {bundle_id}")
    if info.get("CFBundleVersion") != build:
        problems.append(f"its build number is {info.get('CFBundleVersion')!r}, not the run's {build}")
    if environment is not None and info.get("TadayoEnvironment") != environment:
        problems.append(f"it points at {info.get('TadayoEnvironment')!r}, not {environment}")
    return problems


def icon_files(info):
    """The app icon's file names, as its Info.plist lists them (without @2x and .png)."""
    primary = (info.get("CFBundleIcons") or {}).get("CFBundlePrimaryIcon") or {}
    files = primary.get("CFBundleIconFiles") or []
    return [f for f in files if isinstance(f, str)]


def entitlement_problems(entitlements, team=None):
    """What's wrong with a bundle's entitlements. With a team, the bundle is signed for App Store
    Connect, and its identifiers and get-task-allow are checked too."""
    problems = []
    if entitlements.get("com.apple.security.application-groups") != [APP_GROUP]:
        problems.append("its app groups are "
                        f"{entitlements.get('com.apple.security.application-groups')!r}, "
                        f"not [{APP_GROUP!r}]")
    if team is not None:
        if entitlements.get("com.apple.developer.team-identifier") != team:
            problems.append("its team isn't the run's")
        identifier = entitlements.get("application-identifier")
        if not isinstance(identifier, str) or not identifier.startswith(team + "."):
            problems.append("its application identifier doesn't start with the run's team")
        if entitlements.get("get-task-allow"):
            problems.append("it allows a debugger (get-task-allow)")
    return problems


def export_options(team, destination):
    return {"method": "app-store-connect", "destination": destination, "teamID": team,
            "signingStyle": "automatic", "manageAppVersionAndBuildNumber": False,
            "uploadSymbols": True}


class Steps:
    def __init__(self, root, shell, environ=None):
        self.root = root
        self.shell = shell
        self.environ = os.environ if environ is None else environ
        temp = self.environ.get("RUNNER_TEMP") or "/tmp"
        self.out = os.path.join(temp, "ios-release-out")
        self.key_dir = os.path.join(temp, "ios-release-key")
        self.ios = ios_steps.Steps(root, shell, environ=self.environ, out=self.out)

    # Helpers

    def say(self, step, text):
        print(f"ios-release: {step}: {text}")

    def inputs(self):
        """(environment, upload), or raises ValueError."""
        environment = self.environ.get("RELEASE_ENVIRONMENT", "")
        if environment not in CONFIGURATIONS:
            raise ValueError(f"RELEASE_ENVIRONMENT is {environment!r}, not one of "
                             + ", ".join(CONFIGURATIONS))
        upload = self.environ.get("RELEASE_UPLOAD", "")
        if upload not in ("true", "false"):
            raise ValueError(f"RELEASE_UPLOAD is {upload!r}, not true or false")
        if upload == "true" and environment not in UPLOADS:
            raise ValueError(f"a {environment} archive is never uploaded by this workflow: "
                             "prod's first upload waits for the founder's ask and its own PR")
        return environment, upload == "true"

    def build_number(self):
        number = self.environ.get("GITHUB_RUN_NUMBER", "")
        attempt = self.environ.get("GITHUB_RUN_ATTEMPT", "")
        if not RUN_NUMBER.fullmatch(number) or not RUN_NUMBER.fullmatch(attempt):
            raise ValueError("GITHUB_RUN_NUMBER and GITHUB_RUN_ATTEMPT aren't a run's")
        return f"{number}.{attempt}"

    def team(self):
        team = self.environ.get("APPLE_TEAM_ID", "")
        if not TEAM_ID.fullmatch(team):
            raise ValueError("APPLE_TEAM_ID (a repository variable) isn't a team id: ten capital "
                             "letters and digits")
        return team

    def key(self):
        """(key id, issuer id, the key's text), or raises ValueError. Never printed."""
        key_id = self.environ.get("ASC_KEY_ID", "")
        issuer = self.environ.get("ASC_ISSUER_ID", "")
        text = self.environ.get("ASC_KEY_P8", "")
        if not KEY_ID.fullmatch(key_id):
            raise ValueError("ASC_KEY_ID (a repository secret) isn't a key id")
        if not ISSUER_ID.fullmatch(issuer):
            raise ValueError("ASC_ISSUER_ID (a repository secret) isn't an issuer id")
        if not text.strip().startswith(KEY_START):
            raise ValueError("ASC_KEY_P8 (a repository secret) isn't a .p8 file's whole text")
        return key_id, issuer, text

    @contextlib.contextmanager
    def key_file(self):
        """The key as a file for one command: its arguments for xcodebuild. Removed after."""
        key_id, issuer, text = self.key()
        shutil.rmtree(self.key_dir, ignore_errors=True)
        os.makedirs(self.key_dir, mode=0o700)
        path = os.path.join(self.key_dir, f"AuthKey_{key_id}.p8")
        try:
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
                f.write(text if text.endswith("\n") else text + "\n")
            yield ["-allowProvisioningUpdates", "-authenticationKeyPath", path,
                   "-authenticationKeyID", key_id, "-authenticationKeyIssuerID", issuer]
        finally:
            shutil.rmtree(self.key_dir, ignore_errors=True)

    def archive_path(self):
        return os.path.join(self.out, "Tadayo.xcarchive")

    def app_path(self):
        return os.path.join(self.archive_path(), "Products", "Applications", ios_steps.APP_PRODUCT)

    def log(self, name):
        return os.path.join(self.out, "logs", name)

    def tail(self, name):
        try:
            with open(self.log(name), encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
        except OSError:
            return
        print(f"--- the last {LOG_TAIL} lines of {name} ---")
        print("".join(lines[-LOG_TAIL:]).rstrip("\n"))

    @staticmethod
    def read_plist(path):
        with open(path, "rb") as f:
            value = plistlib.load(f)
        if not isinstance(value, dict):
            raise ValueError(f"{os.path.basename(path)} isn't a dictionary")
        return value

    def entitlements(self, bundle):
        code, out, err = self.shell.capture(
            ["codesign", "-d", "--entitlements", "-", "--xml", bundle], env=self.ios.xcode_env())
        if code != 0 or not out.strip():
            raise ValueError(f"codesign shows no entitlements for {os.path.basename(bundle)}: "
                             f"{err.strip()[:200]}")
        value = plistlib.loads(out.encode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("the entitlements aren't a dictionary")
        return value

    def fixtures(self):
        folder = os.path.join(self.root, *FIXTURES.split("/"))
        return sorted(n[:-len(".imageset")] for n in os.listdir(folder) if n.endswith(".imageset"))

    # The steps

    def plan(self):
        try:
            environment, upload = self.inputs()
            build = self.build_number()
            if upload:
                self.team()
                self.key()
        except ValueError as error:
            self.say("plan", str(error))
            return 1
        self.say("plan", f"the {CONFIGURATIONS[environment]} configuration ({environment}), "
                         f"build {build}, " + ("signed and uploaded to App Store Connect"
                                               if upload else "a dry run: archived and checked, "
                                               "nothing signed for Apple and nothing uploaded"))
        return 0

    def toolchain(self):
        return self.ios.toolchain()

    def xcodegen(self):
        return self.ios.xcodegen()

    def archive(self):
        try:
            environment, _ = self.inputs()
            build = self.build_number()
            project = self.ios.project()
        except (OSError, ValueError) as error:
            self.say("archive", str(error))
            return 1
        shutil.rmtree(self.archive_path(), ignore_errors=True)
        # Ad hoc: no certificate, profile or account. The entitlements stay in the signature,
        # which the export reads when it signs for App Store Connect.
        code = self.shell.run(
            ["xcodebuild", "archive", "-project", project, "-scheme", ios_steps.SCHEME,
             "-configuration", CONFIGURATIONS[environment],
             "-destination", "generic/platform=iOS", "-archivePath", self.archive_path(),
             "-derivedDataPath", self.ios.derived_data(), "-skipPackagePluginValidation",
             f"CURRENT_PROJECT_VERSION={build}", "CODE_SIGN_STYLE=Manual", "CODE_SIGN_IDENTITY=-",
             "AD_HOC_CODE_SIGNING_ALLOWED=YES", "PROVISIONING_PROFILE_SPECIFIER=",
             "DEVELOPMENT_TEAM="],
            env=self.ios.xcode_env(), log=self.log("archive.log"))
        try:
            with open(self.log("archive.log"), encoding="utf-8", errors="replace") as f:
                plugins = ios_steps.package_plugin_problems(f, toolchain.PACKAGE_PLUGINS)
        except OSError as error:
            plugins = [f"logs/archive.log can't be read ({error.strerror})"]
        if plugins:
            self.say("archive", "the package plugins in the log aren't the ones "
                                "toolchain.PACKAGE_PLUGINS allows (ADR-028): "
                                + "; ".join(plugins[:10]))
            return code or 1
        if code != 0:
            self.say("archive", "xcodebuild archive failed")
            self.tail("archive.log")
            return code
        if not os.path.isdir(self.app_path()):
            self.say("archive", f"the archive holds no {ios_steps.APP_PRODUCT}")
            return 1
        self.say("archive", f"{ios_steps.APP_PRODUCT}, build {build}, "
                            f"{CONFIGURATIONS[environment]}")
        return 0

    def check(self):
        try:
            environment, _ = self.inputs()
            build = self.build_number()
            problems = self.archive_problems(environment, build)
        except (OSError, ValueError, KeyError, plistlib.InvalidFileException) as error:
            self.say("check", f"the archive can't be read: {error}")
            return 1
        for problem in problems:
            self.say("check", problem)
        if problems:
            return 1
        self.say("check", f"the {environment} archive holds what it must and nothing it mustn't")
        return 0

    def archive_problems(self, environment, build):
        app = self.app_path()
        share = os.path.join(app, "PlugIns", ios_steps.SHARE_EXTENSION)
        info = self.read_plist(os.path.join(app, "Info.plist"))
        share_info = self.read_plist(os.path.join(share, "Info.plist"))
        problems = [f"the app: {p}" for p in bundle_problems(info, APP_ID, build, environment)]
        problems += [f"the share extension: {p}"
                     for p in bundle_problems(share_info, SHARE_ID, build)]
        # The icon (ITMS-90022, ITMS-90713).
        if info.get("CFBundleIconName") != ICON_NAME:
            problems.append(f"the app's CFBundleIconName is {info.get('CFBundleIconName')!r}, "
                            f"not {ICON_NAME}")
        sizes = {}
        for name in icon_files(info):
            path = os.path.join(app, f"{name}@2x.png")
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    sizes[name] = png_size(f.read(4096))
        if (ICON_PIXELS, ICON_PIXELS) not in sizes.values():
            problems.append(f"the app holds no {ICON_PIXELS}-pixel iPhone icon file among the "
                            f"ones its Info.plist names ({sizes or 'none'})")
        # The share extension's activation rule.
        attributes = (share_info.get("NSExtension") or {}).get("NSExtensionAttributes") or {}
        if attributes.get("NSExtensionActivationRule") != ACTIVATION_RULE:
            problems.append("the share extension's activation rule is "
                            f"{attributes.get('NSExtensionActivationRule')!r}, not the dictionary "
                            f"{ios_steps.PROJECT_SPEC} declares")
        # The entitlements the export will sign with.
        for label, bundle in (("the app", app), ("the share extension", share)):
            problems += [f"{label}: {p}" for p in entitlement_problems(self.entitlements(bundle))]
        # The fixture photographs.
        code, listing, err = self.shell.capture(
            ["xcrun", "assetutil", "--info", os.path.join(app, "Assets.car")],
            env=self.ios.xcode_env())
        if code != 0:
            raise ValueError(f"assetutil can't list the app's catalog: {err.strip()[:200]}")
        files = [name for _, _, names in os.walk(app) for name in names]
        problems += fixture_problems(environment, asset_names(listing), files, self.fixtures())
        return problems

    def export(self):
        try:
            _, upload = self.inputs()
            if not upload:
                self.say("export", "a dry run: skipped")
                return 0
            team = self.team()
        except ValueError as error:
            self.say("export", str(error))
            return 1
        folder = os.path.join(self.out, "export")
        code = self.export_archive("export", team, folder)
        if code != 0:
            return code
        try:
            problems = self.exported_problems(folder, team)
        except (OSError, ValueError, KeyError, zipfile.BadZipFile,
                plistlib.InvalidFileException) as error:
            self.say("export", f"the exported app can't be read: {error}")
            return 1
        finally:
            shutil.rmtree(folder, ignore_errors=True)
            shutil.rmtree(os.path.join(self.out, "payload"), ignore_errors=True)
        for problem in problems:
            self.say("export", problem)
        if problems:
            return 1
        self.say("export", "signed for App Store Connect, with the app group in both bundles")
        return 0

    def exported_problems(self, folder, team):
        packages = sorted(n for n in os.listdir(folder) if n.endswith(".ipa"))
        if len(packages) != 1:
            raise ValueError(f"expected one .ipa in the export, found {packages}")
        payload = os.path.join(self.out, "payload")
        shutil.rmtree(payload, ignore_errors=True)
        with zipfile.ZipFile(os.path.join(folder, packages[0])) as package:
            for member in package.namelist():
                target = os.path.realpath(os.path.join(payload, member))
                if not target.startswith(os.path.realpath(payload) + os.sep):
                    raise ValueError("the .ipa holds a path outside itself")
            package.extractall(payload)
        app = os.path.join(payload, "Payload", ios_steps.APP_PRODUCT)
        share = os.path.join(app, "PlugIns", ios_steps.SHARE_EXTENSION)
        problems = []
        for label, bundle in (("the app", app), ("the share extension", share)):
            if not os.path.isfile(os.path.join(bundle, "embedded.mobileprovision")):
                problems.append(f"{label}: it holds no provisioning profile")
            problems += [f"{label}: {p}"
                         for p in entitlement_problems(self.entitlements(bundle), team)]
        return problems

    def upload(self):
        try:
            _, upload = self.inputs()
            if not upload:
                self.say("upload", "a dry run: skipped")
                return 0
            team = self.team()
            build = self.build_number()
        except ValueError as error:
            self.say("upload", str(error))
            return 1
        folder = os.path.join(self.out, "upload")
        code = self.export_archive("upload", team, folder)
        shutil.rmtree(folder, ignore_errors=True)
        if code == 0:
            self.say("upload", f"build {build} is uploaded; App Store Connect processes it "
                               "before TestFlight shows it")
        return code

    def export_archive(self, destination, team, folder):
        """`xcodebuild -exportArchive` to a folder (export) or to App Store Connect (upload)."""
        if not os.path.isdir(self.app_path()):
            self.say(destination, "there is no archive: the archive step didn't finish")
            return 1
        shutil.rmtree(folder, ignore_errors=True)
        os.makedirs(self.out, exist_ok=True)
        options = os.path.join(self.out, f"{destination}-options.plist")
        with open(options, "wb") as f:
            plistlib.dump(export_options(team, destination), f)
        log = f"{destination}.log"
        try:
            with self.key_file() as key:
                code = self.shell.run(
                    ["xcodebuild", "-exportArchive", "-archivePath", self.archive_path(),
                     "-exportPath", folder, "-exportOptionsPlist", options] + key,
                    env=self.ios.xcode_env(), log=self.log(log))
        except ValueError as error:
            self.say(destination, str(error))
            return 1
        if code != 0:
            self.say(destination, "xcodebuild -exportArchive failed")
            self.tail(log)
        return code


STEPS = {"plan": Steps.plan, "toolchain": Steps.toolchain, "xcodegen": Steps.xcodegen,
         "archive": Steps.archive, "check": Steps.check, "export": Steps.export,
         "upload": Steps.upload}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/ios_release_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(HERE))
    return STEPS[argv[1]](Steps(root, ios_steps.Shell(root)))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
