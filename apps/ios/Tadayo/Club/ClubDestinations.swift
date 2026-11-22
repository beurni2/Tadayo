import SwiftUI
import TadayoCore

/// Club details as a club tab's stack shows it, bound to the selected club's model
/// (`RootModel.clubDetails()`): it reads the details the first time it shows, and again on
/// Retry. Coming back from the members list reads nothing again. A read cancelled while the
/// screen stays (its task ended by the system, the answer dropped) is made again the next time it
/// shows, so loading never stays with no read behind it.
struct ClubDetailsDestination: View {
    let model: ClubDetailsModel
    let openMembers: () -> Void
    @State private var asked = false

    var body: some View {
        ClubDetailsScreen(
            details: model.details, retry: { await model.loadDetails() }, openMembers: openMembers
        )
        .task {
            guard !asked else { return }
            asked = true
            await model.loadDetails()
            if Task.isCancelled { asked = false }
        }
    }
}

/// The members list as a club tab's stack shows it: it reads the roster and the club's week each
/// time it's opened, and again on Retry. Until its own read has started it shows loading, never
/// what an earlier opening left in the model (an old roster, or the answer to a read Back
/// cancelled), so it slides in loading each time. A cancelled read is made again, as Club
/// details' is.
struct MembersDestination: View {
    let model: ClubDetailsModel
    @State private var asked = false

    var body: some View {
        MembersScreen(
            members: asked ? model.members : .loading, retry: { await model.loadMembers() }
        )
        .task {
            guard !asked else { return }
            asked = true
            await model.loadMembers()
            if Task.isCancelled { asked = false }
        }
    }
}
