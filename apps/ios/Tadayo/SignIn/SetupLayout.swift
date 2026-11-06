import SwiftUI
import TadayoDesign
import UIKit

/// The sign-in and profile screens' column: content from the top, 20 points in from each edge,
/// scrolling when the text is large, on `canvas`. Gaps are book p35's steps nearest to the
/// frames' (each listed in the PR, and in INVENTORY.md's known differences).
struct SetupScroll<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.inset)
            .padding(.top, Spacing.xl)
            .padding(.bottom, Spacing.l)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background { Palette.canvas.ignoresSafeArea() }
    }
}

/// A setup screen's title, `utilityTitle` 32/35 as a heading, wrapping naturally (handoff 2's
/// `textWrapping`), and its subtitle in `body`.
struct SetupHeading: View {
    let title: LocalizedStringKey
    let subtitle: Text

    var body: some View {
        Text(title)
            .textRole(.utilityTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
        subtitle
            .textRole(.body)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.l)
    }
}

/// A primary action pinned above the bottom edge, or the keyboard, while the content scrolls
/// under it (handoff 1, PDF p30: "keeping the primary action reachable").
struct SetupFooter<Content: View>: View {
    let bottom: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: Spacing.s) {
            content
        }
        .padding(.horizontal, Spacing.inset)
        .padding(.top, Spacing.s)
        .padding(.bottom, bottom)
        .background(Palette.canvas)
    }
}

extension View {
    /// Says `words` each time they change to something, without moving VoiceOver's focus
    /// (handoff 1: "Announce errors and resend availability without stealing focus"); politely
    /// lets what VoiceOver is saying finish first.
    func announcing(_ words: String?, politely: Bool = false) -> some View {
        onChange(of: words) { _, said in
            guard let said else { return }
            let priority: UIAccessibilityPriority = politely ? .low : .default
            let announcement = NSAttributedString(
                string: said, attributes: [.accessibilitySpeechAnnouncementPriority: priority])
            UIAccessibility.post(notification: .announcement, argument: announcement)
        }
    }
}
