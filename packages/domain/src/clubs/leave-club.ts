/// <reference lib="esnext.temporal" />
// Leave a club (the contract's `leaveClub`; spec 04, 05, 18, 22, 32; G05-leave, book p30; T1, T7, T8, T9, T14,
// T18, T19, T22, T23, T24, T26, T33, T36; FQ16, FQ60, FQ63, FQ75, FQ80, FQ102, FQ112, FQ120 to FQ123, FQ125, FQ126,
// FQ142; docs/plans/api-b1-clubs.md, section 5; docs/plans/api-b2-leave-withdraw.md), in one READ COMMITTED
// transaction the caller opens. A refusal throws `Refused`, which rolls
// it back, so a refused request leaves nothing, its receipt included.
//
// 1. Who is asking (../authorization/member.ts): an active account with an active interval in a club that
//    isn't suspended (FQ122).
// 2. The receipt (T19). For a member, the rule every club command has (`reserveAsMember`, FQ112). For
//    anyone else, the receipt of this same request is answered as it was stored: a retry of a leave that
//    went through, whose first answer is still the caller's; not once the account has begun another
//    interval in the club, whether that one is active, ended or in a club suspended since (FQ112). With no
//    such receipt, and for a key the account used for another request, NOT_FOUND, and nothing
//    is kept: a stranger, a former member with a new key, an account being deleted, a suspended club and
//    an id nobody has all read alike (T14).
// 3. The club's row, `FOR UPDATE`. Then who is asking, again: the same interval, or NOT_FOUND.
// 4. The clock, after the lock (T1): `left_at`, and every `ended_at` below.
// 5. The membership ends, with the choice and the name the person has now (T26, FQ75). From here the
//    authorization module gives the account nothing of the club.
// 5a. The leaver's contributions (the outside audit's A3; docs/plans/api-b2-leave-withdraw.md). Each counter of
//    the leaving interval in the club with a live reservation, or, to withdraw, an active or held drop, in
//    occurrence id order, `FOR NO KEY UPDATE`, after the club's row and the membership's, as TECH-DESIGN orders
//    them. Every leave gives back the interval's live reservations: the lapsed ones settled as `expired` at their
//    own `expires_at`, the rest `released` at the instant and off the counts, since nobody can use them now (T18).
//    With `withdraw`, every drop of the interval in the club, active or held, revealed or not, is withdrawn at the
//    instant: its one removal, reason `leave`, by the interval; `withdrawn`, ended then, its pending replacement
//    let go; the leaver's highlight on it cleared (T22); and, before its day's reveal, its slot given back, while
//    after it none reopens (T3, T18; spec 22). Every read already leaves a withdrawn drop out (T23, T24). Only the
//    leaving interval's drops: an earlier interval's kept drops stay kept (FQ142).
// 6. The club's proposals (FQ121): the leaver's own open candidates end; the open revision ends, since it
//    lists the leaver; its other open candidates are carried into a revision the server makes
//    (./apply-roster.ts `writeRevision`), which supersedes it, when its proposer is still a member; else
//    it ends as did-not-go-ahead and its open candidates end with it. The new revision is what the ended
//    one was: a member's proposal keeps its proposer's approval by proposing (FQ60), and the revision of
//    a name nobody has approved (`rename`, FQ84) starts with no approval at all.
// 7. The club's `roster_version`, up by one.
// 8. The club's week, asked on every leave. First its first days (../schedule/settle.ts, FQ102, FQ123);
//    with none open that changes nothing, since the club has no first days to restart. While they are
//    open: with no day confirmed, a revision of the proposed week without the leaver, or their end with
//    one member left; with one confirmed, they apply when only confirmed members stay among those they
//    include, and end when the one member left hasn't confirmed or nobody they include is left. Then the
//    new member's pick (../schedule/settle-change.ts; FQ16, FQ125, FQ126, FQ131): in a club whose first
//    days have applied, nobody is asked anything and nobody moves, and the leaver's days are free; an open
//    pick loses the leaver, is replaced when the club's size changes the days each, applies when everyone
//    it still includes has confirmed, and ends when nobody it includes is left or the club is paused.
// 9. The answer, stored in the receipt and answered as the receipt keeps it.
//
// Nothing else is written. A club under two members is paused by its members' count (./club-state.ts,
// FQ16); the leaver's days that haven't opened are held by `left_at` (FQ63); leaving pushes to nobody (T36:
// spec 21 has no such event). A withdrawn drop's caption and media are purged, and its tombstone written, by B6's
// purge, as for every withdrawal (T27, T28); until then the media route, which reads the predicate, serves nothing
// of it (T12). A withdrawn drop is an authored withdrawal, whose notice to its day's star (spec 21) comes with the
// notifications (B8), from its removal row.

import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { completeReceipt, reserveAsMember, reserveReceipt, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { freeSlot, settleLapsed, type CounterKey } from "../drops/counter.ts";
import { settleChange } from "../schedule/settle-change.ts";
import { settleFirstDays } from "../schedule/settle.ts";
import { writeRevision } from "./apply-roster.ts";
import { Fault, InputFault } from "../fault.ts";

export type Contributions = "keep" | "withdraw";

export interface LeaveClubInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's club. */
  readonly clubId: string;
  /** The explicit choice for the caller's drops (spec 22, T26). */
  readonly contributions: Contributions;
}

export interface LeftClub {
  readonly clubId: string;
  /** The server's clock when the interval ended, sampled under the club's row. */
  readonly leftAt: ServerNow;
  readonly contributions: Contributions;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: LeaveClubInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new InputFault("leave_club_1", "clubs: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new InputFault("leave_club_2", "clubs: the idempotency key is a UUID");
  }
  const choice: unknown = input.contributions;
  if (choice !== "keep" && choice !== "withdraw") {
    throw new InputFault("leave_club_3", "clubs: contributions is keep or withdraw");
  }
}

const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Fault("leave_club_4", "clubs: a leave read a row it can't use");
  return value;
};

/**
 * Step 5a: gives back every live reservation of the membership `interval` in the club `club`, and, with
 * `withdraw`, withdraws every active or held drop of it there, at `at`, the leave's instant. The caller holds the
 * club's row `FOR UPDATE` and has ended the membership.
 *
 * `at` was sampled under the club's row, before the counters' locks below, where the other commands sample theirs
 * after their counter's (T1, T3). It reads the same here because every other writer of a counter, a reservation, a
 * drop or a highlight takes the club's row `FOR SHARE` first (../drops/reserve.ts `lockDay`), which waits for this
 * leave's `FOR UPDATE`: nothing in the club moves between the sample and the commit. ../drops/counter.ts holds
 * every later writer to that.
 */
async function settleContributions(
  tx: QuerySql,
  club: string,
  interval: string,
  at: ServerNow,
  contributions: Contributions,
): Promise<void> {
  // A drop and a reservation each name their counter, so the counters find everything there is to settle. They
  // are found from the interval's reservations and drops, whose keys start with it, then taken by their own key.
  await bound(tx)`
    SELECT c.occurrence_id
      FROM app.contribution_counters c
     WHERE c.club_id = ${club} AND c.interval_id = ${interval}
       AND c.occurrence_id IN (
             SELECT r.occurrence_id FROM app.reservations r WHERE r.interval_id = ${interval} AND r.state = 'live'
             UNION
             SELECT d.occurrence_id FROM app.drops d
              WHERE ${contributions} = 'withdraw' AND d.author_interval_id = ${interval}
                AND d.state IN ('active', 'held'))
     ORDER BY c.occurrence_id COLLATE "C"
       FOR NO KEY UPDATE`;
  // The live reservations, after their counters, `FOR NO KEY UPDATE` as releaseReservation takes one. They are
  // given back counter by counter through ../drops/counter.ts: live only in a day still collecting (T18), lapsed
  // wherever nobody has settled them since.
  const held = await bound(tx)`
    SELECT r.occurrence_id FROM app.reservations r
     WHERE r.interval_id = ${interval} AND r.state = 'live'
     ORDER BY r.occurrence_id COLLATE "C", r.id COLLATE "C"
       FOR NO KEY UPDATE`;
  const days = new Set(held.map((row) => text(row["occurrence_id"])));
  for (const occurrence of days) {
    const day: CounterKey = { day: occurrence, interval, club };
    await settleLapsed(tx, day, at);
    const live = await bound(tx)`
      SELECT id FROM app.reservations
       WHERE occurrence_id = ${day.day} AND interval_id = ${interval} AND state = 'live'
       ORDER BY id COLLATE "C"`;
    for (const slot of live) await freeSlot(tx, day, text(slot["id"]), at);
  }
  if (contributions !== "withdraw") return;
  // The drops, all at once, whatever their number. Each `FOR UPDATE`, in id order, after its counter.
  await bound(tx)`
    SELECT d.id FROM app.drops d
     WHERE d.author_interval_id = ${interval} AND d.state IN ('active', 'held')
     ORDER BY d.id COLLATE "C"
       FOR UPDATE`;
  // Each its one removal, then withdrawn: the database matches the two at the commit (drops_removal_matches).
  await bound(tx)`
    INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
    SELECT d.id, 'leave', ${interval}, ${at}::pg_catalog.timestamptz
      FROM app.drops d
     WHERE d.author_interval_id = ${interval} AND d.state IN ('active', 'held')`;
  await bound(tx)`
    UPDATE app.drops
       SET state = 'withdrawn', ended_at = ${at}::pg_catalog.timestamptz,
           updated_at = ${at}::pg_catalog.timestamptz, pending_upload_id = NULL
     WHERE author_interval_id = ${interval} AND state IN ('active', 'held')`;
  // The drops this leave withdrew are the interval's with a `leave` removal at its instant (an interval leaves
  // once), found from the interval's drops (`drops_by_author`) and their highlights (`highlights_by_drop`). The
  // leaver's highlight on one is cleared after the drop's end, as the highlights' guard asks from the reveal on
  // (T22).
  await bound(tx)`
    UPDATE app.highlights h
       SET drop_id = NULL, version = h.version + 1, updated_at = ${at}::pg_catalog.timestamptz
      FROM app.drops d
      JOIN app.drop_removals r ON r.drop_id = d.id
     WHERE d.author_interval_id = ${interval} AND h.drop_id = d.id AND h.interval_id = ${interval}
       AND r.reason = 'leave' AND r.actor_interval_id = ${interval} AND r.removed_at = ${at}::pg_catalog.timestamptz`;
  // Before its day's reveal, its slot given back; from the reveal on, none reopens (T3, T18; spec 22).
  await bound(tx)`
    UPDATE app.contribution_counters c
       SET committed_total = c.committed_total - f.total, committed_external = c.committed_external - f.external
      FROM (SELECT d.occurrence_id,
                   pg_catalog.count(*)::pg_catalog.int2 AS total,
                   pg_catalog.count(*) FILTER (WHERE d.media_class = 'external_video')::pg_catalog.int2 AS external
              FROM app.drops d
              JOIN app.drop_removals r ON r.drop_id = d.id
              JOIN app.occurrences o ON o.id = d.occurrence_id
             WHERE d.author_interval_id = ${interval} AND r.reason = 'leave' AND r.actor_interval_id = ${interval}
               AND r.removed_at = ${at}::pg_catalog.timestamptz AND o.reveal_at > ${at}::pg_catalog.timestamptz
             GROUP BY d.occurrence_id) f
     WHERE c.occurrence_id = f.occurrence_id AND c.interval_id = ${interval}`;
}

/**
 * Ends the membership of the account `input.userId` in the club, in `tx`, and returns what `render` makes
 * of it, which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function leaveClub(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: LeaveClubInput,
  render: (left: LeftClub) => Json,
): Promise<Json> {
  check(input);
  const { userId, clubId, contributions } = input;
  // An id that can't be one names no club, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: { operation: "leaveClub", path: { club_id: clubId }, query: {}, body: { contributions } },
  };

  // 1. Who is asking. 2. The receipt.
  const asking = await activeMember(tx, userId, clubId);
  if (asking === null) {
    // Only the retry of this very leave is answered, and only while the account has begun no interval in
    // the club since. Everything else is NOT_FOUND, a key used for another request included: to someone
    // who isn't a member, a club reads the same whether it is suspended, left or was never there (T14).
    let stored: { readonly replay: Json } | null;
    try {
      stored = await reserveReceipt(tx, receipt, await clock.sample(tx));
    } catch (error) {
      if (error instanceof Refused && error.code === "IDEMPOTENCY_CONFLICT") throw new Refused("NOT_FOUND");
      throw error;
    }
    // With no receipt, the reservation goes with the refusal.
    if (stored === null) throw new Refused("NOT_FOUND");
    const [since] = await bound(tx)`
      SELECT 1 AS found
        FROM app.idempotency_receipts r
        JOIN app.memberships m ON m.user_id = r.actor_user_id AND m.club_id = ${clubId}
       WHERE r.actor_user_id = ${userId} AND r.operation = 'leaveClub'
         AND r.idempotency_key = ${input.key}::pg_catalog.uuid AND m.joined_at >= r.created_at
       LIMIT 1`;
    if (since !== undefined) throw new Refused("NOT_FOUND");
    return stored.replay;
  }
  const first = await reserveAsMember(tx, receipt, await clock.sample(tx), asking);
  if (first !== null) return first.replay;

  // 3. The club's row, and who is asking, again.
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  if ((await activeMember(tx, userId, clubId)) !== asking) throw new Refused("NOT_FOUND");

  // 4. The clock, after the lock.
  const at = await clock.sample(tx);

  // 5. The membership ends.
  const [ended] = await bound(tx)`
    UPDATE app.memberships m
       SET state = 'left', left_at = ${at}::pg_catalog.timestamptz, contributions = ${contributions},
           ended_display_name = u.display_name
      FROM app.users u
     WHERE m.interval_id = ${asking} AND m.state = 'active' AND u.id = m.user_id
    RETURNING m.interval_id`;
  if (ended === undefined)
    throw new Fault("leave_club_5", "clubs: the membership its member is leaving can't be ended");

  // 5a. The leaver's contributions.
  await settleContributions(tx, clubId, asking, at, contributions);

  // 6. The club's proposals.
  await bound(tx)`
    UPDATE app.candidates SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz
     WHERE club_id = ${clubId} AND proposed_by_interval_id = ${asking} AND state = 'open'`;
  const [open] = await bound(tx)`
    SELECT r.id, r.origin, r.proposed_by_interval_id,
           (SELECT pm.state = 'active' FROM app.memberships pm
             WHERE pm.interval_id = r.proposed_by_interval_id) AS proposer_active
      FROM app.roster_revisions r
     WHERE r.club_id = ${clubId} AND r.state = 'open'`;
  if (open !== undefined) {
    const revisionId = text(open["id"]);
    const carried = await bound(tx)`
      SELECT rc.candidate_id, rc.label
        FROM app.roster_revision_candidates rc
        JOIN app.candidates k ON k.id = rc.candidate_id
       WHERE rc.revision_id = ${revisionId} AND k.state = 'open'
       ORDER BY rc.position`;
    const origin: unknown = open["origin"];
    if (origin !== "proposal" && origin !== "rename")
      throw new Fault("leave_club_6", "clubs: a leave read a row it can't use");
    if (carried.length > 0 && open["proposer_active"] === true) {
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
        UPDATE app.candidates k SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz
          FROM app.roster_revision_candidates rc
         WHERE rc.revision_id = ${revisionId} AND rc.candidate_id = k.id AND k.state = 'open'`;
      await bound(tx)`
        UPDATE app.roster_revisions
           SET state = 'did_not_go_ahead', version = version + 1, ended_at = ${at}::pg_catalog.timestamptz
         WHERE id = ${revisionId}`;
    }
  }

  // 7. The club's roster version.
  await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;

  // 8. The club's first days, and, once they have applied, its week: a membership change (FQ56, FQ125).
  await settleFirstDays(tx, at, clubId);
  await settleChange(tx, at, clubId);

  // 9. The answer.
  return completeReceipt(tx, receipt, render({ clubId, leftAt: at, contributions }));
}
