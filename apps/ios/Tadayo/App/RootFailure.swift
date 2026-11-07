import SwiftUI
import TadayoCore
import TadayoDesign

/// The root's failures, with no header and no tabs, since the app doesn't yet know which screen
/// comes next: a title naming what failed (T43) over a line saying what to do, and Retry, the
/// primary button, pinned at the foot. In the sign-in screens' form (`SetupScroll`), with no
/// navigation bar. Built from spec: the words are FQ89's defaults until handoff 7 gives them (its
/// item 12). VoiceOver says the title and the line as the screen shows, without moving its focus.
struct RootFailure: View {
    enum Kind: Equatable {
        /// The account couldn't be read, at launch or after a verified code: Retry reads it again.
        case account(RootModel.Failure)
        /// Leave sign-in, the Lab's Log out, or a session the server ended, couldn't remove the
        /// session from this iPhone: Retry leaves again.
        case leave
        /// A verified code's session couldn't be kept on this iPhone: Retry starts again, which
        /// is sign-in.
        case keep

        var title: LocalizedStringResource {
            switch self {
            case .account: "root.error.account"
            case .leave: "root.error.leave"
            case .keep: "root.error.keep"
            }
        }

        var line: LocalizedStringResource {
            switch self {
            case .account(let failure): failure.line
            case .leave, .keep: RootModel.Failure.other.line
            }
        }

        /// What VoiceOver says as the failure shows: the title, then the line.
        var spoken: String {
            "\(String(localized: title)) \(String(localized: line))"
        }
    }

    let kind: Kind
    let retry: @MainActor () async -> Void

    var body: some View {
        SetupScroll {
            SetupHeading(title: LocalizedStringKey(kind.title.key), subtitle: Text(kind.line))
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: Spacing.s) {
                Button {
                    Task { await retry() }
                } label: {
                    Text("common.retry")
                }
                .buttonStyle(.tadayoPrimary)
            }
        }
        .announcing(kind.spoken, initial: true)
    }
}
