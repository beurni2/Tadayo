import SwiftUI

/// The main action: full width, at least 50 points high, label 16/22 bold, radius 13 (book p34,
/// p35; brand revision 1.1's "Buttons and fields", `design/reference/claude-design/handoff-1/IMPLEMENTATION.md`).
/// Default `action`/`onAction`; pressed `actionPressed`/`onActionPressed`; disabled
/// `actionDisabled`/`onActionDisabled`, with no opacity multiplier. Keyboard focus, never an
/// ordinary touch, draws a 2-point `focusRing` outside a 2-point canvas gap (handoff 4's
/// `buttonFocus`). Its label grows with the text.
public struct PrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        PrimaryButton(configuration: configuration)
    }
}

private struct PrimaryButton: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.button)
        let ring = Size.focusRingGap + Size.focusRingWidth / 2
        configuration.label
            .textRole(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(ink)
            .padding(.horizontal, Spacing.l)
            .padding(.vertical, Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Size.primaryButtonHeight)
            .background(fill, in: shape)
            .contentShape(shape)
            .overlay {
                if isFocused {
                    RoundedRectangle(cornerRadius: Radius.button + ring)
                        .stroke(Palette.focusRing, lineWidth: Size.focusRingWidth)
                        .padding(-ring)
                        .accessibilityHidden(true)
                }
            }
            .focusEffectDisabled()
    }

    private var fill: Color {
        if !isEnabled { return Palette.actionDisabled }
        return configuration.isPressed ? Palette.actionPressed : Palette.action
    }

    private var ink: Color {
        if !isEnabled { return Palette.onActionDisabled }
        return configuration.isPressed ? Palette.onActionPressed : Palette.onAction
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    public static var tadayoPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
}
