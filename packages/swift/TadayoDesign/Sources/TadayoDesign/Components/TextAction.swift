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
///
/// Busy, while its request is on its way (handoff 10's `decisionBusy`: a decision screen's
/// Decline): the label keeps its words and its ink, and the system's activity indicator, 16 points
/// at every text size (`BusyIndicator`), sits 8 before it, the label centred between two 24-point
/// slots, one on each side, so it doesn't move when the request starts. Where the label can't fit
/// between them (the largest text sizes) the indicator takes a row of its own above the label,
/// which the action reserves idle and busy alike, as the busy primary button does. Its value is
/// "In progress" (`busy.value.vo`); the indicator says nothing. An action that can be busy opts in
/// (`tadayoTextUnderPrimary(isBusy:waits:)`); no other changes.
///
/// One that `waits` is unavailable only while another request on its screen is out (a decision
/// screen's pair, both waiting while either is): it keeps its idle ink, unavailable, rather than
/// `secondaryText` (handoff 10's `decisionBusy.declineWhileApproving`).
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
    let isBusy: Bool
    let canBeBusy: Bool
    let waits: Bool

    public init(
        ink: Ink = .action, placement: Placement = .leading, isBusy: Bool = false,
        canBeBusy: Bool = false, waits: Bool = false
    ) {
        self.ink = ink
        self.placement = placement
        self.isBusy = isBusy
        self.canBeBusy = canBeBusy || isBusy
        self.waits = waits
    }

    public func makeBody(configuration: Configuration) -> some View {
        TextActionFace(
            configuration: configuration, ink: ink, placement: placement, isBusy: isBusy,
            canBeBusy: canBeBusy, waits: waits)
    }
}

private struct TextActionFace: View {
    let configuration: ButtonStyleConfiguration
    let ink: TextActionStyle.Ink
    let placement: TextActionStyle.Placement
    let isBusy: Bool
    let canBeBusy: Bool
    let waits: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let face =
            content
            .textRole(.textAction)
            .multilineTextAlignment(placement == .underPrimary ? .center : .leading)
            .foregroundStyle(color)
            .frame(
                maxWidth: .infinity, minHeight: Size.touchTarget,
                alignment: placement == .underPrimary ? .center : .leading
            )
            .contentShape(Rectangle())
        if canBeBusy {
            face.accessibilityValue(
                isBusy ? String(localized: "busy.value.vo", bundle: .module) : "")
        } else {
            face
        }
    }

    /// The label alone, or, in an action that can be busy, the label and its indicator: on one
    /// line between the two slots, the indicator in the leading one; where it can't fit, the
    /// indicator's own row above it, 8 clear.
    @ViewBuilder private var content: some View {
        if canBeBusy {
            ViewThatFits(in: .horizontal) {
                configuration.label
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, Size.busySlot)
                    .overlay(alignment: .leading) { indicator }
                VStack(spacing: Spacing.s) {
                    indicator
                    configuration.label
                }
            }
        } else {
            configuration.label
        }
    }

    /// The indicator while busy and its empty room while idle: the same 16-point box.
    @ViewBuilder private var indicator: some View {
        if isBusy {
            BusyIndicator(tint: color)
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
                .accessibilityHidden(true)
        } else {
            Color.clear
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
                .accessibilityHidden(true)
        }
    }

    private var color: Color {
        guard isEnabled || isBusy || waits else { return Palette.secondaryText }
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

    /// A decision screen's Decline, centred under its primary action: busy while its request is
    /// on its way, and keeping its idle ink while the other decision's is (`waits`).
    public static func tadayoTextUnderPrimary(isBusy: Bool, waits: Bool) -> TextActionStyle {
        TextActionStyle(placement: .underPrimary, isBusy: isBusy, canBeBusy: true, waits: waits)
    }
}
