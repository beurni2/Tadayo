// The book's fixture clubs, for the mock and the tests (book p43; docs/MILESTONES.md, "Lanes").
// Sunday people: Ben Monday, Maya Tuesday, Alex Wednesday, Sam Thursday, Debby Friday, Nina Saturday;
// Ben is the viewer unless an example says otherwise. Kitchen table: five members before Leila's
// proposal (book p30); its next day is Maya's (G06-switcher). The book names only Ben, Maya and Leila
// there, so its other members are people from Sunday people rather than invented names.
// People are their membership in each club (spec 31), so Ben in Kitchen table has another id than Ben in
// Sunday people. Real ids are random and say nothing; these spell out the scene so a test reads plainly.
// The club's zone is America/New_York: UTC-4 until the clocks go back at 2 AM on Sunday 1 November 2026,
// and UTC-5 after, so 7 AM is 11:00Z in October and 12:00Z in November. Every example is an independent
// scene (book p12), dated as the book dates it.
import type * as z from "zod";

import type { ClubRef as ClubRefSchema, Occurrence as OccurrenceSchema, Person as PersonSchema } from "../common.ts";

export type Person = z.input<typeof PersonSchema>;
export type Occurrence = z.input<typeof OccurrenceSchema>;
export type ClubRef = z.input<typeof ClubRefSchema>;
type Phase = Occurrence["phase"];

export const ZONE = "America/New_York";

const names = {
  ben: "Ben",
  maya: "Maya",
  alex: "Alex",
  sam: "Sam",
  debby: "Debby",
  nina: "Nina",
  leila: "Leila",
} as const;

export type Who = keyof typeof names;

/** Those with a photo; the others show their initial (book p8, p13). */
const withAvatar: ReadonlySet<Who> = new Set(["ben", "maya", "debby"]);

export type ClubKey = "sundayPeople" | "kitchenTable";

const prefix: Record<ClubKey, string> = { sundayPeople: "sp", kitchenTable: "kt" };

/** A person as a member of one club. */
export function member(club: ClubKey, who: Who): Person {
  return {
    membership_id: `mem_${prefix[club]}_${who}`,
    display_name: names[who],
    ...(withAvatar.has(who) ? { avatar_version: `av_${who}_1` } : {}),
  };
}

/** Sunday people's members, as Ben sees them. */
export const people = {
  ben: member("sundayPeople", "ben"),
  maya: member("sundayPeople", "maya"),
  alex: member("sundayPeople", "alex"),
  sam: member("sundayPeople", "sam"),
  debby: member("sundayPeople", "debby"),
  nina: member("sundayPeople", "nina"),
} as const satisfies Record<string, Person>;

/** A club as `viewer` sees it. */
export function club(key: ClubKey, viewer: Who = "ben"): ClubRef {
  const base = {
    sundayPeople: { id: "club_sunday_people", name: "Sunday people" },
    kitchenTable: { id: "club_kitchen_table", name: "Kitchen table" },
  }[key];
  return { ...base, timezone: ZONE, my_membership_id: member(key, viewer).membership_id };
}

export const clubs = { sundayPeople: club("sundayPeople"), kitchenTable: club("kitchenTable") } as const;

/** The membership order and weekdays of each club (spec 05, T6). */
export const rosters = {
  sundayPeople: [
    ["ben", "monday"],
    ["maya", "tuesday"],
    ["alex", "wednesday"],
    ["sam", "thursday"],
    ["debby", "friday"],
    ["nina", "saturday"],
  ],
  kitchenTable: [
    ["ben", "monday"],
    ["alex", "tuesday"],
    ["sam", "wednesday"],
    ["nina", "thursday"],
    ["maya", "saturday"],
  ],
} as const satisfies Record<ClubKey, readonly (readonly [Who, string])[]>;

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** The UTC instant of `hour`:00 on `date` in New York; the first of the two when the clocks go back (ADR-008). */
export function zoned(date: string, hour: number): string {
  const wanted = `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}, ${String(hour).padStart(2, "0")}:00`;
  const local = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  // New York is four hours behind UTC in summer time and five in winter: keep the offsets that land on
  // the wanted local time, and take the earliest instant.
  const matches = [4, 5]
    .map((hours) => local + hours * 3_600_000)
    .filter((instant) => offsetFormat.format(new Date(instant)) === wanted);
  const first = matches[0];
  if (first === undefined) throw new Error(`${date} ${String(hour)}:00 doesn't exist in ${ZONE}`);
  return new Date(first).toISOString().replace(".000Z", "Z");
}

/** The calendar date after `date`. */
function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Someone's day in New York: 7 AM to 1 AM the next morning (spec 05). A number is a date in November 2026. */
export function day(key: ClubKey, who: Who, date: number | string, phase: Phase): Occurrence {
  const local = typeof date === "number" ? `2026-11-${String(date).padStart(2, "0")}` : date;
  return {
    id: `occ_${prefix[key]}_${who}_${local.replaceAll("-", "_")}`,
    club_id: clubs[key].id,
    star: member(key, who),
    local_date: local,
    reveal_at: zoned(local, 7),
    close_at: zoned(nextDate(local), 1),
    phase,
  };
}

/**
 * The first Monday a schedule change can start, seen from Friday 6 November. The fixtures take the worker
 * to generate four weeks ahead (spec 05 says several weeks; B2 sets the worker's own), so every day to
 * Saturday 5 December is announced and stays as it is (FQ61). G04-change shows 16 November, inside them.
 */
export const changeFrom = "2026-12-07";

/** Times the book's scenes happen at (book p12, p29, p30). */
export const at = {
  tuesday3Morning: "2026-11-03T14:41:00Z", // Tuesday 3 November, 9:41 AM: Sunday people's first days, nobody confirmed
  thursday5Morning: "2026-11-05T14:41:00Z", // Thursday 5 November, 9:41 AM: four confirmed on Wednesday at 9 AM
  friday6Morning: "2026-11-06T14:41:00Z", // Friday 6 November, 9:41 AM: Debby's Friday is open
  friday6Night: "2026-11-06T06:41:00Z", // Friday 6 November, 1:41 AM: Debby opens in 5h 19m
  saturday7Night: "2026-11-07T06:01:00Z", // Saturday 7 November, 1:01 AM: Nina opens in 5h 59m
  sunday8Morning: "2026-11-08T14:41:00Z", // Sunday 8 November, 9:41 AM: Ben opens in 21h 19m
  monday9Morning: "2026-11-09T14:41:00Z", // Monday 9 November, 9:41 AM: Ben's own day
  tuesday10Morning: "2026-11-10T14:41:00Z", // Tuesday 10 November: Debby's Friday 13 is collecting
} as const;
