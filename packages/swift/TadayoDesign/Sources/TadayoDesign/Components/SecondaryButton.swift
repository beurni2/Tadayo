import SwiftUI

/// The secondary button, under the primary on the no-club tabs: full width, at least 50 points
/// high, radius 13, a `surface` fill inside a 1-point `inputBorder`, and its label in
/// `primaryText` at `button` 16/22 bold, growing with the text (handoff 2's
/// `invitationEntryAction`: "50 pt minimum high, radius 13, surface fill, 1 pt inputBorder and
/// primaryText label in the existing button role"; handoff 6 keeps it).
///
/// No delivery draws it pressed or disabled, so it looks the same when pressed, and nothing
/// disables it yet: built from spec until a handoff draws them (the ios lane's needs list). Keyboard
/// focus draws the primary button's ring (handoff 4's `buttonFocus`, which names no one button).
public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        SecondaryButton(configuration: configuration)
    }
}

private struct SecondaryButton: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        SecondaryButtonFace(isFocused: isFocused) {
            configuration.label
        }
        .focusEffectDisabled()
    }
}

/// The secondary button's appearance, which `SecondaryButtonStyle` feeds from the button; the Lab
/// draws its keyboard focus with it, since a snapshot can't give a button the focus.
public struct SecondaryButtonFace<Label: View>: View {
    let isFocused: Bool
    let label: Label

    public init(isFocused: Bool = false, @ViewBuilder label: () -> Label) {
        self.isFocused = isFocused
        self.label = label()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.button)
        let ring = Size.focusRingGap + Size.focusRingWidth / 2
        label
            .textRole(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(Palette.primaryText)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.l)
            .padding(.vertical, Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Size.primaryButtonHeight)
            .background(Palette.surface, in: shape)
            .overlay { shape.strokeBorder(Palette.inputBorder, lineWidth: Size.secondaryBorder) }
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
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    public static var tadayoSecondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}
