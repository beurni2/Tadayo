// The club examples: Sunday people (six members) and Kitchen table (five, with Leila proposed by Ben,
// book p30). Each is a scene of its own (book p12).
import type { Examples } from "./examples.ts";
import { at, changeFrom, club, clubs, day, member, people, rosters } from "./world.ts";

const sp = clubs.sundayPeople;
const kt = clubs.kitchenTable;
const ZONE = sp.timezone;

const spSummary = (extra: Record<string, unknown> = {}) => ({
  id: sp.id,
  name: sp.name,
  timezone: ZONE,
  my_membership_id: sp.my_membership_id,
  state: "active",
  member_count: 6,
  ...extra,
});

const ktSummary = (extra: Record<string, unknown> = {}) => ({
  id: kt.id,
  name: kt.name,
  timezone: ZONE,
  my_membership_id: kt.my_membership_id,
  state: "active",
  member_count: 5,
  ...extra,
});

// On Friday 6 November at 9:41 AM: each member's next day to open (Debby's is next week's, book p13).
const spNextDays = {
  ben: day("sundayPeople", "ben", 9, "collecting"),
  maya: day("sundayPeople", "maya", 10, "collecting"),
  alex: day("sundayPeople", "alex", 11, "collecting"),
  sam: day("sundayPeople", "sam", 12, "collecting"),
  debby: day("sundayPeople", "debby", 13, "collecting"),
  nina: day("sundayPeople", "nina", 7, "collecting"),
} as const;

const ktNextDays = {
  ben: day("kitchenTable", "ben", 9, "collecting"),
  alex: day("kitchenTable", "alex", 10, "collecting"),
  sam: day("kitchenTable", "sam", 11, "collecting"),
  nina: day("kitchenTable", "nina", 12, "collecting"),
  maya: day("kitchenTable", "maya", 7, "collecting"),
} as const;

// G05-members and G03-approve: Ben proposed Leila; Maya is the member who approves (FQ60's fixture).
// `revision` is the one the server makes when Ben's link for Leila is forwarded and Debby accepts it,
// naming Debby (FQ66).
const leilaRevision = (
  viewer: "ben" | "maya",
  decision: "pending" | "approved" | "declined",
  link: "live" | "accepted" | "revoked" = "live",
  revision: { id: string; name: string } = { id: "rev_kt_leila", name: "Leila" },
) => ({
  id: revision.id,
  version: 1,
  club: club("kitchenTable", viewer),
  state: "open",
  proposed_by: member("kitchenTable", "ben"),
  members: rosters.kitchenTable.map(([who]) => member("kitchenTable", who)),
  candidates: [
    {
      id: "cnd_kt_leila",
      name: revision.name,
      // Only Ben, who proposed Leila, sees the link Ben made and where it stands (T7, handoff 1): made at
      // 9:41 AM on Friday 6 November, for seven days (FQ71).
      ...(viewer === "ben"
        ? { invitation: { id: "inv_kt_leila", state: link, expires_at: "2026-11-13T14:41:00Z" } }
        : {}),
    },
  ],
  my_decision: decision,
});
const debbyRevision = { id: "rev_kt_debby", name: "Debby" };

const invitationRoster = (state: "open" | "changed" | "waiting") => ({
  state,
  invitation_id: "inv_kt_leila",
  inviter_name: "Ben",
  club_name: kt.name,
  revision_id: "rev_kt_leila",
  revision_version: 1,
  roster: [
    ...rosters.kitchenTable.map(([who]) => ({
      name: member("kitchenTable", who).display_name,
      kind: "member",
      is_you: false,
    })),
    { name: "Leila", kind: "candidate", is_you: true },
  ],
});

// Kitchen table's proposal after Leila joins, from Monday 7 December, the first week after the days
// already announced (FQ61): Alex, Sam and Maya have confirmed Tuesday, Wednesday and Saturday, each named
// as the day's owner (book p11, FQ78). `others` is the rest of the week as Ben sees it: by default Ben has
// chosen Monday. In a clash, Ben's other member is Leila (FQ46).
type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
const ktOwners: Partial<Record<WeekdayKey, "alex" | "sam" | "maya">> = {
  tuesday: "alex",
  wednesday: "sam",
  saturday: "maya",
};
const changeDate = (index: number) =>
  new Date(Date.parse(`${changeFrom}T12:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
const ktSlots = (others: Partial<Record<WeekdayKey, "yours" | "clash" | "no_reveal">> = { monday: "yours" }) =>
  (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const).map((weekday, index) => {
    const owner = ktOwners[weekday];
    const state = owner ? "taken" : (others[weekday] ?? "available");
    return {
      weekday,
      state,
      ...(owner ? { owner: member("kitchenTable", owner) } : {}),
      ...(state === "clash" ? { clash_with: member("kitchenTable", "leila") } : {}),
      first_date: changeDate(index),
      suggested: weekday === "monday",
    };
  });
const ktProposal = (version: number, others?: Parameters<typeof ktSlots>[0], extra: Record<string, unknown> = {}) => ({
  id: "spr_kt_2",
  version,
  reason: "membership_change",
  effective_from: changeFrom,
  days_per_member: 1,
  slots: ktSlots(others),
  my_days: ["monday"],
  my_state: "choosing",
  state: "open",
  ...extra,
});
const ktSchedule = (proposal: Record<string, unknown>) => ({
  server_now: at.friday6Morning,
  club: kt,
  current: {
    effective_from: "2026-10-05",
    assignments: rosters.kitchenTable.map(([who, weekday]) => ({ weekday, person: member("kitchenTable", who) })),
  },
  proposal,
});

const spSchedule = rosters.sundayPeople.map(([who, weekday]) => ({ weekday, person: member("sundayPeople", who) }));

export const CLUB_EXAMPLES: { home: Examples; operations: Record<string, Examples> } = {
  home: {
    awaiting_activation: {
      summary: "Ben's new club before anyone has accepted its roster (H01-awaiting-activation)",
      value: {
        mode: "awaiting_activation",
        server_now: at.friday6Morning,
        club: sp,
        club_today: "2026-11-06",
      },
    },
    no_days: {
      summary: "The club has started, and nobody's day is confirmed yet",
      value: { mode: "no_days", server_now: at.friday6Morning, club: sp, club_today: "2026-11-06" },
    },
    paused: {
      summary: "Kitchen table with fewer than two members: paused, Memories still there (H01-paused, FQ16)",
      value: {
        mode: "paused",
        server_now: at.friday6Morning,
        club: kt,
        club_today: "2026-11-06",
        recent_days: [{ occurrence: day("kitchenTable", "ben", 2, "past") }],
      },
    },
    unavailable: {
      summary: "A suspended club: neutral, no reason (H01-paused, spec 22)",
      value: { mode: "unavailable", server_now: at.friday6Morning, club: kt, club_today: "2026-11-06" },
    },
  },
  operations: {
    listClubs: {
      two_clubs: {
        summary:
          "Friday 6 November, 9:41 AM: Sunday people is on Debby's Friday; Kitchen table's next is Maya (G06-switcher)",
        value: {
          server_now: at.friday6Morning,
          clubs: [
            spSummary({ open_day: day("sundayPeople", "debby", 6, "open"), next_day: spNextDays.nina }),
            ktSummary({ next_day: ktNextDays.maya }),
          ],
          invitations: [],
        },
      },
      no_club: {
        summary: "Signed in with no club (G06-no-club)",
        value: { server_now: at.friday6Morning, clubs: [], invitations: [] },
      },
      waiting_to_join: {
        summary: "Leila has accepted Kitchen table's roster and waits for the members (G03-waiting)",
        value: {
          server_now: at.friday6Morning,
          clubs: [],
          invitations: [{ invitation_id: "inv_kt_leila", club_name: kt.name, inviter_name: "Ben", state: "waiting" }],
        },
      },
    },
    createClub: {
      created: {
        summary: "A new club, waiting for its first roster (G01-create)",
        value: {
          server_now: at.friday6Morning,
          club: { ...spSummary({ state: "proposed", member_count: 1 }) },
          roster_version: 0,
          can_propose: true,
        },
      },
    },
    getClub: {
      sunday_people: {
        summary: "Sunday people's information: six members, so no more can be proposed (G05-club-details)",
        value: {
          server_now: at.friday6Morning,
          club: spSummary({ open_day: day("sundayPeople", "debby", 6, "open"), next_day: spNextDays.nina }),
          roster_version: 6,
          can_propose: false,
        },
      },
      kitchen_table: {
        summary: "Kitchen table, with Leila's revision open",
        value: {
          server_now: at.friday6Morning,
          club: ktSummary({ next_day: ktNextDays.maya }),
          roster_version: 5,
          can_propose: false,
          open_revision_id: "rev_kt_leila",
        },
      },
    },
    listMembers: {
      sunday_people: {
        summary: "Friday 6 November, 9:41 AM: Sunday people with next dates; Nina is next up (F01-friends)",
        value: {
          server_now: at.friday6Morning,
          club: sp,
          members: rosters.sundayPeople.map(([who], index) => ({
            person: people[who],
            position: index + 1,
            cover: index + 1,
            next_day: spNextDays[who],
            next_up: who === "nina",
          })),
        },
      },
      kitchen_table: {
        summary: "Kitchen table with Leila proposed by Ben (G05-members)",
        value: {
          server_now: at.friday6Morning,
          club: kt,
          members: rosters.kitchenTable.map(([who], index) => ({
            person: member("kitchenTable", who),
            position: index + 1,
            cover: index + 1,
            next_day: ktNextDays[who],
            next_up: who === "maya",
          })),
          open_revision: leilaRevision("ben", "approved"),
        },
      },
    },
    proposeRoster: {
      leila: { summary: "Ben proposes Leila for Kitchen table (book p30)", value: leilaRevision("ben", "approved") },
    },
    getRosterRevision: {
      approve: { summary: "Maya is asked to approve Leila (G03-approve)", value: leilaRevision("maya", "pending") },
      link_revoked: {
        summary:
          "Ben revoked Leila's link: Leila stays proposed, and Ben can make a new link (Link revoked; where a later addition's link is managed has no render yet, FQ51)",
        value: leilaRevision("ben", "approved", "revoked"),
      },
      another_name: {
        summary:
          "Ben's link for Leila was forwarded and Debby accepted it: Maya is asked to approve Debby, since a different name is a new revision (FQ66)",
        value: leilaRevision("maya", "pending", "live", debbyRevision),
      },
      another_name_proposer: {
        summary:
          "The same revision as Ben sees it: Ben approves Debby too, and only Ben sees that the link was accepted (FQ66, handoff 1)",
        value: leilaRevision("ben", "pending", "accepted", debbyRevision),
      },
      superseded: {
        summary: "Leila's revision once Debby's replaced it: its approvals no longer count (FQ66, T7)",
        value: { ...leilaRevision("maya", "approved"), state: "superseded", version: 2, superseded_by: "rev_kt_debby" },
      },
    },
    approveRoster: {
      approved: { summary: "Maya approved", value: leilaRevision("maya", "approved") },
    },
    declineRoster: {
      declined: {
        summary: "Maya declined: the invitation doesn't go ahead, and nobody is told who declined",
        value: { ...leilaRevision("maya", "declined"), state: "did_not_go_ahead", version: 2 },
      },
    },
    createInvitation: {
      link: {
        summary: "Leila's share link, for Ben to send (book p30)",
        value: {
          invitation_id: "inv_kt_leila",
          candidate_id: "cnd_kt_leila",
          url: "https://tadayo.app/i#q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM",
          expires_at: "2026-11-13T14:41:00Z",
        },
      },
      replayed: {
        summary: "A retry with the same key: the first answer without its link, which the app offers to remake (FQ77)",
        value: { invitation_id: "inv_kt_leila", candidate_id: "cnd_kt_leila", expires_at: "2026-11-13T14:41:00Z" },
      },
    },
    revokeInvitation: {
      revoked: { summary: "The link no longer works", value: { invitation_id: "inv_kt_leila", state: "revoked" } },
    },
    previewInvitationWeb: {
      open: { summary: "The signed-out page: the inviter's name only (G02-web)", value: { inviter_name: "Ben" } },
    },
    previewInvitation: {
      open: {
        summary: "Leila sees the inviter, the club and the exact roster, names only (G02-invitation, FQ47)",
        value: { ...invitationRoster("open"), expires_at: "2026-11-13T14:41:00Z" },
      },
      changed: {
        summary: "The roster changed since Leila accepted (G02-changed)",
        value: {
          ...invitationRoster("changed"),
          revision_id: "rev_kt_leila_2",
          revision_version: 1,
          expires_at: "2026-11-13T14:41:00Z",
        },
      },
      waiting: {
        summary: "Leila has accepted and waits for the members (G03-waiting)",
        value: invitationRoster("waiting"),
      },
      expired: {
        summary: "The link expired: ask Ben for a new one (G02-expired)",
        value: { state: "expired", inviter_name: "Ben" },
      },
      full: { summary: "The club already has six (G02-full)", value: { state: "full" } },
      did_not_go_ahead: {
        summary: "The invitation didn't go ahead (G03-declined)",
        value: { state: "did_not_go_ahead" },
      },
      joined: {
        summary: "Already a member: open the club",
        value: { state: "joined", club: club("kitchenTable", "maya") },
      },
    },
    acceptInvitation: {
      waiting: {
        summary: "Accepted; the members haven't all approved yet (G03-waiting)",
        value: { invitation_id: "inv_kt_leila", state: "waiting" },
      },
      joined: {
        summary: "Accepted after every member approved: Leila is in",
        value: {
          invitation_id: "inv_kt_leila",
          state: "joined",
          club: { ...kt, my_membership_id: "mem_kt_leila" },
        },
      },
      another_name: {
        summary:
          "Debby accepted Ben's link for Leila: a new revision names Debby, and Debby waits while every member approves it (FQ66)",
        value: { invitation_id: "inv_kt_leila", state: "waiting" },
      },
    },
    getSchedule: {
      sunday_people: {
        summary: "Sunday people's week, Monday to Saturday (G05-schedule)",
        value: {
          server_now: at.friday6Morning,
          club: sp,
          current: { effective_from: "2026-10-05", assignments: spSchedule },
        },
      },
      confirm_one_day: {
        summary:
          "Kitchen table's proposal after Leila joins: Ben chooses Monday; the days others confirmed name their owners (G04, FQ78)",
        value: ktSchedule(ktProposal(1)),
      },
      clash: {
        summary:
          "Ben and Leila both chose Friday: neither can confirm it until one chooses again, and only the two of them see each other's name (FQ46, FQ55)",
        value: ktSchedule(ktProposal(1, { friday: "clash" }, { my_days: ["friday"] })),
      },
      no_reveal: {
        summary:
          "Nina and Leila both chose Friday: Ben sees only that it has no reveal scheduled (G04-conflict-others, FQ46)",
        value: ktSchedule(ktProposal(1, { monday: "yours", friday: "no_reveal" })),
      },
    },
    chooseScheduleDays: {
      chosen: { summary: "Ben chose Monday", value: ktProposal(2) },
    },
    confirmScheduleDays: {
      confirmed: { summary: "Ben confirmed Monday", value: ktProposal(3, undefined, { my_state: "confirmed" }) },
    },
    leaveClub: {
      kept: {
        summary: "Left Kitchen table, keeping the drops (G05-leave)",
        value: { club_id: kt.id, left_at: at.friday6Morning, contributions: "keep" },
      },
    },
    previewBlock: {
      shared: {
        summary: "Blocking Sam names the two clubs Ben shares with them (S02-block)",
        value: { name: "Sam", shared_clubs: [sp, kt] },
      },
    },
    blockMember: {
      blocked: {
        summary: "Blocked, and left both clubs",
        value: { block_id: "blk_ben_1", left_club_ids: [sp.id, kt.id], past_contributions: "keep" },
      },
    },
    listBlocks: {
      one: {
        summary: "Ben's blocked accounts (S02-blocked-list)",
        value: { items: [{ block_id: "blk_ben_1", name: "Sam" }] },
      },
      none: { summary: "Nobody blocked", value: { items: [] } },
    },
  },
};
