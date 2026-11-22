/// <reference lib="esnext.temporal" />
// The privacy matrix's world (TECH-DESIGN section 8): its roles, the drop's states and the day's
// phases, shared by the read predicate's test on rows (db/authorization.test.ts) and the privacy
// matrix over the API's routes (privacy/matrix.test.ts), so the two can't drift apart. The rows
// are built as the commands will write them (db/world.ts).

import { randomBytes } from "node:crypto";
import type { Tx, WorldTx } from "./db/harness.ts";
import {
  AT,
  joinByRoster,
  leave,
  named,
  newId,
  newUnfinishedUser,
  newUser,
  newWorld,
  type Member,
  type World,
} from "./db/world.ts";

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;

export const REVEAL = Temporal.Instant.from(AT.reveal.toISOString());
export const CLOSE = Temporal.Instant.from(AT.close.toISOString());
/** The privacy matrix's phases, at their edges: collecting ends a microsecond before reveal_at. */
export const PHASES = {
  collecting: REVEAL.subtract({ microseconds: 1 }),
  open: REVEAL,
  past: CLOSE,
  "past, a year on": CLOSE.add({ hours: 24 * 365 }),
} as const;
export type Phase = keyof typeof PHASES;

export const AFTER = new Date("2026-11-06T20:10:00Z");
export const LATER = new Date("2026-11-06T20:20:00Z");
export const STATE_AT = new Date("2026-11-06T20:30:00Z");

/**
 * Clears the highlight that points to `drop`, if one does, as every path that ends a drop does in the same
 * transaction, after the drop's own change (T22, T24; the highlights guard, db/migrations/0006).
 */
async function clearHighlight(tx: WorldTx, drop: string, at: Date) {
  await tx`UPDATE app.highlights SET drop_id = NULL, version = version + 1, updated_at = ${at} WHERE drop_id = ${drop}`;
}

/** Removes the drop by moderation, citing the operator's audited action (FQ27), and clears its highlight. */
export async function removeByModeration(tx: WorldTx, drop: string, at: Date) {
  const action = newId("act");
  await tx`
    INSERT INTO app.operator_actions (id, operator, script, script_version, action, target_kind, target_id, policy, acted_at)
    VALUES (${action}, 'founder', 'remove-drop', ${"0".repeat(40)}, 'remove_drop', 'drop', ${drop}, 'trial.safety', ${at})
  `;
  await tx`UPDATE app.drops SET state = 'removed', ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
  await clearHighlight(tx, drop, at);
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, operator_action_id, removed_at)
    VALUES (${drop}, 'moderation', ${action}, ${at})
  `;
}

/**
 * Gives back the slot of a drop withdrawn at `at` when its day hadn't revealed by then, as a withdrawal does
 * (spec 11, T18: one before the reveal releases the drop's slot, one after it doesn't): its author's counter
 * counts one committed drop less, a link one link less.
 */
async function releaseSlotOf(tx: WorldTx, drop: string, at: Date) {
  await tx`
    UPDATE app.contribution_counters c
       SET committed_total = c.committed_total - 1,
           committed_external = c.committed_external - CASE WHEN d.media_class = 'external_video' THEN 1 ELSE 0 END
      FROM app.drops d JOIN app.occurrences o ON o.id = d.occurrence_id
     WHERE d.id = ${drop} AND c.occurrence_id = d.occurrence_id AND c.interval_id = d.author_interval_id
       AND o.reveal_at > ${at}`;
}

/** The author withdraws the drop (spec 22), its slot given back before the reveal, and its highlight goes with it. */
export async function withdraw(tx: WorldTx, w: World, drop: string, at: Date) {
  await tx`UPDATE app.drops SET state = 'withdrawn', ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
  await releaseSlotOf(tx, drop, at);
  await clearHighlight(tx, drop, at);
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
    VALUES (${drop}, 'withdraw', ${w.ben.interval}, ${at})
  `;
}

/** `blocker` blocks `blocked` and leaves the club by it, keeping their drops (spec 22, D11). */
export async function block(
  tx: WorldTx,
  blocker: Member,
  blockerName: string,
  blocked: Member,
  blockedName: string,
  at: Date,
) {
  await tx`
    INSERT INTO app.blocks (id, blocker_user_id, blocked_user_id, blocked_interval_id, blocked_name, created_at)
    VALUES (${newId("blk")}, ${blocker.user}, ${blocked.user}, ${blocked.interval}, ${blockedName}, ${at})
  `;
  await tx`
    UPDATE app.memberships SET state = 'left_by_block', left_at = ${at}, contributions = 'keep',
                               ended_display_name = ${blockerName}
     WHERE interval_id = ${blocker.interval}
  `;
}

/**
 * Withdraws `member`'s drops whose day hadn't opened at `at`, as a block or a leaving that takes
 * them away does (D11, spec 22: the contract's BlockRequest withdraws the blocker's drops still
 * to be revealed). Each gets its removal row, with `member`'s interval as the actor, gives back its slot and loses
 * its highlight.
 */
export async function withdrawUnrevealed(tx: WorldTx, member: Member, reason: "block" | "leave", at: Date) {
  const drops = await tx<{ id: string }[]>`
    SELECT d.id FROM app.drops d JOIN app.occurrences o ON o.id = d.occurrence_id
     WHERE d.author_interval_id = ${member.interval} AND d.state = 'active' AND o.reveal_at > ${at}`;
  for (const { id } of drops) {
    await tx`UPDATE app.drops SET state = 'withdrawn', ended_at = ${at}, updated_at = ${at} WHERE id = ${id}`;
    await releaseSlotOf(tx, id, at);
    await clearHighlight(tx, id, at);
    await tx`
      INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
      VALUES (${id}, ${reason}, ${member.interval}, ${at})
    `;
  }
}

/**
 * Mo is invited to the club and has accepted with Mo's own link, but the members haven't approved
 * the roster, so it isn't applied and Mo isn't a member (T7). An invitation nobody has accepted ties
 * no account to the club at all, so this is the nearest an invited person comes.
 */
export async function invite(tx: WorldTx, w: World, at: Date): Promise<string> {
  const mo = await newUser(plain(tx), named(w, "Mo"));
  const [revision, candidate, invitation] = [newId("rev"), newId("cand"), newId("inv")];
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revision}, ${w.club}, 'proposal', ${w.ana.interval}, ${at})
  `;
  for (const member of [w.ana, w.ben, w.cleo]) {
    await tx`
      INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
      VALUES (${revision}, ${w.club}, ${member.interval})
    `;
  }
  await tx`
    INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
    VALUES (${candidate}, ${w.club}, ${w.ana.interval}, ${at})
  `;
  await tx`
    INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
    VALUES (${revision}, ${w.club}, ${candidate}, ${named(w, "Mo")}, 1)
  `;
  await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${at} WHERE id = ${revision}`;
  await tx`
    INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
    VALUES (${invitation}, ${candidate}, ${randomBytes(32)}, ${at}, ${new Date(at.getTime() + 7 * 864e5)}, ${mo}, ${at})
  `;
  await tx`
    UPDATE app.roster_revision_candidates SET accepted_at = ${at}, accepted_invitation_id = ${invitation}
     WHERE revision_id = ${revision} AND candidate_id = ${candidate}
  `;
  return mo;
}

/**
 * What the sign-in gate makes of the role's account (spec 23; T27; FQ13, FQ69): `active` has a session
 * and a finished profile, `unfinished` has a session but no age confirmation or no name, and `deleting`
 * has none, since its deletion has begun.
 */
export type Session = "active" | "unfinished" | "deleting";

export interface Role {
  name: string;
  /** Whether the role reads Ben's active drop: the caption while collecting, everything from the reveal. */
  reads: boolean;
  /** What the gate makes of the role's account; `active` when absent. The privacy matrix checks it against the rows. */
  session?: Session;
  /** Makes the role's rows after Ben's drop is committed, and returns the viewer's account. */
  make(tx: WorldTx, w: World): Promise<string>;
  /** The phases whose server time can follow the role's rows; every phase when absent. */
  phases?: readonly Phase[];
}

export const ROLES: Role[] = [
  { name: "author", reads: true, make: (_tx, w) => Promise.resolve(w.ben.user) },
  { name: "star", reads: true, make: (_tx, w) => Promise.resolve(w.ana.user) },
  { name: "member in the audience", reads: true, make: (_tx, w) => Promise.resolve(w.cleo.user) },
  {
    name: "member who joined after the commit (T8)",
    reads: false,
    make: async (tx, w) => {
      const eve = await newUser(plain(tx), named(w, "Eve"));
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: eve, label: named(w, "Eve") }], AFTER);
      return eve;
    },
  },
  {
    name: "rejoined member, a new interval (T8)",
    reads: false,
    make: async (tx, w) => {
      await leave(plain(tx), w.cleo, named(w, "Cleo"), AFTER);
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: w.cleo.user, label: named(w, "Cleo") }], LATER);
      return w.cleo.user;
    },
  },
  {
    name: "former member",
    reads: false,
    make: async (tx, w) => {
      await leave(plain(tx), w.cleo, named(w, "Cleo"), AFTER);
      return w.cleo.user;
    },
  },
  { name: "invited, not yet a member (T7)", reads: false, make: (tx, w) => invite(tx, w, AFTER) },
  {
    name: "stranger from another club",
    reads: false,
    make: async (tx, w) =>
      (await newWorld(plain(tx), w.suffix === "" ? "" : ` ${randomBytes(6).toString("hex")}`)).cleo.user,
  },
  {
    name: "blocked: Cleo blocked the author, leaving by the block",
    reads: false,
    make: async (tx, w) => {
      await block(tx, w.cleo, named(w, "Cleo"), w.ben, named(w, "Ben"), AFTER);
      await withdrawUnrevealed(tx, w.cleo, "block", AFTER);
      return w.cleo.user;
    },
  },
  {
    // A block withdraws the blocker's drops still to be revealed (D11; the contract's
    // BlockRequest), so Ben blocks Cleo as the day opens and keeps the drop, and only the phases
    // from then on are asked. Ben's block before the reveal is the T23 test below.
    name: "blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)",
    reads: false,
    make: async (tx, w) => {
      await block(tx, w.ben, named(w, "Ben"), w.cleo, named(w, "Cleo"), AT.reveal);
      return w.cleo.user;
    },
    phases: ["open", "past", "past, a year on"],
  },
  {
    name: "deletion pending, the membership not yet ended (T27)",
    reads: false,
    session: "deleting",
    make: async (tx, w) => {
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AFTER} WHERE id = ${w.cleo.user}`;
      return w.cleo.user;
    },
  },
  {
    // The account a first sign-in makes: no age confirmation, no name, in no club (FQ13, FQ69).
    name: "signed in, profile not finished (FQ13, FQ69)",
    reads: false,
    session: "unfinished",
    make: (tx) => newUnfinishedUser(plain(tx)),
  },
];

/**
 * TECH-DESIGN section 8's six states of the drop, each made in a way the schema accepts, and a
 * cancelled day, which no trial command makes yet but the schema allows and T9 denies.
 */
export const STATES: { name: string; denies: boolean; make(tx: WorldTx, w: World, drop: string): Promise<unknown> }[] =
  [
    { name: "active", denies: false, make: () => Promise.resolve() },
    { name: "withdrawn", denies: true, make: (tx, w, drop) => withdraw(tx, w, drop, STATE_AT) },
    { name: "removed by moderation", denies: true, make: (tx, _w, drop) => removeByModeration(tx, drop, STATE_AT) },
    {
      name: "held (T29)",
      denies: true,
      make: (tx, _w, drop) => tx`UPDATE app.drops SET state = 'held', updated_at = ${STATE_AT} WHERE id = ${drop}`,
    },
    {
      name: "its day suspended",
      denies: true,
      make: (tx, w) => tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${w.day}`,
    },
    {
      name: "its club suspended",
      denies: true,
      make: (tx, w) => tx`UPDATE app.clubs SET suspended_at = ${STATE_AT} WHERE id = ${w.club}`,
    },
    {
      name: "its day cancelled",
      denies: true,
      make: (tx, w) => tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${w.day}`,
    },
  ];
