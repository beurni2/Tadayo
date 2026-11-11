import SwiftUI
import TadayoCore
import TadayoDesign

/// The root's two waits, with no header, no tabs and no Retry, since the app doesn't yet know
/// which screen comes next: the system's indicator over the words, on the canvas the launch
/// screen handed over on. `loading` while a kept sign-in's account is read, at launch and on
/// Retry; `leaving` while Leave sign-in, the Lab's Log out or a session the server ended removes
/// the session (handoff 7's `launch.runtimeAccountLoading` and `launch.runtimeLeaving`: a native
/// spinner and the words, "no header or tabs"). With no sign-in to read, the canvas stays alone
/// (`RootModel.Route.starting`; FQ96's default).
///
/// Built from spec: no frame draws either wait (INVENTORY.md's `global-launch` and
/// `global-leaving`), so the form is the tabs' loading shell's (`TabContent.loading`, handoff 3's
/// `loadingHome`): the indicator in `secondaryText` over the words in `metadata`, 20 points
/// apart, two fifths of the way down the space between the safe areas. Said politely once as the
/// wait shows, with no timer and no invented delay or promise (`launch.limits`). The indicator
/// isn't an element of its own: the words are what VoiceOver reads.
struct RootWait: View {
    enum Kind: Equatable {
        case loading
        case leaving

        var words: LocalizedStringResource {
            switch self {
            case .loading: "root.loading"
            case .leaving: "root.leaving"
            }
        }

        /// What VoiceOver says as the wait shows: the words as they're drawn, since the delivery
        /// gives no spoken form of its own, and politely, so what it is saying finishes first
        /// (`announcementPolicy.loading`: "One polite announcement on state entry").
        var announcement: (words: String, politely: Bool) {
            (String(localized: words), true)
        }
    }

    let kind: Kind

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            ProgressView()
                .tint(Palette.secondaryText)
                .accessibilityHidden(true)
            Text(kind.words)
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xl)
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, Spacing.inset)
        .background { Palette.canvas.ignoresSafeArea() }
        .announcing(kind.announcement.words, politely: kind.announcement.politely, initial: true)
    }
}
