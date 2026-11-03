// After the reveal: reactions, comments, favourites and Memories, as Ben sees them.
import type { Examples } from "./examples.ts";
import { day, people } from "./world.ts";

const debby6Past = day("sundayPeople", "debby", 6, "past");

// Ben sees the heart on Sam's photo without names, and his own in `viewer_reaction` (FQ73).
const samHill = {
  view: "revealed",
  id: "drp_sam_hill",
  author: people.sam,
  media_class: "photo",
  caption: "We said we’d go back here.",
  highlight: true,
  photo: { width: 4032, height: 2268, media_version: "mv_drp_sam_hill_1" },
  reactions: [{ reaction: "heart" }],
  viewer_reaction: "heart",
  viewer_favourite: true,
};

const mayaChair = {
  view: "revealed",
  id: "drp_maya_chair",
  author: people.maya,
  media_class: "photo",
  caption: "Your future living room.",
  highlight: true,
  photo: { width: 3024, height: 4032, media_version: "mv_drp_maya_chair_1" },
  reactions: [],
  viewer_favourite: true,
};

const comment = (id: string, who: "debby" | "maya" | "ben", text: string, extra: Record<string, unknown> = {}) => ({
  id,
  author: people[who],
  text,
  edited: false,
  version: 1,
  ...extra,
});

export const AFTER_EXAMPLES: Record<string, Examples> = {
  setReaction: {
    heart: {
      summary: "Ben's heart on Sam's photo: the heart shows, with no names and no count (R01-reactions, FQ73)",
      value: { drop_id: "drp_sam_hill", viewer_reaction: "heart", reactions: [{ reaction: "heart" }] },
    },
  },
  clearReaction: {
    cleared: {
      summary: "Ben's heart removed; Debby's is still there",
      value: { drop_id: "drp_sam_hill", reactions: [{ reaction: "heart" }] },
    },
  },
  listComments: {
    thread: {
      summary: "The thread on Sam's photo (R04-comments)",
      value: {
        items: [
          comment("cmt_debby_1", "debby", "Next summer. No excuses."),
          comment("cmt_maya_1", "maya", "I’m saving this as evidence.", {
            reply_to: { comment_id: "cmt_debby_1", author: people.debby },
          }),
        ],
        thread_muted: false,
      },
    },
    empty: { summary: "No comments yet (R04-empty)", value: { items: [], thread_muted: false } },
  },
  createComment: {
    added: {
      summary: "Ben's comment",
      value: { comment_id: "cmt_ben_1", drop_id: "drp_sam_hill", edited: false, version: 1 },
    },
  },
  updateComment: {
    edited: {
      summary: "Ben's comment, edited (R04-edit)",
      value: { comment_id: "cmt_ben_1", drop_id: "drp_sam_hill", edited: true, version: 2 },
    },
  },
  setThreadNotifications: { muted: { summary: "Muted (R04-menu)", value: { drop_id: "drp_sam_hill", muted: true } } },
  saveFavourite: { saved: { summary: "Saved privately", value: { drop_id: "drp_sam_hill", favourite: true } } },
  listFavourites: {
    two: {
      summary: "Ben's favourites, newest saved first: Maya's chair and Sam's photo (M02-favourites)",
      value: {
        items: [
          { drop: mayaChair, occurrence: debby6Past },
          { drop: samHill, occurrence: debby6Past },
        ],
      },
    },
    empty: { summary: "Nothing saved yet (M02-empty)", value: { items: [] } },
  },
  listMemories: {
    days: {
      summary: "Sunday people's past days, as Ben sees them on Monday 9 November (M01-memories)",
      value: {
        items: [
          { occurrence: day("sundayPeople", "nina", 7, "past"), cover_drop_id: "drp_nina_7" },
          { occurrence: debby6Past, cover_drop_id: "drp_maya_chair" },
          { occurrence: day("sundayPeople", "sam", 5, "past"), cover_drop_id: "drp_maya_5" },
          { occurrence: day("sundayPeople", "alex", 4, "past"), cover_drop_id: "drp_alex_4" },
          { occurrence: day("sundayPeople", "maya", 3, "past"), cover_drop_id: "drp_maya_3" },
          { occurrence: day("sundayPeople", "ben", 2, "past"), cover_drop_id: "drp_ben_2" },
        ],
        // October is the next page; a cursor reads as nothing (Cursor).
        next_cursor: "q8ZrT2vLm5XcW0nB",
      },
    },
    empty: { summary: "Your first memories are ahead (M01-empty)", value: { items: [] } },
  },
  searchMemories: {
    caption: {
      summary: "A search for 'back here' (M01-search)",
      value: { items: [{ occurrence: debby6Past, drop: samHill }] },
    },
    none: { summary: "No results (M01-no-results)", value: { items: [] } },
  },
};
