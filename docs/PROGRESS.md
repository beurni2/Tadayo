# Progress

Keep this current. It's the short view, and the first file the next session reads after the journal's state section. Each lane keeps its own section.

## Shared

- **Done:** the starter pack, merged to `main` as PR #1 (`0a6c91c`) on 2026-11-02, with its document fixes and the founder's answers of 1 and 2 November (ADR-016 to ADR-021). The B0 plan, merged as PR #2 (`1c4a4b5`) on 2026-11-02 at the founder's approval, with the merge rule (ADR-022), the dev API host (ADR-023), FQ38 and FQ39. The rulebook brought in line with the merge rule and FQ38's answer (ADR-024: spikes S1, S2 and S4 run before Gate A), merged as PR #3 (`208c809`) on 2026-11-02 at the founder's approval. Design handoff 0 (the brand) as reference files, ahead of the app code, merged as PR #4 (`7ab4bdc`) on 2026-11-02 at the founder's approval, after two review rounds. Design handoff 1's 17 states marked `requested 1`, merged as PR #5 (`3d43860`) on 2026-11-02 at the founder's approval. ADR-025's two threads from slice 9, merged as PR #6 (`fa47c87`) on 2026-11-02 at the founder's approval. Slice 1, the pnpm workspace and the copy lint, merged as PR #7 (`674b226`) on 2026-11-03 at the founder's approval. Slice 2, the `ci` workflow, its steps and guard 1, with ADR-026's database made like Supabase's, merged as PR #8 (`c06edbe`) on 2026-11-03 at the founder's approval, after three review rounds, a privacy-and-security review and a check of its description; `ci` is green on `main` and is `main`'s required check. The api thread's environment checks (2026-11-02, `docs/LIMITATIONS.md`): the hosts answer; the journal hook doesn't fire; the CodeRabbit skills still show; Docker's daemon starts by hand but can't pull images; swiftly installed by hand.
- **In progress:** the rulebook PR `plan/b0-rulebook-ci`, at the founder's yes of 2026-11-03: every rule about workflow files now says the session pushes and merges them itself, each in its own PR under a freeze, as PR #8 showed (`docs/LIMITATIONS.md`). Design handoff 1 (sign-in and clubs): its export and a corrections round (handoff 2) are checked and kept in the project's files; they enter the repository together when `docs/plans/B0.md` section 5.2 allows (slice 12 merged and the first build in TestFlight).
- **Next:** the rulebook PR's independent review and the founder's approval. Then slice 9 (`ios/b0-ios-workflow`, `ios.yml`) under a new freeze, asked of the coordinator first. The ios thread starts once `ios.yml` has run green on the latest check branch (`docs/MILESTONES.md`, "Lanes").
- **Blockers / waiting for the founder:** approving the rulebook PR once it says it's ready; FQ40 to FQ44 keep their defaults until answered (FQ42 by B1, FQ44 by slice 11); FQ45 was answered on its card on 2026-11-03 (adopt brand revision 1.1), and the ios thread records it with ADR-027; FQ39 before any destructive migration (none in B0; if answered with its proposal, T57 is reworded in a rulebook PR of its own); the B0 accounts and secrets the plan names (Apple's approval of the enrolment, then the App Store Connect key; Resend's verification of `tadayo.app`; the Supabase project's URL and publishable key). Before Gate A: S2's photo (the plan's F9), the APNs key, and the internal tester on a second iPhone (FQ28), whom spike S1's club needs (the plan's F8).

## api lane

- **Done:**
- **In progress:**
- **Next:**
- **Needs from the other lane:**

## ios lane

- **Done:**
- **In progress:**
- **Next:**
- **Needs from the other lane:**
