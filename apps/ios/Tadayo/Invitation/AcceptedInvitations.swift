import SwiftUI
import TadayoCore
import TadayoDesign

/// The invitations the account accepted that haven't become a membership, one row each in the
/// list's order, with no badge, count or progress (handoff 9's `acceptedInvitations.multiple`):
/// on Home with no club (`HomeNoClub`) and in the switcher (`ClubSwitcher`). Each row says the
/// club and where its invitation stands, and nothing else of the club: no roster, member count,
/// photo or date, and never who declined (`accessBoundary`, `did_not_go_ahead.privacy`; T33).
/// A changed roster whose link this phone doesn't hold adds "Open the invitation link to
/// continue." (FQ136). `open` opens the invitation as its state says (`RootModel.openAccepted`).
struct AcceptedInvitationRows: View {
    let invitations: [AcceptedInvitation]
    let open: (MyInvitation) -> Void

    var body: some View {
        VStack(spacing: Spacing.m) {
            ForEach(invitations) { accepted in
                let words = AcceptedWords(accepted)
                AcceptedInvitationRow(
                    name: accepted.invitation.clubName, status: Text(words.status),
                    helper: words.helper.map { Text($0) },
                    label: Text(verbatim: words.label), hint: Text(words.hint)
                ) {
                    open(accepted.invitation)
                }
            }
        }
    }
}

/// A row's words: its state, any helper line, and what VoiceOver reads (handoff 9's
/// `handoff9.invitation.*`).
struct AcceptedWords: Equatable {
    let status: LocalizedStringKey
    let helper: LocalizedStringKey?
    let label: String
    let hint: LocalizedStringKey

    init(_ accepted: AcceptedInvitation) {
        let club = accepted.invitation.clubName
        switch accepted.invitation.state {
        case .waiting:
            status = "accepted.waiting"
            helper = nil
            label = String(format: String(localized: "accepted.waiting.vo"), club)
            hint = "accepted.waiting.hint"
        case .rosterChanged where accepted.linkHeld:
            status = "accepted.changed"
            helper = nil
            label = String(format: String(localized: "accepted.changed.vo"), club)
            hint = "accepted.changed.hint"
        case .rosterChanged:
            status = "accepted.changed"
            helper = "accepted.changed.missing"
            label = String(format: String(localized: "accepted.changed.missing.vo"), club)
            hint = "accepted.changed.missing.hint"
        case .didNotGoAhead:
            status = "accepted.ended"
            helper = nil
            label = String(format: String(localized: "accepted.ended.vo"), club)
            hint = "accepted.ended.hint"
        }
    }
}
