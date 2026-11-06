# Tadayo - design handoff 6

Start with **Tadayo_Handoff_6_Days_and_Home.pdf** for the visual overview, then **IMPLEMENTATION.md** for the complete written answers and Defaults.

## Order and contents

Positions 1-15 are the requested phone states, each 393 x 852 points. Position 16 is the whole updated brand-components sheet. Eleven consequent redraws follow in the exact order in frame-manifest.json. Each frame has an SVG and a 2x PNG; there are 26 phone frames and one component sheet in total.

- `frames/`: 27 SVGs and 27 PNGs. SVG text is outlined from Arimo for portable rendering; production uses the iOS system font.
- `frame-manifest.json`: exact names, order, paths, dimensions, fixture notes, viewports and frame hashes.
- `screen-copy.json`: text, control labels/hints/targets and semantic groups. Scrollable sheets include the full dated occurrence data, not just the first visible viewport.
- `copy-contracts.json`: cumulative H1-H5 unchanged, plus H6 templates, examples, provenance and replacements.
- `component-contracts.json`: cumulative earlier entries unchanged, plus H6 geometry, theme pairings, state, navigation and reflow rules with explicit replacement scopes.
- `brand-tokens.json` and `assets/`: adopted revision 1.1, unchanged wordmarks/dark icon masters, Arimo and its licence.
- `IMPLEMENTATION.md`: full answers, source precedence, independent fixture definitions and tradeoffs of each Default.
- `validation-report.json`: automated export/contract/date/contrast checks and manual visual review, with limitations.
- `source-provenance.json`: reviewed source hashes and precedence.
- `SHA256SUMS.txt`: hash of every other deliverable in the ZIP.

## Contract precedence

Resolve `handoff6.replaces` before `handoff5.replaces`, including when both name the same earlier key. Do not render a historical fixture string merely because it remains in the cumulative file. A replacement can select a template still located under handoff5. Component replacement scopes explicitly retain unaffected rules such as noLock, largest-text stacking and the read-only week’s nextDates/nextUp/contentSignals=false.

Format names, dates, times, weekday lists and zones through the native formatters. Fixture values are examples. The first opening is server-resolved at least 24 elapsed hours after confirmation, including across DST. Travel changes date/time representation; it never changes access or the shared opening instant.

## Implementation limits

These are static design references. Native iPhone Dynamic Type, VoiceOver/Voice Control, navigation, authorization, live clock/state updates and support routing require implementation testing. Dark components and AX5 metrics/reflow contracts are included; no unrequested dark or XL phone frames are added. Intentional list viewports scroll and retain complete semantic data. No live accounts, clubs, schedules or repository files were modified.
