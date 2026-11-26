/// <reference lib="esnext.temporal" />
// A club made the way the product makes one, for the tests that need a week the commands wrote
// (tests/src/db/membership-change.test.ts, and the privacy matrix's new member's pick through the app): `createClub`,
// `proposeRoster`, `approveRoster`, `createInvitation`, `acceptInvitation`, `leaveClub` and
// `confirmScheduleDays`, each as its route runs it (./roster-world.ts), at the instant the caller's clock
// says. Members are in the order they joined (FQ98), so a caller moves its clock between two joins.

import { randomUUID } from "node:crypto";
import { leftClubBody } from "@tadayo/api";
import { confirmScheduleDays, leaveClub, readSchedule, type Json, type ProposalAnswer } from "@tadayo/domain";
import type { FakeClock } from "@tadayo/domain/testing";
import type { WorldTx } from "./harness.ts";
import { acceptWith, approve, founded, linkFor, plain, propose } from "./roster-world.ts";
import { newUser } from "./world.ts";

export interface MadeClub {
  club: string;
  /** Accounts and membership intervals, by the name each was given. */
  user: Record<string, string>;
  member: Record<string, string>;
}

/** A club `name` has just made, in New York's zone unless `timezone` names another: proposed, with nobody else. */
export async function foundedBy(tx: WorldTx, clock: FakeClock, name: string, timezone?: string): Promise<MadeClub> {
  const made = await founded(tx, clock, name, timezone);
  return { club: made.club, user: { [name]: made.user }, member: { [name]: made.interval } };
}

/** `proposer` proposes `name`, every other member approves, and `account` (else a new account of that name) accepts. */
export async function joinAs(
  tx: WorldTx,
  clock: FakeClock,
  c: MadeClub,
  name: string,
  proposer: string,
  account?: string,
): Promise<void> {
  const by = c.user[proposer] ?? "";
  const open = await propose(tx, clock, by, c.club, [name]);
  const candidate = open.candidates.find((each) => each.name === name)?.id ?? "";
  const active = await tx<{ user_id: string }[]>`
    SELECT user_id FROM app.memberships WHERE club_id = ${c.club} AND state = 'active'`;
  for (const { user_id: other } of active) {
    if (other !== by) await approve(tx, clock, other, open.id, open.version);
  }
  const made = await linkFor(tx, clock, by, c.club, candidate);
  const accepting = account ?? (await newUser(plain(tx), name));
  const answer = await acceptWith(tx, clock, accepting, made.token, open.id, open.version);
  if (answer.state !== "joined" || answer.club === undefined) throw new Error(`joinAs: ${name} is ${answer.state}`);
  c.user[name] = accepting;
  c.member[name] = answer.club.my_membership_id;
}

/** `name` leaves, keeping their drops. */
export async function leaveAs(tx: WorldTx, clock: FakeClock, c: MadeClub, name: string): Promise<void> {
  await tx.savepoint((sp) =>
    leaveClub(
      sp,
      clock,
      { userId: c.user[name] ?? "", key: randomUUID(), clubId: c.club, contributions: "keep" },
      leftClubBody,
    ),
  );
}

const asJson = (proposal: ProposalAnswer): Json => JSON.parse(JSON.stringify(proposal)) as Json;

/** `name` confirms the days they hold in the club's open proposal, having just read it. */
export async function confirmOwnDays(
  tx: WorldTx,
  clock: FakeClock,
  c: MadeClub,
  name: string,
): Promise<ProposalAnswer> {
  const userId = c.user[name] ?? "";
  const seen = (await readSchedule(tx, userId, c.club, await clock.sample(tx)))?.proposal ?? null;
  if (seen === null) throw new Error(`confirmOwnDays: ${name} sees no proposal`);
  const answer = await tx.savepoint((sp) =>
    confirmScheduleDays(
      sp,
      clock,
      { userId, key: randomUUID(), proposalId: seen.id, expectedVersion: seen.version, weekdays: seen.myDays },
      asJson,
    ),
  );
  return answer as unknown as ProposalAnswer;
}
