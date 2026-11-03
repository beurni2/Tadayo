// The club examples: Sunday people (six members) and Kitchen table (five, with Leila proposed by Ben,
// book p30). Each is a scene of its own (book p12).
import type { Examples } from "./examples.ts";
import { at, club, clubs, day, member, people, rosters } from "./world.ts";

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
const leilaRevision = (
  viewer: "ben" | "maya",
  decision: "pending" | "approved" | "declined",
  link: "live" | "revoked" = "live",
) => ({
  id: "rev_kt_leila",
  version: 1,
  club: club("kitchenTable", viewer),
  state: "open",
  proposed_by: member("kitchenTable", "ben"),
  members: rosters.kitchenTable.map(([who]) => member("kitchenTable", who)),
  candidates: [
    {
      id: "cnd_kt_leila",
      label: "Leila",
      // Only Ben, who proposed Leila, sees the link he made (T7): made at 9:41 AM on Friday 6 November,
      // for seven days (FQ71).
      ...(viewer === "ben"
        ? { invitation: { id: "inv_kt_leila", state: link, expires_at: "2026-11-13T14:41:00Z" } }
        : {}),
    },
  ],
  my_decision: decision,
});

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

// Kitchen table's proposal from Monday 16 November once Ben has chosen: Alex, Sam and Maya have confirmed
// Tuesday, Wednesday and Saturday, each named as the day's owner (book p11, FQ78).
const ktOwners: Partial<Record<string, "alex" | "sam" | "maya">> = {
  tuesday: "alex",
  wednesday: "sam",
  saturday: "maya",
};
const ktSlots = (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const).map(
  (weekday, index) => {
    const owner = ktOwners[weekday];
    return {
      weekday,
      state: weekday === "monday" ? "yours" : owner ? "taken" : "available",
      ...(owner ? { owner: member("kitchenTable", owner) } : {}),
      first_date: `2026-11-${String(16 + index)}`,
      suggested: weekday === "monday",
    };
  },
);

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
        summary: "Ben revoked Leila's link: Leila stays proposed, and Ben can make a new link (G01-invite-people)",
        value: leilaRevision("ben", "approved", "revoked"),
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
        summary: "Leila's share link, for Ben to send (G01-invite-people)",
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
        value: {
          server_now: at.friday6Morning,
          club: kt,
          current: {
            effective_from: "2026-10-05",
            assignments: rosters.kitchenTable.map(([who, weekday]) => ({
              weekday,
              person: member("kitchenTable", who),
            })),
          },
          proposal: {
            id: "spr_kt_2",
            version: 1,
            reason: "membership_change",
            effective_from: "2026-11-16",
            days_per_member: 1,
            slots: ktSlots,
            my_days: ["monday"],
            my_state: "choosing",
            state: "open",
          },
        },
      },
    },
    chooseScheduleDays: {
      chosen: {
        summary: "Ben chose Monday",
        value: {
          id: "spr_kt_2",
          version: 2,
          reason: "membership_change",
          effective_from: "2026-11-16",
          days_per_member: 1,
          slots: ktSlots,
          my_days: ["monday"],
          my_state: "choosing",
          state: "open",
        },
      },
    },
    confirmScheduleDays: {
      confirmed: {
        summary: "Ben confirmed Monday",
        value: {
          id: "spr_kt_2",
          version: 3,
          reason: "membership_change",
          effective_from: "2026-11-16",
          days_per_member: 1,
          slots: ktSlots,
          my_days: ["monday"],
          my_state: "confirmed",
          state: "open",
        },
      },
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
