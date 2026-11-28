/// <reference lib="esnext.temporal" />
// A roster applied: the people who accepted it join (spec 04, 32; T1, T6, T7, T8; A01; FQ54, FQ65, FQ84,
// FQ100, FQ120; docs/plans/api-b1-clubs.md, section 4). `acceptInvitation` and `approveRoster` each call
// `applyIfReady` after their own change, in their transaction, under the club's row, so whichever of the
// last approval and the first acceptance comes second applies the roster (FQ65: either order).
//
// A revision is ready when it is open and sealed, its members are exactly the club's active members,
// every one of them has approved it, and at least one of its candidates has accepted it with a link bound
// to an account that is still active and whose profile name is still the label the revision shows: an
// acceptance stands for the name the members read and approve, so an account that changed its name after
// accepting joins nobody until it accepts again, which makes the rename's revision (FQ66, FQ84). Then, at
// the command's own sample of the clock:
// 1. Six (A01): the members and the people joining are at most `CLUB_SIZE`, else CLUB_FULL. The six count
//    every open candidate when they are proposed, so no command leads here.
// 2. The revision ends as applied, its `version` up by one.
// 3. Each candidate who accepted joins, in the revision's order: a new membership interval that inherits
//    nothing (T8), `joined_at` the command's sample, taken under the club's row, which is what makes
//    `reservedSince` sound (../idempotency/receipt.ts); the candidate ends as joined. A candidate who
//    accepted with an account that is no longer active (a deletion has begun, T27) doesn't join: that
//    candidate ends.
// 4. The club's `roster_version` moves by one, once for the whole command. A club that hadn't started
//    starts now (FQ54, FQ84), and its first days open in this transaction (../schedule/open.ts). In a
//    club that had started, ../schedule/settle.ts says what the people who joined do to its first days:
//    they are included while no day is confirmed (FQ55, FQ102); once one is, they join with no day; and
//    a club whose first days ended with nobody to confirm them opens new ones. Then
//    ../schedule/settle-change.ts settles a new member's pick (FQ100, FQ125, FQ126, FQ131): in a club
//    whose first days have applied, the people who joined with no day pick free days, in a new pick or
//    added to the open one, and nobody else is asked anything; where the free days are too few, as when a
//    fourth member joins three, the others' second days are freed now.
// 5. The candidates who hadn't accepted, or whose acceptance no longer stands, are carried into a new revision the server makes (FQ120's
//    default): the same proposer, whose approval of them stands as it did when they proposed (FQ60), the
//    club's members now, the people who just joined included, and the carried candidates at their own
//    labels, in their order, with no acceptance. Every other member approves it, the newly joined too:
//    they accepted a roster as candidates, and approve an addition as members (spec 04: "Existing members
//    approve any additions, including initial people added after they accepted a smaller roster"). So no
//    open candidate is ever left on no open revision, holding one of the six places for good. Should the
//    proposer no longer be a member, nobody can stand behind the carried candidates, and they end.

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import { openFirstDays } from "../schedule/open.ts";
import { settleChange } from "../schedule/settle-change.ts";
import { settleFirstDays } from "../schedule/settle.ts";
import type { ClockSql, ServerNow } from "../time/clock.ts";
import { CLUB_SIZE } from "./club.ts";
import { Fault } from "../fault.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

function shape(): Error {
  return new Fault("apply_roster_1", "clubs: the roster came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

export interface CarriedCandidate {
  readonly candidateId: string;
  readonly label: string;
}

export interface NewRevision {
  /** An id the caller made first, when an earlier revision must name this one as it ends. */
  readonly id?: string;
  readonly clubId: string;
  readonly origin: "proposal" | "rename";
  /** The interval the revision names as its proposer. */
  readonly proposer: string;
  readonly at: ServerNow;
  /** Its candidates, in their order, each by the label it shows. */
  readonly candidates: readonly CarriedCandidate[];
  /** The proposer's approval by proposing (FQ60): only in a member's proposal, never for a name (FQ84). */
  readonly implicit: boolean;
}

/**
 * Writes a revision the server makes, sealed, with exactly the club's active members, and returns its id.
 * The caller holds the club's row, has ended the club's earlier open revision, and moves `roster_version`.
 */
export async function writeRevision(tx: QuerySql, revision: NewRevision): Promise<string> {
  const { clubId, at } = revision;
  const id = revision.id ?? newId("rev");
  await bound(tx)`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${id}, ${clubId}, ${revision.origin}, ${revision.proposer}, ${at}::pg_catalog.timestamptz)`;
  await bound(tx)`
    INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
    SELECT ${id}, m.club_id, m.interval_id
      FROM app.memberships m WHERE m.club_id = ${clubId} AND m.state = 'active'`;
  for (const [index, candidate] of revision.candidates.entries()) {
    await bound(tx)`
      INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
      VALUES (${id}, ${clubId}, ${candidate.candidateId}, ${candidate.label},
              ${String(index + 1)}::pg_catalog.int2)`;
  }
  await bound(tx)`
    UPDATE app.roster_revisions SET roster_sealed_at = ${at}::pg_catalog.timestamptz WHERE id = ${id}`;
  if (revision.implicit) {
    await bound(tx)`
      INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
      VALUES (${id}, ${revision.proposer}, 'approved', true, ${at}::pg_catalog.timestamptz)`;
  }
  return id;
}

export interface Joined {
  readonly userId: string;
  readonly candidateId: string;
  /** The new membership interval. */
  readonly intervalId: string;
}

export interface AppliedRoster {
  /** The people who joined, in the revision's order. */
  readonly joined: readonly Joined[];
  /** The club started with this roster. */
  readonly started: boolean;
  /** The revision the candidates who hadn't accepted were carried into, or null. */
  readonly carriedInto: string | null;
}

/**
 * Applies the revision when it is ready, at `at`, the sample the calling command took under the club's
 * row, and says what it did; null when it isn't ready, and then nothing is changed. Throws `Refused`
 * CLUB_FULL.
 */
export async function applyIfReady(
  tx: QuerySql & ClockSql,
  at: ServerNow,
  clubId: string,
  revisionId: string,
): Promise<AppliedRoster | null> {
  const [row] = await bound(tx)`
    SELECT r.proposed_by_interval_id,
           (SELECT pm.state = 'active' FROM app.memberships pm
             WHERE pm.interval_id = r.proposed_by_interval_id) AS proposer_active,
           NOT EXISTS (SELECT FROM app.roster_revision_members rm
                        WHERE rm.revision_id = r.id
                          AND NOT EXISTS (SELECT FROM app.roster_approvals a
                                           WHERE a.revision_id = rm.revision_id AND a.interval_id = rm.interval_id
                                             AND a.decision = 'approved')) AS approved,
           NOT EXISTS (SELECT FROM app.memberships m
                        WHERE m.club_id = r.club_id AND m.state = 'active'
                          AND NOT EXISTS (SELECT FROM app.roster_revision_members rm
                                           WHERE rm.revision_id = r.id AND rm.interval_id = m.interval_id))
             AND NOT EXISTS (SELECT FROM app.roster_revision_members rm
                               JOIN app.memberships m ON m.interval_id = rm.interval_id
                              WHERE rm.revision_id = r.id AND m.state <> 'active') AS exact,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.memberships m
             WHERE m.club_id = r.club_id AND m.state = 'active') AS members,
           c.activated_at IS NOT NULL AS activated,
           (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'candidate_id', rc.candidate_id, 'label', rc.label, 'open', k.state = 'open',
                     'accepted', rc.accepted_invitation_id IS NOT NULL,
                     'user_id', i.bound_user_id, 'active', coalesce(u.state = 'active', false),
                     'named', coalesce(u.display_name = rc.label, false))
                     ORDER BY rc.position)
              FROM app.roster_revision_candidates rc
              JOIN app.candidates k ON k.id = rc.candidate_id
              LEFT JOIN app.invitations i ON i.id = rc.accepted_invitation_id
              LEFT JOIN app.users u ON u.id = i.bound_user_id
             WHERE rc.revision_id = r.id) AS candidates
      FROM app.roster_revisions r
      JOIN app.clubs c ON c.id = r.club_id
     WHERE r.id = ${revisionId} AND r.club_id = ${clubId} AND r.state = 'open' AND r.roster_sealed_at IS NOT NULL`;
  if (row === undefined) return null;
  const members = row["members"];
  if (typeof members !== "number" || !Number.isInteger(members)) throw shape();
  const listed = row["candidates"];
  if (!Array.isArray(listed)) throw shape();
  const candidates = (listed as unknown[]).map((entry) => {
    const candidate = record(entry);
    const accepted = flag(candidate["accepted"]);
    return {
      candidateId: text(candidate["candidate_id"]),
      label: text(candidate["label"]),
      open: flag(candidate["open"]),
      accepted,
      userId: accepted ? text(candidate["user_id"]) : null,
      active: flag(candidate["active"]),
      named: flag(candidate["named"]),
    };
  });
  // An acceptance stands while the account's profile name is the label the members read and approve
  // (FQ66, FQ84). An account that changed its name since joins nobody: it accepts again, which makes the
  // rename's revision, and until then it is carried like someone who hasn't accepted.
  const standing = (candidate: (typeof candidates)[number]) => candidate.open && candidate.accepted && candidate.named;
  // An account that accepted and is no longer active (a deletion has begun, T27) ends, whatever its name.
  const gone = (candidate: (typeof candidates)[number]) => candidate.open && candidate.accepted && !candidate.active;
  const joining = candidates.filter((candidate) => standing(candidate) && candidate.active);
  if (!flag(row["approved"]) || !flag(row["exact"]) || joining.length === 0) return null;

  // 1. Six.
  if (members + joining.length > CLUB_SIZE) throw new Refused("CLUB_FULL");

  // 2. The revision is applied.
  await bound(tx)`
    UPDATE app.roster_revisions
       SET state = 'applied', version = version + 1, ended_at = ${at}::pg_catalog.timestamptz
     WHERE id = ${revisionId}`;

  // 3. The people who accepted join; an account being deleted doesn't.
  const joined: Joined[] = [];
  for (const candidate of joining) {
    const userId = candidate.userId;
    if (userId === null) throw shape();
    const intervalId = newId("mem");
    await bound(tx)`
      INSERT INTO app.memberships
        (interval_id, club_id, user_id, origin, joined_via_revision_id, joined_via_candidate_id, joined_at)
      VALUES (${intervalId}, ${clubId}, ${userId}, 'roster', ${revisionId}, ${candidate.candidateId},
              ${at}::pg_catalog.timestamptz)`;
    await bound(tx)`
      UPDATE app.candidates SET state = 'joined', ended_at = ${at}::pg_catalog.timestamptz
       WHERE id = ${candidate.candidateId}`;
    joined.push({ userId, candidateId: candidate.candidateId, intervalId });
  }
  for (const candidate of candidates) {
    if (gone(candidate)) {
      await bound(tx)`
        UPDATE app.candidates SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz
         WHERE id = ${candidate.candidateId}`;
    }
  }

  // 4. The club's roster moved, and a club that hadn't started starts, with its first days.
  const started = !flag(row["activated"]);
  await bound(tx)`
    UPDATE app.clubs
       SET roster_version = roster_version + 1,
           activated_at = coalesce(activated_at, ${at}::pg_catalog.timestamptz)
     WHERE id = ${clubId}`;
  // The first days are dated by the command's own sample, the one `activated_at` and `joined_at` hold.
  if (started) await openFirstDays(tx, { sample: () => Promise.resolve(at) }, clubId);
  // A club that had started: what the people who joined do to its first days (FQ55, FQ100, FQ102), and,
  // once those have applied, to its week: a membership change (FQ56, FQ125).
  else {
    await settleFirstDays(tx, at, clubId);
    await settleChange(tx, at, clubId);
  }

  // 5. The candidates who hadn't accepted go on, in a new revision (FQ120).
  const left = candidates.filter((candidate) => candidate.open && !standing(candidate) && !gone(candidate));
  let carriedInto: string | null = null;
  if (left.length > 0) {
    if (row["proposer_active"] === true) {
      carriedInto = await writeRevision(tx, {
        clubId,
        origin: "proposal",
        proposer: text(row["proposed_by_interval_id"]),
        at,
        candidates: left.map(({ candidateId, label }) => ({ candidateId, label })),
        implicit: true,
      });
    } else {
      for (const candidate of left) {
        await bound(tx)`
          UPDATE app.candidates SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz
           WHERE id = ${candidate.candidateId}`;
      }
    }
  }
  return { joined, started, carriedInto };
}
