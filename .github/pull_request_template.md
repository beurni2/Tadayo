## What and why

<!-- Two or three lines. The stage, lane and slice, e.g. "B3 · api · media gateway". -->

## Spec, book and invariants

<!-- Spec sections and book pages touched (docs/tadayo-build-spec-v3.md, docs/tadayo-design-book-2.1.md), and every invariant this change touches (docs/INVARIANTS.md), e.g. "spec 14, 33, book p34 · T9 T10 T12". -->

## Plan

<!-- Before building: the approach, the tests you'll write first, the risks. Keep it short. -->

## How it was verified

<!-- Tests added or changed, CI, privacy-matrix rows, leak-scanner results, snapshots, device checks. Say plainly what you could not verify. -->

## Evidence

<!-- Links to snapshots, contact sheets or MP4s on the evidence branch, and the TestFlight build if there is one. -->

## Design handoff

<!-- If this slice needs states the inventory lists as missing: the handoff for Claude Design, in one code block (docs/DESIGN-HANDOFF.md). Otherwise "None". -->

## Risks and open questions

<!-- Anything the founder should know. New questions also go in docs/QUESTIONS.md. -->

## Review

<!-- The independent review (docs/GITHUB.md): each finding, and whether it was fixed (with the commit) or answered (with the reason). -->

- [ ] Reviewed by a fresh subagent that hadn't seen the work
- [ ] Privacy and security review too, if this touches authorization, the database, time, idempotency, media, caches, tokens, notifications or the video viewer
- [ ] Every finding fixed, or answered here with a reason
- [ ] `ci` green on the last push (once it exists)
- [ ] `docs/JOURNAL.md`: an entry for each commit, the state rewritten, the audit map and this PR's row in section 4 up to date (`python3 tools/ci/journal_check.py --branch` passes)

## Ready for the founder

<!-- Filled in when the review is done and `ci` is green (once it exists): what changed, the evidence, what the review found (fixed / answered), and what you need from the founder. -->
