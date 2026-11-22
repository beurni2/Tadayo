/// <reference lib="esnext.temporal" />
// `GET /v1/clubs/{club_id}/home` (the contract's `getHome` and `Home`; spec 06, 08, 15, 32; T1, T5, T9, T14,
// T34, T35, T55; docs/plans/api-b2-home.md). The rules are the domain's (packages/domain/src/clubs/home.ts): the
// handler takes the clock's sample first in one read-only transaction, reads Home in one statement, and
// serializes it by an explicit field list (T55). Home goes to the club's members only; anyone else gets the
// neutral not-found, the same answer as an id nobody has (T14). It records nothing (T34).
//
// The open day's page is the domain's first page of it: each drop the viewer may see, star first, and the
// highlight rail. Its reactions, favourites and reply previews are B6's: the domain's read refuses a page whose
// drops have a reaction or a comment, or the viewer's own favourite (the plan's section 0.1), so each drop's
// `reactions` is empty and `viewer_favourite` false, truly; that refusal reaches the app as a server error,
// never as a page that hides something.

import {
  contractInstant,
  readHome,
  type HomeBase,
  type HomeRead,
  type Json,
  type PageDrop,
  type RailEntry,
  type RecentDay,
} from "@tadayo/domain";
import { ok, problem } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";
import { personBody } from "../schedule/routes.ts";
import { occurrenceBody } from "./list.ts";

/** The contract's ClubRef. */
function clubRef(base: HomeBase): Json {
  return {
    id: base.club.id,
    name: base.club.name,
    timezone: base.club.timezone,
    my_membership_id: base.club.membershipId,
  };
}

/** The contract's DayLink: the day, and its cover only when there is one. */
function dayLinkBody(recent: RecentDay): Json {
  return {
    occurrence: occurrenceBody(recent.day),
    ...(recent.coverDropId === null ? {} : { cover_drop_id: recent.coverDropId }),
  };
}

/**
 * The contract's RevealedDayDrop: the photo's frame or the video's provider, as the media class has it, the
 * caption only when there is one, and B6's parts empty (the header).
 */
function pageDropBody(drop: PageDrop): Json {
  return {
    view: "revealed",
    id: drop.id,
    author: personBody(drop.author),
    media_class: drop.mediaClass,
    ...(drop.caption === null ? {} : { caption: drop.caption }),
    highlight: drop.highlight,
    ...(drop.photo === null
      ? {}
      : { photo: { width: drop.photo.width, height: drop.photo.height, media_version: drop.photo.mediaVersion } }),
    ...(drop.video === null ? {} : { video: { provider: drop.video.provider } }),
    reactions: [],
    viewer_favourite: false,
    section: drop.section,
  };
}

/** The contract's HighlightEntry. */
function railEntryBody(entry: RailEntry): Json {
  return { drop_id: entry.dropId, author: personBody(entry.author), star_pick: entry.starPick };
}

/** The contract's Home: `now` is the clock's sample, whole seconds, rounded down. */
export function homeBody(now: Temporal.Instant, home: HomeRead): Json {
  const serverNow = contractInstant(now);
  const base = { server_now: serverNow, club: clubRef(home), club_today: home.clubToday };
  switch (home.mode) {
    case "unavailable":
    case "awaiting_activation":
    case "no_days":
      return { mode: home.mode, ...base };
    case "paused":
      return { mode: home.mode, ...base, recent_days: home.recentDays.map(dayLinkBody) };
    case "waiting":
      return {
        mode: home.mode,
        ...base,
        next: occurrenceBody(home.next),
        recent_days: home.recentDays.map(dayLinkBody),
      };
    case "day":
      return {
        mode: home.mode,
        ...base,
        day: {
          stage: "revealed",
          server_now: serverNow,
          occurrence: occurrenceBody(home.day.occurrence),
          club: clubRef(home),
          viewer: { is_star: home.day.isStar, joined_later: home.day.joinedLater },
          ...(home.day.addTarget === null ? {} : { add_target: occurrenceBody(home.day.addTarget) }),
          drops: home.day.drops.map(pageDropBody),
          highlights: home.day.highlights.map(railEntryBody),
        },
        ...(home.next === null ? {} : { next: occurrenceBody(home.next) }),
        recent_days: home.recentDays.map(dayLinkBody),
      };
  }
}

export function getHomeHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const params = request.params as Readonly<Record<string, unknown>> | null;
    const clubId = typeof params?.["club_id"] === "string" ? params["club_id"] : "";
    // Read only, and the server's instant first: Home is one statement, so one snapshot (T1, T5, T34).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      const home = await readHome(tx, account.id, clubId, now);
      return home === null ? null : homeBody(now, home);
    });
    return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);
  };
}
