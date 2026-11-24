// The contract's shapes that several answers share, each an explicit field list (T55): a day as the
// contract's `Occurrence`, and the caller's own `Allowance` in one (T15, T17). A command's refusal carries
// both (answers.ts' `refusal`), so they live apart from any one route.

import { contractInstant, type Allowance, type Json, type PlacedDay } from "@tadayo/domain";

/** The contract's `Person` for a day's star, as `placed` names them (FQ75): the avatar version only when there is one. */
export function starBody(star: PlacedDay["star"]): Json {
  return {
    membership_id: star.membershipId,
    display_name: star.displayName,
    ...(star.avatarVersion === null ? {} : { avatar_version: star.avatarVersion }),
  };
}

/** The contract's `Occurrence`: its instants in whole seconds, its star as `starBody` writes them. */
export function occurrenceBody(day: PlacedDay): Json {
  return {
    id: day.id,
    club_id: day.clubId,
    star: starBody(day.star),
    local_date: day.localDate,
    reveal_at: contractInstant(day.revealAt),
    close_at: contractInstant(day.closeAt),
    phase: day.phase,
  };
}

/** The contract's `Allowance`: the caller's own counts and their role's limits in one day, nobody else's (T15). */
export function allowanceBody(allowance: Allowance): Json {
  return {
    added: allowance.added,
    reserved: allowance.reserved,
    limit: allowance.limit,
    photo_added: allowance.photoAdded,
    photo_reserved: allowance.photoReserved,
    photo_limit: allowance.photoLimit,
    external_added: allowance.externalAdded,
    external_reserved: allowance.externalReserved,
    external_limit: allowance.externalLimit,
    is_star: allowance.isStar,
  };
}
