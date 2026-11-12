import Foundation

/// What VoiceOver says as a sign-in request begins, without moving its focus (handoff 7's
/// `announcementPolicy.busy`: "Announce the action once, keep focus; button label stable, value
/// vo.busy.value. Do not repeat on renders."). A hosted test can't hear VoiceOver, so the choice
/// is made here, as `TabsView.announcement` makes the tabs', and the screen says what it returns.
enum SignInAnnouncement {
    /// "Sending a code.", once, as Send a code's request begins (`isSending` turns true), and
    /// nothing when it ends, goes on, or the screen redraws. It is said at the default priority:
    /// it acknowledges the person's own tap, as a failure's words are said; handoff 7 gives no
    /// priority (`docs/design/handoff-7/ios-lane-needs.md`, item 57).
    static func sending(from was: Bool, to now: Bool) -> String? {
        guard !was, now else { return nil }
        return String(localized: "auth.email.busy.vo")
    }
}
