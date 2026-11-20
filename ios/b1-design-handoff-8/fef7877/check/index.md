# Design handoff 8: the frames, for the check

Branch `ios/b1-design-handoff-8` at `fef7877`. The frames are Claude Design's export (`design/reference/claude-design/handoff-8/frames/`), copied unchanged into `design/reference/screens/`; these sheets only lay them out. The check is `docs/design/handoff-8/check/handoff-8-check.md` on the branch.

- `frames-1-6.png`: A01-welcome, A01-welcome-dark, A01-welcome-xl, G02-web, G02-web-dark, G02-web-xl.
- `frames-7-11.png`: G01-create-failed, G02-checking, G02-invitation-failed, G03-approve-failed, G05-club-details-failed.
- `frames-12-16.png`: G01-invite-people-accept-again, G01-pending-approve, G05-members-invite, G02-changed-name, G05-club-details-active.
- `before-after-*.png`: on the left the frame each builds on, on the right handoff 8's.
    - `A01-welcome`: 2.1's render, then frame 1 (2.1's "Already here? Sign in" is the link the app keeps).
    - `G02-web` and `G02-web-xl`: handoff 1's and handoff 2's frames, then frames 4 and 6.
    - `G01-pending`: handoff 4's, then frame 13 (`G01-pending-approve`).
    - `G01-invite-people`: handoff 4's revoked list, then frame 12 (`G01-invite-people-accept-again`).
    - `G05-club-details`: handoff 6's paused club, then frame 16 (`G05-club-details-active`; Leave club's place is the difference the app keeps).
    - `G02-changed`: handoff 2's, then frame 15 (`G02-changed-name`).
    - `G03-approve`: handoff 4's, then frame 10 (`G03-approve-failed`).
