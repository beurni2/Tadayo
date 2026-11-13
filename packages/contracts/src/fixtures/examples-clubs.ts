// The club examples: Sunday people (six members) and Kitchen table (five, with Leila proposed by Ben,
// book p30). Each is a scene of its own (book p12).
import type { Examples } from "./examples.ts";
import { at, changeFrom, club, clubs, day, member, people, rosters, type Who } from "./world.ts";

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
// naming Debby, which everyone then accepts again, Debby too (FQ66, FQ84).
const leilaRevision = (
  viewer: "ben" | "maya",
  decision: "pending" | "approved" | "declined",
  link: "live" | "accepted" | "used" | "revoked" | "expired" = "live",
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
      proposed_by: member("kitchenTable", "ben"),
      // Only Ben, who proposed Leila, sees the link Ben made and where it stands (T7, handoff 1): made at
      // 9:41 AM on Friday 6 November, for seven days (FQ71). Before it, a first link made at 10 AM on Friday
      // 30 October expired unused seven days later, at 9 AM on Friday 6 November, the clocks gone back.
      ...(viewer === "ben"
        ? {
            invitation:
              link === "expired"
                ? { id: "inv_kt_leila_first", state: link, expires_at: "2026-11-06T14:00:00Z" }
                : { id: "inv_kt_leila", state: link, expires_at: "2026-11-13T14:41:00Z" },
          }
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

type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
const WEEK: readonly WeekdayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Kitchen table's membership change after Leila joins, from Monday 7 December, the first week after the
// days already announced (FQ61), built on G04-change's rules: one week every member confirms as a whole,
// with no choosing, each day naming the member it's proposed for, whoever has confirmed (FQ81). G04-change
// itself draws a pair change from 16 November (world.ts). `announced` is every Kitchen table day from
// Saturday 7 November to Saturday 5 December, the days kept as they were.
const ktChange: Record<WeekdayKey, Who> = {
  monday: "ben",
  tuesday: "alex",
  wednesday: "sam",
  thursday: "nina",
  friday: "leila",
  saturday: "maya",
};
const ktAnnounced = Array.from({ length: 29 }, (_, index) =>
  new Date(Date.parse("2026-11-07T12:00:00Z") + index * 86_400_000).toISOString().slice(0, 10),
).flatMap((date) => {
  const weekday = WEEK[new Date(`${date}T12:00:00Z`).getUTCDay() - 1];
  const holder = rosters.kitchenTable.find(([, day]) => day === weekday);
  return holder ? [day("kitchenTable", holder[0], date, "collecting")] : [];
});
const ktChangeProposal = (myState: "choosing" | "confirmed") => ({
  id: "spr_kt_2",
  version: 1,
  reason: "membership_change",
  effective_from: changeFrom,
  days_per_member: 1,
  slots: WEEK.map((weekday) =>
    ktChange[weekday] === "ben"
      ? { weekday, state: "yours", suggested: true }
      : { weekday, state: "available", held_by: member("kitchenTable", ktChange[weekday]), suggested: false },
  ),
  my_days: ["monday"],
  my_state: myState,
  state: "open",
  announced: ktAnnounced,
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

// Sunday people's first days, as an independent scene from Monday 2 November: the proposal gave each member
// the weekday of their place in the order they joined (Ben Monday to Nina Saturday, as spec 05's examples
// do). A slot is written as its state, a member (the owner of a taken day, or who a day is held by), the
// holders of a contested day, and the November date a confirmed day first opens on (FQ79).
type SlotSpec = readonly [
  state: "yours" | "taken" | "available" | "clash" | "no_reveal",
  who?: Who | readonly Who[] | undefined,
  date?: number,
];
const proposedFor = Object.fromEntries(rosters.sundayPeople.map(([who, weekday]) => [weekday, who])) as Record<
  WeekdayKey,
  Who
>;
const spFirstDays = (
  viewer: Who,
  week: Record<WeekdayKey, SlotSpec>,
  myState: "choosing" | "confirmed" = "choosing",
) => ({
  id: "spr_sp_1",
  version: 1,
  reason: "activation",
  effective_from: "2026-11-02",
  days_per_member: 1,
  slots: WEEK.map((weekday) => {
    const [state, who, date] = week[weekday];
    const person = (name: Who) => member("sundayPeople", name);
    return {
      weekday,
      state,
      ...(state === "taken" && typeof who === "string" ? { owner: person(who) } : {}),
      ...(state === "clash" && Array.isArray(who) ? { holders: who.map(person) } : {}),
      ...(state === "available" && typeof who === "string" ? { held_by: person(who) } : {}),
      ...(date === undefined ? {} : { first_date: `2026-11-${String(date).padStart(2, "0")}` }),
      suggested: proposedFor[weekday] === viewer,
    };
  }),
  my_days: WEEK.filter((weekday) => {
    const [state] = week[weekday];
    return state === "yours" || state === "clash";
  }),
  my_state: myState,
  state: "open",
});
const spFirstDaysSchedule = (
  viewer: Who,
  serverNow: string,
  proposal: Record<string, unknown>,
  confirmed: readonly (readonly [Who, WeekdayKey])[] = [],
) => ({
  server_now: serverNow,
  club: club("sundayPeople", viewer),
  ...(confirmed.length > 0
    ? {
        current: {
          effective_from: "2026-11-02",
          assignments: confirmed.map(([who, weekday]) => ({ weekday, person: member("sundayPeople", who) })),
        },
      }
    : {}),
  proposal,
});
// Thursday 5 November: Maya, Alex, Sam and Nina confirmed on Wednesday at 9 AM, so their first dates are
// Tuesday 10, Wednesday 11, Thursday 12 (Thursday 5's 7 AM was only 22 hours later) and Saturday 7.
const spConfirmedFour = [
  ["maya", "tuesday"],
  ["alex", "wednesday"],
  ["sam", "thursday"],
  ["nina", "saturday"],
] as const;
const spFirstDates: Partial<Record<Who, number>> = { maya: 10, alex: 11, sam: 12, nina: 7 };
const spTakenFour = {
  tuesday: ["taken", "maya", 10],
  wednesday: ["taken", "alex", 11],
  thursday: ["taken", "sam", 12],
  saturday: ["taken", "nina", 7],
} as const;

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
      first_days: {
        summary:
          "Thursday 5 November, Sunday people's first days: every member in the order they joined, and Ben and Debby, not yet confirmed, with no date (F01-friends-first-days, FQ98)",
        value: {
          server_now: at.thursday5Morning,
          club: sp,
          members: rosters.sundayPeople.map(([who], index) => {
            const first = spFirstDates[who];
            return {
              person: people[who],
              position: index + 1,
              cover: index + 1,
              ...(first === undefined ? {} : { next_day: day("sundayPeople", who, first, "collecting") }),
              next_up: who === "nina",
            };
          }),
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
      link_expired: {
        summary:
          "Leila's first link expired unused at 9 AM on Friday 6 November: Ben can make a new one (FQ71; no render shows this row yet)",
        value: leilaRevision("ben", "approved", "expired"),
      },
      accepted: {
        summary: "Leila has accepted: only Ben, who proposed Leila, sees Accepted (handoff 1)",
        value: leilaRevision("ben", "approved", "accepted"),
      },
      another_name: {
        summary:
          "Ben's link for Leila was forwarded and Debby accepted it: Maya is asked to approve Debby, since a different name is a new revision (FQ66)",
        value: leilaRevision("maya", "pending", "live", debbyRevision),
      },
      another_name_proposer: {
        summary:
          "The same revision as Ben sees it: Ben approves Debby too, and Debby hasn't accepted this revision yet (FQ66, FQ84, handoff 1)",
        value: leilaRevision("ben", "pending", "used", debbyRevision),
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
      another_name: {
        summary:
          "Debby, whose acceptance of Ben's link for Leila made a revision under Debby's own name, reviews it and accepts again (G02-changed, FQ66, FQ84)",
        value: {
          ...invitationRoster("changed"),
          revision_id: debbyRevision.id,
          roster: [
            ...invitationRoster("changed").roster.filter((entry) => !entry.is_you),
            { name: debbyRevision.name, kind: "candidate", is_you: true },
          ],
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
          "Debby accepted Ben's link for Leila: a new revision names Debby, which Debby reviews and accepts again (FQ66, G02-changed)",
        value: { invitation_id: "inv_kt_leila", state: "changed" },
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
      change: {
        summary:
          "Kitchen table's membership change after Leila joins, from Monday 7 December: one week everyone confirms, each day naming the member it's proposed for, with the days announced until then kept (G04-change's rules, FQ61)",
        value: ktSchedule(ktChangeProposal("choosing")),
      },
      change_confirmed: {
        summary:
          "The same change once Ben has confirmed it: the same week and version, and nothing about anyone else's confirmation before it starts (FQ81)",
        value: ktSchedule(ktChangeProposal("confirmed")),
      },
      conflict_three: {
        summary:
          "Sunday people's first days, Tuesday 3 November: Ben, Alex and Debby hold Friday, so none of them can confirm it, and only they see each other's names (G04-conflict-three, FQ46, FQ55)",
        value: spFirstDaysSchedule(
          "ben",
          at.tuesday3Morning,
          spFirstDays("ben", {
            monday: ["available"],
            tuesday: ["available", "maya"],
            wednesday: ["available"],
            thursday: ["available", "sam"],
            friday: ["clash", ["ben", "alex", "debby"]],
            saturday: ["available", "nina"],
          }),
        ),
      },
      contested_other: {
        summary:
          "Sam, still choosing, sees Friday contested with no names and no count, and may choose it too (G04-contested-other, FQ46, FQ48)",
        value: spFirstDaysSchedule(
          "sam",
          at.tuesday3Morning,
          spFirstDays("sam", {
            monday: ["available"],
            tuesday: ["available", "maya"],
            wednesday: ["available"],
            thursday: ["yours"],
            friday: ["no_reveal"],
            saturday: ["available", "nina"],
          }),
        ),
      },
      confirm_refused: {
        summary:
          "Alex went back to Wednesday, and Debby can't confirm Friday while Ben holds it too (G04-confirm-refused, FQ55)",
        value: spFirstDaysSchedule(
          "debby",
          at.tuesday3Morning,
          spFirstDays("debby", {
            monday: ["available"],
            tuesday: ["available", "maya"],
            wednesday: ["available", "alex"],
            thursday: ["available", "sam"],
            friday: ["clash", ["ben", "debby"]],
            saturday: ["available", "nina"],
          }),
        ),
      },
      first_days: {
        summary:
          "Thursday 5 November: the days Maya, Alex, Sam and Nina confirmed go ahead from their first dates (FQ79), while Ben and Debby still choose. Friday names Debby for the day picker only: the club's week shows it with no name (G05-schedule-choose-own, FQ48)",
        value: spFirstDaysSchedule(
          "ben",
          at.thursday5Morning,
          spFirstDays("ben", { ...spTakenFour, monday: ["yours"], friday: ["available", "debby"] }),
          spConfirmedFour,
        ),
      },
      first_days_confirmed: {
        summary:
          "The same Thursday as Maya sees it, having confirmed: a day nobody has confirmed names nobody (weekRows, FQ48)",
        value: spFirstDaysSchedule(
          "maya",
          at.thursday5Morning,
          spFirstDays(
            "maya",
            { ...spTakenFour, tuesday: ["yours", undefined, 10], monday: ["available"], friday: ["available"] },
            "confirmed",
          ),
          spConfirmedFour,
        ),
      },
    },
    chooseScheduleDays: {
      chosen: {
        summary:
          "Ben, in conflict_three, chooses Monday: Friday, which Alex and Debby still hold, now has no reveal scheduled and no names for Ben, and the version stays (FQ46, T33)",
        value: spFirstDays("ben", {
          monday: ["yours"],
          tuesday: ["available", "maya"],
          wednesday: ["available"],
          thursday: ["available", "sam"],
          friday: ["no_reveal"],
          saturday: ["available", "nina"],
        }),
      },
      joined_contest: {
        summary:
          "Sam, in contested_other, chooses Friday, joins its holders and sees their names; Thursday is free (FQ46, FQ48)",
        value: spFirstDays("sam", {
          monday: ["available"],
          tuesday: ["available", "maya"],
          wednesday: ["available"],
          thursday: ["available"],
          friday: ["clash", ["ben", "alex", "sam", "debby"]],
          saturday: ["available", "nina"],
        }),
      },
    },
    confirmScheduleDays: {
      confirmed: {
        summary: "Ben confirms Kitchen table's change: the same week and version as before (FQ81)",
        value: ktChangeProposal("confirmed"),
      },
      first_day_confirmed: {
        summary:
          "Ben confirms Monday in the first days: it first opens on Monday 9 November, at least 24 hours away (FQ79), and Friday, which Debby holds, now names nobody for Ben (FQ48)",
        value: spFirstDays(
          "ben",
          { ...spTakenFour, monday: ["yours", undefined, 9], friday: ["available"] },
          "confirmed",
        ),
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
