// A small club for the database tests, built through the rows the API's commands will write
// (spec 04, 05, 06, 11): Ana made it, Ben and Cleo joined by an exact roster that Ana approved
// (T7), each has a weekday, and Ana's Saturday, 7 November 2026, is the day the tests add to.
// Dan has an account and no club. Every id is random, as the API's are (T10, T15), so tests
// never collide with each other.

import { randomBytes, randomUUID } from "node:crypto";
import type { Tx } from "./harness.ts";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

/** The instants the tests use. The club is in Europe/London, which is on UTC in November. */
export const AT = {
  created: new Date("2026-11-01T10:00:00Z"),
  joined: new Date("2026-11-01T12:00:00Z"),
  generated: new Date("2026-11-02T08:00:00Z"),
  added: new Date("2026-11-06T20:00:00Z"),
  edited: new Date("2026-11-06T22:00:00Z"),
  reveal: new Date("2026-11-07T07:00:00Z"),
  opened: new Date("2026-11-07T09:00:00Z"),
  close: new Date("2026-11-08T01:00:00Z"),
} as const;

export interface Member {
  user: string;
  interval: string;
}

export interface World {
  club: string;
  ana: Member;
  ben: Member;
  cleo: Member;
  dan: { user: string };
  version: string;
  /** Ana's Saturday. */
  day: string;
  /**
   * What ends every name in the world, its people's, its club's and its roster's labels: empty but
   * in the privacy matrix, whose worlds each take their own, so no two worlds share a name.
   */
  suffix: string;
}

/** `name` as the world `w` writes it, with its suffix. */
export function named(w: Pick<World, "suffix">, name: string): string {
  return `${name}${w.suffix}`;
}

export async function newUser(tx: Tx, name: string): Promise<string> {
  const id = newId("acct");
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${id}, ${randomUUID()}, ${AT.created}, ${name}, ${AT.created})
  `;
  return id;
}

/**
 * Adds `newcomers` to the club by one exact roster revision: `proposer` proposes it, each
 * newcomer accepts it with their own link, every active member approves it, and it is applied
 * (T7). Returns each newcomer's new interval.
 */
export async function joinByRoster(
  tx: Tx,
  club: string,
  proposer: Member,
  newcomers: { user: string; label: string }[],
  at: Date,
): Promise<string[]> {
  const revision = newId("rev");
  const members = await tx<{ interval_id: string }[]>`
    SELECT interval_id FROM app.memberships WHERE club_id = ${club} AND state = 'active'
  `;
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revision}, ${club}, 'proposal', ${proposer.interval}, ${at})
  `;
  for (const { interval_id } of members) {
    await tx`
      INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
      VALUES (${revision}, ${club}, ${interval_id})
    `;
  }
  const candidates: { id: string; invitation: string; user: string }[] = [];
  for (const [index, newcomer] of newcomers.entries()) {
    const candidate = newId("cand");
    await tx`
      INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
      VALUES (${candidate}, ${club}, ${proposer.interval}, ${at})
    `;
    await tx`
      INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
      VALUES (${revision}, ${club}, ${candidate}, ${newcomer.label}, ${index + 1})
    `;
    candidates.push({ id: candidate, invitation: newId("inv"), user: newcomer.user });
  }
  await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${at} WHERE id = ${revision}`;
  for (const candidate of candidates) {
    await tx`
      INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
      VALUES (${candidate.invitation}, ${candidate.id}, ${randomBytes(32)}, ${at}, ${new Date(at.getTime() + 7 * 864e5)},
              ${candidate.user}, ${at})
    `;
    await tx`
      UPDATE app.roster_revision_candidates SET accepted_at = ${at}, accepted_invitation_id = ${candidate.invitation}
       WHERE revision_id = ${revision} AND candidate_id = ${candidate.id}
    `;
  }
  for (const { interval_id } of members) {
    await tx`
      INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
      VALUES (${revision}, ${interval_id}, 'approved', ${interval_id === proposer.interval}, ${at})
    `;
  }
  await tx`UPDATE app.roster_revisions SET state = 'applied', version = 2, ended_at = ${at} WHERE id = ${revision}`;
  const intervals: string[] = [];
  for (const candidate of candidates) {
    const interval = newId("mem");
    await tx`
      INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_via_revision_id, joined_via_candidate_id, joined_at)
      VALUES (${interval}, ${club}, ${candidate.user}, 'roster', ${revision}, ${candidate.id}, ${at})
    `;
    await tx`UPDATE app.candidates SET state = 'joined', ended_at = ${at} WHERE id = ${candidate.id}`;
    intervals.push(interval);
  }
  return intervals;
}

export async function newWorld(tx: Tx, suffix = ""): Promise<World> {
  const w = { suffix };
  const [ana, ben, cleo, dan] = [
    await newUser(tx, named(w, "Ana")),
    await newUser(tx, named(w, "Ben")),
    await newUser(tx, named(w, "Cleo")),
    await newUser(tx, named(w, "Dan")),
  ];
  const club = newId("club");
  const anaInterval = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, ${named(w, "Saturday people")}, 'Europe/London', ${anaInterval}, ${AT.created})
  `;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${anaInterval}, ${club}, ${ana}, 'creator', ${AT.created})
  `;
  const anaMember = { user: ana, interval: anaInterval };
  const [benInterval, cleoInterval] = await joinByRoster(
    tx,
    club,
    anaMember,
    [
      { user: ben, label: named(w, "Ben") },
      { user: cleo, label: named(w, "Cleo") },
    ],
    AT.joined,
  );
  if (!benInterval || !cleoInterval) throw new Error("newWorld: the roster added nobody");
  await tx`UPDATE app.clubs SET activated_at = ${AT.joined} WHERE id = ${club}`;

  const version = newId("sched");
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${club}, '2026-11-02', ${AT.generated})
  `;
  for (const [weekday, interval, firstDate] of [
    ["saturday", anaInterval, "2026-11-07"],
    ["friday", benInterval, "2026-11-06"],
    ["thursday", cleoInterval, "2026-11-05"],
  ] as const) {
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      VALUES (${version}, ${club}, ${weekday}, ${interval}, ${firstDate}, ${AT.generated})
    `;
  }
  const day = newId("occ");
  await tx`
    INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
    VALUES (${day}, ${club}, ${anaInterval}, ${version}, '2026-11-07', ${AT.reveal}, ${AT.close}, ${AT.generated})
  `;
  return {
    club,
    ana: anaMember,
    ben: { user: ben, interval: benInterval },
    cleo: { user: cleo, interval: cleoInterval },
    dan: { user: dan },
    version,
    day,
    suffix,
  };
}

export interface DropOptions {
  media?: "photo" | "external_video";
  caption?: string | null;
  at?: Date;
  /** Leave the audience unwritten and the drop unsealed, for a test to finish the commit. */
  unsealed?: boolean;
}

/**
 * Commits a drop to the world's day as createDrop will (TECH-DESIGN section 5): the author's
 * counter, a reservation and a prepared upload for a photo (or a resolved link), the drop, its
 * audience of every active member, and the seal (T8, T17).
 */
export async function commitDrop(tx: Tx, w: World, author: Member, options: DropOptions = {}): Promise<string> {
  const media = options.media ?? "photo";
  const at = options.at ?? AT.added;
  const drop = newId("drp");
  const dedupe = randomBytes(32);
  await tx`
    INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id)
    VALUES (${w.day}, ${author.interval}, ${w.club}) ON CONFLICT DO NOTHING
  `;
  if (media === "photo") {
    const reservation = newId("rsv");
    const upload = newId("upl");
    await tx`
      INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
      VALUES (${reservation}, ${w.day}, ${author.interval}, 'photo', ${randomUUID()}, ${at}, ${AT.reveal})
    `;
    await tx`
      UPDATE app.contribution_counters SET reserved_total = reserved_total + 1
       WHERE occurrence_id = ${w.day} AND interval_id = ${author.interval}
    `;
    await tx`
      INSERT INTO app.uploads (id, owner_user_id, purpose, reservation_id, content_type, byte_size, object_key, created_at, expires_at)
      VALUES (${upload}, ${author.user}, 'drop_photo', ${reservation}, 'image/jpeg', 1000, ${newId("uploads/raw")}, ${at},
              ${new Date(at.getTime() + 864e5)})
    `;
    await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${upload}`;
    await tx`
      UPDATE app.uploads SET state = 'ready', content_hash = ${dedupe}, content_version = ${newId("v")} WHERE id = ${upload}
    `;
    await tx`
      INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, upload_id, dedupe_key, caption,
                             submitted_at, updated_at)
      VALUES (${drop}, ${w.day}, ${w.club}, ${author.interval}, 'photo', ${upload}, ${dedupe}, ${options.caption ?? null},
              ${at}, ${at})
    `;
    await tx`
      UPDATE app.reservations SET state = 'consumed', ended_at = ${at}, drop_id = ${drop} WHERE id = ${reservation}
    `;
    await tx`
      UPDATE app.contribution_counters SET reserved_total = reserved_total - 1, committed_total = committed_total + 1
       WHERE occurrence_id = ${w.day} AND interval_id = ${author.interval}
    `;
  } else {
    const source = newId("src");
    const post = String(1e15 + Math.floor(Math.random() * 1e15));
    await tx`
      INSERT INTO app.sources (id, owner_user_id, provider, provider_post_id, canonical_url, created_at, expires_at)
      VALUES (${source}, ${author.user}, 'tiktok', ${post}, ${`https://www.tiktok.com/@ana/video/${post}`}, ${at},
              ${new Date(at.getTime() + 864e5)})
    `;
    await tx`
      INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, source_id, dedupe_key, caption,
                             submitted_at, updated_at)
      VALUES (${drop}, ${w.day}, ${w.club}, ${author.interval}, 'external_video', ${source}, ${dedupe},
              ${options.caption ?? null}, ${at}, ${at})
    `;
    await tx`UPDATE app.sources SET used_at = ${at} WHERE id = ${source}`;
    await tx`
      UPDATE app.contribution_counters SET committed_total = committed_total + 1, committed_external = committed_external + 1
       WHERE occurrence_id = ${w.day} AND interval_id = ${author.interval}
    `;
  }
  await tx`
    INSERT INTO app.drop_caption_versions (drop_id, drop_version, caption, created_at)
    VALUES (${drop}, 1, ${options.caption ?? null}, ${at})
  `;
  if (!options.unsealed) await writeAudience(tx, w, drop, at);
  return drop;
}

/** Writes the drop's audience, every active member of the club, and seals it (T8). */
export async function writeAudience(tx: Tx, w: World, drop: string, at: Date = AT.added): Promise<void> {
  await tx`
    INSERT INTO app.drop_audience (drop_id, club_id, interval_id)
    SELECT ${drop}, club_id, interval_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'
  `;
  await tx`UPDATE app.drops SET audience_sealed_at = ${at} WHERE id = ${drop}`;
}

/** Runs the checks Postgres runs at COMMIT, now, inside the test's transaction. */
export async function checkAsAtCommit(tx: Tx): Promise<void> {
  await tx`SET CONSTRAINTS ALL IMMEDIATE`;
  await tx`SET CONSTRAINTS ALL DEFERRED`;
}

/** Ends a member's interval as leaving does (spec 22). */
export async function leave(tx: Tx, member: Member, name: string, at: Date): Promise<void> {
  await tx`
    UPDATE app.memberships SET state = 'left', left_at = ${at}, contributions = 'keep', ended_display_name = ${name}
     WHERE interval_id = ${member.interval}
  `;
}
