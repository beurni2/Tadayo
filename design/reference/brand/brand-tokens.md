# Brand tokens

Tadayo's tokens, revision 1.1, which the founder adopted on 3 November 2026 (FQ45, ADR-027). Every value is copied exactly from `brand-tokens.json` revision 1.1, byte-identical in design handoffs 1 to 4 (`../claude-design/handoff-1/brand-tokens.json` to `../claude-design/handoff-4/brand-tokens.json`). It replaces handoff 0's table (still in `../claude-design/handoff-0/`).

`brand-tokens.json` says: "Handoff 0 colour, component and dark icon definitions only".

## Colours

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
| inputBorder | #778579 | #8C9B90 |
| cover1 | #EEDFC4 | #DFCFB3 |
| onCover1 | #182B25 | #182B25 |
| cover2 | #E1E5F6 | #D4D9EC |
| onCover2 | #182B25 | #182B25 |
| cover3 | #DFE7D9 | #D0DCC9 |
| onCover3 | #182B25 | #182B25 |
| cover4 | #F1DFD6 | #E5D2C8 |
| onCover4 | #182B25 | #182B25 |
| cover5 | #DCE9EB | #CCDEE1 |
| onCover5 | #182B25 | #182B25 |
| cover6 | #EADFED | #DDCFE2 |
| onCover6 | #182B25 | #182B25 |
| actionPressed | #203FB7 | #96A9F2 |
| onActionPressed | #FFFFFF | #18233B |
| actionDisabled | #E2E6DF | #35463A |
| onActionDisabled | #4F5E55 | #BAC6BD |
| focusRing | #284CDB | #AFBEFF |
| avatarCanvas | #E1E5F6 | #35463A |
| onAvatarCanvas | #182B25 | #F7F8F2 |
| avatarOnCover | #182B25 | #182B25 |
| onAvatarOnCover | #FAFBF8 | #FAFBF8 |
| photoLabel | #FAFBF8 | #FAFBF8 |
| onPhotoLabel | #182B25 | #182B25 |

## Type roles

Size and line height in points, on the system font (Arimo stands in for it in the frames).

| Role | Size / line height | Weight |
|---|---|---|
| utilityTitle | 32/35 | bold |
| dayTitle | 31/34 | bold |
| dateTitle | 25/29 | bold |
| emptyTitle | 25/30 | bold |
| body | 17/23 | regular |
| row | 17/22 | bold |
| metadata | 13/18 | regular |
| cardStatus | 13/18 | regular |
| caption | 21/28 | bold |
| highlight | 12/14 | bold |
| plaqueWeekday | 10/12 | bold |
| plaqueDay | 25/28 | bold |
| clubHeader | 16/20 | bold |
| headerAdd | 15/20 | bold |
| button | 16/22 | bold |
| tab | 11/14 | regular |
| allowance | 12/17 | regular |
| photoLabel | 11/14 | bold |
| avatar36 | 16/20 | bold |
| avatar28 | 13/18 | bold |
| avatar18 | 9/11 | bold |
| avatarProfile68 | 28/34 | bold |

## Geometry

| Token | Value |
|---|---|
| screen | 393, 852 |
| contentInset | 20 |
| cardRadius | 16 |
| ticketRadius | 18 |
| photoRadius | 14 |
| surfaceRadius | 12 |
| buttonRadius | 13 |
| inputRadius | 10 |
| plaqueRadius | 9 |
| primaryButtonMinimumHeight | 50 |
| minimumTouchTarget | 44 |
| focusRingWidth | 2 |
| focusRingGap | 2 |

## Avatar

| Token | Value |
|---|---|
| sizes | {"profile": 68, "row": 36, "card": 28, "rail": 18} |
| canvas | avatarCanvas / onAvatarCanvas |
| surface | avatarCanvas / onAvatarCanvas |
| allSixCovers | avatarOnCover / onAvatarOnCover |

## Cover assignment

Index base 0. "Persist the sender membership slot 0..5. Do not compact slots after a departure. Historical memberships retain their original slot. All author names remain visible. Colour conveys no status, popularity or hidden-content information."

## Wordmark

| Token | Value |
|---|---|
| welcomeWidth | 144 |
| invitationWebWidth | 144 |
| minimumWidth | 96 |
| clearSpaceUnitSource | 44 |
| viewBoxWidth | 915 |
| clearSpaceReference | Width of the lower straight vertical stem of the first t below the crossbar, measured across the stem near source y=160. Excludes the upper diagonal shoulder and the horizontal arm. |
| clearSpaceAt144 | 6.925 |

## Later additions

Handoffs 2 to 4 add supplemental tokens and type roles in their `component-contracts.json` (the newest, handoff 4's, holds every earlier entry): for example the fold line (`foldCornerLine`, #8C8F84 at 0.75 points in both themes) and the roles `textAction`, `rowAction`, `fieldLabel`, `eyebrow`, `proposedTag`, `personDisplay`, `highlightExpanded` and `nextUp`. They're read from that file, which stays as it arrived (`../claude-design/handoff-4/component-contracts.json`).
