# Brand tokens

Tadayo's colour tokens, light and dark, by role, in hex, with the six cover colours and their ink. The table is copied exactly from design handoff 0's delivery (`../claude-design/handoff-0/IMPLEMENTATION.md`, "brand-tokens"), and holds the same values as its `brand-tokens.json` and its `frames/brand-tokens.svg`. They replace book p35's proposal (`docs/DESIGN-HANDOFF.md`).

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

## Contrast

- The delivery's own check (`../claude-design/handoff-0/contrast-checks.json`): 28 text pairs, each at least 4.5:1, the lowest 4.64:1 (secondaryText on surface, light).
- The tokens frame adds: "Separators and input borders are non-text roles. Never use them as caption ink."

## Other notes

- **The icon's yellow,** #F0D968, is used only by the app icon (`../claude-design/handoff-0/assets/brand-icon.svg` and `brand-icon-dark.svg`); it isn't a token.
- **The six covers** are numbered 1 to 6 here; `brand-tokens.json`'s "coverAssignment" counts the same six slots as 0 to 5.
- **The delivery's own notes on the tokens,** as written. `IMPLEMENTATION.md`: "Cobalt remains the light action. Dark action is a lighter cobalt for contrast. Six calm covers retain dark #182B25 ink in both themes. Persist a colour slot on the sender membership record; a departure must not reshuffle existing senders. Store cover index independently of hidden content, highlight status, popularity or reactions. Separators are decorative; input borders are control boundaries, not text colours. Destructive is a foreground on canvas or surface, not a filled button background. The JSON is the implementation source." `brand-tokens.json`, "coverAssignment": "Persist sender membership slot 0..5; do not compact slots after departure or reuse a historical slot for a different sender. Colours carry no state or content metadata."
