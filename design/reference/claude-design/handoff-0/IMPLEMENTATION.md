# Tadayo brand implementation handoff

brand-wordmark

Tadayo brand implementation handoff · 2 November 2026
This document and its companion pack define the requested brand frames. Use the vector assets and semantic tokens rather than tracing screenshots. These targeted directions supersede conflicting brand examples in the 2.1 book; product scheduling and consent rules remain in force.

Outlined vector reconstruction of the supplied raster direction. No live font, raster logo, tagline or background in assets/brand-wordmark.svg. Preserve the viewBox and aspect ratio. Minimum width 96 pt; use 144 pt on Welcome and 120 CSS px on invitations. Do not rebuild with a similar font. Clear space is one lowercase t stem width.

brand-wordmark-dark

Same paths and spacing as light; fill #AFBEFF on the dark canvas. Do not recolour photographic content. The frame includes its presentation canvas; the asset SVG is transparent.

brand-icon

1024 by 1024 opaque square master with square corners. Cobalt background #284CDB and yellow monogram #F0D968. The supplied identity uses a folded t; retain that more specific mark rather than introducing a competing plaque symbol. Native iOS supplies the corner mask. Do not bake a rounded container, shadow, gloss or decorative gradient into the master.

brand-icon-dark

Same geometry and 1024 square master. Dark background #121D19 with #F0D968 mark. Keep the diagonal negative space open at 60 pt and 29 pt. A native Icon Composer build may need layers and additional clear appearances; do not invent them by filtering this file.

brand-icon-tinted

Grayscale luminance source: #202020 background and #E6E6E6 mark, 1024 square. This is a tintable source, not a promise of the final wallpaper tint. Let iOS choose user tint. Test both tinted light and tinted dark in Xcode or Icon Composer.

brand-tokens

| Role | Light | Dark |
|---|---|---|
| canvas | #FAFBF8 | #121D19 |
| surface | #F0F2EC | #203027 |
| primaryText | #182B25 | #F7F8F2 |
| secondaryText | #607067 | #B6C3B7 |
| action | #284CDB | #AFBEFF |
| onAction | #FFFFFF | #18233B |
| separator | #DCE2DA | #35463A |
| accent | #F0E4A8 | #E4D8A2 |
| onAccent | #182B25 | #182B25 |
| destructive | #AD3529 | #FFB4A5 |
| inputBorder | #849185 | #8C9B90 |
| cover1 / ink | #F0E4A8 / #182B25 | #E4D8A2 / #182B25 |
| cover2 / ink | #E1E5F6 / #182B25 | #D4D9EC / #182B25 |
| cover3 / ink | #DFE7D9 / #182B25 | #D0DCC9 / #182B25 |
| cover4 / ink | #F1DFD6 / #182B25 | #E5D2C8 / #182B25 |
| cover5 / ink | #DCE9EB / #182B25 | #CCDEE1 / #182B25 |
| cover6 / ink | #EADFED / #182B25 | #DDCFE2 / #182B25 |

Cobalt remains the light action. Dark action is a lighter cobalt for contrast. Six calm covers retain dark #182B25 ink in both themes. Persist a colour slot on the sender membership record; a departure must not reshuffle existing senders. Store cover index independently of hidden content, highlight status, popularity or reactions. Separators are decorative; input borders are control boundaries, not text colours. Destructive is a foreground on canvas or surface, not a filled button background. The JSON is the implementation source.

brand-components

All measurements are logical iOS points. Arimo is the frame stand-in; native iOS uses system typography. A 91 by 69 cover has 8 pt side insets and 12/14 bold text. Deborah-Anne's pick wraps after the hyphen as Deborah- then Anne's pick, without ellipsis or shrinking. At large Dynamic Type, replace the horizontal rail with full-width vertical rows, minimum 96 pt high and growing, using 20/26 text in this reference. Never squeeze large text into 91 pt. The initial is decorative; the accessible label contains the full name and role.

Type roles: day 31/34 bold; utility 32/35 bold; body 17/23 regular; row 17/22 bold; metadata 13/18; tab 11/14; caption card 21/28 bold; highlight label 12/14 bold; allowance 12/17. Insets 20. Photo radius 14, surfaces 12, plaque 9, card 16, button 13. Components grow with text.

H01-open

393 by 852 iOS 18 reference layout. Debby's pick leads, then Ben, Maya, Sam in weekly order from Monday. Use full possessive names, not inferred pronouns. Photo colours remain original. Share is intentionally absent. Native selected Home uses house.fill plus visible Home label and action tint. Friends and Memories keep labels and unselected foreground. This is a vector schematic of native chrome, not a screenshot of UIKit or a pixel specification for every OS.

H01-open-dark

Same hierarchy, content, order and photo as light. Only semantic surface and ink tokens change. Never invert or tint a photo. Dark folded covers remain light enough for dark ink.

F02-upcoming

393 by 852 collecting state for Friday 13 November. At 7 AM on Friday 6 November the collecting target is the next Friday. Only Ben is the current viewer; only Ben’s own card may expose Highlight before reveal. Maya and Sam get no highlight badge, even if selected privately. Card height grows from 151 pt; the footer stays outside the scrolling region. No thumbnails, hidden source identities or Share action appear.

F02-upcoming-dark

Same disclosure rules and content as light. Cover index stays attached to the sender and maps to its dark token. Lock text and opening date communicate availability in addition to colour.

Native integration and acceptance

Use SwiftUI TabView or UIKit UITabBarController with Home, Friends and Memories. Keep selection in app state; set tint to the semantic action token. Use SF Symbols house and house.fill, person.2 and person.2.fill, and photo.on.rectangle with the appropriate native selected variant. The selected label remains visible; do not rely on colour alone.

iOS 18 reference: selected Home is action-coloured with a filled house and a visible label; other items use the secondary system foreground. Do not add a custom selection rectangle. iOS 26 and later: allow the system Liquid Glass tab bar and selection treatment; do not draw a permanent glass capsule in application content. System-selected effects and accessibility overrides take precedence over this static schematic. Verify actual appearance on each supported OS.

Wordmarks and app icons are path-only SVGs. Frame text is converted from Arimo glyphs into paths for portable rendering; original Arimo TTF and SIL OFL licence are included for editing. Brand marks are not SF or Arimo typesetting. SVG frames import as editable vector shapes in design tools; photographs are embedded raster images. These files are not a native Figma document.

At default text, verify the full Deborah-Anne's pick label at 91 by 69. Use a soft wrap opportunity after the hyphen without changing the spoken name. Test all accessibility text sizes; at large text move to a vertical list, expand height without clipping and keep a minimum 44 pt touch region.

Before shipping: render icons with the system mask at 60 pt and 29 pt on @2x and @3x devices; verify the notch stays open and the mark is not confused with a generic t. Test native VoiceOver selected-tab announcements, Reduce Motion, bold text and increased contrast. The delivered contrast report validates 28 specified text combinations; it is not a complete native accessibility certification.

Before reveal: authorize the highlight badge by author_id == viewer_id on the current membership interval. Do not include other senders' highlight-selection metadata in the viewer payload. After reveal: resolve the star's eligible pick first and then remaining highlights by weekly order. Leave Share out of these four frames, including menus that would introduce it.

Photographs are fixture assets for fictional users. Do not tint, filter, stretch or replace them with generated imagery. Use aspect-fill previews and aspect-fit full viewers. A colour slot conveys sender identity only; author text is always present.

Acceptance checklist

☐ Eleven frames appear in the manifest in the requested order, with exact names.

☐ Wordmark contains only vector paths; icon masters are 1024 square without rounded masks.

☐ All 28 text contrast pairs pass 4.5:1; six cover pairs include explicit dark ink.

☐ Four screen frames are exactly 393 by 852; there is no Share icon.

☐ Home rail order is Debby, Ben, Maya, Sam; upcoming Highlight appears only on Ben.

☐ Arimo and OFL are present; no remote asset or font request is necessary to view the frames.

☐ Actual iOS tab bar and app-icon appearances still require native device review.

Sources and authority

Tadayo UI UX Design Book revision 2.1, pages 6, 8, 9, 12, 13, 26, 34, 35 and 36; Tadayo v3 Build and Design section 24. The user’s explicit corrections in this handoff override conflicting examples.

Apple Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars

Apple App icons: https://developer.apple.com/design/human-interface-guidelines/app-icons

Apple asset-catalog icon guidance: https://developer.apple.com/documentation/xcode/configuring-your-app-icon

The two supplied identity boards are visual references. The vector marks are a cleaned, flat reconstruction of that raster direction, not original font source recovered from it.
