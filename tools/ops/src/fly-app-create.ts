// `fly-app-create`: makes the Fly app `tadayo-api-dev` when it isn't there, and requests the
// certificate of the dev API host `api-dev.tadayo.app` for it (docs/plans/B0.md, slice 10a; ADR-017,
// ADR-023). It can run again: it looks first, makes only what is missing, and says where the
// certificate is. It makes no Machine and sets no secret (those are the first deploy's and the
// founder's), and it allocates no address: the first deploy gives the app its shared IPv4 and its
// IPv6, which the `fly.dev` name the CNAME points to resolves to.
//
// The Fly token must be an organization's: an app-scoped deploy token can't make an app. `flyctl
// apps create` needs the organization named when it isn't run by hand, so the script takes it from
// `--org`, or, when the token sees exactly one organization, from `flyctl orgs list`; it won't guess
// between several. `flyctl certs add` and `certs check` exit 0 whether DNS is ready or not, so their
// answers are read, and what is still to do is said in words the founder can follow.

import { DEV_APP, DEV_HOST } from "./environment.ts";
import { jsonOf, onlyOrganization, SLUG, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

export interface FlyAppCreateInput {
  readonly fly: Fly;
  /** The organization's slug; without it, the one the token sees. */
  readonly org?: string;
  readonly say: (line: string) => void;
}

const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

type CertificateState = "issued" | "issuing" | "waiting for DNS" | "unknown";

/**
 * Where the certificate is, from what `flyctl certs add|check --json` printed. The Machines API
 * names two signs that it exists: the detail's `status` is `Ready`, or an entry's `issued` list has a
 * certificate in it. An entry's own `status` of `active` says only that Fly has verified the host's
 * ownership, and the certificate comes after that (`Awaiting certificates`), so it isn't one.
 */
function stateOf(answer: unknown): CertificateState {
  const detail = record(answer);
  if (detail === undefined) return "unknown";
  const certificates = Array.isArray(detail["certificates"]) ? (detail["certificates"] as unknown[]) : [];
  // Go prints a list with nothing in it as `null`, so what is read is a list, not "has a length".
  const issued = certificates.some((entry) => {
    const list = record(entry)?.["issued"];
    return Array.isArray(list) && list.length > 0;
  });
  if (issued || detail["status"] === "Ready") return "issued";
  if (detail["configured"] === true) return "issuing";
  if (detail["configured"] === false) return "waiting for DNS";
  return "unknown";
}

/** The name the CNAME points to: Fly's own answer when it is a host name, else the app's `fly.dev` name. */
function cnameTarget(answer: unknown): string {
  const named = record(record(answer)?.["dns_requirements"])?.["cname"];
  return typeof named === "string" && HOST_NAME.test(named) ? named : `${DEV_APP}.fly.dev`;
}

export async function flyAppCreate(input: FlyAppCreateInput): Promise<void> {
  const { fly, say } = input;
  if (input.org !== undefined && !SLUG.test(input.org)) {
    throw new OpsError("fly-app-create: --org takes an organization's slug: lowercase letters, digits and hyphens");
  }

  // `flyctl status` exits 0 for an app that is there, and the app is made only when it isn't.
  const status = await fly.run(["status", "-a", DEV_APP]);
  if (status.code === 0) {
    say(`fly-app-create: ${DEV_APP} is there`);
  } else {
    const org = input.org ?? (await onlyOrganization(fly, "fly-app-create", "say which with --org <slug>"));
    const made = await fly.run(["apps", "create", DEV_APP, "--org", org]);
    if (made.code !== 0) throw new OpsError(`fly-app-create: flyctl couldn't make ${DEV_APP}: ${why(made)}`);
    say(`fly-app-create: ${DEV_APP} is made, in the organization ${org}`);
  }

  // `certs check` fails for a host that isn't added, so a host that answers is there already.
  const check = await fly.run(["certs", "check", DEV_HOST, "-a", DEV_APP, "--json"]);
  let answer: unknown;
  if (check.code === 0) {
    say(`fly-app-create: the certificate for ${DEV_HOST} is requested already`);
    answer = jsonOf(check);
  } else {
    const added = await fly.run(["certs", "add", DEV_HOST, "-a", DEV_APP, "--json"]);
    if (added.code !== 0) {
      throw new OpsError(`fly-app-create: flyctl couldn't request the certificate for ${DEV_HOST}: ${why(added)}`);
    }
    say(`fly-app-create: the certificate for ${DEV_HOST} is requested`);
    answer = jsonOf(added);
  }

  const state = stateOf(answer);
  const dns = `fly-app-create: DNS: in Cloudflare, on tadayo.app, add a CNAME record named ${DEV_HOST.split(".")[0] ?? ""} that points to ${cnameTarget(answer)}, with the proxy off (a grey cloud)`;
  if (state === "issued") {
    say(`fly-app-create: the certificate for ${DEV_HOST} is issued`);
  } else if (state === "issuing") {
    say(`fly-app-create: DNS is in place for ${DEV_HOST}, and Fly is issuing the certificate`);
    say("fly-app-create: run it again in a few minutes, to see the certificate's state");
  } else {
    say(
      state === "unknown"
        ? `fly-app-create: couldn't read flyctl's answer about the certificate for ${DEV_HOST}`
        : `fly-app-create: Fly is waiting for DNS for ${DEV_HOST}`,
    );
    say(dns);
    say("fly-app-create: run it again once the record is in, to see the certificate's state");
  }
}
