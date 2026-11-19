/// <reference lib="esnext.temporal" />
// Propose people for a club (the contract's `proposeRoster`; spec 04, 32; G01-invite-people, book p30; T1,
// T6, T7, T9, T14, T19, T33; A01; FQ51, FQ60, FQ112, FQ113; docs/plans/api-b1-clubs.md, section 3): a new
// revision of the exact roster, never a direct insertion, in one READ COMMITTED transaction the caller
// opens. A refusal throws `Refused`, which rolls it back, so a refused request leaves nothing, its receipt
// included. Nobody joins here, and no link is made: a candidate's proposer makes it next
// (./invitation.ts), and people join when the revision is applied (B1's next PR).
//
// 1. The caller's membership of the club (`activeMember`), before the receipt is looked at: someone with
//    nothing of the club never holds its row and never gets a stored answer, which names other people.
//    NOT_FOUND, for a first request and a retry alike (T14; FQ112's default).
// 2. The receipt (T19): the same request under the same key gets the first revision back, as it was
//    answered, though the roster has changed since; another request under it is IDEMPOTENCY_CONFLICT. Then
//    the club's row, `FOR UPDATE`: every command that changes a club's roster takes it first, the lock the
//    schema's own guards take (db/migrations/0003_people_and_clubs.sql `memberships_guard`, 0004's seal).
// 3. Who is asking, again, now that nothing of the roster can change under the lock: NOT_FOUND.
// 4. VERSION_CONFLICT with `current_version` when `expected_roster_version` isn't the club's.
// 5. Six (A01, T6): the active members, the candidates still open and the people proposed now are at most
//    `CLUB_SIZE`, else CLUB_FULL. It is `can_propose`'s rule (./club.ts), so CLUB_FULL is the answer
//    wherever `can_propose` is false.
// 6. The clock, sampled after the lock (T1). The receipt's own `created_at` is an earlier sample, which
//    decides nothing.
// 7. The change, in the order the schema's guards ask:
//    - the open revision, if there is one, ends as superseded by the new one, its `version` up by one
//      (its approvals no longer count: they are of another roster, T7);
//    - the new revision, a member's proposal, with exactly the club's active members as its members;
//    - the earlier revision's candidates still open, carried at their own labels and in their order, with
//      no acceptance (they accept again), then a new candidate for each person proposed now, positions
//      from 1;
//    - the seal, which the schema checks against the club's members;
//    - the proposer's approval, by proposing (FQ60), which the schema takes only of a sealed roster;
//    - the club's `roster_version`, up by one.
// 8. The answer: the new revision as its proposer reads it (./roster-revision.ts `readRevision`, the read
//    `getRosterRevision` runs), stored in the receipt and answered as the receipt keeps it (FQ113).

import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveReceipt, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { CLUB_SIZE } from "./club.ts";
import { readRevision, type RevisionSight } from "./roster-revision.ts";

export interface ProposeRosterInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's club. */
  readonly clubId: string;
  /** The roster version the caller read (`ClubDetail.roster_version`). */
  readonly expectedRosterVersion: number;
  /** The people proposed now, one to five, each by a label the contract has checked (`CandidateLabel`). */
  readonly add: readonly { readonly label: string }[];
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: ProposeRosterInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("clubs: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("clubs: the idempotency key is a UUID");
  }
  if (!Number.isInteger(input.expectedRosterVersion) || input.expectedRosterVersion < 0) {
    throw new TypeError("clubs: expected_roster_version is a whole number from 0");
  }
  if (
    !Array.isArray(input.add) ||
    input.add.length < 1 ||
    input.add.length >= CLUB_SIZE ||
    input.add.some((one: unknown) => typeof (one as { label?: unknown } | null)?.label !== "string")
  ) {
    throw new TypeError("clubs: a proposal adds one to five people, each by a label");
  }
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("clubs: the roster came back in a shape the schema doesn't allow");
  }
  return value;
}

/**
 * Proposes `input.add` for the club in `tx`, and returns what `render` makes of the new revision as its
 * proposer reads it, which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function proposeRoster(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: ProposeRosterInput,
  render: (revision: RevisionSight) => Json,
): Promise<Json> {
  check(input);
  const { userId, clubId } = input;
  // An id that can't be one names no club, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation: "proposeRoster",
      path: { club_id: clubId },
      query: {},
      body: {
        expected_roster_version: input.expectedRosterVersion,
        add: input.add.map(({ label }) => ({ label })),
      },
    },
  };

  // 1. The caller's membership of the club.
  if ((await activeMember(tx, userId, clubId)) === null) throw new Refused("NOT_FOUND");

  // 2. The receipt, then the club's row.
  const first = await reserveReceipt(tx, receipt, await clock.sample(tx));
  if (first !== null) return first.replay;
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;

  // 3. Who is asking.
  const proposer = await activeMember(tx, userId, clubId);
  if (proposer === null) throw new Refused("NOT_FOUND");

  // 4. The version. 5. Six.
  const [roster] = await bound(tx)`
    SELECT c.roster_version,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.memberships m
             WHERE m.club_id = c.id AND m.state = 'active') AS members,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.candidates k
             WHERE k.club_id = c.id AND k.state = 'open') AS open_candidates,
           (SELECT r.id FROM app.roster_revisions r WHERE r.club_id = c.id AND r.state = 'open') AS open_revision_id
      FROM app.clubs c WHERE c.id = ${clubId}`;
  if (roster === undefined) throw new Error("clubs: the club vanished under its own lock");
  const version = count(roster["roster_version"]);
  if (version !== input.expectedRosterVersion) throw new Refused("VERSION_CONFLICT", { current_version: version });
  if (count(roster["members"]) + count(roster["open_candidates"]) + input.add.length > CLUB_SIZE) {
    throw new Refused("CLUB_FULL");
  }
  const earlier = roster["open_revision_id"];
  if (earlier !== null && typeof earlier !== "string") {
    throw new Error("clubs: the roster came back in a shape the schema doesn't allow");
  }

  // 6. The clock, after the lock.
  const at = await clock.sample(tx);

  // 7. The change.
  const revisionId = newId("rev");
  if (earlier !== null) {
    await bound(tx)`
      UPDATE app.roster_revisions
         SET state = 'superseded', version = version + 1, superseded_by_id = ${revisionId},
             ended_at = ${at}::pg_catalog.timestamptz
       WHERE id = ${earlier}`;
  }
  await bound(tx)`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revisionId}, ${clubId}, 'proposal', ${proposer}, ${at}::pg_catalog.timestamptz)`;
  await bound(tx)`
    INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
    SELECT ${revisionId}, m.club_id, m.interval_id
      FROM app.memberships m WHERE m.club_id = ${clubId} AND m.state = 'active'`;
  let position = 0;
  if (earlier !== null) {
    const carried = await bound(tx)`
      INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
      SELECT ${revisionId}, rc.club_id, rc.candidate_id, rc.label,
             (pg_catalog.row_number() OVER (ORDER BY rc.position))::pg_catalog.int2
        FROM app.roster_revision_candidates rc
        JOIN app.candidates k ON k.id = rc.candidate_id
       WHERE rc.revision_id = ${earlier} AND k.state = 'open'
      RETURNING candidate_id`;
    position = carried.length;
  }
  for (const { label } of input.add) {
    const candidateId = newId("cand");
    position += 1;
    await bound(tx)`
      INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
      VALUES (${candidateId}, ${clubId}, ${proposer}, ${at}::pg_catalog.timestamptz)`;
    await bound(tx)`
      INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
      VALUES (${revisionId}, ${clubId}, ${candidateId}, ${label}, ${String(position)}::pg_catalog.int2)`;
  }
  await bound(tx)`
    UPDATE app.roster_revisions SET roster_sealed_at = ${at}::pg_catalog.timestamptz WHERE id = ${revisionId}`;
  await bound(tx)`
    INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
    VALUES (${revisionId}, ${proposer}, 'approved', true, ${at}::pg_catalog.timestamptz)`;
  await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;

  // 8. The answer.
  const revision = await readRevision(tx, userId, revisionId, at);
  if (revision === null) throw new Error("clubs: the revision its proposer just made can't be read");
  return completeReceipt(tx, receipt, render(revision), 201);
}
