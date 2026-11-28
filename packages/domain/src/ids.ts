// New ids (T10, T15; the contract's `Id`; db/migrations/0002_shared_rules.sql): a prefix that names the
// kind of thing, and 128 random bits, so an id says nothing of when or how many things were made, and
// knowing one grants nothing (T9, T14). Never a sequence, a UUID or anything time-ordered.

import { randomBytes } from "node:crypto";
import { InputFault } from "./fault.ts";

const PREFIX = /^[a-z][a-z0-9]{0,15}$/;

/** `acct_` and the like, then 16 random bytes in base64url: at most 64 characters, all of `Id`'s alphabet. */
export function newId(prefix: string): string {
  if (!PREFIX.test(prefix))
    throw new InputFault("ids_1", "ids: a prefix is 1 to 16 lowercase letters and digits, from a letter");
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}
