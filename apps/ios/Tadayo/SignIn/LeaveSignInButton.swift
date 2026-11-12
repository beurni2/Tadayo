import SwiftUI

/// Leave sign-in, a setup screen's native leading text action in its navigation bar, with no back
/// chevron and no confirmation (handoff 7's `ageExit`: "Native leading Leave sign-in text action,
/// no back chevron. Same on A03."; `confirmationAlert false`). It ends this sign-in and returns to
/// A02-email, and doesn't mean the person is under 18 (IMPL §2: "Do not infer an under-18 status
/// from leaving"). The screen makes it inactive while a save runs, and available again after a
/// failure ("Exit unavailable during save/verification/resend"; X-18).
struct LeaveSignInButton: View {
    let leave: @MainActor () async -> Void

    var body: some View {
        Button("auth.age.leave") { Task { await leave() } }
    }
}
