// Reads the system copy out of each kind of string file the copy lint covers:
// - `.xcstrings` (Xcode's string catalogs): every key and every localized value;
// - `.strings` (the older Apple format): every key and value;
// - `.html` (apps/web): the text between tags and the attributes people read or hear.
// A file kind the lint doesn't know is an error, so a new kind is added here on purpose.

export const STRING_FILE_EXTENSIONS = [".xcstrings", ".strings", ".html"] as const;

export function isStringFile(path: string): boolean {
  return STRING_FILE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function extractStrings(path: string, content: string): string[] {
  if (path.endsWith(".xcstrings")) return fromXcstrings(content);
  if (path.endsWith(".strings")) return fromStrings(content);
  if (path.endsWith(".html")) return fromHtml(content);
  throw new Error(`The copy lint can't read ${path}: not a string file it knows`);
}

function fromXcstrings(content: string): string[] {
  const catalog = JSON.parse(content) as { strings?: Record<string, unknown> };
  const out: string[] = [];
  for (const [key, entry] of Object.entries(catalog.strings ?? {})) {
    out.push(key);
    collectStringUnits(entry, out);
  }
  return out;
}

function collectStringUnits(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectStringUnits(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "comment") continue; // a note for translators, never shown
    if (key === "stringUnit" && value !== null && typeof value === "object") {
      const unit = value as { value?: unknown };
      if (typeof unit.value === "string") out.push(unit.value);
      continue;
    }
    collectStringUnits(value, out);
  }
}

// `"key" = "value";` pairs, with /* */ and // comments between them.
function fromStrings(content: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === "/" && content[i + 1] === "*") {
      const end = content.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
    } else if (c === "/" && content[i + 1] === "/") {
      const end = content.indexOf("\n", i);
      i = end === -1 ? content.length : end + 1;
    } else if (c === '"') {
      let j = i + 1;
      let text = "";
      while (j < content.length && content[j] !== '"') {
        if (content[j] === "\\" && j + 1 < content.length) {
          const next = content[j + 1] ?? "";
          const hex = /^[0-9a-f]{4}$/iu.exec(content.slice(j + 2, j + 6));
          if ((next === "U" || next === "u") && hex) {
            // Apple's \U0021 escape: the character itself is what people read.
            text += String.fromCharCode(parseInt(hex[0], 16));
            j += 6;
            continue;
          }
          text += next === "n" ? "\n" : next === "t" ? "\t" : next;
          j += 2;
        } else {
          text += content[j] ?? "";
          j += 1;
        }
      }
      out.push(text);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

const READ_ATTRIBUTES =
  /\s(?:alt|title|label|placeholder|content|value|aria-label|aria-description|aria-roledescription|aria-valuetext|aria-placeholder)\s*=\s*("([^"]*)"|'([^']*)')/giu;

function fromHtml(content: string): string[] {
  const body = content
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<!doctype[^>]*>/giu, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, " ");
  const out: string[] = [];
  for (const tag of body.matchAll(/<[^>]*>/gu)) {
    for (const attr of tag[0].matchAll(READ_ATTRIBUTES)) {
      out.push(decodeEntities(attr[2] ?? attr[3] ?? ""));
    }
  }
  for (const text of body.split(/<[^>]*>/u)) {
    const decoded = decodeEntities(text).trim();
    if (decoded !== "") out.push(decoded);
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  excl: "!",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1] === "x" || code[1] === "X";
      const point = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}
