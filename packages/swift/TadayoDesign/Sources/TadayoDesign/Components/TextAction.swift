import SwiftUI

/// A plain text action: `textAction` 16/22 regular in `action` ink, at the leading edge of a
/// full-width row at least 44 points high, the whole of which takes a tap (handoff 2: "All plain
/// text actions use textAction 16/22 regular"; T47). Handoff 7's frames draw every text action
/// from the leading edge, and its component sheet's specimen too (X-25, VM-03); they were centred
/// before it. Pressed takes `actionPressed`. Unavailable takes `secondaryText`, the ink of words
/// that aren't an action, as handoff 7's frames 4 and 7 draw Change email address while a request
/// runs.
///
/// A destructive one, Club details' Leave club (2.1's `G05-club-details`, handoff 8's frame 16),
/// takes `destructive` instead, pressed or not: the brand has no pressed destructive ink, and no
/// delivery draws it pressed.
///
/// One under a footer's primary action, an invitation's Not now under Accept this roster, is
/// centred on the row (`Placement.underPrimary`), as handoff 8's frames 9 and 15 and handoff 9's
/// frame 6 draw it: handoff 9's answer on Leave club keeps the leading edge for Leave club alone
/// ("Leading alignment replaces only H8 frame16 centering", `handoff9.replaces.leaveClub`).
public struct TextActionStyle: ButtonStyle {
    /// The action's ink.
    public enum Ink: Sendable {
        case action, destructive
    }

    /// Where the words sit in the row.
    public enum Placement: Sendable {
        /// At the leading edge (handoff 7).
        case leading
        /// Centred, under a footer's primary action (handoffs 8 and 9).
        case underPrimary
    }

    let ink: Ink
    let placement: Placement

    public init(ink: Ink = .action, placement: Placement = .leading) {
        self.ink = ink
        self.placement = placement
    }

    public func makeBody(configuration: Configuration) -> some View {
        TextActionFace(configuration: configuration, ink: ink, placement: placement)
    }
}

private struct TextActionFace: View {
    let configuration: ButtonStyleConfiguration
    let ink: TextActionStyle.Ink
    let placement: TextActionStyle.Placement
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .textRole(.textAction)
            .multilineTextAlignment(placement == .underPrimary ? .center : .leading)
            .foregroundStyle(color)
            .frame(
                maxWidth: .infinity, minHeight: Size.touchTarget,
                alignment: placement == .underPrimary ? .center : .leading
            )
            .contentShape(Rectangle())
    }

    private var color: Color {
        guard isEnabled else { return Palette.secondaryText }
        switch ink {
        case .action: return configuration.isPressed ? Palette.actionPressed : Palette.action
        case .destructive: return Palette.destructive
        }
    }
}

extension ButtonStyle where Self == TextActionStyle {
    public static var tadayoText: TextActionStyle { TextActionStyle() }

    public static func tadayoText(ink: TextActionStyle.Ink) -> TextActionStyle {
        TextActionStyle(ink: ink)
    }

    /// A text action centred under a footer's primary action.
    public static var tadayoTextUnderPrimary: TextActionStyle {
        TextActionStyle(placement: .underPrimary)
    }
}
