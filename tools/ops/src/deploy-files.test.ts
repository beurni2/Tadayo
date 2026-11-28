// The files that make the dev API's image and app, read as files (docs/plans/api-b0-deploy.md,
// sections 1 and 2; TECH-DESIGN sections 3 and 7; ADR-003, ADR-023; T56): the `Dockerfile`, its
// `.dockerignore` and `fly.toml`. No `flyctl` has been run in a cloud session, so what it will read is
// checked against what the repository says elsewhere: the Node and pnpm it pins, the packages the two
// process groups run, the project the app calls, and the host the iOS app is built to call. The
// image itself is built and run as evidence (docs/JOURNAL.md), and `fly.toml` is parsed by Python's
// own TOML reader, so the syntax is a real parser's and not this file's.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SUPABASE_ROOT_CA_PATH } from "@tadayo/domain";
import { describe, expect, it } from "vitest";
import { DEV_APP, DEV_HOST, MACHINE_MAIN } from "./environment.ts";
import { projectUrl } from "./supabase.ts";

/** The file the Dockerfile writes, which both entries read (services/worker/src/privileges.ts, services/api/src/start.ts). */
const IMAGE_MARKER = "/etc/tadayo-built-image";
const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ---- Reading the files.

interface Instruction {
  readonly name: string;
  readonly args: string;
}

function dockerfile(): Instruction[] {
  const instructions: Instruction[] = [];
  let pending = "";
  for (const raw of read("Dockerfile").split("\n")) {
    const line = raw.trim();
    if (pending === "" && (line === "" || line.startsWith("#"))) continue;
    const joined = pending + line;
    if (joined.endsWith("\\")) {
      pending = `${joined.slice(0, -1)} `;
      continue;
    }
    pending = "";
    const [name = "", ...rest] = joined.split(/\s+/);
    instructions.push({ name: name.toUpperCase(), args: rest.join(" ") });
  }
  return instructions;
}

const table = (value: unknown, what: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${what} isn't a table`);
  return value as Record<string, unknown>;
};
const list = (value: unknown, what: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${what} isn't a list`);
  return value as unknown[];
};

function flyToml(): Record<string, unknown> {
  const printed = execFileSync(
    "python3",
    [
      "-I",
      "-c",
      "import json, sys, tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], 'rb'))))",
      join(ROOT, "fly.toml"),
    ],
    { encoding: "utf8" },
  );
  return table(JSON.parse(printed), "fly.toml");
}

/** The workspace's packages: directory to name and workspace dependencies. */
function workspace(): Map<string, { name: string; needs: string[] }> {
  const dirs = [...read("pnpm-workspace.yaml").matchAll(/^ {2}- (\S+)$/gm)].map((match) => match[1] ?? "");
  const packages = new Map<string, { name: string; needs: string[] }>();
  for (const dir of dirs) {
    const manifest = table(JSON.parse(read(`${dir}/package.json`)), `${dir}/package.json`);
    const dependencies = table(manifest["dependencies"] ?? {}, `${dir}'s dependencies`);
    const needs = Object.entries(dependencies)
      .filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
      .map(([name]) => name);
    packages.set(dir, { name: String(manifest["name"]), needs });
  }
  return packages;
}

/** The instructions of each stage, in order, each from its `FROM` to the next one. */
function stages(): Instruction[][] {
  const all = dockerfile();
  const starts = all.flatMap((instruction, index) => (instruction.name === "FROM" ? [index] : []));
  return starts.map((start, position) => all.slice(start, starts[position + 1]));
}

const copies = (stage: "deps" | "runtime") => {
  const [deps = [], runtime = []] = stages();
  const part = stage === "deps" ? deps : runtime;
  return part
    .filter((instruction) => instruction.name === "COPY")
    .map((instruction) => {
      const words = instruction.args.split(/\s+/);
      const from = words[0]?.startsWith("--from=") ? words.shift() : undefined;
      return { from, sources: words.slice(0, -1), destination: words.at(-1) ?? "" };
    });
};

// How each group drops root (fly.toml's [processes]; ADR-038): the API for good, the worker in effect only, keeping
// setuid, setgid and kill to start and end each photo's process as TADAYO_PHOTO_USER and no inheritable capability,
// with no core dump of any kind (a limit of 1 byte), no POSIX message queue and the photo user's processes capped
// first. Node runs with its inspector off in both (PR #118's review, both rounds). The worker's setpriv sets no user or
// group id, and its first module takes `node`'s effective ones (services/worker/src/turn.ts): on Fly's kernel, an exec
// under no new privileges puts an effective id that differs from the real one back to the real one (PR #132's start).
const API_DROP = "setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs";
const WORKER_DROP =
  "prlimit --core=1 --msgqueue=0 --nproc=256 -- setpriv --groups=node --inh-caps=-all --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs";
const NODE = "node --disable-sigusr1";

// ---- The Dockerfile.

describe("Dockerfile", () => {
  it("has one base, pinned by digest, at the Node version .nvmrc names, for both stages", () => {
    const [arg] = dockerfile().filter((instruction) => instruction.name === "ARG");
    expect(arg?.args).toMatch(/^NODE_IMAGE=node:\d+\.\d+\.\d+-[a-z0-9-]+@sha256:[0-9a-f]{64}$/);
    const version = /^NODE_IMAGE=node:(\d+\.\d+\.\d+)-/.exec(arg?.args ?? "")?.[1];
    // A whole version, so `ci`'s Node is the image's and moves only in a commit (the outside audit's B6).
    expect(read(".nvmrc")).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(version).toBe(read(".nvmrc").trim());
    const stages = dockerfile().filter((instruction) => instruction.name === "FROM");
    expect(stages.map((stage) => stage.args.split(/\s+/)[0])).toEqual(["${NODE_IMAGE}", "${NODE_IMAGE}"]);
  });

  it("installs pnpm and its x86-64 Linux binary only from the tarballs the lockfile pins, and runs no other package tool but the frozen install", () => {
    const manifest = table(JSON.parse(read("package.json")), "package.json");
    const pinned = /^pnpm@(\d+\.\d+\.\d+)$/.exec(String(manifest["packageManager"]))?.[1];
    expect(pinned).toBeDefined();
    const version = String(pinned);
    // The lockfile's own record of a package (pnpm itself is `packageManagerDependencies`), its integrity as hexadecimal.
    const lockfile = read("pnpm-lock.yaml");
    const integrity = (name: string): string => {
      const key = name.startsWith("@") ? `'${name}@${version}'` : `${name}@${version}`;
      const escaped = key.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      const locked = new RegExp(`^  ${escaped}:\\n    resolution: \\{integrity: sha512-([A-Za-z0-9+/=]+)\\}`, "m").exec(
        lockfile,
      )?.[1];
      expect(locked, name).toBeDefined();
      const hex = Buffer.from(String(locked), "base64").toString("hex");
      expect(hex, name).toMatch(/^[0-9a-f]{128}$/);
      return hex;
    };
    // pnpm's package is a wrapper whose install script links the binary of its platform in its place: that binary is
    // what runs `pnpm install` below, so it is checked too (PR #154's review, finding 1).
    const wrapper = integrity("pnpm");
    const binary = integrity("@pnpm/exe.linux-x64");
    const wrapperFile = `pnpm-${version}.tgz`;
    const binaryFile = `pnpm-exe.linux-x64-${version}.tgz`;
    // The parser joins words with one space; the file keeps sha512sum's own two-space form.
    expect(read("Dockerfile")).toContain(`"${wrapper}  ${wrapperFile}" \\\n        "${binary}  ${binaryFile}"`);
    const tools = dockerfile().filter(
      (instruction) =>
        instruction.name === "RUN" && /\b(?:npm|npx|corepack|pnpm|pnpx|pnx|pn|yarn)\b/.test(instruction.args),
    );
    expect(tools.map((instruction) => instruction.args)).toEqual([
      `npm pack --silent pnpm@${version} @pnpm/exe.linux-x64@${version} > /dev/null ` +
        `&& printf '%s\\n' "${wrapper} ${wrapperFile}" "${binary} ${binaryFile}" | sha512sum --check --strict --quiet ` +
        `&& npm install --global --offline ./${wrapperFile} ./${binaryFile} ` +
        `&& rm ${wrapperFile} ${binaryFile}`,
      expect.stringMatching(/^pnpm install --frozen-lockfile --prod(?: --filter "@tadayo\/[a-z]+\.\.\.")+$/),
    ]);
  });

  it("installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile", () => {
    const packages = workspace();
    const commands = table(table(flyToml()["processes"], "[processes]"), "[processes]");
    const running = Object.values(commands).map((command) => {
      // Each command drops root first (fly.toml; ADR-038), the worker's after its limits, then runs `node` on a file.
      const file = /^(?:prlimit .*? -- )?setpriv .*? -- node --disable-sigusr1 (\S+)$/.exec(String(command))?.[1] ?? "";
      const dir = [...packages.keys()].find((candidate) => file.startsWith(`${candidate}/`));
      expect(dir, String(command)).toBeDefined();
      return packages.get(dir ?? "")?.name ?? "";
    });
    const install = dockerfile().find(
      (instruction) => instruction.name === "RUN" && instruction.args.includes("pnpm install"),
    );
    expect(install?.args).toContain("--frozen-lockfile");
    expect(install?.args).toContain("--prod");
    const filters = [...(install?.args ?? "").matchAll(/--filter "([^"]+)"/g)].map((match) => match[1]);
    expect([...filters].sort()).toEqual([...running, "@tadayo/ops"].map((name) => `${name}...`).sort());
  });

  it("copies every workspace package's manifest before it installs, and the source of what runs and what it needs, and nothing else", () => {
    const packages = workspace();
    const manifests = copies("deps").flatMap((copy) =>
      copy.sources.filter((source) => source.endsWith("/package.json")),
    );
    expect(manifests.sort()).toEqual([...packages.keys()].map((dir) => `${dir}/package.json`).sort());

    // What runs: the packages the filters name and, transitively, the ones they depend on.
    const wanted = new Set<string>();
    const visit = (name: string) => {
      if (wanted.has(name)) return;
      wanted.add(name);
      const entry = [...packages.values()].find((candidate) => candidate.name === name);
      for (const need of entry?.needs ?? []) visit(need);
    };
    const install = dockerfile().find(
      (instruction) => instruction.name === "RUN" && instruction.args.includes("pnpm install"),
    );
    for (const match of (install?.args ?? "").matchAll(/--filter "([^".]+)\.\.\."/g)) visit(match[1] ?? "");
    const wantedDirs = [...packages.entries()]
      .filter(([, entry]) => wanted.has(entry.name))
      .map(([dir]) => `${dir}/src`);
    const sources = copies("runtime")
      .filter((copy) => copy.from === undefined)
      .flatMap((copy) => copy.sources);
    expect(sources.sort()).toEqual(wantedDirs.sort());
    for (const copy of copies("runtime").filter((candidate) => candidate.from === undefined)) {
      expect(copy.destination, copy.sources.join()).toBe(copy.sources[0]);
    }
  });

  it("puts the ops entry where the runner starts it, and the API's command where a bare run starts it", () => {
    const workdir = dockerfile().filter((instruction) => instruction.name === "WORKDIR");
    expect(workdir.map((instruction) => instruction.args)).toEqual(["/app", "/app"]);
    expect(MACHINE_MAIN).toBe("/app/tools/ops/src/main.ts");
    expect(existsSync(join(ROOT, "tools/ops/src/main.ts"))).toBe(true);
    const api = String(table(flyToml()["processes"], "[processes]")["api"]).split(" ");
    const cmd = dockerfile().find((instruction) => instruction.name === "CMD");
    expect(JSON.parse(cmd?.args ?? "[]")).toEqual(api);
  });

  it("starts, in the stage that is the image, as root only to drop, in production, with the dependencies copied once as pnpm laid them", () => {
    expect(stages()).toHaveLength(2);
    // The second stage is what Fly runs; the first only builds node_modules.
    const image = stages().at(-1) ?? [];
    // No USER: each group's command drops with setpriv as it starts, the API before any Node code runs and the worker
    // all but its effective ids, which its first module takes (fly.toml; ADR-038, its note "As found on Fly").
    expect(image.filter((instruction) => instruction.name === "USER")).toEqual([]);
    const processes = table(flyToml()["processes"], "[processes]");
    expect(String(processes["api"]).startsWith(`${API_DROP} -- ${NODE} `)).toBe(true);
    expect(String(processes["worker"]).startsWith(`${WORKER_DROP} -- ${NODE} `)).toBe(true);
    expect(image.filter((instruction) => instruction.name === "ENV").map((instruction) => instruction.args)).toContain(
      "NODE_ENV=production",
    );
    // pnpm's symlinks are what makes a workspace import resolve: its tree is taken whole, once.
    const fromDeps = image.filter(
      (instruction) => instruction.name === "COPY" && instruction.args.startsWith("--from="),
    );
    expect(fromDeps.map((instruction) => instruction.args)).toEqual(["--from=deps /app/ ./"]);
  });

  it("makes the photo user, tadayo-image, with uid and gid 10001, no home, no shell and no password, nothing else, and names it", () => {
    const image = stages().at(-1) ?? [];
    const runs = image.filter((instruction) => instruction.name === "RUN").map((instruction) => instruction.args);
    expect(runs).toEqual([
      "groupadd --system --gid 10001 tadayo-image && useradd --system --uid 10001 --gid tadayo-image --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin tadayo-image",
      `touch ${IMAGE_MARKER}`,
    ]);
    // useradd leaves the password locked unless one is given; none is.
    expect(runs[0]).not.toMatch(/--password|-p |chpasswd/);
    // And names it, after it is made, so a worker started as root alone refuses for that alone, whatever fly.toml's
    // [env] says or leaves out (the audit's A6), and nothing else sets it.
    // These two alone: no NODE_OPTIONS, nor any other setting Node or glibc reads as it starts, which the worker's Node
    // would honour as root until its first module turns it (services/worker/src/turn.ts; round 1 of PR #135's review).
    const env = image.filter((instruction) => instruction.name === "ENV").map((instruction) => instruction.args);
    expect(env).toEqual(["NODE_ENV=production", "TADAYO_PHOTO_USER=tadayo-image"]);
    const made = image.findIndex((instruction) => instruction.name === "RUN");
    const named = image.findIndex((instruction) => instruction.args === "TADAYO_PHOTO_USER=tadayo-image");
    expect(named).toBeGreaterThan(made);
    expect(Object.keys(table(flyToml()["env"], "[env]"))).not.toContain("TADAYO_PHOTO_USER");
  });

  it("writes the image's marker, the file each entry reads to know it is in the image whatever NODE_ENV says", () => {
    // Round 3 of PR #118's review: NODE_ENV alone is a setting, which a start can clear; a file in the image isn't.
    const image = stages().at(-1) ?? [];
    expect(image.filter((instruction) => instruction.args === `touch ${IMAGE_MARKER}`)).toHaveLength(1);
    for (const entry of ["services/worker/src/privileges.ts", "services/api/src/start.ts"]) {
      expect(read(entry), entry).toContain(`export const IMAGE_MARKER = "${IMAGE_MARKER}";`);
    }
  });

  it("names no secret, key, password or environment file in what it sets or copies", () => {
    const secretLike = /(SECRET|TOKEN|PASSWORD|API_?KEY|SERVICE_?KEY|DATABASE_URL|\.env\b|\.pem\b|\.p8\b|id_rsa)/i;
    for (const instruction of dockerfile().filter((candidate) =>
      ["ENV", "ARG", "COPY", "ADD", "RUN", "LABEL"].includes(candidate.name),
    )) {
      expect(`${instruction.name} ${instruction.args}`).not.toMatch(secretLike);
    }
    expect(dockerfile().some((instruction) => instruction.name === "ADD")).toBe(false);
  });
});

// ---- .dockerignore.

describe(".dockerignore", () => {
  const rules = () =>
    read(".dockerignore")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));

  it("is an allowlist: everything out, then exactly what the Dockerfile copies", () => {
    const [first, ...rest] = rules();
    expect(first).toBe("*");
    const allowed = rest.filter((rule) => rule.startsWith("!")).map((rule) => rule.slice(1));
    const copied = [...copies("deps"), ...copies("runtime")]
      .filter((copy) => copy.from === undefined)
      .flatMap((copy) => copy.sources);
    expect([...new Set(allowed)].sort()).toEqual([...new Set(copied)].sort());
    expect(allowed.length).toBe(new Set(allowed).size);
    // And no exclusion but the last two, so nothing let in above is shut out again after it.
    expect(rules()).toEqual(["*", ...allowed.map((path) => `!${path}`), "**/*.test.ts", "**/node_modules"]);
  });

  it("lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out", () => {
    const allowed = rules()
      .filter((rule) => rule.startsWith("!"))
      .map((rule) => rule.slice(1));
    for (const forbidden of [
      ".git",
      "docs",
      "design",
      "apps/ios",
      "node_modules",
      ".env",
      ".claude",
      ".github",
      "db",
      "tests/src",
    ]) {
      expect(
        allowed.some((path) => path === forbidden || path.startsWith(`${forbidden}/`) || path.includes("*")),
        forbidden,
      ).toBe(false);
    }
    expect(rules().slice(-2)).toEqual(["**/*.test.ts", "**/node_modules"]);
  });

  it("lets Supabase's root in, which every database link the image opens is checked against (packages/domain/src/db/ssl.ts)", () => {
    const root = relative(ROOT, SUPABASE_ROOT_CA_PATH);
    expect(root).toBe("packages/domain/src/db/supabase-root-2021.crt");
    expect(existsSync(SUPABASE_ROOT_CA_PATH)).toBe(true);
    const inside = (folder: string) => root.startsWith(`${folder}/`);
    const copied = copies("runtime")
      .filter((copy) => copy.from === undefined)
      .flatMap((copy) => copy.sources);
    expect(copied.some(inside)).toBe(true);
    const allowed = rules()
      .filter((rule) => rule.startsWith("!"))
      .map((rule) => rule.slice(1));
    expect(allowed.some(inside)).toBe(true);
    // The only exclusions after the allowlist, the last two (the first test pins it), don't match it.
    expect(root.endsWith(".test.ts") || root.split("/").includes("node_modules")).toBe(false);
  });
});

// ---- fly.toml.

/** The names `[env]` may have: public values only, as the probe, the API and the worker read them. */
const ENV_NAMES = [
  "TADAYO_ENVIRONMENT",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "LOG_LEVEL",
  "TADAYO_SAFETY_PROVIDER",
];

describe("fly.toml", () => {
  it("is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command", () => {
    const config = flyToml();
    expect(config["app"]).toBe(DEV_APP);
    expect(config["primary_region"]).toBe("iad");
    expect(table(config["build"], "[build]")["dockerfile"]).toBe("Dockerfile");
    expect(existsSync(join(ROOT, "Dockerfile"))).toBe(true);
    const deploy = table(config["deploy"] ?? {}, "[deploy]");
    expect(deploy["strategy"]).toBe("rolling");
    // Migrations run before the deploy, from the runner (TECH-DESIGN section 7), so a failed one stops it.
    expect(Object.keys(deploy)).toEqual(["strategy"]);
  });

  it("has the two process groups, each dropping root with its setpriv line and running a file that is there, and no other", () => {
    const processes = table(flyToml()["processes"], "[processes]");
    expect(processes).toEqual({
      api: `${API_DROP} -- ${NODE} services/api/src/main.ts`,
      worker: `${WORKER_DROP} -- ${NODE} services/worker/src/main.ts`,
    });
    for (const command of Object.values(processes)) {
      expect(existsSync(join(ROOT, String(command).split(" ").at(-1) ?? "")), String(command)).toBe(true);
    }
  });

  it("changes no id at the exec of either group's Node, so no kernel puts one back under no new privileges", () => {
    // PR #132's start on `dev`: Fly's kernel took the worker's `setpriv --euid=node --egid=node --no-new-privs`, whose
    // effective ids differed from its real ones, for a set-id exec, and put them back to root's. The API's setpriv sets
    // its real, effective and saved ids together; the worker's sets none (its first module takes them, turn.ts).
    const processes = table(flyToml()["processes"], "[processes]");
    const flags = (group: string) => {
      const words = String(processes[group]).split(" ");
      return words.slice(words.indexOf("setpriv") + 1, words.indexOf("--", words.indexOf("setpriv")));
    };
    const ids = /^--(e|r|re)?(uid|gid)=/;
    expect(flags("api").filter((flag) => ids.test(flag))).toEqual(["--reuid=node", "--regid=node"]);
    expect(flags("worker").filter((flag) => ids.test(flag))).toEqual([]);
    expect(flags("worker")).toContain("--no-new-privs");
    expect(flags("worker")).toContain("--groups=node");
  });

  it("scopes every section that binds to a group to its group: flyctl refuses an unscoped service, and the others go to one group only", () => {
    const config = flyToml();
    for (const section of ["services", "restart", "checks", "http_service", "mounts", "files", "metrics"]) {
      const value = config[section];
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        const processes = table(item, section)["processes"];
        expect(Array.isArray(processes) && processes.length > 0, `[${section}] has processes`).toBe(true);
      }
    }
    // The service is the API's alone: the worker has none, so Fly's proxy never starts or stops it.
    const services = list(config["services"], "[[services]]");
    expect(services).toHaveLength(1);
    expect(table(services[0], "[[services]]")["processes"]).toEqual(["api"]);
    expect(config["http_service"]).toBeUndefined();
  });

  it("serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and asks the health route, not the port", () => {
    const service = table(list(flyToml()["services"], "[[services]]")[0], "[[services]]");
    const port = /if \(value === undefined\) return (\d+);/.exec(read("services/api/src/start.ts"))?.[1];
    expect(service["internal_port"]).toBe(Number(port));
    expect(service["protocol"]).toBe("tcp");
    expect(service["auto_stop_machines"]).toBe("off");
    const ports = list(service["ports"], "[[services.ports]]").map((entry) => table(entry, "[[services.ports]]"));
    expect(ports).toEqual([
      { port: 80, handlers: ["http"], force_https: true },
      { port: 443, handlers: ["tls", "http"] },
    ]);
    // The check asks the contract's getHealth, which makes one round trip through the API's own pool: an open
    // port said nothing of a pool whose every connection was held, the stall the outside audit's A7 proved. It
    // goes to the Machine's internal port in plain HTTP, the fields flyctl's own source reads (docs/LIMITATIONS.md).
    expect(service["tcp_checks"]).toBeUndefined();
    const checks = list(service["http_checks"], "[[services.http_checks]]").map((entry) => table(entry, "http check"));
    expect(checks).toEqual([
      { grace_period: "20s", interval: "15s", timeout: "3s", method: "GET", path: "/v1/health", protocol: "http" },
    ]);
    // The path is the contract's public GET of that name, which the privacy matrix has a row for (T58).
    expect(read("packages/contracts/openapi.yaml")).toMatch(
      /^ {2}\/v1\/health:\n {4}get:\n {6}operationId: getHealth\n(?: {6}(?:summary|description): .*\n)*? {6}security: \[\]\n/m,
    );
    // The API answers the check itself before Fly's timeout speaks for it (services/api/src/health.ts).
    const bound = /export const HEALTH_MS = ([\d_]+);/.exec(read("services/api/src/health.ts"))?.[1];
    expect(Number(bound?.replaceAll("_", ""))).toBeLessThan(3_000);
  });

  it("stops each group with SIGTERM and time to finish, and restarts one only when it failed", () => {
    const config = flyToml();
    expect(config["kill_signal"]).toBe("SIGTERM");
    expect(Number(config["kill_timeout"])).toBeGreaterThanOrEqual(10);
    expect(Number(config["kill_timeout"])).toBeLessThanOrEqual(300);
    // `on-failure`: a clean exit (what a stop by `worker-scale` is) is not restarted.
    const restarts = list(config["restart"], "[[restart]]").map((entry) => table(entry, "[[restart]]"));
    expect(restarts).toHaveLength(1);
    expect(restarts[0]?.["policy"]).toBe("on-failure");
    expect(restarts[0]?.["processes"]).toEqual(["api", "worker"]);
  });

  it("gives every group the same small Machine, and says so once", () => {
    const vms = list(flyToml()["vm"], "[[vm]]").map((entry) => table(entry, "[[vm]]"));
    expect(vms).toEqual([{ size: "shared-cpu-1x", memory: "512mb" }]);
  });

  it("has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them", () => {
    const env = table(flyToml()["env"], "[env]");
    // These names alone: no NODE_OPTIONS, nor any other setting Node or glibc reads as it starts, which the worker's
    // Node would honour as root until its first module turns it (services/worker/src/turn.ts; PR #135's review).
    expect(Object.keys(env).sort()).toEqual([...ENV_NAMES].sort());
    expect(env["TADAYO_ENVIRONMENT"]).toBe("dev");
    expect(env["LOG_LEVEL"]).toBe("info");
    // The photo safety provider, FQ8's `none` for the closed trial, which the worker refuses to start without
    // (services/worker/src/safety.ts; the outside audit's B7).
    expect(env["TADAYO_SAFETY_PROVIDER"]).toBe("none");
    // Named by each environment's configuration alone: the image names none, so `prod`'s must name its own.
    expect(read("Dockerfile")).not.toContain("TADAYO_SAFETY_PROVIDER");
    // The same project the app signs in to (apps/ios/project.yml, Dev), by the verifier's own rule for its URL.
    const dev = /^ {4}Dev:\n(?: {6}.*\n)+/m.exec(read("apps/ios/project.yml"))?.[0] ?? "";
    expect(projectUrl(String(env["SUPABASE_URL"]))).toBe(String(env["SUPABASE_URL"]));
    expect(dev).toContain(`TADAYO_SUPABASE_URL: ${String(env["SUPABASE_URL"])}\n`);
    expect(dev).toContain(`TADAYO_SUPABASE_PUBLISHABLE_KEY: ${String(env["SUPABASE_PUBLISHABLE_KEY"])}\n`);
    expect(String(env["SUPABASE_PUBLISHABLE_KEY"])).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/);
    // And the host the app calls is the one the founder points at this app (ADR-023).
    expect(dev).toContain(`TADAYO_API_BASE_URL: https://${DEV_HOST}\n`);
    expect(dev).toContain("TADAYO_ENVIRONMENT: dev\n");
  });

  it("names no secret anywhere: the database's string and the service key are Fly's, set by the founder", () => {
    // Its comments say what Fly keeps, by name; what is set is what counts.
    const text = read("fly.toml")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    for (const name of [
      "DATABASE_URL",
      "DATABASE_ADMIN_URL",
      "SUPABASE_SERVICE_KEY",
      "SUPABASE_ACCESS_TOKEN",
      "FLY_API_TOKEN",
      "sb_secret_",
      "eyJ",
    ]) {
      expect(text.includes(name), name).toBe(false);
    }
  });
});
