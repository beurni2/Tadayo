/// Where a form's primary action goes while the keyboard is up (handoff 7's
/// `authForm.keyboardFooter`: "Continue and Verify code pinned above keyboard with 12-point clear
/// gap. Form body is one vertical scroll view; controls are never overlaid on form text.").
///
/// Handoff 7's frames at the usual size draw Verify code in the column, well clear of the
/// keyboard, and frame 19, the largest size, pins it 12 above the keyboard; the check's ruling
/// (V-02, X-04) is to pin it only where it would otherwise sit under the keyboard
/// (`docs/plans/ios-b0-adopt-handoff-7/signin.md` F1). A03's Continue, always pinned, is
/// `ios/b0-adopt-profile`'s.
public enum KeyboardFooter {
    /// Whether the action is pinned `gap` points above the keyboard, rather than left in the
    /// column: only while the keyboard shows, and only where the action, in the column scrolled
    /// to its top, would end less than `gap` above the keyboard. `bottom` is how far down the
    /// column it would end, measured from the column's top as if it weren't pinned, and
    /// `visibleHeight` the height of the column's view above the keyboard, the pinned footer's
    /// room included: neither changes as the action is pinned, so the choice can't undo itself
    /// as the column shortens. Nothing is pinned before the screen has measured itself.
    ///
    /// Nor while VoiceOver runs (FQ97's default): it reads a pinned footer after everything in
    /// the column, where handoff 7's `codeAccessibilityOrder` reads Verify code before the resend
    /// row, and it scrolls an action in the column into view above the keyboard as it reaches it.
    public static func pinsAction(
        bottom: Double, visibleHeight: Double, keyboardShows: Bool, voiceOverRuns: Bool,
        gap: Double
    ) -> Bool {
        guard keyboardShows, !voiceOverRuns, bottom > 0, visibleHeight > 0 else { return false }
        return bottom + gap > visibleHeight
    }
}
