/// <reference lib="esnext.temporal" />
// What an invitation shows the person holding its link (the contract's `previewInvitation`,
// `previewInvitationWeb`, `InvitationPreview` and `WebInvitationPreview`; spec 04, 32; G02, G03-waiting,
// book p9, p30; T1, T7, T14, T33, T52; FQ47, FQ59, FQ66, FQ71, FQ75, FQ80; docs/plans/api-b1-clubs.md,
// section 4). Both only read: previewing grants nothing, binds nothing and never uses up the token (T7).
//
// `invitationStanding` says where a link stands for one account, from the facts one statement read
// (./invitation-facts.ts). In order:
// 1. Nothing (the neutral not-found, T14): no such link; one revoked, replaced or used by another account,
//    even past its expiry (FQ59); a club moderation has suspended (FQ80).
// 2. `joined`: the caller is a member of the club by the authorization module's rule, whoever the link was
//    for. The app opens the club.
// 3. Nothing: a link whose candidate joined, held by an account that is no longer a member (it left).
// 4. A candidate whose proposal ended: `did_not_go_ahead` to the account that accepted with the link, which
//    never says who declined; nothing to anyone else, who never accepted anything.
// 5. `expired`: a link nobody used, past its expiry, with the inviter's name (FQ71). A link its account has
//    used doesn't expire for that account: it can't be replaced (handoff 4), so an expiry would leave the
//    candidate no way to accept a changed roster.
// 6. Nothing: the caller already holds another place in this club's roster, by another link they accepted
//    with. One account takes one place.
// 7. Nothing when the inviter has no name to show, or no member of the roster has one: the contract's
//    answer must name them (FQ75).
// 8. `full`: the club has six members already (A01). The six count every open candidate, so no command
//    leads here; it is the answer should the rows ever say so.
// 9. The exact roster of the club's open revision: `waiting` when the candidate accepted it with this link
//    and the account's profile name is still the label it shows; `changed` when the account accepted an
//    earlier roster with it, or has changed its name since it accepted (FQ66: it accepts again, which
//    makes the name's revision); else `open`.
//
// The roster is names only (FQ47): each member of the revision who has a name, by their profile name, in
// the order they joined; then its candidates by their position, each by the label the revision shows, the
// link's own candidate marked as You. No id of a person, no photo, no date, no state of anyone, and
// nothing about who has approved or accepted (T7, T33).
//
// `previewInvitationWeb` is for the signed-out page: the inviter's name for a live link, one nobody used,
// not revoked, replaced or expired, whose candidate is still open in a club that isn't suspended. Anything
// else is nothing, with no name.

import type { QuerySql } from "../authorization/read-sql.ts";
import type { ServerNow } from "../time/clock.ts";
import { CLUB_SIZE } from "./club.ts";
import { linkFacts, namesNothing, tokenHash, type LinkFacts } from "./invitation-facts.ts";

export interface InvitationRosterEntry {
  readonly name: string;
  readonly kind: "member" | "candidate";
  readonly isYou: boolean;
}

export interface InvitationRoster {
  readonly invitationId: string;
  readonly inviterName: string;
  readonly clubName: string;
  readonly revisionId: string;
  readonly revisionVersion: number;
  readonly roster: readonly InvitationRosterEntry[];
}

export type InvitationSight =
  | ({ readonly state: "open" | "changed"; readonly expiresAt: Temporal.Instant } & InvitationRoster)
  | ({ readonly state: "waiting" } & InvitationRoster)
  | { readonly state: "expired"; readonly inviterName: string }
  | { readonly state: "full" }
  | { readonly state: "did_not_go_ahead" }
  | {
      readonly state: "joined";
      readonly club: {
        readonly id: string;
        readonly name: string;
        readonly timezone: string;
        readonly membershipId: string;
      };
    };

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** Where the link of `facts` stands for the account `userId`, or null for the neutral not-found. */
export function invitationStanding(facts: LinkFacts | null, userId: string): InvitationSight | null {
  // 1. Nothing to this caller.
  if (facts === null || namesNothing(facts, userId)) return null;
  // 2. A member already.
  if (facts.membershipId !== null) {
    return { state: "joined", club: { ...facts.club, membershipId: facts.membershipId } };
  }
  // 3. Joined once, and gone since.
  if (facts.candidateState === "joined") return null;
  const mine = facts.boundUserId === userId;
  // 4. The proposal ended.
  if (facts.candidateState === "ended") return mine ? { state: "did_not_go_ahead" } : null;
  // 5. Expired while nobody had used it.
  if (!mine && facts.pastExpiry) {
    return facts.inviterName === null ? null : { state: "expired", inviterName: facts.inviterName };
  }
  // 6. One account, one place.
  if (!mine && facts.holdsAnother) return null;
  // 7. Names the answer can't do without.
  const roster = facts.roster;
  if (roster === null) throw new Error("clubs: an open candidate is on no open revision");
  if (facts.inviterName === null || roster.members.length === 0) return null;
  // 8. Six already.
  if (facts.members >= CLUB_SIZE) return { state: "full" };
  // 9. The exact roster.
  const shown: InvitationRoster = {
    invitationId: facts.invitationId,
    inviterName: facts.inviterName,
    clubName: facts.club.name,
    revisionId: roster.id,
    revisionVersion: roster.version,
    roster: [
      ...roster.members.map(({ name }) => ({ name, kind: "member" as const, isYou: false })),
      ...roster.candidates.map(({ id, name }) => ({
        name,
        kind: "candidate" as const,
        isYou: id === facts.candidateId,
      })),
    ],
  };
  if (roster.accepted) return { state: "waiting", ...shown };
  return { state: mine ? "changed" : "open", ...shown, expiresAt: facts.expiresAt };
}

/** What the token shows the account `userId` at `now`, or null (T14). One statement, so one snapshot. */
export async function previewInvitation(
  sql: QuerySql,
  userId: string,
  token: string,
  now: ServerNow,
): Promise<InvitationSight | null> {
  const hash = tokenHash(token);
  // A text that can't be a token names nothing, as one nobody made.
  if (hash === null) return null;
  return invitationStanding(await linkFacts(sql, userId, hash, now), userId);
}

/** The inviter's name for a live link, or null (T7, FQ59). One statement. */
export async function previewInvitationWeb(
  sql: QuerySql,
  token: string,
  now: ServerNow,
): Promise<{ readonly inviterName: string } | null> {
  const hash = tokenHash(token);
  if (hash === null) return null;
  const rows = await bound(sql)`
    SELECT CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END AS inviter_name
      FROM app.invitations i
      JOIN app.candidates k ON k.id = i.candidate_id
      JOIN app.clubs c ON c.id = k.club_id
      JOIN app.memberships pm ON pm.interval_id = k.proposed_by_interval_id
      JOIN app.users pu ON pu.id = pm.user_id
     WHERE i.token_sha256 = pg_catalog.decode(${hash}, 'hex')
       AND i.revoked_at IS NULL AND i.replaced_by_id IS NULL AND i.bound_user_id IS NULL
       AND i.expires_at > ${now}::pg_catalog.timestamptz
       AND k.state = 'open' AND c.suspended_at IS NULL`;
  const name = rows[0]?.["inviter_name"];
  return typeof name === "string" && name.length > 0 ? { inviterName: name } : null;
}
