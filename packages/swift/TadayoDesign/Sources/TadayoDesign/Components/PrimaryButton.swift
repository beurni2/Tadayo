import SwiftUI

/// The main action: full width, at least 50 points high, label 16/22 bold, radius 13 (book p34,
/// p35; brand revision 1.1's "Buttons and fields", `design/reference/claude-design/handoff-1/IMPLEMENTATION.md`).
/// Default `action`/`onAction`; pressed `actionPressed`/`onActionPressed`; disabled
/// `actionDisabled`/`onActionDisabled`, with no opacity multiplier. Keyboard focus, never an
/// ordinary touch, draws a 2-point `focusRing` outside a 2-point canvas gap (handoff 4's
/// `buttonFocus`). Its label grows with the text.
///
/// Busy, while its request is on its way: the button keeps its height, its label and its colours,
/// with the system's indeterminate indicator at its trailing edge, and the screen disables it so
/// a second tap does nothing (handoff 1: "keep the button height and label stable, disable
/// repeated submission and expose the busy state accessibly"; handoff 3's indicator). No delivery
/// draws it yet, so it's built from spec (handoff 7 asks). A button that can be busy keeps the
/// indicator's room clear on both sides of its centred label, busy or not, at the indicator's own
/// size, which grows with the text (20 points at the default size, about 56 at the largest): the
/// label wraps before it reaches the indicator, and doesn't wrap differently when it comes.
public struct PrimaryButtonStyle: ButtonStyle {
    let isBusy: Bool
    let canBeBusy: Bool

    public init(isBusy: Bool = false, canBeBusy: Bool = false) {
        self.isBusy = isBusy
        self.canBeBusy = canBeBusy
    }

    public func makeBody(configuration: Configuration) -> some View {
        PrimaryButton(configuration: configuration, isBusy: isBusy, canBeBusy: canBeBusy)
    }
}

private struct PrimaryButton: View {
    let configuration: ButtonStyleConfiguration
    let isBusy: Bool
    let canBeBusy: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        PrimaryButtonFace(
            isPressed: configuration.isPressed, isFocused: isFocused,
            isEnabled: isEnabled || isBusy, isBusy: isBusy, canBeBusy: canBeBusy
        ) {
            configuration.label
        }
        .focusEffectDisabled()
    }
}

/// The primary button's appearance in one state, which `PrimaryButtonStyle` feeds from the
/// button. The Lab draws each of the sheet's four states with it (default, pressed, disabled,
/// keyboard focus, busy), since a snapshot can't press a button or give it keyboard focus.
public struct PrimaryButtonFace<Label: View>: View {
    let isPressed: Bool
    let isFocused: Bool
    let isEnabled: Bool
    let isBusy: Bool
    let canBeBusy: Bool
    let label: Label

    public init(
        isPressed: Bool = false, isFocused: Bool = false, isEnabled: Bool = true,
        isBusy: Bool = false, canBeBusy: Bool = false, @ViewBuilder label: () -> Label
    ) {
        self.isPressed = isPressed
        self.isFocused = isFocused
        self.isEnabled = isEnabled
        self.isBusy = isBusy
        self.canBeBusy = canBeBusy || isBusy
        self.label = label()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.button)
        let ring = Size.focusRingGap + Size.focusRingWidth / 2
        HStack(spacing: Spacing.s) {
            if canBeBusy {
                // The indicator's room on the leading side too, so the label stays centred.
                indicator.hidden().accessibilityHidden(true)
            }
            label
                .textRole(.button)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            if canBeBusy {
                indicator.opacity(isBusy ? 1 : 0).accessibilityHidden(!isBusy)
            }
        }
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
    }

    /// The system's indeterminate activity indicator, 8 points from the label.
    private var indicator: some View {
        ProgressView().tint(ink)
    }

    private var fill: Color {
        if !isEnabled { return Palette.actionDisabled }
        return isPressed ? Palette.actionPressed : Palette.action
    }

    private var ink: Color {
        if !isEnabled { return Palette.onActionDisabled }
        return isPressed ? Palette.onActionPressed : Palette.onAction
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    public static var tadayoPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }

    /// The primary button, busy while its request is on its way.
    public static func tadayoPrimary(isBusy: Bool) -> PrimaryButtonStyle {
        PrimaryButtonStyle(isBusy: isBusy, canBeBusy: true)
    }
}
