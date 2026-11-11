// A made-up Supabase project, as a `fetch`: the parts of Storage, Auth's admin routes, REST and
// GraphQL that `storage-setup` and `supabase-probe` call, answering as a hosted project with no
// policies and the Data API off does, by the vendor's own sources read on 11 November 2026
// (docs/plans/api-b0-deploy.md, section 5). Test support, outside `src`, so the image doesn't
// carry it (`@tadayo/ops/testing`).
//
// `leaks` turns a closed surface open, one at a time, so a test can show the probe notices each:
// the probe has to fail when the surface leaks, and pass when it doesn't, with the privileged key
// working in both (the controls). Every key here is made up, built from pieces so no secret
// scanner reads one whole.

export const FAKE_URL = "https://abcdefghijklmnopqrst.supabase.co";
export const FAKE_SECRET = ["sb_", "secret_", "A".repeat(32)].join("");
export const FAKE_PUBLISHABLE = ["sb_", "publishable_", "B".repeat(32)].join("");

export type Leak =
  | "list-buckets"
  | "list-objects"
  | "download"
  | "sign-read"
  | "overwrite"
  | "new-object"
  | "sign-upload"
  | "bucket-create"
  | "rest"
  | "rest-root"
  | "graphql";

export interface FakeBucket {
  id: string;
  name: string;
  owner: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
}

export interface FakeOptions {
  /** Surfaces that answer as if open. */
  readonly leaks?: readonly Leak[];
  /** The service key is refused everywhere, as a broken setup would have it. */
  readonly serviceKeyRefused?: boolean;
  /** Buckets that exist before the script runs. */
  readonly buckets?: readonly Partial<FakeBucket>[];
  /** A call by this method and path fails with a server error, once. */
  readonly failing?: string;
}

export type Who = "service" | "anon" | "user" | "none" | "bad";

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly who: Who;
  readonly status: number;
}

export interface Fake {
  readonly fetch: typeof fetch;
  readonly calls: FakeCall[];
  readonly buckets: Map<string, FakeBucket>;
  /** Objects by `<bucket>/<path>`. */
  readonly objects: Map<string, Uint8Array>;
  /** Auth's users by id, with their addresses. */
  readonly users: Map<string, string>;
}

const STORAGE_REFUSED = {
  statusCode: "403",
  code: "AccessDenied",
  error: "Unauthorized",
  message: "new row violates row-level security policy",
};
const NO_BUCKET = { statusCode: "404", code: "NoSuchBucket", error: "Bucket not found", message: "Bucket not found" };
const NO_KEY = { statusCode: "404", code: "NoSuchKey", error: "not_found", message: "Object not found" };
const DUPLICATE = { statusCode: "409", error: "Duplicate", message: "The resource already exists" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
/** Storage's way of failing: HTTP 400, and the status that counts in the body. */
const storageError = (body: Record<string, string>) => json(400, body);
/** An object's bytes, as Storage serves an image: a copy, so the body is an ArrayBuffer of its own. */
const image = (bytes: Uint8Array) =>
  new Response(new Uint8Array(bytes).buffer, { status: 200, headers: { "content-type": "image/png" } });

export function fakeSupabase(options: FakeOptions = {}): Fake {
  const leaks = new Set(options.leaks ?? []);
  const calls: FakeCall[] = [];
  const buckets = new Map<string, FakeBucket>();
  const objects = new Map<string, Uint8Array>();
  const users = new Map<string, string>();
  const tokens = new Map<string, string>();
  const links = new Map<string, string>();
  const uploads = new Map<string, { bucket: string; path: string; upsert: boolean }>();
  let failing = options.failing;
  let counter = 0;
  const next = (prefix: string) => `${prefix}${String((counter += 1)).padStart(8, "0")}`;

  for (const partial of options.buckets ?? []) {
    const name = partial.name ?? "uploads";
    buckets.set(name, {
      id: name,
      name,
      owner: "",
      public: false,
      created_at: "2026-11-11T00:00:00Z",
      updated_at: "2026-11-11T00:00:00Z",
      file_size_limit: null,
      allowed_mime_types: null,
      ...partial,
    });
  }

  function whoIs(headers: Headers): Who {
    const apikey = headers.get("apikey");
    const bearer = /^Bearer (.+)$/.exec(headers.get("authorization") ?? "")?.[1];
    if (apikey === FAKE_SECRET && (bearer === undefined || bearer === FAKE_SECRET)) {
      return options.serviceKeyRefused ? "bad" : "service";
    }
    if (apikey === FAKE_PUBLISHABLE) {
      if (bearer === undefined || bearer === FAKE_PUBLISHABLE) return "anon";
      return tokens.has(bearer) ? "user" : "bad";
    }
    return apikey === null && bearer === undefined ? "none" : "bad";
  }

  function allowedType(bucket: FakeBucket, contentType: string | null): boolean {
    const type = (contentType ?? "application/octet-stream").split(";")[0]?.trim().toLowerCase() ?? "";
    return bucket.allowed_mime_types === null || bucket.allowed_mime_types.includes(type);
  }

  function store(bucketName: string, path: string, body: Uint8Array, contentType: string | null, upsert: boolean) {
    const bucket = buckets.get(bucketName);
    if (!bucket) return storageError(NO_BUCKET);
    if (!allowedType(bucket, contentType)) {
      return storageError({
        statusCode: "415",
        code: "InvalidMimeType",
        error: "invalid_mime_type",
        message: "mime type not supported",
      });
    }
    if (bucket.file_size_limit !== null && body.length > bucket.file_size_limit) {
      return storageError({
        statusCode: "413",
        code: "EntityTooLarge",
        error: "Payload too large",
        message: "The object exceeded the maximum allowed size",
      });
    }
    const key = `${bucketName}/${path}`;
    if (objects.has(key) && !upsert) return storageError({ ...DUPLICATE, code: "KeyAlreadyExists" });
    objects.set(key, body);
    return json(200, { Key: key, version: next("v") });
  }

  async function handle(request: Request): Promise<{ response: Response; who: Who }> {
    const url = new URL(request.url);
    const path = url.pathname;
    const who = whoIs(request.headers);
    const method = request.method;
    const privileged = who === "service";
    const body = async () => new Uint8Array(await request.arrayBuffer());
    const parsed = async (): Promise<Record<string, unknown>> => {
      try {
        return JSON.parse(new TextDecoder().decode(await body())) as Record<string, unknown>;
      } catch {
        return {};
      }
    };
    const signedIn = who === "user";

    if (options.failing !== undefined && failing === `${method} ${path}`) {
      failing = undefined;
      return { who, response: json(500, { message: "internal" }) };
    }
    if (who === "bad") return { who, response: json(401, { message: "Invalid API key" }) };

    // ---- Auth
    if (path.startsWith("/auth/v1/admin/")) {
      if (!privileged)
        return { who, response: json(403, { code: 403, error_code: "not_admin", msg: "User not allowed" }) };
      if (method === "POST" && path === "/auth/v1/admin/users") {
        const input = await parsed();
        const email = typeof input["email"] === "string" ? input["email"] : "";
        if ([...users.values()].includes(email)) return { who, response: json(422, { error_code: "email_exists" }) };
        const id = next("00000000-0000-4000-8000-");
        users.set(id, email);
        return { who, response: json(200, { id, email }) };
      }
      if (method === "POST" && path === "/auth/v1/admin/generate_link") {
        const input = await parsed();
        const email = typeof input["email"] === "string" ? input["email"] : "";
        const id = [...users].find(([, address]) => address === email)?.[0];
        if (id === undefined) return { who, response: json(400, { error_code: "user_not_found" }) };
        const hashed = next("hashed");
        links.set(hashed, id);
        return {
          who,
          response: json(200, {
            id,
            email,
            hashed_token: hashed,
            email_otp: "123456",
            action_link: "x",
            verification_type: "magiclink",
          }),
        };
      }
      const match = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(path);
      if (method === "DELETE" && match?.[1] !== undefined) {
        users.delete(match[1]);
        return { who, response: json(200, {}) };
      }
    }
    if (method === "POST" && path === "/auth/v1/verify") {
      const input = await parsed();
      const keys = Object.keys(input).sort().join(",");
      if (keys !== "token_hash,type") return { who, response: json(400, { error_code: "validation_failed" }) };
      const hash = typeof input["token_hash"] === "string" ? input["token_hash"] : "";
      const id = links.get(hash);
      if (id === undefined) return { who, response: json(403, { error_code: "otp_expired" }) };
      links.delete(hash);
      const access = next("user-token-");
      tokens.set(access, id);
      return {
        who,
        response: json(200, { access_token: access, token_type: "bearer", expires_in: 3600, user: { id } }),
      };
    }
    if (method === "GET" && path === "/auth/v1/user") {
      const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      const id = bearer === undefined ? undefined : tokens.get(bearer);
      if (!signedIn || id === undefined)
        return { who, response: json(401, { error_code: "bad_jwt", msg: "invalid JWT" }) };
      return { who, response: json(200, { id, email: users.get(id) ?? "" }) };
    }

    // ---- Data API: off, so every door answers an error (a 503 for the schema cache it can't build).
    if (path.startsWith("/rest/v1")) {
      // The root, which describes the schema, is read only with the secret key, since April 2026
      // (supabase discussion 42949): the public key and a user's token are refused whatever the Data
      // API's state, and the service key is told the schema when the Data API is on (`rest-root`).
      if (path === "/rest/v1/" || path === "/rest/v1") {
        if (who !== "service") {
          return {
            who,
            response: json(403, {
              message: "Access to schema is forbidden",
              hint: "Accessing the schema via the Data API is only allowed using a secret API key.",
            }),
          };
        }
        if (leaks.has("rest-root")) {
          return { who, response: json(200, { swagger: "2.0", paths: { "/clubs": {}, "/users": {}, "/": {} } }) };
        }
      } else if (leaks.has("rest") && (who === "anon" || signedIn)) {
        return { who, response: json(200, [{ id: "someone-else's row" }]) };
      }
      return {
        who,
        response: json(503, {
          code: "PGRST002",
          details: null,
          hint: null,
          message: "Could not query the database for the schema cache. Retrying.",
        }),
      };
    }
    if (path === "/graphql/v1") {
      if (leaks.has("graphql") && (who === "anon" || signedIn)) {
        return {
          who,
          response: json(200, {
            data: { __schema: { queryType: { fields: [{ name: "usersCollection" }, { name: "clubsCollection" }] } } },
          }),
        };
      }
      return {
        who,
        response: json(503, {
          code: "PGRST002",
          message: "Could not query the database for the schema cache. Retrying.",
        }),
      };
    }

    // ---- Storage
    if (!path.startsWith("/storage/v1/")) return { who, response: json(404, { message: "not found" }) };
    const rest = path.slice("/storage/v1/".length);
    const [head, second, ...tail] = rest.split("/");
    const objectPath = decodeURIComponent(tail.join("/"));

    if (head === "bucket") {
      if (second === undefined) {
        if (method === "GET") {
          const all = [...buckets.values()];
          return { who, response: json(200, privileged || (leaks.has("list-buckets") && signedIn) ? all : []) };
        }
        if (method === "POST") {
          if (!privileged && !(leaks.has("bucket-create") && signedIn))
            return { who, response: storageError(STORAGE_REFUSED) };
          const input = await parsed();
          const name = typeof input["name"] === "string" ? input["name"] : "";
          if (buckets.has(name)) return { who, response: storageError({ ...DUPLICATE, code: "BucketAlreadyExists" }) };
          buckets.set(name, {
            id: typeof input["id"] === "string" ? input["id"] : name,
            name,
            owner: "",
            public: input["public"] === true,
            created_at: "2026-11-11T00:00:00Z",
            updated_at: "2026-11-11T00:00:00Z",
            file_size_limit: typeof input["file_size_limit"] === "number" ? input["file_size_limit"] : null,
            allowed_mime_types: Array.isArray(input["allowed_mime_types"])
              ? (input["allowed_mime_types"] as string[])
              : null,
          });
          return { who, response: json(200, { name }) };
        }
      } else {
        const bucket = buckets.get(second);
        if (method === "GET") {
          return { who, response: bucket && privileged ? json(200, bucket) : storageError(NO_BUCKET) };
        }
        if (method === "PUT") {
          if (!bucket || !privileged) return { who, response: storageError(NO_BUCKET) };
          const input = await parsed();
          if (typeof input["public"] === "boolean") bucket.public = input["public"];
          if ("file_size_limit" in input) bucket.file_size_limit = input["file_size_limit"] as number | null;
          if ("allowed_mime_types" in input) bucket.allowed_mime_types = input["allowed_mime_types"] as string[] | null;
          return { who, response: json(200, { message: "Successfully updated" }) };
        }
        if (method === "DELETE") {
          if (!bucket || !privileged) return { who, response: storageError(NO_BUCKET) };
          if ([...objects.keys()].some((key) => key.startsWith(`${second}/`))) {
            return {
              who,
              response: storageError({
                statusCode: "409",
                code: "InvalidRequest",
                error: "Conflict",
                message: "Bucket not empty",
              }),
            };
          }
          buckets.delete(second);
          return { who, response: json(200, { message: "Successfully deleted" }) };
        }
      }
    }

    if (head === "object" && second === "list" && method === "POST") {
      // Storage lists one level under the prefix: the next path segment of each object there.
      const bucketName = tail[0] ?? "";
      const input = await parsed();
      const prefix = typeof input["prefix"] === "string" ? input["prefix"] : "";
      const inside = prefix === "" ? "" : `${prefix}/`;
      const names = new Set<string>();
      for (const key of objects.keys()) {
        if (key.startsWith(`${bucketName}/${inside}`)) {
          names.add(key.slice(bucketName.length + 1 + inside.length).split("/")[0] ?? "");
        }
      }
      const items = [...names].map((name) => ({ name }));
      return { who, response: json(200, privileged || (leaks.has("list-objects") && signedIn) ? items : []) };
    }
    if (head === "object" && second === "authenticated" && method === "GET") {
      const key = `${tail[0] ?? ""}/${decodeURIComponent(tail.slice(1).join("/"))}`;
      const bytes = objects.get(key);
      if (bytes && (privileged || (leaks.has("download") && (who === "anon" || signedIn)))) {
        return { who, response: image(bytes) };
      }
      return { who, response: storageError(NO_KEY) };
    }
    if (head === "object" && second === "public" && method === "GET") {
      const key = `${tail[0] ?? ""}/${decodeURIComponent(tail.slice(1).join("/"))}`;
      const bytes = objects.get(key);
      if (bytes && leaks.has("download") && who === "anon") {
        return { who, response: image(bytes) };
      }
      return { who, response: storageError(NO_BUCKET) };
    }
    if (head === "object" && second === "sign" && method === "POST") {
      const input = await parsed();
      const allowed = privileged || (leaks.has("sign-read") && signedIn);
      if (tail.length === 1) {
        const bucketName = tail[0] ?? "";
        const paths = Array.isArray(input["paths"]) ? (input["paths"] as string[]) : [];
        return {
          who,
          response: json(
            200,
            paths.map((one) =>
              allowed && objects.has(`${bucketName}/${one}`)
                ? { path: one, signedURL: `/object/sign/${bucketName}/${one}?token=x` }
                : {
                    error: "Either the object does not exist or you do not have access to it",
                    path: one,
                    signedURL: null,
                  },
            ),
          ),
        };
      }
      const key = `${tail[0] ?? ""}/${decodeURIComponent(tail.slice(1).join("/"))}`;
      if (allowed && objects.has(key))
        return { who, response: json(200, { signedURL: `/object/sign/${key}?token=x` }) };
      return { who, response: storageError(NO_KEY) };
    }
    if (head === "object" && second === "upload" && tail[0] === "sign") {
      const bucketName = tail[1] ?? "";
      const path2 = decodeURIComponent(tail.slice(2).join("/"));
      if (method === "POST") {
        if (!privileged && !(leaks.has("sign-upload") && signedIn))
          return { who, response: storageError(STORAGE_REFUSED) };
        if (!buckets.has(bucketName)) return { who, response: storageError(NO_BUCKET) };
        const upsert = request.headers.get("x-upsert") === "true";
        if (objects.has(`${bucketName}/${path2}`) && !upsert)
          return { who, response: storageError({ ...DUPLICATE, code: "KeyAlreadyExists" }) };
        const token = next("upload-token-");
        uploads.set(token, { bucket: bucketName, path: path2, upsert });
        return {
          who,
          response: json(200, { url: `/object/upload/sign/${bucketName}/${path2}?token=${token}`, token }),
        };
      }
      if (method === "PUT") {
        const grant = uploads.get(url.searchParams.get("token") ?? "");
        if (!grant || grant.bucket !== bucketName || grant.path !== path2) {
          return {
            who,
            response: storageError({
              statusCode: "400",
              code: "InvalidJWT",
              error: "invalid_jwt",
              message: "invalid signature",
            }),
          };
        }
        return {
          who,
          response: store(bucketName, path2, await body(), request.headers.get("content-type"), grant.upsert),
        };
      }
    }
    if (head === "object" && second !== undefined && second !== "sign" && second !== "list" && second !== "upload") {
      const bucketName = second;
      const objectKey = `${bucketName}/${objectPath}`;
      if (method === "POST" || method === "PUT") {
        const allowed = privileged || (signedIn && leaks.has(method === "POST" ? "new-object" : "overwrite"));
        if (!allowed) return { who, response: storageError(STORAGE_REFUSED) };
        return {
          who,
          response: store(bucketName, objectPath, await body(), request.headers.get("content-type"), method === "PUT"),
        };
      }
      if (method === "DELETE") {
        if (!privileged) return { who, response: storageError(NO_KEY) };
        const had = objects.delete(objectKey);
        return { who, response: had ? json(200, { message: "Successfully deleted" }) : storageError(NO_KEY) };
      }
    }
    return { who, response: json(404, { message: "not found" }) };
  }

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const { response, who } = await handle(request);
    calls.push({ method: request.method, path: new URL(request.url).pathname, who, status: response.status });
    return response;
  }) as typeof fetch;

  return { fetch: fetcher, calls, buckets, objects, users };
}
