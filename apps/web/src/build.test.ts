// The site's build and the files it builds (docs/plans/api-b0-deploy.md, section 7; TECH-DESIGN
// sections 1 and 9; ADR-023): what Cloudflare Pages is given is `dist/`, a copy of `public/` made only
// when `apple-app-site-association` is the file Apple reads, `_headers` serves it as JSON, and a
// missing path answers 404 and not the home page (a Pages site with no `404.html` answers every
// missing path with `index.html`, and 200, which would hide a missing association file from Apple).

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ASSOCIATION, buildSite, checkAssociation, checkHeaders, SOURCE } from "./build.ts";

const APP_ID = "ABCDE12345.app.tadayo";
const association = (details: unknown) => JSON.stringify({ applinks: { details } });

describe("checkAssociation", () => {
  it("takes the iOS 13 form of the file, which is Tadayo's own rule: details, each with app IDs and components", () => {
    expect(checkAssociation(association([]))).toEqual([]);
    expect(
      checkAssociation(
        association([
          {
            appIDs: [APP_ID, "ABCDE12345.app.tadayo.share"],
            components: [{ "/": "/i", comment: "invitations" }, { "/": "/c/*/d/*/*" }],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("says what is wrong with a file that isn't that, one problem each", () => {
    const cases: [string, string, string][] = [
      ["not JSON", "applinks {", "isn't JSON"],
      ["a list", "[]", "isn't an object"],
      ["no applinks", "{}", "has no applinks"],
      [
        "a stray key",
        JSON.stringify({ applinks: { details: [] }, webcredentials: {} }),
        "has a key other than applinks: webcredentials",
      ],
      ["details that isn't a list", JSON.stringify({ applinks: { details: {} } }), "applinks.details isn't a list"],
      ["a detail with no app IDs", association([{ components: [] }]), "detail 1 has no appIDs"],
      ["an empty list of app IDs", association([{ appIDs: [], components: [] }]), "detail 1 has no appIDs"],
      [
        "a team ID in lowercase",
        association([{ appIDs: ["abcde12345.app.tadayo"], components: [] }]),
        "detail 1: abcde12345.app.tadayo isn't a team ID and a bundle ID",
      ],
      [
        "no bundle ID",
        association([{ appIDs: ["ABCDE12345"], components: [] }]),
        "detail 1: ABCDE12345 isn't a team ID and a bundle ID",
      ],
      [
        "a placeholder",
        association([{ appIDs: ["TEAMID.app.tadayo"], components: [] }]),
        "detail 1: TEAMID.app.tadayo isn't a team ID and a bundle ID",
      ],
      [
        "components that isn't a list",
        association([{ appIDs: [APP_ID], components: "/i" }]),
        "detail 1: components isn't a list",
      ],
      ["no components", association([{ appIDs: [APP_ID] }]), "detail 1: components isn't a list"],
      // Apple takes the singular `appID` and a component with no `/` key (which matches every path):
      // these are refused on purpose, so a mistyped key can't claim the whole site without a word.
      ["Apple's singular appID", association([{ appID: APP_ID, components: [] }]), "detail 1 has no appIDs"],
      [
        "a component with only a fragment, which matches every path",
        association([{ appIDs: [APP_ID], components: [{ "#": "no_universal_links", exclude: true }] }]),
        "detail 1, component 1 has no path: a / key",
      ],
      [
        "a component with no path",
        association([{ appIDs: [APP_ID], components: [{ comment: "x" }] }]),
        "detail 1, component 1 has no path: a / key",
      ],
      [
        "a component path that isn't one",
        association([{ appIDs: [APP_ID], components: [{ "/": "i" }] }]),
        "detail 1, component 1: the path i doesn't start with a slash",
      ],
    ];
    for (const [name, text, problem] of cases) expect(checkAssociation(text), name).toEqual([problem]);
  });

  it("refuses a file Apple would refuse for its size", () => {
    const big = association([{ appIDs: [APP_ID], components: [{ "/": "/i", comment: "x".repeat(130 * 1024) }] }]);
    expect(checkAssociation(big)).toEqual(["is larger than 128 KB, which Apple's CDN refuses"]);
  });
});

describe("checkHeaders", () => {
  const RULE = "/.well-known/apple-app-site-association\n  Content-Type: application/json\n";

  it("wants the association file served as JSON", () => {
    expect(checkHeaders(RULE)).toEqual([]);
    expect(checkHeaders(`# a comment\n\n${RULE}`)).toEqual([]);
  });

  it("says what is missing or wrong", () => {
    expect(checkHeaders("")).toEqual(["has no rule for /.well-known/apple-app-site-association"]);
    expect(checkHeaders("/.well-known/apple-app-site-association\n  Content-Type: text/plain\n")).toEqual([
      "serves /.well-known/apple-app-site-association as text/plain, and not as application/json",
    ]);
    expect(checkHeaders("/.well-known/apple-app-site-association\n  X-Other: 1\n")).toEqual([
      "has no Content-Type for /.well-known/apple-app-site-association",
    ]);
    expect(checkHeaders(`/*\n  X-Other: 1\n${RULE}`)).toEqual([]);
  });

  it("reads the file as Pages does: a line is trimmed, so a header needs no indentation, and a path starts with a slash", () => {
    expect(checkHeaders("/.well-known/apple-app-site-association\nContent-Type: application/json\n")).toEqual([]);
    expect(
      checkHeaders("  /.well-known/apple-app-site-association  \r\n\tContent-Type: application/json  \r\n"),
    ).toEqual([]);
    expect(checkHeaders("/.well-known/apple-app-site-association\nContent-Type: text/plain\n")).toEqual([
      "serves /.well-known/apple-app-site-association as text/plain, and not as application/json",
    ]);
  });

  it("refuses a second rule for the association's path, since what Pages makes of a path written twice isn't something to lean on", () => {
    const second = "/.well-known/apple-app-site-association\n  X-Other: 1\n";
    expect(checkHeaders(`${RULE}${second}`)).toEqual([
      "has 2 rules for /.well-known/apple-app-site-association: it wants one, so that the type served doesn't depend on how Pages treats a path written twice",
    ]);
    expect(checkHeaders(`${second}${RULE}`)).toEqual([
      "has 2 rules for /.well-known/apple-app-site-association: it wants one, so that the type served doesn't depend on how Pages treats a path written twice",
    ]);
  });

  it("refuses a Content-Type set or removed under any other path, since Pages applies every rule that matches", () => {
    const sets = "/.well-known/*\n  Content-Type: text/plain\n";
    const removes = "/*\n  ! Content-Type\n";
    expect(checkHeaders(`${sets}${RULE}`)).toEqual([
      "sets or removes Content-Type for /.well-known/*, and Pages applies every rule that matches, so it could change the type of /.well-known/apple-app-site-association",
    ]);
    expect(checkHeaders(`${RULE}${removes}`)).toEqual([
      "sets or removes Content-Type for /*, and Pages applies every rule that matches, so it could change the type of /.well-known/apple-app-site-association",
    ]);
    expect(checkHeaders(`${RULE}${sets}${removes}`)[0]).toContain("for /.well-known/*, /*,");
    // A header whose name only contains it is another header.
    expect(checkHeaders(`/*\n  X-Content-Type-Options: nosniff\n${RULE}`)).toEqual([]);
  });

  it("refuses the association's own rule when it removes the Content-Type, beside setting it or not", () => {
    expect(checkHeaders("/.well-known/apple-app-site-association\n  ! Content-Type\n")).toEqual([
      "removes the Content-Type of /.well-known/apple-app-site-association",
    ]);
    expect(
      checkHeaders("/.well-known/apple-app-site-association\n  Content-Type: application/json\n  ! Content-Type\n"),
    ).toEqual(["removes the Content-Type of /.well-known/apple-app-site-association"]);
  });
});

describe("buildSite", () => {
  const made: string[] = [];
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "tadayo-web-"));
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A folder holding these files; a file whose content is `undefined` isn't made. */
  function site(files: Record<string, string | undefined>): string {
    const root = scratch();
    for (const [path, content] of Object.entries(files)) {
      if (content === undefined) continue;
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }
  const GOOD = {
    ".well-known/apple-app-site-association": association([]),
    _headers: "/.well-known/apple-app-site-association\n  Content-Type: application/json\n",
    "index.html": "<!doctype html><title>Tadayo</title>",
    "404.html": "<!doctype html><title>Not found</title>",
  };
  /** A build, as a function for `toThrow`, which says nothing. */
  const quietly = (source: string, out: string) => () => {
    buildSite({ source, out, say: () => undefined });
  };
  const treeOf = (dir: string): string[] => readdirSync(dir, { recursive: true, encoding: "utf8" }).sort();

  it("copies the site whole, dot-folders included, into an empty folder, and says what it made", () => {
    const source = site(GOOD);
    const out = join(scratch(), "dist");
    const lines: string[] = [];
    buildSite({ source, out, say: (line) => lines.push(line) });
    expect(treeOf(out)).toEqual(treeOf(source));
    expect(readFileSync(join(out, ASSOCIATION), "utf8")).toBe(GOOD[".well-known/apple-app-site-association"]);
    expect(lines).toEqual(["web: 4 files copied"]);
  });

  it("replaces what a build before it left, so a file that was taken out isn't kept", () => {
    const source = site(GOOD);
    const out = site({ "old.html": "stale", ".well-known/stale": "{}" });
    buildSite({ source, out, say: () => undefined });
    expect(treeOf(out)).not.toContain("old.html");
    expect(treeOf(out)).not.toContain(join(".well-known", "stale"));
  });

  it("builds nothing when the association file is missing or wrong, and leaves the old output as it was", () => {
    const out = site({ "keep.html": "kept" });
    const cases: [string, Record<string, string | undefined>, string][] = [
      [
        "missing",
        { ".well-known/apple-app-site-association": undefined },
        "has no .well-known/apple-app-site-association",
      ],
      ["wrong", { ".well-known/apple-app-site-association": "{}" }, "has no applinks"],
      ["no headers file", { _headers: undefined }, "has no _headers"],
      ["not served as JSON", { _headers: "" }, "has no rule for /.well-known/apple-app-site-association"],
      ["no 404 page", { "404.html": undefined }, "has no 404.html"],
    ];
    for (const [name, change, problem] of cases) {
      const source = site({ ...GOOD, ...change });
      expect(quietly(source, out), name).toThrow(problem);
      expect(treeOf(out), name).toEqual(["keep.html"]);
    }
  });

  it("says the association file's rules are Tadayo's own, when one of them refused it, and not for any other problem", () => {
    const out = scratch();
    const note =
      "web: the rules for .well-known/apple-app-site-association are Tadayo's own, stricter than Apple's format: checkAssociation in apps/web/src/build.ts says which";
    const refused = site({
      ...GOOD,
      ".well-known/apple-app-site-association": JSON.stringify({ applinks: { details: [] }, webcredentials: {} }),
    });
    let said = "";
    try {
      buildSite({ source: refused, out, say: () => undefined });
    } catch (error) {
      said = error instanceof Error ? error.message : "";
    }
    expect(said.split("\n")).toEqual([
      "web: .well-known/apple-app-site-association has a key other than applinks: webcredentials",
      note,
    ]);
    // A problem with the headers or the 404 page is not about those rules.
    let other = "";
    try {
      buildSite({ source: site({ ...GOOD, _headers: "", "404.html": undefined }), out, say: () => undefined });
    } catch (error) {
      other = error instanceof Error ? error.message : "";
    }
    expect(other).toContain("web: _headers has no rule for");
    expect(other).not.toContain("Tadayo's own");
  });

  it("refuses a source or an output that is the other's folder, so a build can't erase the site", () => {
    const source = site(GOOD);
    expect(quietly(source, source)).toThrow(/same folder/);
    expect(quietly(source, join(source, "dist"))).toThrow(/inside the source/);
    expect(quietly(join(source, ".well-known"), source)).toThrow(/contains the source/);
  });
});

describe("the site in public/", () => {
  it("builds, and has what Cloudflare Pages and Apple need", () => {
    const out = join(mkdtempSync(join(tmpdir(), "tadayo-web-")), "dist");
    try {
      buildSite({ source: SOURCE, out, say: () => undefined });
      const tree = readdirSync(out, { recursive: true, encoding: "utf8" }).sort();
      expect(tree).toEqual(
        expect.arrayContaining([
          ".well-known",
          join(".well-known", "apple-app-site-association"),
          "_headers",
          "404.html",
          "index.html",
        ]),
      );
      // The association file has no extension: Apple fetches exactly this path.
      expect(tree.filter((path) => path.includes("apple-app-site-association"))).toEqual([
        join(".well-known", "apple-app-site-association"),
      ]);
    } finally {
      rmSync(join(out, ".."), { recursive: true, force: true });
    }
  });

  it("claims one app, Tadayo's, for one path, an invitation link's /i, so no other page of tadayo.app opens the app", () => {
    const text = readFileSync(join(SOURCE, ASSOCIATION), "utf8");
    expect(checkAssociation(text)).toEqual([]);
    expect(JSON.parse(text)).toEqual({
      applinks: {
        details: [
          { appIDs: ["62N556GMFP.app.tadayo"], components: [{ "/": "/i", comment: expect.any(String) as unknown }] },
        ],
      },
    });
  });

  it("claims the path of the invitation link the contract gives, with the token in its fragment, never in its path", () => {
    // The contract's example of createInvitation's link (InvitationLink.url), as the server makes it.
    const contract = readFileSync(join(SOURCE, "..", "..", "..", "packages", "contracts", "openapi.yaml"), "utf8");
    const links = [...contract.matchAll(/url: (https:\/\/tadayo\.app\/\S*)/g)].map((match) => new URL(match[1] ?? ""));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.pathname).toBe("/i");
      expect(link.search).toBe("");
      expect(link.hash.length).toBeGreaterThan(1);
    }
  });

  it("makes no request, and carries no script, so a page of it can't send anything anywhere", () => {
    for (const name of ["index.html", "404.html"]) {
      const text = readFileSync(join(SOURCE, name), "utf8");
      expect(text, name).not.toMatch(/<script|<link|<img|<iframe|https?:\/\/|src=|href=/i);
      expect(text, name).toMatch(/<meta name="robots" content="noindex"\s*\/?>/);
    }
  });
});
