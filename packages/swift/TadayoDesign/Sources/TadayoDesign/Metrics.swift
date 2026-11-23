import CoreGraphics

/// Spacing, radii and sizes (book p35; brand revision 1.1's geometry, `design/reference/brand/brand-tokens.md`).
public enum Spacing {
    public static let xs: CGFloat = 4
    public static let s: CGFloat = 8
    public static let m: CGFloat = 12
    public static let l: CGFloat = 16
    public static let xl: CGFloat = 20
    public static let xxl: CGFloat = 24
    public static let xxxl: CGFloat = 32
    /// The standard inset from the screen's edges.
    public static let inset: CGFloat = 20
}

public enum Radius {
    public static let photo: CGFloat = 14
    public static let surface: CGFloat = 12
    public static let ticket: CGFloat = 18
    public static let button: CGFloat = 13
    public static let plaque: CGFloat = 9
    /// The folded card: 1.1's `cardRadius`, as spec 24 says.
    public static let card: CGFloat = 16
    public static let input: CGFloat = 10
    /// The Highlight label on a photograph (handoff 2's `photoHighlightLabel.radius`).
    public static let photoLabel: CGFloat = 6
}

public enum Size {
    /// The smallest touch target (T47).
    public static let touchTarget: CGFloat = 44
    public static let primaryButtonHeight: CGFloat = 50
    public static let plaque = CGSize(width: 45, height: 55)
    /// The folded card's minimum height at the default text size (book p34; TECH-DESIGN 4).
    public static let foldedCardMinHeight: CGFloat = 151
    public static let foldedCardInset: CGFloat = 18
    public static let highlightCover = CGSize(width: 91, height: 69)
    /// The highlight cover as a row at large text sizes: full width, at least 96 high.
    public static let highlightRowMinHeight: CGFloat = 96
    /// The folded corner, on the card and the highlight cover alike.
    public static let fold: CGFloat = 18
    /// The lock before a card's status line: SF Symbol `lock.fill` at 12 points, 8 before the text
    /// (handoff 5's `collectingCardStatus.lock`, which reaches the repository with handoffs 5
    /// and 6; it supersedes 2.1's outlined drawing).
    public static let lockGlyph: CGFloat = 12
    /// The labelled star that marks a Highlight (book p6), before the author's "Highlight" on a
    /// card and on the star's own pick: SF Symbol `star.fill` at 12 points, 4 before its word, as
    /// handoff 4's `photoHighlightLabel` draws it.
    public static let highlightStar: CGFloat = 12
    public static let highlightStarGap: CGFloat = 4
    /// A photo avatar's edge: 1 point of `separator` just outside the circular clip, in both
    /// themes, on every photo avatar (handoff 3's `photoAvatarEdge`, kept by handoff 4).
    public static let photoAvatarEdge: CGFloat = 1
    /// An avatar with no photograph and no initial draws SF Symbol `person` at this share of its
    /// circle as the symbol's point size: 38.08, 20.16, 15.68 and 10.08 points at 68, 36, 28 and
    /// 18 (handoff 7's `avatarWithoutInitial.glyphSizeRatio`, 0.56).
    public static let avatarGlyphRatio: CGFloat = 0.56
    /// How far that symbol's middle sits above the circle's, as a share of the circle: handoff 7's
    /// sheet ("Avatar with no readable initial") draws it 4 percent of the circle high at every
    /// size, 2.72, 1.44, 1.12 and 0.72 points at 68, 36, 28 and 18 in its vector source
    /// (`brand-components.svg`; read on its 2x image, to the half point, 2.75, 1.5, 1 and 0.5),
    /// frame 10 2.75 at 68 on its 2x image, and no contract names it. The symbol at
    /// `avatarGlyphRatio` is as tall as the drawn one at each size.
    public static let avatarGlyphLift: CGFloat = 0.04
    /// The fold's edge (handoff 4's `foldCornerLine`).
    public static let foldLine: CGFloat = 0.75
    /// The keyboard focus ring: 2 points wide, outside a 2-point gap (1.1's `focusRingWidth`, `focusRingGap`).
    public static let focusRingWidth: CGFloat = 2
    public static let focusRingGap: CGFloat = 2
    /// The busy primary button's indicator, the system's own, 16 points at every text size, in a
    /// 24-point slot on each side of the label: the label stays where it is idle and the
    /// indicator's right edge is 8 before it (handoff 7's `busyPrimary`: `indicatorSize` 16,
    /// `indicatorGap` 8, symmetric 24-point accessory slots).
    public static let busyIndicator: CGFloat = 16
    public static let busySlot: CGFloat = 24
    /// The labelled field's least height, which grows with the text: 54 is not a cap (handoff 4's
    /// `componentGeometry.field`).
    public static let fieldMinHeight: CGFloat = 54
    /// The field's value from its edge. Handoff 1's frames draw 14, between two steps of book
    /// p35's scale, and no contract names it, so it takes 16, the inset handoff 5 and 6 name for
    /// content inside a surface (`dayChoiceRow.contentInset`).
    public static let fieldInset: CGFloat = 16
    /// The secondary button's border (handoff 2's `invitationEntryAction.borderWidth`).
    public static let secondaryBorder: CGFloat = 1
    /// The Private drafts row's least height, which grows with the text (handoff 2's
    /// `privateDraftsEntry.minimumHeight`).
    public static let draftsRowMinHeight: CGFloat = 76
    /// The drafts row's folder: the 24-point box handoff 4's `G06-no-club` draws, holding SF Symbol
    /// `folder` at the size whose glyph matches the drawn one, 20 by 15.
    public static let draftsFolderBox: CGFloat = 24
    public static let draftsFolder: CGFloat = 17
    /// The drafts row's chevron: the frame's 20-point box, holding SF Symbol `chevron.right` at
    /// the size whose glyph matches the drawn one, 6 by 12.
    public static let draftsChevronBox: CGFloat = 20
    public static let draftsChevron: CGFloat = 13
    /// The photo label's padding above and below its word: handoff 4's optical inset
    /// `photoHighlightBlock` ("14 + 2×6 = 26"), not a general spacing step. It keeps its size at
    /// every text size, as handoff 7's largest-text specimen draws it.
    public static let photoLabelBlock: CGFloat = 6
    /// The owner's photo in a draft or upload row (handoff 7's `dropShapes.thumbnailRow.photo`,
    /// 76 by 92, as 2.1's `C05-drafts` draws it).
    public static let dropThumbnail = CGSize(width: 76, height: 92)
    /// A revealed photograph's frame in the feed, width over height: 2.1's `H01-open`, 353 by 304
    /// (FQ40's default; handoff 0's frame draws 353 by 300). Every photograph fills it.
    public static let feedPhotoAspect: CGFloat = 353.0 / 304.0
    /// The compact receipt's disc and its SF Symbol `checkmark` at the default text size: 28 and 12
    /// points (handoff 7's `compactReceipt.checkDisc`, "default 28"; the check at the size whose
    /// glyph is as wide as the drawn one, about 10.5 points, at the regular weight that every
    /// symbol here has, nearest the drawing's thin stroke; its height is SF's own, nearly square,
    /// where the drawing's is about 7.6). Both grow with `row` text ("scalesWith row";
    /// `CompactReceipt`).
    public static let receiptDisc: CGFloat = 28
    public static let receiptCheck: CGFloat = 12
    /// A roster row's least height with a date, and without one, both growing with the text
    /// (handoff 6's `friendsRow.minimumHeight` and `noOccurrence`: "52 minimum").
    public static let personRowMinHeight: CGFloat = 68
    public static let personRowNoDateMinHeight: CGFloat = 52
    /// A travelling roster row's least height: the contract's "100-point minimum in fixture"
    /// (`friendsRow.travelling`), which the frame draws at 108.
    public static let personRowTravellingMinHeight: CGFloat = 100
    /// Where a roster row's words and its separator start, from the row's leading edge: the
    /// 36-point avatar and 13 after it (`friendsRow.textInset`, `separatorLeadingInset`).
    public static let personRowTextInset: CGFloat = 49
    /// A roster row's chevron: the contract's 20-point box (`friendsRow.chevronSize`), holding
    /// SF Symbol `chevron.right` at the size whose glyph matches the Private drafts row's, 6 by
    /// 12 in handoff 4's `G06-no-club`, as the drafts row's does; handoff 3's `F01-friends-dark`
    /// draws 7.5 by 13 and handoff 6's `F01-friends` 5 by 9 (the ios lane's needs list).
    public static let personRowChevronBox: CGFloat = 20
    public static let personRowChevron: CGFloat = 13
    /// The roster chevron's box from the row's trailing edge: handoff 6's sheet draws 2, which
    /// is no step of book p35's scale, so the nearest inside it, 4.
    public static let personRowChevronInset: CGFloat = 4
    /// A separator's width (handoff 6's `invitationRosterRow.separatorWidth`).
    public static let separatorWidth: CGFloat = 1
    /// The target block's chevron: a 20-point box, as the drafts row's, holding SF Symbol
    /// `chevron.down` at the size whose glyph matches 2.1's `C02-photo`, about 8 by 5.
    public static let targetChevronBox: CGFloat = 20
    public static let targetChevron: CGFloat = 9
    /// The wordmark's width in the no-club header (handoff 2's `noClubRootHeader`: "outlined
    /// wordmark, width 96"; revision 1.1's `minimumWidth`).
    public static let headerWordmark: CGFloat = 96
    /// The wordmark's top, from the header's (handoff 7's `noClubRootHeader.wordmarkRect`,
    /// [20, 64, 96, 30.43] in a header that starts at 56).
    public static let headerWordmarkTop: CGFloat = 8
    /// The wordmark's band when the header stacks: the actions' row starts 48 under the header's
    /// top (handoff 7's `noClubRootHeader.largest`, `addTarget` [20, 104, 249, 76]).
    public static let headerWordmarkBand: CGFloat = 48
    /// "+ Add"'s least width in the header's one row (handoff 7's
    /// `noClubRootHeader.addTarget`, [241, 56, 80, 44]).
    public static let headerAddMinWidth: CGFloat = 80
    /// "+ Add"'s words from its target's leading edge in that row (the frames draw them from
    /// 249).
    public static let headerAddLabelInset: CGFloat = 8
    /// Between "+ Add"'s target and Account's (handoff 7: 321 to 329).
    public static let headerActionGap: CGFloat = 8
    /// The selected club's header's trailing inset, to Account's trailing edge (handoff 3's
    /// `navigationAndTargets.selectedClubHeader`: Account's target [337, 56, 44, 44] ends at 381).
    public static let clubHeaderTrailingInset: CGFloat = 12
    /// "+ Add"'s least width in that header's one row (its target [274, 56, 59, 44]).
    public static let clubHeaderAddMinWidth: CGFloat = 59
    /// From the club selector's target to "+ Add"'s in that header (250 to 274).
    public static let clubHeaderSelectorGap: CGFloat = 24
    /// From "+ Add"'s target to Account's in that header (333 to 337).
    public static let clubHeaderActionGap: CGFloat = 4
    /// The selector's `chevron.down`, at the size whose glyph matches the drawn one, 10 by 5
    /// (handoff 5's `G06-switcher-status`, which draws handoff 3's header).
    public static let clubHeaderChevron: CGFloat = 11
    /// The switcher's `checkmark` on the selected club's row, at the size whose glyph is the
    /// drawn one's width, 15 (handoff 6's `G06-switcher-unavailable`).
    public static let switcherCheck: CGFloat = 16
    /// The Private drafts row's folder box from the row's leading edge (handoff 7's `G06-no-club`
    /// and `F01-no-club`, and its sheet's Private drafts specimen: the box at 36 in a row that
    /// starts at 20).
    public static let draftsLeadingInset: CGFloat = 16
    /// The Proposed tag's space above and below its word (handoff 8's `proposedMemberTag`,
    /// `handoff4.opticalInsets.proposedTagBlock`).
    public static let proposedTagBlock: CGFloat = 5
    /// The Proposed tag's least height at the default text size (`proposedMemberTag`).
    public static let proposedTagMinHeight: CGFloat = 28
    /// The Proposed tag's corner radius (`proposedMemberTag`).
    public static let proposedTagRadius: CGFloat = 6
}

/// The avatar's sizes (1.1: 68 on the profile, 36 in rows, 28 on cards, 18 on the rail).
public enum AvatarSize: CGFloat, Sendable, CaseIterable {
    case profile = 68
    case row = 36
    case card = 28
    case rail = 18
}
