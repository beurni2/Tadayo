import SwiftUI
import TadayoCore
import TadayoDesign

/// The root's failures, with no header and no tabs, since the app doesn't yet know which screen
/// comes next: a title naming what failed (T43) over a line saying what to do, and Retry, the
/// primary button, pinned at the foot, 44 points above the safe area as the forms' primary
/// actions are (`SetupGap.formFooterToSafeAreaBottom`).
///
/// Handoff 7's `global-launch-failed-network` draws the first failure with no bar and the title
/// where the sign-in screens' titles sit under theirs. So the screen is held in the same
/// container, an empty inline navigation bar, and the system supplies the offset on every iOS
/// version, where a number of its own would suit one: `RootFailureTests` compares the two, on each
/// iOS the compatibility runs use. An empty bar is kept visible
/// (`.toolbar(.visible, for: .navigationBar)`): on iOS 26 SwiftUI gives a bar with nothing in it
/// no height at all, and the title sat 54 points above the sign-in titles, which sit under a bar
/// of 54 (a check on that iOS measured it); kept visible, the bar is the one the sign-in screens
/// have, and at rest it draws nothing and gives VoiceOver no element. Its background is left to
/// the system, as theirs is: hidden, a failure that scrolls under it (about 320 points wide at the
/// largest text) would run under the status bar with nothing behind it. No snapshot or test
/// scrolls it, so what the scrolled bar looks like has not been looked at on any iOS version
/// (docs/LIMITATIONS.md).
///
/// The words are handoff 7's, which equal FQ89's defaults; FQ89 stays the founder's to answer.
/// VoiceOver says the title and the line as the screen shows them, without moving its focus, and
/// Retry's hint says what it does.
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

        /// What Retry's hint says it does (handoff 7's `vo.retryAccount.hint`,
        /// `vo.retryLeave.hint` and `vo.retryKeep.hint`); its label stays "Retry".
        var retryHint: LocalizedStringResource {
            switch self {
            case .account: "root.retry.account.hint"
            case .leave: "root.retry.leave.hint"
            case .keep: "root.retry.keep.hint"
            }
        }
    }

    let kind: Kind
    let retry: @MainActor () async -> Void

    var body: some View {
        NavigationStack {
            SetupScroll {
                SetupHeading(title: LocalizedStringKey(kind.title.key), subtitle: Text(kind.line))
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                    Button {
                        Task { await retry() }
                    } label: {
                        Text("common.retry")
                    }
                    .buttonStyle(.tadayoPrimary)
                    .accessibilityHint(Text(kind.retryHint))
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .announcing(kind.spoken, initial: true)
        }
    }
}
