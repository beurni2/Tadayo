# Tadayo handoff 1

Read Tadayo_Handoff_1_Implementation.docx or its PDF, then IMPLEMENTATION.md.
Open index.html locally to review the frames. This is a static design index, not an interactive product.

The first 17 frames exactly match the requested state names and order, at 393 × 852 pt.
Three complete replacement brand frames follow: brand-tokens, brand-components, brand-icon-dark.
No extra dark or XL screen frames are substituted. Dark and large-text component rules are in the shared frame and JSON.

frames/*.svg preserve exact point geometry and path-outlined Arimo text. Screens also have 2x PNG previews.
assets/ contains Arimo and its OFL licence, unchanged outlined wordmarks, and the transparent dark icon master.
brand-tokens.json revision 1.1 supersedes the earlier token/component/dark-icon definitions.
screen-copy.json contains the exact base-state text. contrast-checks.json records all 58 specified checks.

The keyboard, code AutoFill, system share sheet and native tab bar must be implemented with iOS controls.
No live authentication, invitations or member actions run in this export. Do not treat Shared as a read or delivery receipt.
