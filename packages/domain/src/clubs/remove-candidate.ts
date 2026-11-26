/// <reference lib="esnext.temporal" />
// Remove someone invited who hasn't joined (the contract's `removeCandidate`; the outside audit's A10; FQ148,
// answered by the founder on 26 November 2026; spec 04, 32; A01; T1, T7, T14, T15; FQ59, FQ60, FQ84, FQ121;
// docs/plans/api-b2-unpropose.md, section 2), in one READ COMMITTED transaction the caller opens. A refusal throws
// `Refused`, which rolls it back, so a refused request leaves nothing.
//
// Until it, a candidate ended only when a member declined the revision, when their proposer left (FQ121) or when a
// revision applied without them and their proposer had gone (FQ120). Their proposer couldn't decline, since proposing
// is their approval (FQ60), and revoking ends a link, not the candidate, so someone who never answered held a place of
// the club's six for good.
//
// 1. The candidate's club, the caller's membership of it, the club's row `FOR UPDATE`, and the caller's membership
//    again, under the lock: an active one, or NOT_FOUND, as `revokeInvitation` reads it. Then the candidate,
//    `FOR UPDATE`, if the interval read under the lock proposed it. Anyone else,
//    an id nobody has, and someone whose membership ended get the same NOT_FOUND, so the answer never tells another
//    member anything about the candidate (T14).
// 2. A candidate who has joined is a member, not a candidate: NOT_FOUND, as the proposer's list no longer shows them.
//    One already ended, by this or anything else, is answered as removed, and nothing moves: the state makes a repeat
//    answer as the first did, as a revoke does, so the operation takes no idempotency key (T19 is about commits a
//    retry could repeat).
// 3. The clock, after the locks (T1): every `ended_at` below.
// 4. The candidate ends. Every link of theirs stops working with it, by the candidate's state alone
//    (./invitation-preview.ts, `invitationStanding`; ./accept-invitation.ts): an unused link answers as a revoked one,
//    the neutral NOT_FOUND (FQ59), and an account that accepted sees `did_not_go_ahead`, never who or why.
// 5. The club's open revision, as a leave carries it (./leave-club.ts, step 6; FQ121): with other candidates still
//    open in it, a revision the server makes replaces it (./apply-roster.ts `writeRevision`): the club's members now,
//    the same proposer, whose approval by proposing stands (FQ60) unless the revision was a name's, which nobody has
//    approved (FQ84), the remaining candidates at their labels and in their order, with no acceptance. Every other
//    member approves it again, the remover too when someone else proposed it, and each remaining candidate accepts it
//    again, their links still good: the roster they accepted had the removed person in it (spec 04). With none, the
//    revision ends as did-not-go-ahead.
// 6. The club's `roster_version`, up by one.
//
// Nothing else is written: no membership, schedule or drop changes, and nobody is pushed (T36).

import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { writeRevision } from "./apply-roster.ts";

export interface RemoveCandidateInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The path's candidate. */
  readonly candidateId: string;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("clubs: a removal read a row it can't use");
  return value;
}

/** Removes the candidate in `tx`, or finds them removed, and returns their id. Throws `Refused`. */
export async function removeCandidate(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: RemoveCandidateInput,
): Promise<{ readonly candidateId: string }> {
  const { userId, candidateId } = input;
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("clubs: the caller is an account id");
  // An id that can't be one names no candidate, as one nobody has.
  if (typeof candidateId !== "string" || !ID.test(candidateId)) throw new Refused("NOT_FOUND");

  // 1. The candidate's club, the caller's membership of it, the club's row, the caller again, and the candidate.
  const [named] = await bound(tx)`SELECT club_id FROM app.candidates WHERE id = ${candidateId}`;
  const clubId = named?.["club_id"];
  if (typeof clubId !== "string") throw new Refused("NOT_FOUND");
  if ((await activeMember(tx, userId, clubId)) === null) throw new Refused("NOT_FOUND");
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  const proposer = await activeMember(tx, userId, clubId);
  if (proposer === null) throw new Refused("NOT_FOUND");
  const [candidate] = await bound(tx)`
    SELECT state FROM app.candidates
     WHERE id = ${candidateId} AND proposed_by_interval_id = ${proposer}
       FOR UPDATE`;
  if (candidate === undefined) throw new Refused("NOT_FOUND");

  // 2. Joined, or ended already.
  const state = text(candidate["state"]);
  if (state === "joined") throw new Refused("NOT_FOUND");
  if (state === "ended") return { candidateId };
  if (state !== "open") throw new Error("clubs: a removal read a row it can't use");

  // 3. The clock, after the locks.
  const at = await clock.sample(tx);

  // 4. The candidate.
  await bound(tx)`
    UPDATE app.candidates SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz WHERE id = ${candidateId}`;

  // 5. The club's open revision.
  const [open] = await bound(tx)`
    SELECT r.id, r.origin, r.proposed_by_interval_id
      FROM app.roster_revisions r
     WHERE r.club_id = ${clubId} AND r.state = 'open'`;
  if (open !== undefined) {
    const revisionId = text(open["id"]);
    const origin: unknown = open["origin"];
    if (origin !== "proposal" && origin !== "rename") throw new Error("clubs: a removal read a row it can't use");
    const carried = await bound(tx)`
      SELECT rc.candidate_id, rc.label
        FROM app.roster_revision_candidates rc
        JOIN app.candidates k ON k.id = rc.candidate_id
       WHERE rc.revision_id = ${revisionId} AND k.state = 'open'
       ORDER BY rc.position`;
    if (carried.length > 0) {
      const next = newId("rev");
      await bound(tx)`
        UPDATE app.roster_revisions
           SET state = 'superseded', version = version + 1, superseded_by_id = ${next},
               ended_at = ${at}::pg_catalog.timestamptz
         WHERE id = ${revisionId}`;
      await writeRevision(tx, {
        id: next,
        clubId,
        // What the ended revision was: a name nobody has approved yet stays one (FQ84).
        origin,
        proposer: text(open["proposed_by_interval_id"]),
        at,
        candidates: carried.map((row) => ({ candidateId: text(row["candidate_id"]), label: text(row["label"]) })),
        implicit: origin === "proposal",
      });
    } else {
      await bound(tx)`
        UPDATE app.roster_revisions
           SET state = 'did_not_go_ahead', version = version + 1, ended_at = ${at}::pg_catalog.timestamptz
         WHERE id = ${revisionId}`;
    }
  }

  // 6. The club's roster version.
  await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;
  return { candidateId };
}
