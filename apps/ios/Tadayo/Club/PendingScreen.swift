import SwiftUI
import TadayoDesign

/// G01-pending and G01-pending-approve (handoff 4's frame 2, handoff 8's frame 13), pushed in
/// the setup list's place by Done for now, with the club's own name as the inline title, the
/// system's Back and no tab bar (handoff 4's `pendingScreen`: "Pushed Sunday people title, not the
/// no-club wordmark").
///
/// Its body is Home's for a club that hasn't started (`HomeAwaiting`: "Its body and Drafts row
/// match H3 Home"), 32 under the bar as Home's is under its header, with frame 13's title and line
/// when the creator's own decision on the open revision is pending (`review`; handoff 8's
/// `creatorReviewRequired`, FQ84). Review members is pinned 44 above the safe area's bottom ("its
/// primary button sits at y724 because it has no tab bar"), with Home's labels; it does nothing
/// until the proposed roster's review comes (plan PR 7), as Home's doesn't. Nothing lists or
/// counts who has accepted (book p30, T33).
struct PendingScreen: View {
    let club: String
    let review: Bool
    @AccessibilityFocusState private var focus: TabFocus?

    var body: some View {
        ScrollView {
            HomeAwaiting(club: club, review: review, heading: $focus)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.inset)
                .padding(.bottom, Spacing.l)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background { Palette.canvas.ignoresSafeArea() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                ReviewMembersButton(club: club, review: review)
            }
        }
        .navigationTitle(Text(verbatim: club))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
    }
}
