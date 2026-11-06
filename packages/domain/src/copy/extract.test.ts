import { describe, expect, it } from "vitest";
import { decode } from "./cli.ts";
import { extractEntries, extractStrings, isStringFile } from "./extract.ts";

describe("isStringFile", () => {
  it("knows the string files", () => {
    expect(["a/Localizable.xcstrings", "b/InfoPlist.strings", "apps/web/i.html"].map(isStringFile)).toEqual([
      true,
      true,
      true,
    ]);
  });
  it("ignores other files", () => {
    expect(["a.ts", "a.json", "a.swift", "a.md"].map(isStringFile)).toEqual([false, false, false, false]);
  });
  it("refuses a kind it doesn't know", () => {
    expect(() => extractStrings("a.json", "{}")).toThrow(/can't read/u);
  });
});

describe(".xcstrings", () => {
  const catalog = JSON.stringify({
    sourceLanguage: "en",
    strings: {
      "Add a drop": { comment: "Sent is fine in a comment" },
      "home.empty": {
        localizations: {
          en: { stringUnit: { state: "translated", value: "Nothing added for this day" } },
          fr: {
            variations: {
              plural: {
                one: { stringUnit: { state: "translated", value: "Une photo" } },
                other: { stringUnit: { state: "translated", value: "Her photos" } },
              },
            },
          },
        },
      },
    },
    version: "1.0",
  });

  it("reads every key and every value, never the comments", () => {
    expect(extractStrings("L.xcstrings", catalog)).toEqual([
      "Add a drop",
      "home.empty",
      "Nothing added for this day",
      "Une photo",
      "Her photos",
    ]);
  });
});

describe("extractEntries", () => {
  it("gives each catalog value its key, and a key, a .strings or an .html string none", () => {
    const catalog = JSON.stringify({
      strings: {
        "auth.code.sentTo": { localizations: { en: { stringUnit: { state: "translated", value: "Sent to %@" } } } },
      },
    });
    expect(extractEntries("L.xcstrings", catalog)).toEqual([
      { key: null, text: "auth.code.sentTo" },
      { key: "auth.code.sentTo", text: "Sent to %@" },
    ]);
    expect(extractEntries("a.strings", '"a" = "b";')).toEqual([
      { key: null, text: "a" },
      { key: null, text: "b" },
    ]);
    expect(extractEntries("i.html", "<p>Hi</p>")).toEqual([{ key: null, text: "Hi" }]);
  });
});

describe(".strings", () => {
  it("reads keys and values with escapes, never the comments", () => {
    const file = '/* Sent */\n// Her\n"title" = "It\\"s your day";\n"body" = "Two\\nlines";\n';
    expect(extractStrings("a.strings", file)).toEqual(["title", 'It"s your day', "body", "Two\nlines"]);
  });

  it("decodes Apple's \\U escapes", () => {
    expect(extractStrings("a.strings", '"a" = "Open\\U0021";')).toEqual(["a", "Open!"]);
  });

  it("decodes UTF-16 without a byte-order mark", () => {
    const le = Buffer.from('"a" = "Sent";', "utf16le");
    const be = Buffer.from(le);
    be.swap16();
    expect(decode(le)).toBe('"a" = "Sent";');
    expect(decode(be)).toBe('"a" = "Sent";');
  });

  it("decodes UTF-16 with a byte-order mark", () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('"a" = "Sent";', "utf16le")]);
    const be = Buffer.from(le);
    be.swap16();
    expect(decode(le)).toBe('"a" = "Sent";');
    expect(decode(be)).toBe('"a" = "Sent";');
    expect(decode(Buffer.from('\uFEFF"a" = "b";'))).toBe('"a" = "b";');
  });
});

describe(".html", () => {
  it("reads text and the attributes people read or hear, never markup, scripts or comments", () => {
    const page = `<!doctype html><html><head><title>Tadayo</title>
      <meta name="description" content="A club of friends">
      <style>a::after { content: "!"; }</style><script>alert("!")</script></head>
      <body><!-- Sent! --><img src="x.png" alt="Debby&#39;s pick"><p>Get &excl; Tadayo</p>
      <input placeholder='Your name'><p aria-description="Opens Friday">x</p>
      <select><option label="Kitchen table">k</option></select></body></html>`;
    expect(extractStrings("i.html", page)).toEqual([
      "A club of friends",
      "Debby's pick",
      "Your name",
      "Opens Friday",
      "Kitchen table",
      "Tadayo",
      "Get ! Tadayo",
      "x",
      "k",
    ]);
  });
});
