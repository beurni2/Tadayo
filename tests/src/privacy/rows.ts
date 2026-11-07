// The privacy matrix's rows: one for each operation of the contract (TECH-DESIGN section 8: "a route
// with no matrix row fails the build"). A row says what each cell (a role, a state of the drop, a
// phase of the day) gets from its route.
//
// The only row in B0's slice 7 is NONE, the skeleton's: every role, in every state and phase, gets
// the neutral not-found (T14; docs/plans/B0.md, slice 7). The harness refuses any other row, so the
// slice that first builds a route defines the row's shape and tests each of its branches. What that
// shape must carry, from the plan's critique (docs/JOURNAL.md, block 1.2, "Next"):
// - for an account route (slice 8: getMe, updateMe, listClubs), the answer each role gets;
// - for the first route that answers drop references (B1, B2), each cell's status and, for each of
//   the world's drops, the form it may take, absent, caption, own or revealed, from the role, the
//   state, the phase and who wrote it, checked by finding drop ids in every answer in every phase;
// - a body, with its Id fields bound through bindings.ts and replaced in the guessed-id step;
// - an object in the world for each binding still marked `missing`;
// - for createUpload, the replays of its intent (TECH-DESIGN section 8), before it grants anything:
//   spike S1's server part needs them before Gate A.

/** The skeleton's row: the neutral not-found to everyone (T14). */
export const NONE = Object.freeze({ answer: "the neutral NOT_FOUND to every role, in every state and phase" });

export const ROWS: Readonly<Record<string, unknown>> = {
  acceptInvitation: NONE,
  approveRoster: NONE,
  blockMember: NONE,
  chooseScheduleDays: NONE,
  clearReaction: NONE,
  completeUpload: NONE,
  confirmScheduleDays: NONE,
  createClub: NONE,
  createComment: NONE,
  createDrop: NONE,
  createInvitation: NONE,
  createReport: NONE,
  createReservation: NONE,
  createUpload: NONE,
  declineRoster: NONE,
  deleteAccount: NONE,
  deleteComment: NONE,
  deleteMyAvatar: NONE,
  getAuthorPreview: NONE,
  getClub: NONE,
  getClubNotificationPreferences: NONE,
  getConfig: NONE,
  getDrop: NONE,
  getDropMedia: NONE,
  getEmbed: NONE,
  getHome: NONE,
  getMe: NONE,
  getMemberAvatar: NONE,
  getMyAvatar: NONE,
  getNotificationPreferences: NONE,
  getOccurrence: NONE,
  getOwnDay: NONE,
  getRosterRevision: NONE,
  getSchedule: NONE,
  getUpload: NONE,
  hideDrop: NONE,
  leaveClub: NONE,
  listBlocks: NONE,
  listClubs: NONE,
  listComments: NONE,
  listFavourites: NONE,
  listMembers: NONE,
  listMemories: NONE,
  listMyDrops: NONE,
  previewBlock: NONE,
  previewInvitation: NONE,
  previewInvitationWeb: NONE,
  proposeRoster: NONE,
  registerDevice: NONE,
  releaseReservation: NONE,
  removeDevice: NONE,
  removeDrop: NONE,
  removeFavourite: NONE,
  resolveSource: NONE,
  revokeInvitation: NONE,
  saveFavourite: NONE,
  searchMemories: NONE,
  sendEvents: NONE,
  setClubNotificationPreferences: NONE,
  setHighlight: NONE,
  setNotificationPreferences: NONE,
  setReaction: NONE,
  setThreadNotifications: NONE,
  updateComment: NONE,
  updateDrop: NONE,
  updateMe: NONE,
};

/** What's wrong with `rows` for `operations`: an operation with no row, a row with no operation, a row that isn't NONE. */
export function rowProblems(operations: readonly { id: string }[], rows: Readonly<Record<string, unknown>>): string[] {
  const ids = new Set(operations.map((operation) => operation.id));
  return [
    ...[...ids].filter((id) => !Object.hasOwn(rows, id)).map((id) => `${id} has no row in the privacy matrix`),
    ...Object.keys(rows)
      .filter((id) => !ids.has(id))
      .map((id) => `${id} has a row but no operation in the contract`),
    ...Object.entries(rows)
      .filter(([, row]) => row !== NONE)
      .map(([id]) => `${id}'s row isn't NONE: the slice that builds a route defines its row and its checks`),
  ];
}
