// `supabase-probe`'s API layer against a made-up Supabase project (test/fake-supabase.ts) that is
// closed as a hosted one with no policies and the Data API off is, and that leaks one surface at a
// time (T12, T53). The probe has to pass the closed project and name each surface that leaks, with
// the service key working in both, so that a refusal means the surface is closed and not that the
// probe's own request was wrong. The database layer, with Postgres and Supabase's roles, is
// tests/src/db/ops-probe.test.ts.

import { describe, expect, it } from "vitest";
import {
  FAKE_PUBLISHABLE,
  FAKE_SECRET,
  FAKE_URL,
  fakeSupabase,
  type Fake,
  type FakeOptions,
  type Leak,
} from "../test/fake-supabase.ts";
import { ALLOWED_TYPES, FILE_SIZE_LIMIT } from "./storage-setup.ts";
import { apiChecks, dataApiChecks, reportLine, type Check } from "./supabase-probe.ts";

const TABLES = ["users", "clubs", "drops"];

function project(options: FakeOptions = {}): Fake {
  const fake = fakeSupabase({
    buckets: ["uploads", "renditions"].map((name) => ({
      name,
      file_size_limit: FILE_SIZE_LIMIT,
      allowed_mime_types: [...ALLOWED_TYPES],
    })),
    ...options,
  });
  return fake;
}

async function probe(fake: Fake, fetcher: typeof fetch = fake.fetch): Promise<Check[]> {
  let n = 0;
  return apiChecks({
    fetch: fetcher,
    url: FAKE_URL,
    publishableKey: FAKE_PUBLISHABLE,
    serviceKey: FAKE_SECRET,
    tables: TABLES,
    id: () => `id${String((n += 1))}`,
  });
}

const failed = (checks: readonly Check[]) => checks.filter((check) => !check.ok).map((check) => check.name);

describe("apiChecks on a closed project", () => {
  it("passes every check, controls and refusals, and leaves no object, no bucket and no user behind", async () => {
    const fake = project();
    const checks = await probe(fake);
    expect(failed(checks)).toEqual([]);
    // Every door is asked for each caller: nothing is dropped without this saying so.
    const count = (prefix: string) => checks.filter((check) => check.name.startsWith(prefix)).length;
    expect(count("control: ")).toBe(12);
    // Per caller: 3 tables and the root of REST, GraphQL, the buckets' list and create, and 8 for each bucket.
    expect(count("anon: ")).toBe(4 + 1 + 2 + 8 * 2);
    expect(count("user: ")).toBe(4 + 1 + 2 + 8 * 2);
    // Two probe objects and the probe user; nothing else was written, so nothing else is deleted.
    expect(count("cleanup: ")).toBe(3);
    expect(fake.objects.size).toBe(0);
    expect(fake.users.size).toBe(0);
    expect([...fake.buckets.keys()].sort()).toEqual(["renditions", "uploads"]);
  });

  it("proves it could have seen what it was refused: the service key signs, uploads, reads, lists and signs first", async () => {
    const fake = project();
    const checks = await probe(fake);
    const controls = checks.filter((check) => check.name.startsWith("control: ")).map((check) => check.name);
    expect(controls).toEqual([
      "control: the service key makes a user",
      "control: the user signs in without an email",
      ...["uploads", "renditions"].flatMap((bucket) => [
        `control: the service key signs an upload URL for ${bucket}`,
        `control: the signed URL puts the object in ${bucket}`,
        `control: the service key reads the object back from ${bucket}`,
        `control: the service key lists the object in ${bucket}`,
        `control: the service key signs a read URL for ${bucket} in a batch`,
      ]),
    ]);
    // The controls come before every refusal, in the calls the project saw.
    const firstRefusal = fake.calls.findIndex((call) => call.who === "anon" && call.path !== "/auth/v1/verify");
    const lastControl = fake.calls.findLastIndex(
      (call) => call.path.startsWith("/storage/v1/object/authenticated") && call.who === "service",
    );
    expect(lastControl).toBeLessThan(firstRefusal);
  });

  it("asks every door for each caller: REST for every table, GraphQL, and Storage's buckets and objects", async () => {
    const fake = project();
    await probe(fake);
    const asked = (who: string, test: (path: string, method: string) => boolean) =>
      fake.calls.filter((call) => call.who === who && test(call.path, call.method)).length;
    for (const who of ["anon", "user"]) {
      expect(
        asked(who, (path) => path === "/rest/v1/users"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path) => path === "/rest/v1/clubs"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path) => path === "/rest/v1/drops"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path) => path === "/rest/v1/"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path) => path === "/graphql/v1"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path, method) => path === "/storage/v1/bucket" && method === "GET"),
        who,
      ).toBe(1);
      expect(
        asked(who, (path, method) => path === "/storage/v1/bucket" && method === "POST"),
        who,
      ).toBe(1);
      for (const bucket of ["uploads", "renditions"]) {
        expect(
          asked(who, (path) => path === `/storage/v1/object/list/${bucket}`),
          `${who} list ${bucket}`,
        ).toBe(1);
        expect(
          asked(who, (path) => path.startsWith(`/storage/v1/object/authenticated/${bucket}/`)),
          `${who} download ${bucket}`,
        ).toBe(1);
        expect(
          asked(who, (path) => path.startsWith(`/storage/v1/object/public/${bucket}/`)),
          `${who} public ${bucket}`,
        ).toBe(1);
        expect(
          asked(who, (path) => path.startsWith(`/storage/v1/object/sign/${bucket}`)),
          `${who} sign ${bucket}`,
        ).toBe(2);
        expect(
          asked(who, (path, method) => path.startsWith(`/storage/v1/object/${bucket}/`) && method === "PUT"),
          `${who} overwrite ${bucket}`,
        ).toBe(1);
        expect(
          asked(who, (path, method) => path.startsWith(`/storage/v1/object/${bucket}/`) && method === "POST"),
          `${who} new ${bucket}`,
        ).toBe(1);
        expect(
          asked(who, (path) => path.startsWith(`/storage/v1/object/upload/sign/${bucket}/`)),
          `${who} sign upload ${bucket}`,
        ).toBe(1);
      }
    }
  });

  it("calls with the key each caller has and no other: the secret key only for the controls and the clean-up", async () => {
    const fake = project();
    await probe(fake);
    expect(fake.calls.map((call) => call.who).filter((who) => who === "bad")).toEqual([]);
    // The signed upload's PUT carries no key, by design (the token is in its query).
    const keyless = fake.calls.filter((call) => call.who === "none");
    expect(keyless.map((call) => `${call.method} ${call.path.split("/").slice(0, 6).join("/")}`)).toEqual([
      "PUT /storage/v1/object/upload/sign",
      "PUT /storage/v1/object/upload/sign",
    ]);
    const service = fake.calls.filter((call) => call.who === "service");
    expect(service.map((call) => call.method)).toContain("DELETE");
    expect(fake.calls.filter((call) => call.who === "anon" && call.method === "DELETE")).toEqual([]);
  });

  it("never puts a key, a token or a response's words in a check's name or note", async () => {
    const fake = project({ leaks: ["list-buckets", "download"] });
    const checks = await probe(fake);
    const text = JSON.stringify(checks);
    expect(text).not.toContain(FAKE_SECRET);
    expect(text).not.toContain(FAKE_PUBLISHABLE);
    expect(text).not.toMatch(/user-token-|hashed|upload-token-|someone-else/);
  });
});

describe("apiChecks on a project that leaks", () => {
  // Each surface that can be opened, and the checks that must say so, for the callers that can use it.
  const LEAKS: [Leak, string[]][] = [
    ["list-buckets", ["user: list the buckets"]],
    ["list-objects", ["user: list the objects of uploads", "user: list the objects of renditions"]],
    [
      "download",
      ["anon: download from uploads", "user: download from uploads", "anon: download from the public route of uploads"],
    ],
    ["sign-read", ["user: sign a read URL for uploads", "user: sign read URLs for uploads in a batch"]],
    ["overwrite", ["user: overwrite the object in uploads"]],
    ["new-object", ["user: add an object to uploads"]],
    ["sign-upload", ["user: sign an upload URL in uploads"]],
    ["bucket-create", ["user: create a bucket"]],
    ["rest", ["anon: REST users", "user: REST users", "anon: REST clubs", "user: REST drops"]],
    ["graphql", ["anon: GraphQL", "user: GraphQL"]],
  ];

  for (const [leak, names] of LEAKS) {
    it(`names the surface when ${leak} is open, and leaves nothing behind`, async () => {
      const fake = project({ leaks: [leak] });
      const checks = await probe(fake);
      for (const name of names) expect(failed(checks), name).toContain(name);
      // Only refusals fail: the controls held, so the failure is the project's.
      expect(failed(checks).filter((name) => name.startsWith("control: "))).toEqual([]);
      expect(failed(checks).filter((name) => name.startsWith("cleanup: "))).toEqual([]);
      // What a leak let the probe write is removed with the rest: objects, buckets and the user.
      expect(fake.objects.size).toBe(0);
      expect(fake.users.size).toBe(0);
      expect([...fake.buckets.keys()].sort()).toEqual(["renditions", "uploads"]);
    });
  }

  it("fails each of two leaks together, and each by name", async () => {
    const checks = await probe(project({ leaks: ["rest", "list-buckets"] }));
    expect(failed(checks)).toContain("user: list the buckets");
    expect(failed(checks)).toContain("anon: REST users");
  });

  it("says what each open surface gave, in a count or a phrase, and never a word the project said", async () => {
    const note = async (leak: Leak, name: string) => {
      const checks = await probe(project({ leaks: [leak] }));
      return checks.find((check) => check.name === name)?.note;
    };
    expect(await note("download", "anon: download from uploads")).toBe("it gave the object");
    expect(await note("list-buckets", "user: list the buckets")).toBe("it listed 2 items");
    expect(await note("list-objects", "user: list the objects of uploads")).toBe("it listed 1 item");
    expect(await note("sign-read", "user: sign a read URL for uploads")).toBe("it gave a signed URL");
    expect(await note("sign-read", "user: sign read URLs for uploads in a batch")).toBe("it gave a signed URL");
    expect(await note("sign-upload", "user: sign an upload URL in uploads")).toBe("it gave an upload URL");
    expect(await note("overwrite", "user: overwrite the object in uploads")).toBe("it wrote the object");
    expect(await note("new-object", "user: add an object to uploads")).toBe("it wrote the object");
    expect(await note("bucket-create", "user: create a bucket")).toBe("it made a bucket");
    expect(await note("rest", "anon: REST users")).toBe("it returned rows");
    expect(await note("rest", "anon: REST root")).toBe("answered HTTP 200");
    expect(await note("graphql", "anon: GraphQL")).toBe("it answered with data");
  });

  it("removes what a leaked write made, by name, and says it did", async () => {
    const fake = project({ leaks: ["new-object", "bucket-create"] });
    const checks = await probe(fake);
    expect(checks.filter((check) => check.name.startsWith("cleanup: ")).map((check) => check.name)).toEqual([
      "cleanup: delete the probe object in uploads",
      "cleanup: delete the probe object in renditions",
      "cleanup: delete the object user added to uploads",
      "cleanup: delete the object user added to renditions",
      "cleanup: delete the bucket user made",
      "cleanup: delete the probe user",
    ]);
    expect(fake.objects.size).toBe(0);
    expect([...fake.buckets.keys()].sort()).toEqual(["renditions", "uploads"]);
  });
});

describe("apiChecks counts only Storage's own refusal as one", () => {
  // A wrapper that answers some calls as something other than Storage would.
  const answering =
    (fake: Fake, when: (request: Request) => Response | undefined): typeof fetch =>
    async (input, init) =>
      when(new Request(input, init)) ?? fake.fetch(input, init);
  const gateway401 = () => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });
  const badRequest = () =>
    new Response(
      JSON.stringify({ statusCode: "400", code: "InvalidRequest", error: "invalid_request", message: "bad" }),
      {
        status: 400,
      },
    );
  const lone404 = () =>
    new Response(JSON.stringify({ statusCode: 404, error: "Not Found", message: "Route not found" }), { status: 404 });
  const serverError = () => new Response("<html>bad gateway</html>", { status: 502 });

  it("fails a gateway's 401, which says the key or the token wasn't taken and not that a policy refused", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) =>
        request.url.endsWith("/storage/v1/bucket") && request.method === "GET" ? gateway401() : undefined,
      ),
    );
    expect(failed(checks)).toEqual(["anon: list the buckets", "user: list the buckets"]);
    expect(checks.find((check) => check.name === "anon: list the buckets")?.note).toBe("answered HTTP 401");
  });

  it("fails a request Storage couldn't read (status 400), so a mistake of the probe's own can't pass as closed", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) =>
        request.url.includes("/object/authenticated/uploads/") && request.headers.get("apikey") === FAKE_PUBLISHABLE
          ? badRequest()
          : undefined,
      ),
    );
    expect(failed(checks)).toEqual(["anon: download from uploads", "user: download from uploads"]);
    expect(checks.find((check) => check.name === "user: download from uploads")?.note).toBe(
      "answered HTTP 400, InvalidRequest",
    );
  });

  it("fails a 404 that isn't Storage's, as a route that isn't there says it, and a server error", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) => {
        if (request.method !== "POST" || request.headers.get("apikey") !== FAKE_PUBLISHABLE) return undefined;
        if (request.url.endsWith("/storage/v1/object/list/uploads")) return lone404();
        if (request.url.endsWith("/storage/v1/object/sign/renditions")) return serverError();
        return undefined;
      }),
    );
    expect(failed(checks)).toEqual([
      "anon: list the objects of uploads",
      "anon: sign read URLs for renditions in a batch",
      "user: list the objects of uploads",
      "user: sign read URLs for renditions in a batch",
    ]);
  });

  it("takes an empty list or a batch with no URL as closed only because the service key listed and signed the same object", async () => {
    const empty = async (path: RegExp): Promise<string[]> => {
      const fake = project();
      const checks = await probe(
        fake,
        answering(fake, (request) =>
          request.method === "POST" &&
          path.test(new URL(request.url).pathname) &&
          request.headers.get("apikey") === FAKE_SECRET
            ? new Response(JSON.stringify([]), { status: 200 })
            : undefined,
        ),
      );
      expect(fake.objects.size).toBe(0);
      expect(fake.users.size).toBe(0);
      return failed(checks);
    };
    // The control that listed the object saw nothing: so nothing the refusals saw proves anything, and none runs.
    expect(await empty(/\/object\/list\/uploads$/)).toEqual(["control: the service key lists the object in uploads"]);
    expect(await empty(/\/object\/sign\/uploads$/)).toEqual([
      "control: the service key signs a read URL for uploads in a batch",
    ]);
  });

  it("stops after the controls when Auth won't take the user's token, since every refusal of that token would mean nothing", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) =>
        request.url.endsWith("/auth/v1/user")
          ? new Response(JSON.stringify({ msg: "invalid JWT" }), { status: 401 })
          : undefined,
      ),
    );
    expect(failed(checks)).toEqual(["control: the user signs in without an email"]);
    expect(checks.find((check) => check.name.startsWith("control: the user"))?.note).toBe(
      "the token wasn't taken: HTTP 401",
    );
    expect(checks.some((check) => check.name.startsWith("anon: ") || check.name.startsWith("user: "))).toBe(false);
    expect(fake.users.size).toBe(0);
  });

  it("stops after the controls when the project gives the user no sign-in code", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) =>
        request.url.endsWith("/auth/v1/admin/generate_link")
          ? new Response(JSON.stringify({ error_code: "validation_failed" }), { status: 400 })
          : undefined,
      ),
    );
    expect(failed(checks)).toEqual(["control: the user signs in without an email"]);
    expect(checks.find((check) => check.name.startsWith("control: the user"))?.note).toBe("no sign-in code: HTTP 400");
    expect(fake.users.size).toBe(0);
  });
});

describe("apiChecks's controls: each must hold, in its own words, before a refusal means anything", () => {
  const answering =
    (fake: Fake, when: (request: Request) => Response | undefined): typeof fetch =>
    async (input, init) =>
      when(new Request(input, init)) ?? fake.fetch(input, init);
  const status = (code: number) => () => new Response("{}", { status: code });
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const asService = (request: Request) => request.headers.get("apikey") === FAKE_SECRET;

  it("names the control of the signed URL's put when it doesn't answer 200, and runs no read after it", async () => {
    for (const code of [201, 400, 403, 500]) {
      const fake = project();
      const checks = await probe(
        fake,
        answering(fake, (request) =>
          request.method === "PUT" && request.url.includes("/object/upload/sign/uploads/") ? status(code)() : undefined,
        ),
      );
      expect(failed(checks), String(code)).toEqual(["control: the signed URL puts the object in uploads"]);
      expect(
        checks.some((check) => check.name.startsWith("control: the service key reads")),
        String(code),
      ).toBe(false);
      // The object it tried to put isn't there, and a delete that finds nothing has done its job.
      expect(fake.objects.size).toBe(0);
      expect(fake.users.size).toBe(0);
    }
  });

  it("names the control of the read when the bytes aren't the ones the probe put there", async () => {
    const fake = project();
    const checks = await probe(
      fake,
      answering(fake, (request) =>
        request.method === "GET" && request.url.includes("/object/authenticated/uploads/") && asService(request)
          ? new Response(Uint8Array.of(1, 2, 3), { status: 200 })
          : undefined,
      ),
    );
    expect(failed(checks)).toEqual(["control: the service key reads the object back from uploads"]);
  });

  it("names the control of the list when it lists some other object, or nothing", async () => {
    for (const body of [[{ name: "another.png" }], [], { name: "seen.png" }]) {
      const fake = project();
      const checks = await probe(
        fake,
        answering(fake, (request) =>
          request.method === "POST" && request.url.endsWith("/object/list/uploads") && asService(request)
            ? ok(body)
            : undefined,
        ),
      );
      expect(failed(checks), JSON.stringify(body)).toEqual(["control: the service key lists the object in uploads"]);
    }
  });

  it("names the control of the batch when it signs some other path, or none", async () => {
    for (const body of [
      [{ path: "probe/elsewhere/seen.png", signedURL: "/object/sign/uploads/x?token=t" }],
      [{ path: "probe/id1/seen.png", signedURL: null, error: "no" }],
      [],
    ]) {
      const fake = project();
      const checks = await probe(
        fake,
        answering(fake, (request) =>
          request.method === "POST" && request.url.endsWith("/object/sign/uploads") && asService(request)
            ? ok(body)
            : undefined,
        ),
      );
      expect(failed(checks), JSON.stringify(body)).toEqual([
        "control: the service key signs a read URL for uploads in a batch",
      ]);
    }
  });

  it("names the control of the upload URL when the project's answer has no token and no URL that is one", async () => {
    for (const body of [{}, { url: "http://[" }, { url: "" }]) {
      const fake = project();
      const checks = await probe(
        fake,
        answering(fake, (request) =>
          request.method === "POST" && request.url.includes("/object/upload/sign/uploads/") && asService(request)
            ? ok(body)
            : undefined,
        ),
      );
      expect(failed(checks), JSON.stringify(body)).toEqual([
        "control: the service key signs an upload URL for uploads",
      ]);
    }
  });

  it("asks REST for the schema app by name, since it would otherwise be asked for the public one", async () => {
    const fake = project();
    const profiles: [string, string | null][] = [];
    const spy = answering(fake, (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/rest/v1/") && pathname !== "/rest/v1/") {
        profiles.push([pathname, request.headers.get("accept-profile")]);
      }
      return undefined;
    });
    await probe(fake, spy);
    expect(profiles).toEqual(
      ["anon", "user"].flatMap(() => TABLES.map((table) => [`/rest/v1/${table}`, "app"] as [string, string])),
    );
  });
});

describe("reportLine", () => {
  it("says ok, or FAIL with why, and nothing else", () => {
    expect(reportLine({ name: "anon: GraphQL", ok: true })).toBe("ok    anon: GraphQL");
    expect(reportLine({ name: "anon: GraphQL", ok: false })).toBe("FAIL  anon: GraphQL");
    expect(reportLine({ name: "anon: GraphQL", ok: false, note: "it answered with data" })).toBe(
      "FAIL  anon: GraphQL: it answered with data",
    );
  });
});

describe("apiChecks when the project can't be trusted to answer", () => {
  it("stops after the controls when the service key is refused, and says that nothing was proved", async () => {
    const fake = project({ serviceKeyRefused: true });
    const checks = await probe(fake);
    expect(failed(checks)).toEqual(["control: the service key makes a user"]);
    // No refusal is run: a refusal by a project that refuses the privileged key too proves nothing.
    expect(checks.some((check) => check.name.startsWith("anon: ") || check.name.startsWith("user: "))).toBe(false);
  });

  it("fails a check, not the run, when a call gets no answer, and still cleans up", async () => {
    const fake = project();
    const failing = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new Request(input, init).url.endsWith("/graphql/v1")) throw new TypeError("fetch failed");
      return fake.fetch(input, init);
    }) as typeof fetch;
    const checks = await probe(fake, failing);
    expect(failed(checks)).toEqual(["anon: GraphQL", "user: GraphQL"]);
    expect(checks.find((check) => check.name === "anon: GraphQL")?.note).toBe("no answer from the project");
    expect(fake.objects.size).toBe(0);
    expect(fake.users.size).toBe(0);
  });

  it("deletes the user and the objects even when a control throws half-way", async () => {
    const fake = project();
    let uploads = 0;
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === "PUT" && request.url.includes("/object/upload/sign/renditions/")) {
        uploads += 1;
        throw new TypeError("fetch failed");
      }
      return fake.fetch(input, init);
    }) as typeof fetch;
    const checks = await probe(fake, flaky);
    expect(uploads).toBe(1);
    // Only the control fails: the clean-up deletes an object that was never stored without complaint.
    expect(failed(checks)).toEqual(["control: the signed URL puts the object in renditions"]);
    expect(fake.objects.size).toBe(0);
    expect(fake.users.size).toBe(0);
  });

  it("deletes the user and the objects even when the run itself throws, which is no excuse to leave them", async () => {
    const fake = project();
    // The tables are read after the controls: an iterator that throws then stands for a bug in the probe.
    const tables = Object.assign([] as string[], {
      [Symbol.iterator]() {
        throw new Error("a bug in the probe");
      },
    });
    let n = 0;
    await expect(
      apiChecks({
        fetch: fake.fetch,
        url: FAKE_URL,
        publishableKey: FAKE_PUBLISHABLE,
        serviceKey: FAKE_SECRET,
        tables,
        id: () => `id${String((n += 1))}`,
      }),
    ).rejects.toThrow("a bug in the probe");
    expect(fake.objects.size).toBe(0);
    expect(fake.users.size).toBe(0);
    expect(fake.calls.filter((call) => call.method === "DELETE").length).toBe(3);
  });

  it("reports a clean-up that fails, with what is left, so that no test user stays behind unseen", async () => {
    const fake = project({ failing: "DELETE /auth/v1/admin/users/00000000-0000-4000-8000-00000001" });
    const checks = await probe(fake);
    expect(failed(checks)).toEqual(["cleanup: delete the probe user"]);
    expect(fake.users.size).toBe(1);
  });
});

describe("dataApiChecks, the project's own configuration through the Management API", () => {
  const answer =
    (dbSchema: unknown, status = 200): typeof fetch =>
    () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            db_schema: dbSchema,
            jwt_secret: "the-project's-jwt-secret-must-never-print",
            max_rows: 1000,
          }),
          { status },
        ),
      );

  it("passes when no schema is exposed, which is how Supabase says the Data API is off", async () => {
    for (const schema of ["", "pg_pgrst_no_exposed_schemas"]) {
      const checks = await dataApiChecks(answer(schema), "abcdefghijklmnopqrst", "a-token");
      expect(checks).toEqual([{ name: "the Data API exposes no schema", ok: true }]);
    }
  });

  it("fails when any schema is exposed, naming it as the project's own list says and nothing else", async () => {
    const [check] = await dataApiChecks(answer("public,storage"), "abcdefghijklmnopqrst", "a-token");
    expect(check?.ok).toBe(false);
    expect(check?.note).toBe("it exposes public, storage");
    expect(JSON.stringify(check)).not.toContain("jwt-secret");
  });

  it("says a schema's name only when it is a plain one, and otherwise that it has an odd name", async () => {
    const odd = ["has space", "semi;colon", "a".repeat(64), "1starts_with_a_digit", 'quote"', "new\nline", "ünï"];
    const [check] = await dataApiChecks(answer(["public", ...odd].join(",")), "abcdefghijklmnopqrst", "a-token");
    expect(check?.note).toBe(`it exposes public, ${odd.map(() => "a schema with an odd name").join(", ")}`);
    const [plain] = await dataApiChecks(
      answer(`_private,Mixed_Case_9,${"a".repeat(63)}`),
      "abcdefghijklmnopqrst",
      "a-token",
    );
    expect(plain?.note).toBe(`it exposes _private, Mixed_Case_9, ${"a".repeat(63)}`);
  });

  it("fails, saying only the status, when the Management API refuses or answers something else", async () => {
    for (const fetcher of [answer("", 401), answer(undefined), answer(42)]) {
      const [check] = await dataApiChecks(fetcher, "abcdefghijklmnopqrst", "a-token");
      expect(check?.ok).toBe(false);
      expect(JSON.stringify(check)).not.toContain("jwt-secret");
      expect(JSON.stringify(check)).not.toContain("a-token");
    }
  });

  it("refuses a reference that isn't a project's, and asks nothing, since it goes into the path of the request", async () => {
    let asked = 0;
    const spy = (() => {
      asked += 1;
      return Promise.resolve(new Response(JSON.stringify({ db_schema: "" }), { status: 200 }));
    }) as typeof fetch;
    const odd = [
      "",
      "short",
      "abcdefghijklmnopqrstu",
      "abcdefghijklmnopqrs",
      "ABCDEFGHIJKLMNOPQRST",
      "abcdefghijklmnopqrst/..",
      "../abcdefghijklmnopqrst",
      "abcdefghijklmnopqrs?",
      " abcdefghijklmnopqrst",
      "abcdefghijklmnopqrst\n",
      "abcdefghijklmnopqrs0",
    ];
    for (const ref of odd) {
      await expect(dataApiChecks(spy, ref, "a-token"), JSON.stringify(ref)).rejects.toThrow(
        /the project's reference is twenty letters/,
      );
    }
    expect(asked).toBe(0);
  });

  it("fails a check, not the run, when the Management API gives no answer, or its answer stops half-way", async () => {
    const refused = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    const stopped = (() => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("terminated"));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;
    for (const fetcher of [refused, stopped]) {
      expect(await dataApiChecks(fetcher, "abcdefghijklmnopqrst", "a-token")).toEqual([
        { name: "the Data API exposes no schema", ok: false, note: "no answer from the project" },
      ]);
    }
  });

  it("asks the project's own configuration with the access token as a bearer, and reads nothing else of it", async () => {
    const seen: { url: string; authorization: string | null; method: string }[] = [];
    const spy = ((input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      seen.push({ url: request.url, authorization: request.headers.get("authorization"), method: request.method });
      return Promise.resolve(new Response(JSON.stringify({ db_schema: "" }), { status: 200 }));
    }) as typeof fetch;
    await dataApiChecks(spy, "abcdefghijklmnopqrst", "a-token");
    expect(seen).toEqual([
      {
        url: "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/postgrest",
        authorization: "Bearer a-token",
        method: "GET",
      },
    ]);
  });
});
