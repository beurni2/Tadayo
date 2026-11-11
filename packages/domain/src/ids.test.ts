import { describe, expect, it } from "vitest";
import { newId } from "./ids.ts";

describe("new ids (T10, T15)", () => {
  it("are a prefix, an underscore and 128 random bits in base64url, inside the contract's Id and the schema's app.id", () => {
    for (const prefix of ["acct", "a", "inv", "x1", "abcdefghijklmnop"]) {
      const id = newId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}_[A-Za-z0-9_-]{22}$`));
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(Buffer.from(id.slice(prefix.length + 1), "base64url")).toHaveLength(16);
    }
  });

  it("never repeat, and carry no order: a thousand ids differ, and sorted they aren't in the order made", () => {
    const made = Array.from({ length: 1000 }, () => newId("acct"));
    expect(new Set(made).size).toBe(1000);
    expect([...made].sort()).not.toEqual(made);
  });

  it("refuse a prefix that isn't one", () => {
    for (const prefix of ["", "Acct", "1a", "a_b", "a-b", "a b", "é", "abcdefghijklmnopq", "a\n"]) {
      expect(() => newId(prefix), JSON.stringify(prefix)).toThrow(/prefix/);
    }
  });
});
