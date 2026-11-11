// The role password as Postgres stores it, so `bootstrap` gives `db/bootstrap.sql` a SCRAM verifier
// and the password never reaches the server's log (that file's header; T56). RFC 7677's own
// exchange (section 3) checks the keys without a database; tests/src/db/ops-bootstrap.test.ts
// checks the string against Postgres itself.

import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { scramVerifier } from "./scram.ts";

const b64 = (text: string) => Buffer.from(text, "base64");

describe("scramVerifier", () => {
  it("is Postgres's SCRAM-SHA-256 string: the iteration count, the salt, the stored key and the server key", () => {
    const verifier = scramVerifier("pencil", b64("W22ZaJ0SNY7soEsUEjb6gQ=="), 4096);
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:W22ZaJ0SNY7soEsUEjb6gQ==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/);
  });

  it("holds the keys of RFC 7677's own exchange, which a client proof and a server signature check", () => {
    const verifier = scramVerifier("pencil", b64("W22ZaJ0SNY7soEsUEjb6gQ=="), 4096);
    const keys = verifier.split("$")[2] ?? "";
    const [stored, server] = keys.split(":");
    const storedKey = b64(stored ?? "");
    const serverKey = b64(server ?? "");
    // RFC 7677, section 3: the messages of user "user" with the password "pencil".
    const nonce = "rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0";
    const authMessage = [
      "n=user,r=rOprNGfwEbeRWgbNEkqO",
      `r=${nonce},s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096`,
      `c=biws,r=${nonce}`,
    ].join(",");
    const proof = b64("dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=");
    const signature = createHmac("sha256", storedKey).update(authMessage).digest();
    const clientKey = Buffer.from(proof.map((byte, i) => byte ^ (signature[i] ?? 0)));
    expect(createHash("sha256").update(clientKey).digest().toString("base64")).toBe(storedKey.toString("base64"));
    expect(createHmac("sha256", serverKey).update(authMessage).digest().toString("base64")).toBe(
      "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
    );
  });

  it("makes a new salt each time, and keeps the password out of the string", () => {
    const password = "a-random-password-of-more-than-32-characters";
    const first = scramVerifier(password);
    const second = scramVerifier(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(first).toMatch(/^SCRAM-SHA-256\$4096:/);
  });

  it("takes printable ASCII only, which SASLprep leaves as it is; any other character would be stored changed", () => {
    expect(() => scramVerifier("pässword-of-many-characters-123456789")).toThrow(/printable ASCII/);
    expect(() => scramVerifier("tab\there-and-more-characters-1234567890")).toThrow(/printable ASCII/);
    expect(() => scramVerifier("line\nbreak-and-more-characters-1234567890")).toThrow(/printable ASCII/);
    expect(() => scramVerifier("")).toThrow(/printable ASCII/);
    expect(() => scramVerifier("a b c d e f g h i j k l m n o p q r s t u v w x y z")).not.toThrow();
  });

  it("never names the password when it refuses", () => {
    expect.assertions(1);
    try {
      scramVerifier("secretäsecret");
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain("secret");
    }
  });
});
