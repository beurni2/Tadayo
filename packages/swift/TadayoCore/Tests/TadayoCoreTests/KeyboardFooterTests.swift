import Testing

@testable import TadayoCore

/// Where A02-code's Verify code goes while the keyboard is up (`KeyboardFooter.pinsAction`; the
/// plan's TL-09): in the column wherever the column, scrolled to its top, leaves it 12 points or
/// more clear of the keyboard, and pinned 12 above the keyboard only where it would otherwise sit
/// under it or nearer than that (handoff 7's frame 19 and `authForm.keyboardFooter`; the check's
/// V-02 and X-04; `docs/plans/ios-b0-adopt-handoff-7/signin.md` F1), and never while VoiceOver
/// runs (FQ97's default). The numbers are the
/// default size's and the largest's on a 393 by 852 point screen; the gap is the screen's
/// `Spacing.m`, handoff 7's "12-point clear gap".
@Suite struct KeyboardFooterTests {
    /// Whether an action that would end `bottom` points down the column is pinned, with
    /// `visibleHeight` points of screen above the keyboard and a 12-point gap.
    private func pins(
        _ bottom: Double, above visibleHeight: Double, keyboard: Bool = true,
        voiceOver: Bool = false
    ) -> Bool {
        KeyboardFooter.pinsAction(
            bottom: bottom, visibleHeight: visibleHeight, keyboardShows: keyboard,
            voiceOverRuns: voiceOver, gap: 12)
    }

    /// The default size: Verify code ends 330 points down the column, which has 366 above a
    /// keyboard: in the column, as frames 4 to 8, 24 and 25 draw it.
    @Test func anActionWellClearOfTheKeyboardStaysInTheColumn() {
        #expect(!pins(330, above: 366))
    }

    /// The largest size: Verify code would end 700 points down, far under the keyboard, so it is
    /// pinned (frame 19).
    @Test func anActionUnderTheKeyboardIsPinned() {
        #expect(pins(700, above: 366))
    }

    /// Where the column would leave it nearer the keyboard than the pinned gap, it is pinned, so
    /// it is never less than 12 clear; exactly 12 clear, it stays.
    @Test func anActionLessThanTheGapClearIsPinned() {
        #expect(pins(355, above: 366))
        #expect(!pins(354, above: 366))
    }

    /// With no keyboard nothing is pinned, however long the column: the action scrolls into view
    /// like the rest (the critic's ruling: only where it would sit under the keyboard).
    @Test func withNoKeyboardNothingIsPinned() {
        #expect(!pins(1_400, above: 702, keyboard: false))
    }

    /// While VoiceOver runs nothing is pinned, even under the keyboard: VoiceOver reads a pinned
    /// footer last, after the resend row Verify code comes before (`codeAccessibilityOrder`), and
    /// scrolls an action in the column into view as it reaches it (FQ97's default).
    @Test func whileVoiceOverRunsNothingIsPinned() {
        #expect(!pins(700, above: 366, voiceOver: true))
        #expect(!pins(355, above: 366, voiceOver: true))
    }

    /// Until the screen has measured itself, nothing is pinned.
    @Test func beforeAnythingIsMeasuredNothingIsPinned() {
        #expect(!pins(0, above: 0))
        #expect(!pins(700, above: 0))
    }
}
