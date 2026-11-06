# Tadayo - design handoff 5

Start with **Tadayo_Handoff_5_Days_and_Home.pdf** for the visual review, then **IMPLEMENTATION.md** for the full written answers. The 13 phone states follow the requested order. The complete updated brand-components is frame 14; it is a component sheet rather than a phone screen.

## Files

- `frames/`: one SVG and one 2x PNG per manifest entry. The 13 phone SVGs are 393 x 852 points, with 786 x 1704 PNGs. SVG text is vector outlines from Arimo for consistent viewing.
- `frame-manifest.json`: exact order, titles, fixture notes, paths, dimensions and frame SHA-256 hashes.
- `screen-copy.json`: the actual frame text, control labels/hints/targets and semantic groups. G05-local-times includes all six occurrences, beyond the first visible scroll viewport.
- `copy-contracts.json`: cumulative earlier entries plus `handoff5` templates, examples, replacement paths and provenance. Resolve replacements; historical earlier text is retained for provenance, not current rendering.
- `component-contracts.json`: cumulative earlier entries plus `handoff5` components, spacing, routes, visibility and accessibility contracts. `handoff5.replaces` and replacement scopes identify the current rules.
- `brand-tokens.json`: adopted revision 1.1, unchanged from handoff 4.
- `assets/`: unchanged vector wordmarks and transparent dark-icon masters, plus Arimo and its licence. Production iOS uses the system font and native controls.
- `validation-report.json`: export, contract, dates/DST, contrast, original-photo and design-time accessibility checks, plus visual review and limitations.
- `SHA256SUMS.txt`: SHA-256 of every other deliverable in this pack.

## Implementation order

1. Load the cumulative contracts. Apply `handoff5` replacements only where their stated scope applies; keep earlier entries intact.
2. Use one day-choice component for G04-one-day, G04-two-days and G04-conflict. Contested is neutral and uses the same noun everywhere. Its public form never includes chooser names.
3. Keep the actual current week separate from a proposed future week. G04-change has the same person groups visually and in VoiceOver, followed by the common SundayRow.
4. Format actual server occurrence instants in the club and device zones independently. Locale and clock format follow device settings. A recurring weekday has no travel-zone time.
5. Handle no-confirmed-day, unavailable and access-lost Home as explicit states. Do not invent a date, upload destination or club content from cache, and do not switch clubs automatically.
6. Verify the native implementation on device: Dynamic Type, VoiceOver/Voice Control, sheets, native targets, authorization, live state transitions and the configured support route.

## Scope

This is a static implementation handoff, not an interactive prototype or a native device test. Defaults and their tradeoffs are stated in IMPLEMENTATION.md. No dark or largest-text phone frames are requested or added; theme/token and large-text metric checks are documented. No live accounts, invitations, schedules or repository files were modified.
