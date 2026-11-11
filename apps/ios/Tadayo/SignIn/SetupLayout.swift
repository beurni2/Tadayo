import SwiftUI
import TadayoDesign
import UIKit

/// The sign-in and profile screens' column: content from the top, 20 points in from each edge,
/// scrolling when the text is large, on `canvas`. Gaps are book p35's steps nearest to the
/// frames' (each listed in the PR, and in INVENTORY.md's known differences), or, past its
/// largest step, a sum of its steps (`SetupGap`).
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

/// The setup screens' gaps wider than book p35's largest step (32), each a sum of its steps,
/// set so the glyphs sit where handoffs 1 and 2's frames put them: a text's box in SwiftUI has no
/// leading above its first line, where a frame's line box does.
enum SetupGap {
    /// From a subtitle to the field below it (A02-email, A02-code): the frames' glyphs are 47
    /// apart, and 32 + 12 puts them 47 apart here.
    static let field = Spacing.xxxl + Spacing.m
    /// From a form's pinned primary action to the bottom of the safe area: 44 in handoff 7's
    /// A02-age, A03-profile and root failure frames (`handoff7.spacing.formFooterToSafeAreaBottom`).
    /// A03-profile's Continue and the root failures' Retry take it.
    static let formFooterToSafeAreaBottom = Spacing.xxxl + Spacing.m
}

/// A setup screen's title, `utilityTitle` 32/35 as a heading, wrapping naturally (handoff 2's
/// `textWrapping`), and its subtitle in `body`: close under the title on A02-email, A02-code and
/// A03-profile, and a paragraph of its own on A02-age, as the frames draw them.
struct SetupHeading: View {
    let title: LocalizedStringKey
    let subtitle: Text
    var subtitleGap: CGFloat = Spacing.l

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
            .padding(.top, subtitleGap)
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
    /// lets what VoiceOver is saying finish first. With `initial`, also the words the view
    /// first shows with.
    func announcing(
        _ words: String?, politely: Bool = false, initial: Bool = false
    ) -> some View {
        onChange(of: words, initial: initial) { _, said in
            guard let said else { return }
            Announcement.post(said, politely: politely)
        }
    }
}

/// Something VoiceOver says without moving its focus.
enum Announcement {
    /// Says `words`; politely lets what VoiceOver is saying finish first.
    static func post(_ words: String, politely: Bool = false) {
        let priority: UIAccessibilityPriority = politely ? .low : .default
        let announcement = NSAttributedString(
            string: words, attributes: [.accessibilitySpeechAnnouncementPriority: priority])
        UIAccessibility.post(notification: .announcement, argument: announcement)
    }
}
