| | Breakage | On this branch | `main`'s tests (control) |
|---|---|---|---|
| B1 | readableDrops and mayRead without the author's account being active | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B2 | starKeepsDay and mayRead without the star's leaving before the reveal | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B3 | starKeepsDay and mayRead without the star's deletion asked before the reveal | the matrix as "member in the audience": caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B4 | a one-way block: the viewer's own block of the author dropped, in both fragments | the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1); `home.test.ts`: caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "blocked: Cleo blocked the author, leaving by the block": passed (missed); `home.test.ts`: passed (missed) |
| B5 | no block at all, in both fragments and mayRead | the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1); `home.test.ts`: caught (exit 1); `authorization.test.ts`: caught (exit 1) | the matrix as "blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)": failed, so caught already |
| B6 | the audit's inline Home: the page's drops by its own statement, with a one-way block | `one-module.test.ts`: caught (exit 1); `home.test.ts`: caught (exit 1); the matrix as "blocked: Cleo blocked the author, both still members": caught (exit 1) | the matrix as "blocked: Cleo blocked the author, leaving by the block": passed (missed); `home.test.ts`: passed (missed) |
| B7 | Home's time from `?t=` by a cast to ServerNow | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience": caught (exit 1) | the matrix as "member in the audience": passed (missed) |
| B8 | Home's time from If-Modified-Since by a cast to ServerNow | `one-clock.test.ts`: caught (exit 1); the matrix as "member in the audience": caught (exit 1) | the matrix as "member in the audience": passed (missed) |

B7's matrix run was judged twice: on the first pass it failed with the manipulation named (`getHome, manipulated {"query":{"t":…}}`), but its words had been registered without the backslash the matrix's output puts before each quote, so the runner said words missing; with the words written as the output has them, the second pass was caught. B5 under `main`'s tests failed, so `main` already caught it: FQ88's role has the author block Cleo and leave, keeping the drop, so the author's block of the viewer is that cell's only denial.

Home's judge, `mayView` in `tests/src/privacy/home.ts`, without each of its conditions in turn: 16 of 16 caught by `tests/src/privacy/home.test.ts` (Home's judge had no test of its own on `main`):
- J01, the viewer's account: caught (exit 1)
- J02, the audience: caught (exit 1)
- J03, the viewer's interval ended: caught (exit 1)
- J04, the drop's state: caught (exit 1)
- J05, the day's status: caught (exit 1)
- J06, the club's suspension: caught (exit 1)
- J07, the star gone before the reveal: caught (exit 1)
- J08, the star's deletion before the reveal: caught (exit 1)
- J09, the author's account: caught (exit 1)
- J10, a block either way: caught (exit 1)
- J11, the viewer's own block of the author: caught (exit 1)
- J12, the author's block of the viewer: caught (exit 1)
- J13, the reveal: caught (exit 1)
- J14, the star's leaving at any time: caught (exit 1)
- J15, the star's deletion at any time: caught (exit 1)
- J16, anyone's block: caught (exit 1)
