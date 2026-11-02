# Tadayo

A private club of two to six friends, where each member has a day:
- friends add photos and selected video links for that person's day;
- the captions are visible as soon as they're added;
- the photos and videos open together at 7 AM on the day, for the whole club;
- the day stays on Home until 1 AM, then lives in Memories.

"Your people. Your day."

## Start here

| File | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | How Claude Code works on this repository |
| [`docs/tadayo-build-spec-v3.md`](docs/tadayo-build-spec-v3.md) | The build and design specification, version 3: product rules, permissions, engineering |
| [`docs/tadayo-design-book-2.1.md`](docs/tadayo-design-book-2.1.md) | The UI and UX design book, revision 2.1: the visual system and the interaction contracts |
| [`docs/INVARIANTS.md`](docs/INVARIANTS.md) | The rules every pull request keeps (T1 to T62) |
| [`docs/TECH-DESIGN.md`](docs/TECH-DESIGN.md) | The stack, the no-Mac build loop, CI and environments |
| [`docs/MILESTONES.md`](docs/MILESTONES.md) | Stages B0 to B9, lanes and gates, up to the closed trial |
| [`docs/JOURNAL.md`](docs/JOURNAL.md) | Everything about the project in one place: what it is, where it stands, what's next, the audit map, the log of every commit, the PRs and evidence, and how to audit it. Start here |
| [`docs/GITHUB.md`](docs/GITHUB.md) | How every PR reaches `main`, with its independent review |
| [`docs/DESIGN-HANDOFF.md`](docs/DESIGN-HANDOFF.md) | Design revision 2.1 and Claude Design design; Claude Code implements. The handoff protocol, the naming rule and the brand handoff |
| [`docs/QUESTIONS.md`](docs/QUESTIONS.md) | The founder's open decisions, each with a default |
| [`design/reference/`](design/reference/) | 2.1's renders, Claude Design's renders and brand assets, and `INVENTORY.md` with every state's status |

## Rules of the road

- Every change reaches `main` through a pull request.
- CI must be green, and every PR gets an independent review before the founder sees it (`docs/GITHUB.md`).
- Every commit updates `docs/JOURNAL.md`: a hook refuses a commit without it, and CI refuses a branch whose entries are missing or incomplete.
- CI configuration (`.yamllint.yaml`, `.github/`, `.claude/`, `tools/ci/`) changes only in its own PR.
- The founder approves each PR in the project, in the thread that reported it, and Claude Code then merges it (ADR-022, ADR-025).
