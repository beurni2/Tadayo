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
    /// The fold's edge (handoff 4's `foldCornerLine`).
    public static let foldLine: CGFloat = 0.75
    /// The keyboard focus ring: 2 points wide, outside a 2-point gap (1.1's `focusRingWidth`, `focusRingGap`).
    public static let focusRingWidth: CGFloat = 2
    public static let focusRingGap: CGFloat = 2
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
    /// The wordmark's width in the no-club header (handoff 2's `noClubRootHeader`: "outlined
    /// wordmark, width 96"; revision 1.1's `minimumWidth`).
    public static let headerWordmark: CGFloat = 96
}

/// The avatar's sizes (1.1: 68 on the profile, 36 in rows, 28 on cards, 18 on the rail).
public enum AvatarSize: CGFloat, Sendable, CaseIterable {
    case profile = 68
    case row = 36
    case card = 28
    case rail = 18
}
