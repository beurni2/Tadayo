import SwiftUI

/// A plain text action: `textAction` 16/22 regular in `action` ink, centred in a full-width row at
/// least 44 points high (handoff 2: "All plain text actions use textAction 16/22 regular"; T47).
/// Pressed takes `actionPressed`. Unavailable takes `secondaryText`, the ink of words that aren't
/// an action: no delivery draws it yet, so it's built from spec (handoff 7 asks).
public struct TextActionStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        TextActionFace(configuration: configuration)
    }
}

private struct TextActionFace: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .textRole(.textAction)
            .multilineTextAlignment(.center)
            .foregroundStyle(
                isEnabled
                    ? (configuration.isPressed ? Palette.actionPressed : Palette.action)
                    : Palette.secondaryText
            )
            .frame(maxWidth: .infinity, minHeight: Size.touchTarget)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == TextActionStyle {
    public static var tadayoText: TextActionStyle { TextActionStyle() }
}
