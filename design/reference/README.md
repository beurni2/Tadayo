# Design reference

This folder holds the designs Claude Code builds from (`docs/DESIGN-HANDOFF.md`). `INVENTORY.md` lists every screen, state and brand asset with its file, its source and its status.

| Folder | What's in it | Who adds to it |
|---|---|---|
| `2.1/` | The 53 screens of design revision 2.1, taken at their native 393×852 from the founder's design book (`docs/tadayo-design-book-2.1.md`), named by inventory state | Nobody: this is the book's record and never changes |
| `claude-design/` | Claude Design's deliveries as they arrived (a .zip, a PDF or HTML), one folder per handoff, `handoff-<n>/` | The founder uploads into `claude-design/` itself, and Claude Code moves the file into its folder; or Claude Code, when the design is sent to its session |
| `screens/` | PNGs at 786×1704 that Claude Code renders from those deliveries: new states, the brand re-renders, and any 2.1 state the founder redraws. When a state has a render here and in `2.1/`, this one wins | Claude Code, by converting a delivery, never by drawing |
| `brand/` | The wordmark, the app icon, the tokens table and the component sheet, extracted from Design handoff 0's delivery | Claude Code, by converting a delivery |
| `wireframes/` | The two schematic wireframes from the build spec (spec 25 and 26), kept for history; 2.1 supersedes them | Nobody |
| `pack/` | Design revision 2.1's own pack (the HTML reference, the tokens file, the 54th screen), if the founder supplies it (FQ25) | The founder |

## What in the 2.1 renders is a stand-in

- **The type is Arimo,** standing in for the iOS system font (book p50). The app uses the system font at the book's sizes, scaled with Dynamic Type.
- **The status bar, tab bar and device frame** are presentation. iOS draws its own tab bar, which looks different, and different again on older iOS versions (T45).
- **The colours are 2.1's proposal** (book p35) until the brand's tokens arrive. After that, colour differences against 2.1 are expected; layout differences are what count.
- **The photographs are Unsplash fixtures** (book p50), standing in for members' photos. The names are invented.
- **A few strings and details break the rules,** and are built the rules' way: "Her pick", the Highlight label on someone else's collecting card, the rail's order and the Share icon. The list is in `INVENTORY.md`, "Known differences".

## What to measure from them

Layout, hierarchy, order, copy and the components' anatomy, checked against the book's contracts (book p34, p35, p41). Where a render and a contract differ, the contract wins until the founder decides. Write the difference in the journal and in the next handoff. Build every screen with the book's fixture clubs and its stress fixtures: long names, a text screenshot, no caption, a dark ordinary photo (book p6, p27).

## Don't

- Don't edit, move or rename anything here. Claude Code only adds the deliveries that arrived through a handoff, and the files it converts from them, with the names from the brief. The one move allowed: an export the founder uploaded into `claude-design/` goes into its `handoff-<n>/` folder, in the unpack commit.
- Don't fill a gap with your own drawing, a stock image or a generated picture (T46). A missing state is built from the spec and the contracts and marked "built from spec" in `INVENTORY.md`.
- Don't ship these files or copy pixels from them. The app is built from tokens and components.
