import SwiftUI
import UIKit

/// The type roles of brand revision 1.1 (FQ45, ADR-027): every role in
/// `design/reference/claude-design/handoff-4/component-contracts.json`'s `typeRoleMetrics`, which
/// holds `brand-tokens.json`'s roles with the Dynamic Type style each scales with, and its
/// supplemental roles from handoffs 2 to 4, on the system font (`design/reference/brand/brand-tokens.md`).
/// Each scales with Dynamic Type through UIFontMetrics (`@ScaledMetric`), relative to its text
/// style, with no maximum, so rows grow and nothing shrinks (book p26, T47).
///
/// The avatar roles are named by their use: `avatarRow` is 1.1's `avatar36`, `avatarCard`
/// `avatar28`, `avatarRail` `avatar18` and `avatarProfile` `avatarProfile68`.
public enum TypeRole: Sendable, CaseIterable {
    case utilityTitle, dayTitle, dateTitle, emptyTitle, body, row
    case metadata, cardStatus, caption, highlight, plaqueWeekday, plaqueDay
    case clubHeader, headerAdd, button, tab, allowance, photoLabel
    case avatarRow, avatarCard, avatarRail, avatarProfile, textAction, rowAction
    case fieldLabel, eyebrow, proposedTag, personDisplay, highlightExpanded, nextUp

    public var size: CGFloat {
        switch self {
        case .utilityTitle: 32
        case .dayTitle: 31
        case .dateTitle, .emptyTitle, .plaqueDay: 25
        case .body, .row: 17
        case .metadata, .cardStatus, .avatarCard, .fieldLabel, .eyebrow, .proposedTag, .nextUp: 13
        case .caption: 21
        case .highlight, .allowance: 12
        case .plaqueWeekday: 10
        case .clubHeader, .button, .avatarRow, .textAction: 16
        case .headerAdd, .rowAction: 15
        case .tab, .photoLabel: 11
        case .avatarRail: 9
        case .avatarProfile, .personDisplay: 28
        case .highlightExpanded: 20
        }
    }

    public var lineHeight: CGFloat {
        switch self {
        case .utilityTitle: 35
        case .dayTitle, .avatarProfile, .personDisplay: 34
        case .dateTitle: 29
        case .emptyTitle: 30
        case .body: 23
        case .row, .button, .textAction: 22
        case .metadata, .cardStatus, .avatarCard, .fieldLabel, .eyebrow, .proposedTag, .nextUp: 18
        case .caption, .plaqueDay: 28
        case .highlight, .tab, .photoLabel: 14
        case .plaqueWeekday: 12
        case .clubHeader, .headerAdd, .avatarRow, .rowAction: 20
        case .allowance: 17
        case .avatarRail: 11
        case .highlightExpanded: 26
        }
    }

    public var weight: Font.Weight {
        switch self {
        case .utilityTitle, .dayTitle, .dateTitle, .emptyTitle, .row, .caption, .highlight,
            .plaqueWeekday, .plaqueDay, .clubHeader, .headerAdd, .button, .photoLabel, .avatarRow,
            .avatarCard, .avatarRail, .avatarProfile, .fieldLabel, .eyebrow, .proposedTag,
            .personDisplay, .highlightExpanded, .nextUp:
            .bold
        case .body, .metadata, .cardStatus, .tab, .allowance, .textAction, .rowAction: .regular
        }
    }

    /// The Dynamic Type style each role scales with, as 1.1 names it.
    public var textStyle: Font.TextStyle {
        switch self {
        case .utilityTitle, .dayTitle: .largeTitle
        case .dateTitle, .emptyTitle, .plaqueDay: .title2
        case .body, .row, .button, .avatarRow, .textAction: .body
        case .metadata, .cardStatus, .avatarCard, .fieldLabel, .eyebrow, .proposedTag, .nextUp:
            .footnote
        case .caption, .highlightExpanded: .title3
        case .highlight, .allowance: .caption
        case .plaqueWeekday, .tab, .photoLabel, .avatarRail: .caption2
        case .clubHeader: .headline
        case .headerAdd, .rowAction: .subheadline
        case .avatarProfile, .personDisplay: .title
        }
    }

    var uiWeight: UIFont.Weight {
        weight == .bold ? .bold : .regular
    }
}

struct TypeRoleModifier: ViewModifier {
    let role: TypeRole
    @ScaledMetric private var size: CGFloat
    @ScaledMetric private var lineHeight: CGFloat

    init(role: TypeRole) {
        self.role = role
        _size = ScaledMetric(wrappedValue: role.size, relativeTo: role.textStyle)
        _lineHeight = ScaledMetric(wrappedValue: role.lineHeight, relativeTo: role.textStyle)
    }

    func body(content: Content) -> some View {
        let font = UIFont.systemFont(ofSize: size, weight: role.uiWeight)
        let natural = font.lineHeight
        let capHeight = font.capHeight
        return
            content
            .font(.system(size: size, weight: role.weight))
            .lineSpacing(max(0, lineHeight - natural))
            .alignmentGuide(.firstLineCenter) { $0[.firstTextBaseline] - capHeight / 2 }
    }
}

extension VerticalAlignment {
    private enum FirstLineCenter: AlignmentID {
        static func defaultValue(in context: ViewDimensions) -> CGFloat {
            context[VerticalAlignment.center]
        }
    }

    /// The middle of the first line of a text set with `textRole`, and the middle of anything
    /// else. An avatar or a glyph beside a name aligns to the name's first line however far the
    /// name wraps (handoff 3: at AX5 "the 36 pt avatar aligns to the first line").
    public static var firstLineCenter: VerticalAlignment {
        VerticalAlignment(FirstLineCenter.self)
    }
}

extension View {
    /// Sets one of the book's type roles. Screens use this, never a size of their own (T44).
    public func textRole(_ role: TypeRole) -> some View {
        modifier(TypeRoleModifier(role: role))
    }
}
