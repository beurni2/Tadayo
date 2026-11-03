// Named examples for the mock: each is one scene from the book, picked with Prism's
// `Prefer: example=<name>` header (the first is the default). `examples.test.ts` checks every one
// against its operation's schema, so an example can't drift from the contract.
import type { ErrorCodeName } from "../errors.ts";
import { AFTER_EXAMPLES } from "./examples-after.ts";
import { CLUB_EXAMPLES } from "./examples-clubs.ts";
import { at, clubs, day, people } from "./world.ts";

export interface Example {
  summary: string;
  value: unknown;
}
export type Examples = Record<string, Example>;

const sp = clubs.sundayPeople;
const tiktok = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

// Debby's Friday 6 November, open, as Ben sees it at 9:41 AM (H01-open, R02-photo).
export const debby6Open = day("sundayPeople", "debby", 6, "open");
export const debby13 = day("sundayPeople", "debby", 13, "collecting");

const photo = (width: number, height: number, version: string) => ({ width, height, media_version: version });

const revealed = (id: string, author: keyof typeof people, extra: Record<string, unknown> = {}) => ({
  view: "revealed",
  id,
  author: people[author],
  media_class: "photo",
  highlight: false,
  photo: photo(3024, 4032, `mv_${id}_1`),
  reactions: [],
  viewer_favourite: false,
  ...extra,
});

// The feed in commit order (T35), Maya's chair first (H01-open). Ben sees who reacted only to his own drop
// (FQ73): on Sam's photo, the heart alone, and his own in `viewer_reaction`.
export const debby6Drops = [
  revealed("drp_maya_chair", "maya", { caption: "Your future living room.", highlight: true }),
  revealed("drp_debby_6_own", "debby", { highlight: true }),
  revealed("drp_sam_hill", "sam", {
    caption: "We said we’d go back here.",
    highlight: true,
    photo: photo(4032, 2268, "mv_drp_sam_hill_1"),
    reactions: [{ reaction: "heart" }],
    viewer_reaction: "heart",
    viewer_favourite: true,
  }),
  revealed("drp_ben_6", "ben", { highlight: true, reactions: [{ reaction: "heart", people: [people.debby] }] }),
  {
    view: "revealed",
    id: "drp_nina_6_video",
    author: people.nina,
    media_class: "external_video",
    caption: "This is you every Friday.",
    highlight: false,
    video: { provider: "tiktok" },
    reactions: [],
    viewer_favourite: false,
  },
];

// The star's pick, then the club's schedule order from Monday (FQ26): Debby, Ben, Maya, Sam.
const debby6Rail = [
  { drop_id: "drp_debby_6_own", author: people.debby, star_pick: true },
  { drop_id: "drp_ben_6", author: people.ben, star_pick: false },
  { drop_id: "drp_maya_chair", author: people.maya, star_pick: false },
  { drop_id: "drp_sam_hill", author: people.sam, star_pick: false },
];

const notStar = { is_star: false, joined_later: false };

export const debby6Day = {
  stage: "revealed",
  server_now: at.friday6Morning,
  occurrence: debby6Open,
  club: sp,
  viewer: notStar,
  add_target: debby13,
  drops: debby6Drops,
  highlights: debby6Rail,
};

// Ben's two drops for Debby's Friday 13 November (F02-your-drops): his highlight, then another.
const benOwn13 = {
  view: "own",
  id: "drp_ben_13",
  author: people.ben,
  media_class: "photo",
  caption: "Coffee, obviously.",
  highlight: true,
  state: "added",
  version: 1,
};

const benOwn13b = {
  view: "own",
  id: "drp_ben_13_b",
  author: people.ben,
  media_class: "photo",
  caption: "Still my favourite.",
  highlight: false,
  state: "added",
  version: 1,
};

// Debby's Friday 13 November, collecting, as Ben sees it on Tuesday (F02-upcoming): others' captions,
// and his own drops.
export const debby13Day = {
  stage: "upcoming",
  server_now: at.tuesday10Morning,
  occurrence: debby13,
  club: sp,
  viewer: notStar,
  add_target: debby13,
  drops: [
    {
      view: "caption",
      id: "drp_maya_13",
      author: people.maya,
      media_class: "photo",
      caption: "Your future living room.",
    },
    {
      view: "caption",
      id: "drp_sam_13",
      author: people.sam,
      media_class: "photo",
      caption: "We said we’d go back here.",
    },
    benOwn13,
    { view: "caption", id: "drp_nina_13", author: people.nina, media_class: "external_video" },
    benOwn13b,
  ],
};

export const allowance = (added: number, external = 0, reserved = 0, externalReserved = 0) => ({
  added,
  reserved,
  limit: 6,
  external_added: external,
  external_reserved: externalReserved,
  external_limit: 2,
});

const link = (date: number | string, who: Parameters<typeof day>[1], cover?: string) => ({
  occurrence: day("sundayPeople", who, date, "past"),
  ...(cover ? { cover_drop_id: cover } : {}),
});

// H01-waiting's Earlier days: Sam's Thursday 5 November and Debby's Friday 30 October.
const recentBeforeFriday6 = [link(5, "sam", "drp_maya_5"), link("2026-10-30", "debby", "drp_alex_30")];

const homeBase = (now: string, today: string) => ({ server_now: now, club: sp, club_today: today });

const benDay9 = day("sundayPeople", "ben", 9, "open");

const SUCCESS: Record<string, Examples> = {
  getMe: {
    ben: {
      summary: "Ben, signed in with his profile done",
      value: { id: "acct_ben", display_name: "Ben", avatar_version: "av_ben_1", age_confirmed: true, version: 3 },
    },
    new_account: {
      summary: "A new account before the age confirmation and a name (A02-age)",
      value: { id: "acct_new", age_confirmed: false, version: 0 },
    },
  },
  updateMe: {
    named: {
      summary: "Ben's name is set (A03-profile)",
      value: { id: "acct_ben", display_name: "Ben", age_confirmed: true, version: 2 },
    },
  },
  deleteMyAvatar: {
    removed: {
      summary: "Back to the initial",
      value: { id: "acct_ben", display_name: "Ben", age_confirmed: true, version: 4 },
    },
  },
  listMyDrops: {
    mine: {
      summary: "Ben's own drops (S03-contributions)",
      value: {
        items: [benOwn13, benOwn13b].map((drop) => ({
          drop_id: drop.id,
          club: sp,
          occurrence: debby13,
          media_class: drop.media_class,
          caption: drop.caption,
          state: drop.state,
          version: drop.version,
        })),
      },
    },
  },
  deleteAccount: {
    deleting: { summary: "Deletion started", value: { state: "deleting", requested_at: at.monday9Morning } },
  },
  registerDevice: {
    registered: {
      summary: "Registered in New York",
      value: { apns_environment: "production", timezone: "America/New_York", registered_at: at.monday9Morning },
    },
  },
  getConfig: {
    trial: {
      summary: "The trial's provider switches: TikTok plays here, Instagram opens the original (FQ11)",
      value: {
        providers: [
          { provider: "tiktok", accepting_links: true, player: true },
          { provider: "instagram", accepting_links: true, player: false },
        ],
      },
    },
  },
  getNotificationPreferences: {
    defaults: {
      summary: "The defaults: caption previews off (spec 20)",
      value: { version: 0, day_ready: true, responses: true, text_previews: false },
    },
  },
  setNotificationPreferences: {
    set: {
      summary: "Reactions and comments off",
      value: { version: 1, day_ready: true, responses: false, text_previews: false },
    },
  },
  getClubNotificationPreferences: {
    defaults: { summary: "Both on", value: { version: 0, day_ready: true, responses: true } },
  },
  setClubNotificationPreferences: {
    set: { summary: "Day is ready off for this club", value: { version: 1, day_ready: false, responses: true } },
  },
  getHome: {
    open: {
      summary: "Friday 6 November, 9:41 AM: Home is Debby's Friday (H01-open)",
      value: {
        mode: "day",
        ...homeBase(at.friday6Morning, "2026-11-06"),
        day: debby6Day,
        next: day("sundayPeople", "nina", 7, "collecting"),
        recent_days: recentBeforeFriday6,
      },
    },
    waiting: {
      summary: "Friday 6 November, 1:41 AM: Debby opens at 7 AM, in 5h 19m (H01-waiting)",
      value: {
        mode: "waiting",
        ...homeBase(at.friday6Night, "2026-11-06"),
        next: day("sundayPeople", "debby", 6, "collecting"),
        recent_days: recentBeforeFriday6,
      },
    },
    first_drop: {
      summary:
        "Friday 6 November, 9:41 AM, just after joining: Debby's Friday is open and Add goes to Friday 13 " +
        "November (H01-first-drop, book p10; the prompt is the app's own)",
      value: {
        mode: "day",
        ...homeBase(at.friday6Morning, "2026-11-06"),
        day: { ...debby6Day, viewer: { is_star: false, joined_later: true }, drops: [], highlights: [] },
        next: day("sundayPeople", "nina", 7, "collecting"),
        recent_days: [],
      },
    },
    after_close: {
      summary: "Saturday 7 November, 1:01 AM: Nina opens in 5h 59m; Debby's Friday is in Memories (H01-after-close)",
      value: {
        mode: "waiting",
        ...homeBase(at.saturday7Night, "2026-11-07"),
        next: day("sundayPeople", "nina", 7, "collecting"),
        recent_days: [link(6, "debby", "drp_debby_6_own"), link(5, "sam", "drp_maya_5")],
      },
    },
    sunday: {
      summary: "Sunday 8 November, 9:41 AM: Ben's Monday opens in 21h 19m, with this week (H01-sunday)",
      value: {
        mode: "waiting",
        ...homeBase(at.sunday8Morning, "2026-11-08"),
        next: day("sundayPeople", "ben", 9, "collecting"),
        recent_days: [
          link(7, "nina", "drp_nina_7"),
          link(6, "debby", "drp_debby_6_own"),
          link(5, "sam", "drp_maya_5"),
          link(4, "alex", "drp_alex_4"),
          link(3, "maya", "drp_maya_3"),
          link(2, "ben", "drp_ben_2"),
        ],
      },
    },
    quiet: {
      summary: "Friday 6 November, 9:41 AM, nothing added for Debby's Friday; next is Nina (H01-quiet)",
      value: {
        mode: "day",
        ...homeBase(at.friday6Morning, "2026-11-06"),
        day: { ...debby6Day, drops: [], highlights: [] },
        next: day("sundayPeople", "nina", 7, "collecting"),
        recent_days: recentBeforeFriday6,
      },
    },
    your_day: {
      summary: "Monday 9 November, 9:41 AM: Ben's own day, with his pick first (H01-your-day)",
      value: {
        mode: "day",
        ...homeBase(at.monday9Morning, "2026-11-09"),
        day: {
          stage: "revealed",
          server_now: at.monday9Morning,
          occurrence: benDay9,
          club: sp,
          viewer: { is_star: true, joined_later: false },
          add_target: day("sundayPeople", "ben", 16, "collecting"),
          drops: [
            revealed("drp_ben_9_own", "ben", { caption: "This week, mostly this.", highlight: true }),
            revealed("drp_maya_9", "maya", { highlight: true }),
            revealed("drp_sam_9", "sam", { highlight: true }),
          ],
          // Ben's pick, then the club's schedule order from Monday (FQ26): Maya, Sam.
          highlights: [
            { drop_id: "drp_ben_9_own", author: people.ben, star_pick: true },
            { drop_id: "drp_maya_9", author: people.maya, star_pick: false },
            { drop_id: "drp_sam_9", author: people.sam, star_pick: false },
          ],
        },
        next: day("sundayPeople", "maya", 10, "collecting"),
        recent_days: [link(7, "nina", "drp_nina_7"), link(6, "debby", "drp_debby_6_own")],
      },
    },
    ...CLUB_EXAMPLES.home,
  },
  getOccurrence: {
    upcoming: {
      summary: "Debby's Friday 13 November as Ben sees it before the reveal: captions only (F02-upcoming)",
      value: debby13Day,
    },
    open: { summary: "Debby's Friday 6 November, open (R01)", value: debby6Day },
    past: {
      summary: "Debby's Friday 6 November from Memories, on Monday 9 November (R01-past-day)",
      value: {
        ...debby6Day,
        server_now: at.monday9Morning,
        occurrence: day("sundayPeople", "debby", 6, "past"),
        add_target: undefined,
      },
    },
    joined_later: {
      summary: "A day Ben joined after it began collecting: partly visible, with no numbers (F02-joined-later)",
      value: { ...debby13Day, viewer: { is_star: false, joined_later: true }, drops: [benOwn13] },
    },
    unavailable: {
      summary: "A cancelled day: its date and nothing in it, with no reason (spec 06)",
      value: {
        stage: "unavailable",
        server_now: at.tuesday10Morning,
        occurrence: day("sundayPeople", "alex", 11, "unavailable"),
        club: sp,
        viewer: notStar,
      },
    },
  },
  getOwnDay: {
    your_drops: {
      summary: "Ben's own drops for Debby's Friday 13 November: two added, the first his highlight (F02-your-drops)",
      value: {
        server_now: at.tuesday10Morning,
        occurrence: debby13,
        club: sp,
        allowance: allowance(2),
        highlight: { drop_id: "drp_ben_13", version: 1 },
        drops: [benOwn13, benOwn13b],
      },
    },
    nothing_yet: {
      summary: "Nothing added yet",
      value: {
        server_now: at.tuesday10Morning,
        occurrence: debby13,
        club: sp,
        allowance: allowance(0),
        highlight: { version: 0 },
        drops: [],
      },
    },
  },
  getDrop: {
    revealed: {
      summary: "Sam's photo on Debby's Friday 6 November (R02-photo)",
      value: { server_now: at.friday6Morning, occurrence: debby6Open, club: sp, drop: debby6Drops[2] },
    },
    caption_only: {
      summary: "Maya's drop for Debby's Friday 13 November before the reveal: its caption only (T10)",
      value: { server_now: at.tuesday10Morning, occurrence: debby13, club: sp, drop: debby13Day.drops[0] },
    },
  },
  createUpload: {
    pending: {
      summary: "A photo upload, waiting for its bytes",
      value: {
        id: "upl_ben_1",
        purpose: "drop_photo",
        state: "pending",
        expires_at: "2026-11-11T14:41:00Z",
        signed_upload: {
          url: "https://dev-project.supabase.co/storage/v1/object/upload/sign/uploads/f3a9c1d2e8b7?token=example",
          method: "PUT",
          headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
          expires_at: "2026-11-10T16:41:00Z",
        },
      },
    },
  },
  getUpload: {
    ready: {
      summary: "Ready to commit",
      value: { id: "upl_ben_1", purpose: "drop_photo", state: "ready", expires_at: "2026-11-11T14:41:00Z" },
    },
    preparing: {
      summary: "Being checked (C07-processing)",
      value: { id: "upl_ben_1", purpose: "drop_photo", state: "preparing", expires_at: "2026-11-11T14:41:00Z" },
    },
    rejected: {
      summary: "Not a supported image (C02-unsupported)",
      value: {
        id: "upl_ben_1",
        purpose: "drop_photo",
        state: "rejected",
        rejection: "unsupported_type",
        expires_at: "2026-11-11T14:41:00Z",
      },
    },
  },
  completeUpload: {
    preparing: {
      summary: "Being checked",
      value: { id: "upl_ben_1", purpose: "drop_photo", state: "preparing", expires_at: "2026-11-11T14:41:00Z" },
    },
  },
  resolveSource: {
    tiktok: {
      summary: "A TikTok link, for its author only (C04-link, T40)",
      value: { id: "src_ben_1", provider: "tiktok", original_url: tiktok, expires_at: "2026-11-11T14:41:00Z" },
    },
  },
  createReservation: {
    held: {
      summary: "A slot held in Debby's Friday 13 November",
      value: {
        id: "rsv_ben_2",
        occurrence_id: debby13.id,
        media_class: "photo",
        expires_at: "2026-11-10T15:11:00Z",
        allowance: allowance(1, 0, 1),
      },
    },
  },
  releaseReservation: {
    released: {
      summary: "Kept as a draft instead",
      value: { id: "rsv_ben_2", state: "released", allowance: allowance(1) },
    },
    consumed: {
      summary: "Its commit had landed: Added, though the answer was lost (T20)",
      value: { id: "rsv_ben_2", state: "consumed", drop_id: "drp_ben_13_b" },
    },
  },
  createDrop: {
    added: {
      summary: "Added for Debby's Friday 13 November (F02-added)",
      value: {
        drop_id: "drp_ben_13",
        occurrence: debby13,
        media_class: "photo",
        state: "added",
        version: 1,
        allowance: allowance(1),
        highlight: { version: 0 },
      },
    },
  },
  updateDrop: {
    edited: { summary: "The caption changed", value: { drop_id: "drp_ben_13", state: "added", version: 2 } },
    replacing: {
      summary: "A replacement photo is being checked",
      value: { drop_id: "drp_ben_13", state: "preparing", version: 3 },
    },
  },
  removeDrop: {
    before_reveal: {
      summary: "Withdrawn before the reveal: the slot is free and the highlight cleared (F02-withdraw)",
      value: { drop_id: "drp_ben_13", state: "withdrawn", allowance: allowance(0), highlight: { version: 2 } },
    },
    after_reveal: {
      summary: "Withdrawn after the reveal (S01-withdraw)",
      value: { drop_id: "drp_ben_6", state: "withdrawn" },
    },
    pictured: {
      summary: "Removed by someone in the photo: no approval, no reason shown (S01-pictured-removal, T25)",
      value: { drop_id: "drp_sam_hill", state: "removed" },
    },
  },
  hideDrop: {
    hidden: {
      summary: "Hidden from Ben's own view (S01-member-menu)",
      value: { drop_id: "drp_nina_6_video", hidden: true },
    },
  },
  createReport: {
    received: { summary: "Received (S01-report)", value: { report_id: "rpt_ben_1", state: "received" } },
  },
  setHighlight: { set: { summary: "Ben's highlight (C08-choose)", value: { drop_id: "drp_ben_13", version: 2 } } },
  getAuthorPreview: {
    link: {
      summary: "Ben's own video link before the reveal (C02-link, T11)",
      value: { provider: "tiktok", original_url: tiktok },
    },
  },
  getEmbed: {
    tiktok: {
      summary: "TikTok's official player (E01-entry)",
      value: {
        provider: "tiktok",
        original_url: tiktok,
        player_url: "https://www.tiktok.com/player/v1/6718335390845095173?rel=0",
      },
    },
    no_player: {
      summary: "An Instagram reel: Open original only (E01-instagram, FQ11)",
      value: { provider: "instagram", original_url: "https://www.instagram.com/reel/C0example/" },
    },
  },
  ...AFTER_EXAMPLES,
  ...CLUB_EXAMPLES.operations,
};

export function successExamples(operationId: string): Examples | undefined {
  return SUCCESS[operationId];
}

export function allSuccessExamples(): Record<string, Examples> {
  return SUCCESS;
}

// Errors that carry facts get a scene; the rest are their code alone.
const ERROR_SCENES: Partial<Record<ErrorCodeName, unknown>> = {
  OCCURRENCE_CLOSED: {
    // C07-missed-cutoff: not added to Friday 6 November; Friday 13 November offered for review.
    code: "OCCURRENCE_CLOSED",
    target: debby6Open,
    next_target: debby13,
  },
  QUOTA_FULL: { code: "QUOTA_FULL", target: debby13, allowance: allowance(6, 1) }, // C07-limit
  EXTERNAL_LIMIT: { code: "EXTERNAL_LIMIT", target: debby13, allowance: allowance(3, 2) }, // C02-external-limit
  DUPLICATE_DROP: { code: "DUPLICATE_DROP", existing_drop_id: "drp_ben_13" }, // C02-duplicate
  VERSION_CONFLICT: { code: "VERSION_CONFLICT", current_version: 3 },
  ROSTER_CHANGED: { code: "ROSTER_CHANGED", current_id: "rev_kt_leila_2" }, // G02-changed
  MEMBERSHIP_CHANGED: { code: "MEMBERSHIP_CHANGED", target: debby13 },
  RATE_LIMITED: { code: "RATE_LIMITED", retry_after_seconds: 30 },
};

export function errorExample(code: ErrorCodeName): unknown {
  return ERROR_SCENES[code] ?? { code };
}
