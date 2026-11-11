# Brand assets

The wordmark, the app icon, the tokens and the component sheet, from brand revision 1.1, which the founder adopted on 3 November 2026 (FQ45, ADR-027). See `docs/DESIGN-HANDOFF.md` ("Naming rule").

| File | From |
|---|---|
| `brand-wordmark.pdf`, `brand-wordmark-dark.pdf` | Design handoff 0 (revision 1.1 keeps the wordmark byte-identical) |
| `brand-icon-1024.png`, `brand-icon-tinted-1024.png` | Design handoff 0 (unchanged by revision 1.1) |
| `brand-icon-dark-1024.png` | Revision 1.1's transparent dark master, the delivery's own 1024-pixel PNG (`../claude-design/handoff-1/assets/brand-icon-dark.png`; the SVG beside it is byte-identical in handoffs 1 to 7) |
| `brand-tokens.md` | `brand-tokens.json` revision 1.1 (handoffs 1 to 7, byte-identical) |
| `brand-components.png` | Design handoff 7's component sheet (`../claude-design/handoff-7/frames/brand-components.png`). It keeps handoff 6's sheet whole, element for element, and adds handoff 7's specimens below it: the busy button, the fields and failure lines, the header at the largest text, the photo circle with no readable initial, the drop card's eight states, the highlight covers and the receipt, in light and dark. Handoff 6's sheet keeps handoff 5's, which kept handoff 4's except the two card samples whose status line and lock its brief asked to fix, so this holds every earlier sheet's components and the contracts handoffs 2 to 7 added. Its PNG draws the sheet's one transparent band (sheet points 6,880 to 9,680) black, so judge that band from the SVG beside it (`../claude-design/handoff-7/frames/brand-components.svg`) |

Handoff 0's delivery stays as it arrived in `../claude-design/handoff-0/`. The files converted from it that revision 1.1 replaced (the earlier `brand-components.png`, `brand-icon-dark-1024.png` and the `brand-tokens.md` table) are in git history only, at `main` before PR #13 (74943c8). Handoff 4's `brand-components.png`, which handoff 6's sheet replaced here, and handoff 6's, which handoff 7's replaced when handoff 7 was adopted for the screens on `main` (ADR-027's second "Later" line), stay as they arrived in `../claude-design/handoff-4/frames/` and `../claude-design/handoff-6/frames/`.
