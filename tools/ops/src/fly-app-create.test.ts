// `fly-app-create` against a made-up `flyctl` (test/fake-fly.ts): the Fly app made once, in the one
// organization the token sees, and the dev API host's certificate requested, with what is still to
// do said plainly (docs/plans/api-b0-deploy.md, section 6; ADR-017, ADR-023). `flyctl certs add` and
// `check` exit 0 whether DNS is ready or not, so the script reads their answer.

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, lineOf, type Route } from "../test/fake-fly.ts";
import { flyAppCreate } from "./fly-app-create.ts";
import { flyOf } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };
const HOST = "api-dev.tadayo.app";
const STATUS = "flyctl status -a tadayo-api-dev";
const CERT_CHECK = `flyctl certs check ${HOST} -a tadayo-api-dev --json`;
const CERT_ADD = `flyctl certs add ${HOST} -a tadayo-api-dev --json`;

const WAITING = {
  hostname: HOST,
  configured: false,
  acme_requested: true,
  status: "Awaiting configuration",
  certificates: [],
  dns_requirements: { cname: "tadayo-api-dev.fly.dev" },
};
const ISSUING = {
  hostname: HOST,
  configured: true,
  status: "Awaiting certificates",
  certificates: [{ status: "pending_validation" }],
  dns_requirements: { cname: "tadayo-api-dev.fly.dev" },
};
// Fly has verified the host (`active` is ownership, in the Machines API's words), and its certificate
// is not in the list of issued ones yet.
const VERIFIED = {
  hostname: HOST,
  configured: true,
  status: "Awaiting certificates",
  certificates: [{ source: "fly", status: "active", issued: [] }],
  dns_requirements: { cname: "tadayo-api-dev.fly.dev" },
};
const ISSUED = {
  hostname: HOST,
  configured: true,
  status: "Ready",
  certificates: [
    {
      source: "fly",
      status: "active",
      issued: [{ type: "ecdsa", expires_at: "2027-02-09T00:00:00Z", created_at: "2026-11-11T00:00:00Z" }],
    },
  ],
  dns_requirements: { cname: "tadayo-api-dev.fly.dev" },
};

async function run(routes: readonly Route[], org?: string) {
  const { spawn, calls } = fakeSpawn(routes);
  const said: string[] = [];
  const input = { fly: flyOf(spawn, ENV), say: (line: string) => said.push(line) };
  const outcome = await flyAppCreate(org === undefined ? input : { ...input, org }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, said, outcome };
}

describe("flyAppCreate on a fresh account", () => {
  const fresh: Route[] = [
    [STATUS, { code: 1, stderr: 'Error: Could not find App "tadayo-api-dev"' }],
    ["flyctl orgs list --json", json({ personal: "Personal" })],
    ["flyctl apps create tadayo-api-dev --org personal", {}],
    [CERT_CHECK, { code: 1, stderr: "Error: certificate not found" }],
    [CERT_ADD, json(WAITING)],
  ];

  it("makes the app in the only organization, requests the certificate, and says what DNS needs", async () => {
    const result = await run(fresh);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([
      STATUS,
      "flyctl orgs list --json",
      "flyctl apps create tadayo-api-dev --org personal",
      CERT_CHECK,
      CERT_ADD,
    ]);
    expect(result.said).toEqual([
      "fly-app-create: tadayo-api-dev is made, in the organization personal",
      "fly-app-create: the certificate for api-dev.tadayo.app is requested",
      "fly-app-create: Fly is waiting for DNS for api-dev.tadayo.app",
      "fly-app-create: DNS: in Cloudflare, on tadayo.app, add a CNAME record named api-dev that points to tadayo-api-dev.fly.dev, with the proxy off (a grey cloud)",
      "fly-app-create: run it again once the record is in, to see the certificate's state",
    ]);
  });

  it("calls flyctl with the Fly token and HOME and nothing else, and never says the token", async () => {
    const result = await run(fresh);
    for (const call of result.raw) {
      expect(call.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
    }
    expect(JSON.stringify(result.said)).not.toContain(FAKE_FLY_TOKEN);
  });

  it("uses the organization it is told to, and doesn't ask which there are", async () => {
    const result = await run(
      [
        [STATUS, { code: 1 }],
        ["flyctl apps create tadayo-api-dev --org tadayo", {}],
        [CERT_CHECK, { code: 1 }],
        [CERT_ADD, json(WAITING)],
      ],
      "tadayo",
    );
    expect(result.outcome).toBeUndefined();
    expect(result.calls).not.toContain("flyctl orgs list --json");
    expect(result.said[0]).toBe("fly-app-create: tadayo-api-dev is made, in the organization tadayo");
  });
});

describe("flyAppCreate when it has been run before", () => {
  it("makes nothing again: the app is there and the certificate is issued", async () => {
    const result = await run([
      [STATUS, {}],
      [CERT_CHECK, json(ISSUED)],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([STATUS, CERT_CHECK]);
    expect(result.said).toEqual([
      "fly-app-create: tadayo-api-dev is there",
      "fly-app-create: the certificate for api-dev.tadayo.app is requested already",
      "fly-app-create: the certificate for api-dev.tadayo.app is issued",
    ]);
  });

  it("says where the certificate is: waiting for DNS, or DNS found and the certificate on its way", async () => {
    const waiting = await run([
      [STATUS, {}],
      [CERT_CHECK, json(WAITING)],
    ]);
    expect(waiting.said).toContain("fly-app-create: Fly is waiting for DNS for api-dev.tadayo.app");
    expect(waiting.said.some((line) => line.includes("add a CNAME record named api-dev"))).toBe(true);
    const issuing = await run([
      [STATUS, {}],
      [CERT_CHECK, json(ISSUING)],
    ]);
    expect(issuing.said).toContain(
      "fly-app-create: DNS is in place for api-dev.tadayo.app, and Fly is issuing the certificate",
    );
    expect(issuing.said.some((line) => line.includes("CNAME"))).toBe(false);
  });

  it("says the certificate is on its way, not issued, while Fly has verified the host and no certificate is in its list", async () => {
    // `active` on an entry is ownership; Go prints a list with nothing in it as null.
    for (const answer of [
      VERIFIED,
      { ...VERIFIED, certificates: [{ source: "fly", status: "active", issued: null }] },
      { ...VERIFIED, certificates: [{ source: "fly", status: "active" }] },
      { ...VERIFIED, certificates: [] },
      { ...VERIFIED, certificates: null },
    ]) {
      const result = await run([
        [STATUS, {}],
        [CERT_CHECK, json(answer)],
      ]);
      const label = JSON.stringify(answer.certificates);
      expect(result.said, label).toContain(
        "fly-app-create: DNS is in place for api-dev.tadayo.app, and Fly is issuing the certificate",
      );
      expect(result.said.join("\n"), label).not.toContain("is issued");
    }
  });

  it("says the certificate is issued when the detail is Ready, or when an entry lists an issued certificate, either alone", async () => {
    const ready = { ...VERIFIED, status: "Ready" };
    const listed = { ...ISSUED, status: "Awaiting certificates" };
    for (const [name, answer] of [
      ["Ready, nothing listed", ready],
      ["listed, not Ready", listed],
    ] as const) {
      const result = await run([
        [STATUS, {}],
        [CERT_CHECK, json(answer)],
      ]);
      expect(result.said, name).toContain("fly-app-create: the certificate for api-dev.tadayo.app is issued");
      expect(result.said.join("\n"), name).not.toContain("issuing");
    }
  });

  it("names the CNAME target Fly gives, and the app's own fly.dev name when it gives none or a strange one", async () => {
    const named = await run([
      [STATUS, {}],
      [CERT_CHECK, json({ ...WAITING, dns_requirements: { cname: "tadayo-api-dev.fly.dev" } })],
    ]);
    expect(named.said.some((line) => line.includes("points to tadayo-api-dev.fly.dev,"))).toBe(true);
    for (const dns_requirements of [undefined, { cname: "" }, { cname: "two words.fly.dev" }, { cname: 42 }]) {
      const result = await run([
        [STATUS, {}],
        [CERT_CHECK, json({ ...WAITING, dns_requirements })],
      ]);
      expect(
        result.said.some((line) => line.includes("points to tadayo-api-dev.fly.dev,")),
        JSON.stringify({ dns_requirements }),
      ).toBe(true);
    }
  });

  it("says it couldn't read an answer it doesn't understand, and still says what DNS needs", async () => {
    // Text, JSON that isn't an object, and an object that says neither whether DNS is set nor that it is ready.
    for (const stdout of [
      "not json",
      "[]",
      "null",
      '"a string"',
      "{}",
      '{"configured":"yes"}',
      '{"certificates":"none"}',
    ]) {
      const result = await run([
        [STATUS, {}],
        [CERT_CHECK, { stdout }],
      ]);
      expect(result.outcome, stdout).toBeUndefined();
      expect(result.said, stdout).toContain(
        "fly-app-create: couldn't read flyctl's answer about the certificate for api-dev.tadayo.app",
      );
      expect(
        result.said.some((line) => line.includes("add a CNAME record named api-dev")),
        stdout,
      ).toBe(true);
      expect(result.said.join("\n"), stdout).not.toMatch(/is issued|is issuing|waiting for DNS for/);
    }
  });
});

describe("flyAppCreate refuses", () => {
  it("to guess between organizations, naming them, and makes nothing", async () => {
    const result = await run([
      [STATUS, { code: 1 }],
      ["flyctl orgs list --json", json({ personal: "Personal", acme: "Acme" })],
    ]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe(
      "fly-app-create: the token sees 2 organizations, personal and acme: say which with --org <slug>",
    );
    expect(result.calls.some((call) => call.includes("apps create"))).toBe(false);
  });

  it("an organization name that isn't a slug, before it calls flyctl at all", async () => {
    for (const org of ["", "Two Words", "-flag", "a/b", "x".repeat(70)]) {
      const result = await run([], org);
      expect(result.outcome, org).toBeInstanceOf(OpsError);
      expect(result.calls, org).toEqual([]);
    }
  });

  it("to go on when the app can't be made, with flyctl's words, and requests no certificate", async () => {
    const result = await run([
      [STATUS, { code: 1 }],
      ["flyctl orgs list --json", json({ personal: "Personal" })],
      ["flyctl apps create", { code: 1, stderr: "Error: Name has already been taken" }],
    ]);
    expect((result.outcome as OpsError).message).toBe(
      "fly-app-create: flyctl couldn't make tadayo-api-dev: exit code 1: Error: Name has already been taken",
    );
    expect(result.calls.some((call) => call.includes("certs"))).toBe(false);
  });

  it("to say the certificate is requested when flyctl refused it", async () => {
    const result = await run([
      [STATUS, {}],
      [CERT_CHECK, { code: 1 }],
      [CERT_ADD, { code: 1, stderr: "Error: you don't have access" }],
    ]);
    expect((result.outcome as OpsError).message).toBe(
      "fly-app-create: flyctl couldn't request the certificate for api-dev.tadayo.app: exit code 1: Error: you don't have access",
    );
    expect(result.said).not.toContain("fly-app-create: the certificate for api-dev.tadayo.app is requested");
  });

  it("an organization list it can't read", async () => {
    for (const stdout of ["not json", JSON.stringify([]), JSON.stringify("personal")]) {
      const result = await run([
        [STATUS, { code: 1 }],
        ["flyctl orgs list --json", { stdout }],
      ]);
      expect(result.outcome, stdout).toBeInstanceOf(OpsError);
      expect((result.outcome as OpsError).message, stdout).toBe(
        "fly-app-create: flyctl's list of organizations isn't one it can read",
      );
      expect(
        result.calls.some((call) => call.includes("apps create")),
        stdout,
      ).toBe(false);
    }
  });

  it("a token that sees no organization, saying so, and makes nothing", async () => {
    const result = await run([
      [STATUS, { code: 1 }],
      ["flyctl orgs list --json", json({})],
    ]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe("fly-app-create: the token sees no organization");
    expect(result.calls.some((call) => call.includes("apps create"))).toBe(false);
  });
});
