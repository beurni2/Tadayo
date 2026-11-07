import SwiftUI

/// A failure's line: an icon and the literal words in `metadata` 13/18, both `destructive`, so
/// the state never rests on colour alone (handoff 1: "State changes use words and symbols, never
/// colour alone"; book p26). It names the action that failed (T43). The icon is SF Symbols'
/// `exclamationmark.circle`, as handoff 2's A02-code-error draws it; the words carry the meaning,
/// so VoiceOver reads them alone.
public struct InlineError: View {
    let message: Text

    public init(_ message: Text) {
        self.message = message
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
            Image(systemName: "exclamationmark.circle")
                .textRole(.metadata)
                .accessibilityHidden(true)
            message
                .textRole(.metadata)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Palette.destructive)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
