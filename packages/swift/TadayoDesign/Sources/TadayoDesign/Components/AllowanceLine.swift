import SwiftUI

/// The quiet allowance line, such as "2 of 6 drops · 0 of 2 video links" (TECH-DESIGN section 4;
/// handoff 0: 12/17, ordinary text, no badge). It is the viewer's own allowance for one day, never
/// a count of anyone else's (T33).
public struct AllowanceLine: View {
    let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        Text(text)
            .textRole(.allowance)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}
