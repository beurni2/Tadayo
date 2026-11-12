import SwiftUI

/// A plain text action: `textAction` 16/22 regular in `action` ink, at the leading edge of a
/// full-width row at least 44 points high, the whole of which takes a tap (handoff 2: "All plain
/// text actions use textAction 16/22 regular"; T47). Handoff 7's frames draw every text action
/// from the leading edge, and its component sheet's specimen too (X-25, VM-03); they were centred
/// before it. Pressed takes `actionPressed`. Unavailable takes `secondaryText`, the ink of words
/// that aren't an action: no delivery draws it yet, so it's built from spec (handoff 7 asks).
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
            .multilineTextAlignment(.leading)
            .foregroundStyle(
                isEnabled
                    ? (configuration.isPressed ? Palette.actionPressed : Palette.action)
                    : Palette.secondaryText
            )
            .frame(maxWidth: .infinity, minHeight: Size.touchTarget, alignment: .leading)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == TextActionStyle {
    public static var tadayoText: TextActionStyle { TextActionStyle() }
}
