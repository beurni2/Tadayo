#!/usr/bin/env python3
"""The steps of the `ios-release` workflow (docs/TECH-DESIGN.md sections 2 and 9; the B0 plan's
slice 12): the archive, the checks of what it holds, and the upload to TestFlight.

  python3 -I tools/ci/ios_release_steps.py <step>

.github/workflows/ios-release.yml stays thin: each of its steps calls one step here. The run is
started by hand, on a chosen branch, with two inputs that reach the steps as environment
variables, never as text in a command:

  RELEASE_ENVIRONMENT  dev (the Dev configuration: a release build that points at dev, with the
                       Lab and its fixture photographs) or prod (the Release configuration).
  RELEASE_UPLOAD       true: sign the archive for App Store Connect and upload it. false: a dry
                       run, which archives and checks and touches nothing at Apple.

A prod archive is built and checked, and never uploaded: prod's first upload waits for the
founder's ask and a change to this file in its own PR (CLAUDE.md, "Git": anything in prod).

Two jobs, on two runners, so that the App Store Connect API key never shares a machine with the
build. The build runs the packages' build plugins and whatever a dependency's manifest does
(ADR-028), so its job holds no secret, and nothing it leaves on its runner (a changed file, a
program on the path) is there when the key arrives. The second job starts from a fresh checkout,
takes only the archive, as data, and runs only on a dev upload.

  build job  what it does
  plan       Reads the inputs and the team, says what the run will do, and fails before any
             build when something is missing or misshapen.
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
             string; both carry the app group in their entitlements, and no entitlement the
             project doesn't declare, but for the app's one associated domain, which the app
             alone may hold, as exactly applinks:tadayo.app (ASSOCIATED_DOMAINS); the archive
             names this app as its own and carries no other app, extension or service bundle
             (.app, .appex, .xpc) than the share extension, though its frameworks and
             executables are not read; and the fixture photographs are all there in a dev
             archive and none of them in a prod one (T46; TECH-DESIGN section 4, "The Lab").
  pack       Puts the archive in one tar file for the workflow to hand to the sign job. Only
             folders and plain files go in: a link, or anything else, fails the step, so a dry
             run shows it too.

  sign job   (a dev upload only)
  toolchain  As above, on the new runner.
  unpack     Reads the tar the build job made, which is data from a job that ran other people's
             code: the downloaded folder must hold that one plain file, every member must be a
             folder or a plain file inside Tadayo.xcarchive, and it is unpacked into a folder
             the download never touched.
  check      As above, again, on the unpacked archive, so the archive that is signed is the
             one this job read.
  export     `xcodebuild -exportArchive` to a folder, signed by Xcode's automatic signing with
             the App Store Connect API key (a distribution certificate Apple holds, and
             Xcode-managed profiles). Then reads the exported app's entitlements: the team's
             application identifier, the app group, no get-task-allow, and no entitlement the
             project doesn't declare beyond what signing adds, the app's associated domain
             allowed as in check. What is uploaded next is signed the same way from the same
             archive.
  upload     `xcodebuild -exportArchive` with `destination: upload`.

The build number is `<run number>.<run attempt>`, so no two runs, and no two attempts of one,
upload the same number. An older run re-run after a newer one uploads a lower number, which App
Store Connect may refuse: start a new run instead. Re-running the sign job alone gives it a
later attempt than the archive's, and it finds no archive of its own attempt: re-run all jobs.

The key. Only export and upload are given it. Before any command runs, the three values are
taken out of the process's environment (take_environment), so no child process inherits them:
xcodebuild gets the key as a file and the two ids as arguments. The file exists only for the
length of one xcodebuild command, in a folder of the runner's temporary directory that only its
owner can read, and the step fails if it is still there afterwards. No step prints the key, and
nothing that holds it is uploaded as an artifact. The ids, and anything shaped like a token made
from the key, are replaced in what the steps say and in every line of a logged command, which
export and upload's are (redact), whatever their case: GitHub's own masking matches a secret's
exact text only. A logged command's output is printed quoted (quoted), so no line of it is read
by the runner as a workflow command. Taking the values out of the environment stops a child
inheriting them; the protection against hostile code is that the sign job runs none.

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
import subprocess
import sys
import tarfile
import xml.parsers.expat
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)  # after the standard library, never before it
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
# What export and upload are given, and no child process may inherit.
KEY_NAMES = ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8")
# A token signed with the key, as App Store Connect's API takes one.
TOKEN = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
HIDDEN = "***"
# What a bundle of this project may hold in its entitlements: the app group it declares
# (apps/ios/project.yml), and what signing itself adds. Anything else is a capability the
# project never asked for, which automatic signing could go on to turn on at Apple.
ARCHIVED_ENTITLEMENTS = {"com.apple.security.application-groups", "application-identifier",
                         "com.apple.developer.team-identifier", "get-task-allow"}
EXPORTED_ENTITLEMENTS = ARCHIVED_ENTITLEMENTS | {"beta-reports-active", "keychain-access-groups"}
# The app's one associated domain, for invitation links (spike S6; B1's invitations), as the site's
# apple-app-site-association names the app (apps/web/public/.well-known/). The app alone may hold
# it, and only with exactly this value: the share extension opens no links.
ASSOCIATED_DOMAINS_KEY = "com.apple.developer.associated-domains"
ASSOCIATED_DOMAINS = ["applinks:tadayo.app"]
# Folders and suffixes of code an app can carry besides itself. The share extension is the one.
NESTED_SUFFIXES = (".app", ".appex", ".xpc")
ARCHIVED_APP = "Applications/" + ios_steps.APP_PRODUCT
ARCHIVE_NAME = "Tadayo.xcarchive"
PACKED_NAME = "Tadayo.xcarchive.tar"
UNREADABLE = (OSError, ValueError, KeyError, plistlib.InvalidFileException,
              xml.parsers.expat.ExpatError, zipfile.BadZipFile, tarfile.TarError)
# Python's own check of a tar member, where this Python has it (3.12, and later 3.9s).
DATA_ONLY = {"filter": "data"} if hasattr(tarfile, "data_filter") else {}
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


def table(value):
    """`value` when it is a dictionary, else an empty one: a plist's shape is never assumed."""
    return value if isinstance(value, dict) else {}


def primary_icon(info):
    return table(table(info.get("CFBundleIcons")).get("CFBundlePrimaryIcon"))


def icon_name(info):
    """The app icon's name, where asset compilation writes it for an iPhone app
    (CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName, which
    apps/ios/TadayoTests/AppIconTests.swift reads in the built app), or at the top level."""
    return primary_icon(info).get("CFBundleIconName", info.get("CFBundleIconName"))


def icon_files(info):
    """The app icon's file names, as its Info.plist lists them (without @2x and .png)."""
    files = primary_icon(info).get("CFBundleIconFiles")
    return [f for f in files if isinstance(f, str)] if isinstance(files, list) else []


def entitlement_problems(entitlements, team=None, bundle_id=None, app=False):
    """What's wrong with a bundle's entitlements. With a team, the bundle is signed for App Store
    Connect, and its team, its application identifier (`<team>.<bundle id>`) and get-task-allow
    are checked too. The app (`app`) may also hold its associated domain, and only that one."""
    problems = []
    allowed = ARCHIVED_ENTITLEMENTS if team is None else EXPORTED_ENTITLEMENTS
    if app:
        allowed = allowed | {ASSOCIATED_DOMAINS_KEY}
    extra = sorted(str(key) for key in entitlements if key not in allowed)
    if extra:
        problems.append("it holds entitlements the project doesn't declare: " + ", ".join(extra))
    if app and ASSOCIATED_DOMAINS_KEY in entitlements:
        if entitlements.get(ASSOCIATED_DOMAINS_KEY) != ASSOCIATED_DOMAINS:
            problems.append(f"its associated domains are "
                            f"{entitlements.get(ASSOCIATED_DOMAINS_KEY)!r}, not "
                            f"{ASSOCIATED_DOMAINS!r}")
    if entitlements.get("com.apple.security.application-groups") != [APP_GROUP]:
        problems.append("its app groups are "
                        f"{entitlements.get('com.apple.security.application-groups')!r}, "
                        f"not [{APP_GROUP!r}]")
    if team is not None:
        if entitlements.get("com.apple.developer.team-identifier") != team:
            problems.append("its team isn't the run's")
        if entitlements.get("application-identifier") != f"{team}.{bundle_id}":
            problems.append(f"its application identifier isn't the run's team and {bundle_id}")
        if entitlements.get("get-task-allow"):
            problems.append("it allows a debugger (get-task-allow)")
    return problems


def nested_code(app):
    """The apps, extensions and services inside an app, as paths from it, sorted."""
    found = []
    for folder, names, _ in os.walk(app):
        for name in names:
            if name.lower().endswith(NESTED_SUFFIXES):
                found.append(os.path.relpath(os.path.join(folder, name), app))
    return sorted(found)


def nested_problems(app):
    """What's wrong with the code an app carries: the share extension, and nothing else."""
    expected = [os.path.join("PlugIns", ios_steps.SHARE_EXTENSION)]
    found = nested_code(app)
    if found != expected:
        return [f"the app carries {found!r}, not the share extension alone"]
    return []


def export_options(team, destination):
    return {"method": "app-store-connect", "destination": destination, "teamID": team,
            "signingStyle": "automatic", "manageAppVersionAndBuildNumber": False,
            "uploadSymbols": True}


def take_environment(environ):
    """A copy of the environment for the steps to read, with the key's three values removed
    from `environ` itself, so that nothing this process starts inherits them."""
    taken = dict(environ)
    for name in KEY_NAMES:
        environ.pop(name, None)
    return taken


def unsafe_member(member):
    """Why a tar member may not be unpacked, or None: only folders and plain files, each inside
    the archive's own folder."""
    parts = member.name.split("/")
    if member.name.startswith("/") or ".." in parts or parts[0] != ARCHIVE_NAME:
        return f"{member.name!r} is outside {ARCHIVE_NAME}"
    if not (member.isdir() or member.isreg()):
        return f"{member.name!r} is neither a folder nor a plain file"
    return None


def quoted(line):
    """A line of a command's output, or of a file, as it is printed: after a bar, since the
    runner reads a workflow command (`::name::`) only at a line's start, and with the older
    form (`##[name]`), which it finds anywhere in a line, broken."""
    return "| " + line.rstrip("\n").replace("##[", "## [")


class Shell(ios_steps.Shell):
    """ios_steps.py's shell, with the command line, and every line of a logged command's output,
    passed through `redact`, and each of those lines printed as `quoted` gives it, so that none
    can be read by the runner as a workflow command."""

    redact = staticmethod(lambda text: text)

    def run(self, cmd, env=None, log=None, cwd=None):
        shown_cmd = self.redact("+ " + " ".join(cmd))
        print(shown_cmd, flush=True)
        try:
            if log is None:
                return subprocess.run(cmd, cwd=cwd or self.root, env=self._env(env)).returncode
            os.makedirs(os.path.dirname(log), exist_ok=True)
            with open(log, "a", encoding="utf-8") as f:
                f.write(shown_cmd + "\n")
                f.flush()
                shown = ios_steps.LogFilter()
                with subprocess.Popen(cmd, cwd=cwd or self.root, env=self._env(env),
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                      text=True, errors="replace") as process:
                    for line in process.stdout:
                        line = self.redact(line)
                        f.write(line)
                        f.flush()  # a step killed by its timeout still leaves its log
                        if shown.show(line):
                            print(quoted(line), flush=True)
                return process.wait()
        except FileNotFoundError:
            print(f"ios-release: {cmd[0]} isn't installed", flush=True)
            return 127


class Steps:
    def __init__(self, root, shell, environ=None):
        self.root = root
        self.shell = shell
        self.environ = os.environ if environ is None else environ
        temp = self.environ.get("RUNNER_TEMP") or "/tmp"
        self.out = os.path.join(temp, "ios-release-out")
        self.incoming = os.path.join(temp, "ios-release-in")
        self.key_dir = os.path.join(temp, "ios-release-key")
        self.ios = ios_steps.Steps(root, shell, environ=self.environ, out=self.out)
        shell.redact = self.redact

    # Helpers

    def say(self, step, text):
        # One line, whatever a tool's own message held, so none of it starts a line.
        text = " ".join(self.redact(text).splitlines())
        print(f"ios-release: {step}: " + text.replace("##[", "## ["))

    def redact(self, text):
        """`text` without the key's ids, in any case, or anything shaped like a token."""
        for name, shape in (("ASC_KEY_ID", KEY_ID), ("ASC_ISSUER_ID", ISSUER_ID)):
            value = self.environ.get(name, "")
            if shape.fullmatch(value):
                text = re.sub(re.escape(value), HIDDEN, text, flags=re.IGNORECASE)
        return TOKEN.sub(HIDDEN, text)

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
        """The key as a file for one command: its arguments for xcodebuild. Removed after; if
        it can't be, RuntimeError, which fails the step."""
        if not self.environ.get("RUNNER_TEMP"):
            raise ValueError("RUNNER_TEMP isn't set, and the key is never written to a shared "
                             "temporary folder")
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
            if os.path.lexists(self.key_dir):
                raise RuntimeError("the key's folder couldn't be removed")

    def archive_path(self):
        return os.path.join(self.out, ARCHIVE_NAME)

    def packed_path(self):
        return os.path.join(self.out, PACKED_NAME)

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
        for line in lines[-LOG_TAIL:]:
            print(quoted(self.redact(line)))

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
            if code != 0:
                self.tail("archive.log")
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
        except UNREADABLE as error:
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
        # The app the export will take is the one the archive names, and the one read here.
        named = table(self.read_plist(os.path.join(self.archive_path(), "Info.plist"))
                      .get("ApplicationProperties")).get("ApplicationPath")
        problems = []
        if named != ARCHIVED_APP:
            problems.append(f"the archive names {named!r} as its app, not {ARCHIVED_APP}")
        apps = sorted(os.listdir(os.path.dirname(app)))
        if apps != [ios_steps.APP_PRODUCT]:
            problems.append(f"the archive's Applications holds {apps!r}, not the app alone")
        problems += nested_problems(app)
        problems += [f"the app: {p}" for p in bundle_problems(info, APP_ID, build, environment)]
        problems += [f"the share extension: {p}"
                     for p in bundle_problems(share_info, SHARE_ID, build)]
        # The icon (ITMS-90022, ITMS-90713).
        if icon_name(info) != ICON_NAME:
            problems.append(f"the app's CFBundleIconName is {icon_name(info)!r}, "
                            f"not {ICON_NAME}")
        sizes = {}
        for name in icon_files(info):
            if "/" in name:  # a file of the app itself, never a path out of it
                continue
            path = os.path.join(app, f"{name}@2x.png")
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    sizes[name] = png_size(f.read(4096))
        if (ICON_PIXELS, ICON_PIXELS) not in sizes.values():
            problems.append(f"the app holds no {ICON_PIXELS}-pixel iPhone icon file among the "
                            f"ones its Info.plist names ({sizes or 'none'})")
        # The share extension's activation rule.
        attributes = table(table(share_info.get("NSExtension")).get("NSExtensionAttributes"))
        if attributes.get("NSExtensionActivationRule") != ACTIVATION_RULE:
            problems.append("the share extension's activation rule is "
                            f"{attributes.get('NSExtensionActivationRule')!r}, not the dictionary "
                            f"{ios_steps.PROJECT_SPEC} declares")
        # The entitlements the export will sign with.
        for label, bundle, is_app in (("the app", app, True),
                                      ("the share extension", share, False)):
            problems += [f"{label}: {p}" for p in
                         entitlement_problems(self.entitlements(bundle), app=is_app)]
        # The fixture photographs.
        code, listing, err = self.shell.capture(
            ["xcrun", "assetutil", "--info", os.path.join(app, "Assets.car")],
            env=self.ios.xcode_env())
        if code != 0:
            raise ValueError(f"assetutil can't list the app's catalog: {err.strip()[:200]}")
        files = [name for _, _, names in os.walk(app) for name in names]
        problems += fixture_problems(environment, asset_names(listing), files, self.fixtures())
        return problems

    def pack(self):
        if not os.path.isdir(self.app_path()):
            self.say("pack", "there is no archive: the archive step didn't finish")
            return 1
        strays = []
        for folder, names, files in os.walk(self.archive_path()):
            for name in names + files:
                path = os.path.join(folder, name)
                if os.path.islink(path) or not (os.path.isdir(path) or os.path.isfile(path)):
                    strays.append(os.path.relpath(path, self.archive_path()))
        if strays:
            self.say("pack", "the archive holds what isn't a folder or a plain file, which the "
                             "sign job refuses: " + ", ".join(sorted(strays)[:10]))
            return 1
        with tarfile.open(self.packed_path(), "w") as packed:
            packed.add(self.archive_path(), arcname=ARCHIVE_NAME)
        self.say("pack", f"{PACKED_NAME}, {os.path.getsize(self.packed_path())} bytes")
        return 0

    def unpack(self):
        try:
            # The folder the workflow downloaded into holds the one tar, a plain file, and
            # nothing else; it is unpacked into a folder the artifact never touched.
            held = sorted(os.listdir(self.incoming))
            packed_path = os.path.join(self.incoming, PACKED_NAME)
            if held != [PACKED_NAME] or os.path.islink(self.incoming) \
                    or os.path.islink(packed_path) or not os.path.isfile(packed_path):
                self.say("unpack", f"refused: the build job's artifact holds {held!r}, not the "
                                   f"one file {PACKED_NAME}")
                return 1
            shutil.rmtree(self.archive_path(), ignore_errors=True)
            if os.path.lexists(self.archive_path()) or os.path.islink(self.out):
                self.say("unpack", "refused: something is already where the archive goes")
                return 1
            os.makedirs(self.out, exist_ok=True)
            with tarfile.open(packed_path, "r:") as packed:
                members = packed.getmembers()
                problems = [p for p in map(unsafe_member, members) if p]
                if problems:
                    self.say("unpack", "refused: " + "; ".join(problems[:10]))
                    return 1
                for member in members:
                    # Its own mode alone: no owner, no set-id bits.
                    member.mode &= 0o755
                    member.uid = member.gid = 0
                    member.uname = member.gname = ""
                    packed.extract(member, self.out, numeric_owner=True, **DATA_ONLY)
        except UNREADABLE as error:
            self.say("unpack", f"the build job's archive can't be read: {error}")
            return 1
        if not os.path.isdir(self.app_path()):
            self.say("unpack", f"the archive holds no {ios_steps.APP_PRODUCT}")
            return 1
        self.say("unpack", f"{ARCHIVE_NAME}, {len(members)} entries")
        return 0

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
        except UNREADABLE as error:
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
        problems = nested_problems(app)
        for label, bundle, bundle_id, is_app in (("the app", app, APP_ID, True),
                                                 ("the share extension", share, SHARE_ID, False)):
            if not os.path.isfile(os.path.join(bundle, "embedded.mobileprovision")):
                problems.append(f"{label}: it holds no provisioning profile")
            problems += [f"{label}: {p}" for p in
                         entitlement_problems(self.entitlements(bundle), team, bundle_id,
                                              app=is_app)]
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
        options = os.path.join(self.out, f"{destination}-options.plist")
        log = f"{destination}.log"
        try:
            os.makedirs(self.out, exist_ok=True)
            with open(options, "wb") as f:
                plistlib.dump(export_options(team, destination), f)
            with self.key_file() as key:
                code = self.shell.run(
                    ["xcodebuild", "-exportArchive", "-archivePath", self.archive_path(),
                     "-exportPath", folder, "-exportOptionsPlist", options] + key,
                    env=self.ios.xcode_env(), log=self.log(log))
        except (OSError, ValueError, RuntimeError) as error:
            self.say(destination, str(error))
            return 1
        if code != 0:
            self.say(destination, "xcodebuild -exportArchive failed")
            self.tail(log)
        return code


STEPS = {"plan": Steps.plan, "toolchain": Steps.toolchain, "xcodegen": Steps.xcodegen,
         "archive": Steps.archive, "check": Steps.check, "pack": Steps.pack,
         "unpack": Steps.unpack, "export": Steps.export, "upload": Steps.upload}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 -I tools/ci/ios_release_steps.py <step>\nsteps: "
              + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(HERE))
    steps = Steps(root, Shell(root), environ=take_environment(os.environ))
    try:
        return STEPS[argv[1]](steps)
    except Exception as error:  # whatever a step didn't foresee fails it, in one plain line
        steps.say(argv[1], f"failed on {type(error).__name__}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
