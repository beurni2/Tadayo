# Tadayo handoff 10 · Stage B1

Start with index.html or Tadayo_Handoff_10_B1_Implementation.pdf. IMPLEMENTATION.md answers every question in the brief. The PDF includes the same proofs and the complete guide.

The first seven base states follow the requested order. Four dark/AX5 variants follow in the listed order. Exactly 11 phone frames, no extra brand frame.

- frames/: 393×852 SVGs with Arimo outlines, plus 786×1704 PNGs.
- fonts/: Arimo regular/bold/variable and OFL licence.
- frame-manifest.json: exact order, content/viewport geometry, named native controls, semantic groups and scroll/fixture notes.
- screen-copy.json: per-proof copy and accessibility metadata.
- copy-contracts.json: cumulative H9 copy, 68 new H10 keys, failure branches and explicit precedence.
- component-contracts.json: cumulative adopted components plus the H10 conditional state/action rules.
- brand-tokens.json and assets/: unchanged revision 1.1 tokens and source assets used or retained for this handoff.
- SOURCE_BRIEF.txt and source-provenance.json: repository brief and consulted source Git blob hashes.
- validation-report.json and checksums.sha256: performed static checks and file integrity.

Decisions: H5 Decline label stands; Decline gets a busy spinner; pending proposed row gets a disclosure arrow/hint, decided row stays static; creator approves directly on Proposed roster; confirmed earlier own decision uses a truthful native alert, not Try again. H9 symbol growth and Drafts inset stay as currently built; no inviter-name line is added.

Fixture notes matter: five active members plus two candidates is layout-only, not an authorized seven-person club; a real decline can remove the ended proposal from everyone’s Members view. Never preserve cached content to match a static proof. AX5 proofs are scrolled within legal content bounds; the whole document remains in each SVG.

Use native iOS controls/system type and verify actual Dynamic Type, VoiceOver and API outcomes in implementation. These are static design exports, not tested production code.
