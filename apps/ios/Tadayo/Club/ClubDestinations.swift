import SwiftUI
import TadayoCore

/// Club details as a club tab's stack shows it, bound to the selected club's model
/// (`RootModel.clubDetails()`): it reads the details the first time it shows, and again on
/// Retry. Coming back from the members list reads nothing again.
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
        }
    }
}

/// The members list as a club tab's stack shows it: it reads the roster and the club's week each
/// time it's opened, and again on Retry.
struct MembersDestination: View {
    let model: ClubDetailsModel
    @State private var asked = false

    var body: some View {
        MembersScreen(members: model.members, retry: { await model.loadMembers() })
            .task {
                guard !asked else { return }
                asked = true
                await model.loadMembers()
            }
    }
}
