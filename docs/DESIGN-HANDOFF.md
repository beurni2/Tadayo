# Design handoffs: Claude Code and Claude Design

Version 1.3 · 6 November 2026

**Design revision 2.1 and Claude Design do the UI and UX design. You, Claude Code, implement it.**
- The founder decided (FQ2, ADR-006) that 2.1's 53 screens stay the reference. Claude Design makes the brand first, then every state 2.1 doesn't show.
- Claude Design lives inside the founder's Claude app; its standalone site at claude.ai/design closes on 14 December 2026. You can't open it. It can link this repository and read it, if the founder links it.
- **What Claude Design can deliver:** a .zip, a PDF, PPTX, Google Slides or standalone HTML, or the design sent straight to Claude Code on the web. It has no PNG export.
- **What you do with it:** turn each delivery into the named files this repository uses (T46). That means rendering frames to PNG, rasterizing delivered vectors, and reading token values. It never means changing what a frame shows.

This document is the protocol.

## Who does what

| | Design revision 2.1 | Claude Design, driven by the founder | Claude Code |
|---|---|---|---|
| Layouts and states | The 53 renders in `design/reference/2.1/`, with the book's contracts | Every state the inventory lists as missing, and any 2.1 state the founder chooses to redraw | Builds each state from its render and the book's contracts; never invents a layout |
| The brand: wordmark, app icon, colour tokens, cover colours, component sheet | Proposed tokens only (book p35); no wordmark design, no icon | Designs them (Design handoff 0), and revises them when a handoff asks it a brand question. Once converted, they live in `design/reference/brand/`, the source every later handoff names; a design system the founder saves in Claude is a convenience, not a dependency | Extracts them from the delivery into `design/reference/brand/`, the asset catalog and `TadayoDesign`; never draws or generates them. A brand revision the founder adopts replaces the files in `brand/`, remade from it under the same names (ADR-027). A later checked handoff's component sheet that holds every earlier one replaces `brand-components.png` alone, adopting no revision; the older sheet stays in its handoff's folder (ADR-027's second "Later" line) |
| States you discover | | Designs them from your handoff | Writes the handoff; builds from the spec and the contracts meanwhile, marked "built from spec" |
| A render that disagrees with the spec or a rule | | The founder decides | Builds the rule, lists the difference in the inventory, the journal and the next handoff |

You never design a screen, an icon or an illustration yourself. You never use stock, placeholder or generated imagery in the product (T46). When you need a design you don't have, you write a handoff.

## What a 2.1 render is

- **A reference** for layout, hierarchy, copy and the order of things on the screen, drawn at 393×852 with presentation chrome (book p50).
- **Not a source of pixels.** The type is Arimo standing in for the system font. The status bar, tab bar and frame are pictures of iOS's own (T45). Once the brand's tokens arrive, its colours are 2.1's proposal, not the final ones.
- **Not above the rules.** Where a render breaks a rule, build the rule. `design/reference/INVENTORY.md` lists those differences.

## When to write a handoff

- **Design handoff 0, the brand.** It's written below and in the founder's guide, so he can start it before you begin. Copy it into `docs/plans/B0.md` and track it in the inventory.
- **At the start of every stage, B1 to B9:** one handoff listing every state the stage builds that the inventory lists as missing. The founder has them made while you build against the spec, the contracts and the mock. Send a handoff after 0 only once the brand files it builds on (`brand-tokens.md`, `brand-components.png`) are on `main`.
- **Whenever you discover a state the inventory lacks** (an error, an edge case, a sheet the spec implies): add it to the inventory and the next handoff. If the slice can't be judged without it, write a small handoff at once.
- **When a render contradicts the spec or can't be built as drawn:** write down the differences; don't fix them yourself.

## The handoff brief

A handoff is a message the founder pastes into a Claude conversation where he asks for a design, so it must be complete on its own. Put it in the stage plan or the PR description under "Design handoff", and in your report to him, inside one code block he can copy. Template:

```
Design handoff <n>: <title>

Sources: the linked Tadayo repository: docs/tadayo-design-book-2.1.md, docs/tadayo-build-spec-v3.md, and design/reference/, with the 2.1 renders and the brand in design/reference/brand/ (revision 1.1, from design handoffs 1 to 4, with design handoff 6's component sheet) (brand-tokens.md, brand-components.png, the wordmark and the icon). If the repository isn't linked: the attached Tadayo_UI_UX_Design_Book.pdf (design revision 2.1), Tadayo_v3_Build_and_Design.pdf, brand-tokens.md and brand-components.png. Use the brand's tokens, cover colours and components as they are; if you have Tadayo's design system, it holds the same brand.

What to design: one frame per state, 393×852 points, each titled with the state's exact name, in the order listed below (if an export loses the titles, the order identifies the frames).
- <state name>, for example "F02-star: Debby's own upcoming Friday, seen by Debby". Screen F02 of the spec (section 09), closest 2.1 screen: state 08 (book p13).
- <next state>
…

Content: the book's fixture clubs. Sunday people: Ben (Monday, the viewer unless stated), Maya, Alex, Sam, Debby (Friday), Nina. Kitchen table: five members, Leila proposed. Dates as the book uses them (Friday 6 and 13 November 2026). Nothing invented.

Rules that apply: book p<n>, p34 (components), p35 (tokens), p41 (routes and labels); spec <sections>. Names, not inferred pronouns. Exact dates. Native iOS controls. The type is the iOS system font at the book's sizes; in the frames, Arimo stands in for it, included in the export.

Questions I need answered in the design: <specific questions>

Dark and large-text frames: only where listed above, titled <state>-dark and <state>-xl.
```

Below the code block, outside it, tell the founder where the result goes: the branch name for "Send to Claude Code on the web", or for the export's upload to `design/reference/claude-design/` ("How renders come back"). From handoff 1 on, ask him to link the repository in Claude Design, or to attach `brand-tokens.md` and `brand-components.png` with the PDFs, so the brand comes with the brief. Keep a brief to one stage's states. Name every frame you expect, so you can check what came back.

## Naming rule

- **Screens:** one PNG per state in `design/reference/screens/`, named `<screen id>-<state>[-dark|-xl].png`, lower case after the screen id, hyphens, no spaces, at 786×1704 (2×). The screen id comes from spec 29. Examples:
    - `F02-star.png`;
    - `C07-partial.png`;
    - `H01-open-xl.png`.

    The frame in Claude Design carries the same name, so the PNG you render from it is unambiguous.
- **States outside the spec's ids:** `global-…`. The external-share screens use the new id `S05`.
- **Brand assets:** in `design/reference/brand/`: `brand-wordmark.pdf`, `brand-wordmark-dark.pdf`, `brand-icon-1024.png`, `brand-icon-dark-1024.png`, `brand-icon-tinted-1024.png`, `brand-tokens.md`, `brand-components.png`.
- **Deliveries** stay as they arrived, in `design/reference/claude-design/handoff-<n>/`, so anyone can check a PNG against its source.
- **A later frame of a state that already has one** in `screens/`: once its handoff is checked, the new frame replaces the older file under the same name, in the PR that brings the handoff in, and a component sheet that holds every earlier one replaces `brand/brand-components.png` the same way. The older file stays as it arrived in its handoff's folder, and the state's inventory row names the handoff it now comes from and the one before. This adopts no brand revision: the tokens, the wordmark and the icon change only as the next bullet says. A defect the replacement brings goes in the inventory's "Known differences" and isn't built (ADR-027's second "Later" line).
- **A brand revision** (a later handoff's `brand-tokens.json` with a new version, or a whole brand frame sent again): once the founder adopts it, the brand files above are remade from it, under the same names, in the PR that brings that delivery in, and the revision's number goes in `brand/README.md`. `brand-tokens.md` then holds the revision's whole token set (colours, type roles and geometry), copied exactly. The earlier revision stays in its own handoff's folder. Until the founder adopts it, it stays only in its handoff's folder (ADR-027).
- **The 2.1 renders** keep the names the inventory gave them, in `design/reference/2.1/`. Never change them.

## The inventory

`design/reference/INVENTORY.md` lists every state for the trial and after it, with its render, its source (2.1 or a handoff number), its status and its stage.
- **Statuses:** `missing`, `requested <n>`, `received`, `built from spec`, `built`, `approved` (the founder passed it at a gate).
- Keep it current in the same commit as the change. The journal's state section quotes its counts.

## How renders come back

Each delivery enters the repository through the ios lane once it's checked against its brief, in a design PR of its own, not at a point a stage plan fixes (ADR-027's first "Later" line).

1. **The founder sends the design back by one of three routes:**
    - from Claude Design straight to Claude Code on the web, in a session on the tadayo repository, with the handoff number and branch;
    - as a .zip or PDF export, uploaded to `design/reference/claude-design/` on the branch you named (GitHub's "Add file → Upload files");
    - attached to your session.

    The first route is the easiest from his phone; test it with Design handoff 0. Whether an attachment reaches the session as a file you can read is also to be checked then. Record what works in `docs/LIMITATIONS.md`.
2. **Unpack the delivery** into `design/reference/claude-design/handoff-<n>/`, in its own commit. An export the founder uploaded into `claude-design/` moves into that folder in the same commit; GitHub's upload page can't create the folder from his phone.
3. **Make the named files from it:**
    - **HTML:** render each frame with the session's Chromium (Playwright) at 393×852 points and a device scale factor of 2.
    - **PDF:** render each page with `pdftoppm` at the matching resolution.
    - **Brand files:** extract the wordmark and icon as vectors (PDF, or SVG from the HTML), and rasterize the icon to the 1024-pixel PNGs. Copy the token table into `brand-tokens.md` exactly.
    - **Fonts:** render with the fonts the delivery includes. Chromium silently swaps in another font when an HTML frame names one it doesn't include, so render that frame from a PDF export instead, or ask for an export that includes the font. Never let a substitute font through.

    Never change a frame's content. If a frame can't be converted faithfully, say so and ask for another export.
4. **Check the result against the brief:** every named frame present, light, dark and large text where asked, sizes right. Match frames to states by their titles; if the export lost them, by the brief's order, and say so in the PR. Say what's missing.
5. **Compare** each render with the spec, the book's contracts and the invariants before building. Differences go in the inventory, the journal and your next report; the rules win until the founder decides.
6. **Build, snapshot,** and put the snapshot beside its render in the PR's evidence. The snapshot tests use the same state names, so the pairing is automatic.

## Snapshot comparison

Every snapshot test is named after its inventory state (`F02-upcoming`, `F02-upcoming-dark`, `F02-upcoming-xl`). The `ios` workflow writes a contact sheet per state on the evidence branch:
- the render on the left, taken from `screens/` if it exists there, else from `2.1/`;
- your snapshot on the right.

A state with no render shows the snapshot alone, marked "built from spec, awaiting render". The gate PDFs are made from these sheets.

## Design handoff 0: Tadayo brand

The founder can paste this as it is, in a Claude conversation where he asks for a design. Track it in the inventory as `requested 0` once he says he has started it.

```
Design handoff 0: Tadayo brand

Sources: the attached Tadayo_UI_UX_Design_Book.pdf (design revision 2.1) and Tadayo_v3_Build_and_Design.pdf, or the Tadayo repository if it's linked (docs/tadayo-design-book-2.1.md, docs/tadayo-build-spec-v3.md, design/reference/2.1/).

Tadayo is a private club of two to six friends. Each member has a day of the week. Friends add photos and video links for that person's day; the captions are visible at once, and everything opens together at 7 AM on the day. The book's screens are the layouts we keep. What they don't have is a brand: the wordmark is plain bold type, there's no app icon, and the same cobalt button sits on every screen. This handoff makes the brand, which every later Tadayo design builds on; if you can keep it as Tadayo's design system, do.

It must not look or feel like an AI-generated app. The book's own warning applies (p5): no interchangeable shell that could be reskinned into a finance or wellness app. No decoration that competes with friends' photographs (p6). Build the identity from Tadayo's own objects: a person's name, the weekday/date plaque, the folded corner of a covered card.

What to design, one frame each, titled exactly as below and in this order:
1. "brand-wordmark" and "brand-wordmark-dark": the wordmark "tadayo". It appears on the Welcome screen (book p9, state 01) and on the invitation web page, so it must hold at small sizes. Keep it as vector shapes.
2. "brand-icon", "brand-icon-dark" and "brand-icon-tinted": the app icon, 1024×1024, square corners, as vector shapes. Start from the plaque and the folded corner if they work at small sizes. It must be legible at 60 points and at 29 points in Settings. No gradient for its own sake.
3. "brand-tokens": a table of the final colour tokens, light and dark, by role, in hex (book p35): canvas, surface, primary text, secondary text, action and the text on it, separator, accent and the text on it, destructive, input border. Keep or change 2.1's values; you decide whether the action colour stays cobalt. Text contrast at least 4.5:1. Add the six cover colours (point 4) to the same table.
4. The six cover colours, in the brand-tokens table (no frame of their own). Collecting caption cards take a colour from the sender's stable place in the club (book p13), but the book lists only one (#F0E4A8). Give six, light and dark, each with its ink. None may suggest popularity, status or what's hidden under the cover, and all must stay calm behind dark text.
5. "brand-components": a component sheet with sizes marked:
   - the day plaque (FRI 06);
   - the folded card for a collecting caption (151 points minimum height);
   - the 91×69-point highlight cover with its folded corner and the label "Debby's pick";
   - the avatar fallback (an initial);
   - the 50-point primary button;
   - the quiet allowance line ("2 of 6 drops · 0 of 2 video links").
6. Two screens with the brand applied, light and dark, so the system is seen in place, at 393×852: "H01-open" and "H01-open-dark" (Home during Debby's day, book state 05, p12), and "F02-upcoming" and "F02-upcoming-dark" (Debby's upcoming Friday, state 08, p13).
   - Use "Debby's pick", never "Her pick": the spec infers no one's gender (spec 03 and 12).
   - Before the reveal, show the Highlight label only on the viewer's own cards.
   - On the highlight rail, Debby's pick comes first, then the others in the club's weekly order from Monday: Ben, Maya, Sam.
   - Leave out the Share icon.

Rules that apply: book p6, p8, p26, p34, p35 and p36; spec 24. Photographs are never tinted or filtered. Colour is never the only signal of a state. The type is the iOS system font at the book's sizes (p35). In the frames, use Arimo as its stand-in, as 2.1 did, and include the font in the export, so the frames look the same wherever they're opened.

Questions I need answered in the design:
- How "Deborah-Anne's pick" fits the 91-point cover, at default and large text.
- What the selected tab looks like on iOS's own tab bar.
```

When the founder has it, the B0 plan names the branch it goes to. If he finishes before then, he exports it as a .zip and keeps it until you ask for it.
