# Tadayo handoff 3

Start with **Tadayo_Handoff_3_Club_Days_and_Home.pdf** for the visual review, then **IMPLEMENTATION.md** for the complete answers.

- `frames/`: eight phone states in the requested order, plus the whole updated `brand-components`; each has SVG and 2× PNG.
- `frame-manifest.json`: exact titles, dimensions, order and frame hashes.
- `screen-copy.json`: drawn phone text.
- `copy-contracts.json`: all handoff 2 copy retained; new strings under `handoff3`.
- `component-contracts.json`: all handoff 2 contracts retained; additions under `handoff3`.
- `brand-tokens.json`: adopted revision 1.1, unchanged.
- `validation-report.json`: preservation, export, contrast, design-time AX5 and visual checks.
- `assets/`: unchanged wordmarks, transparent dark icon, Arimo and licence.

Production uses native iOS controls and the system font. Arimo is the portable frame stand-in. The SVGs are vector references with outlined text; JSON supplies editable copy. These are static design exports, not a functioning app or a device accessibility test.

Braced date/time placeholders are formatter parameters, not literal UI. See the contracts for server-authoritative scheduling, membership gating, error retention, offline display and access loss. H01-unavailable needs a distinct later frame and is intentionally outside the requested phone set.
