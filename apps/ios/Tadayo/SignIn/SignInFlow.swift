import SwiftUI
import TadayoCore
import TadayoDesign

/// A02-email, then A02-code pushed on it (handoff 1's frames 1 and 2, as handoff 2 corrected
/// them), in one navigation stack: the system's back button on A02-code is Change email address,
/// and it hides while a code is being verified or sent, as that row is unavailable then. A02-email
/// has no back in B0: Welcome (A01) comes in B1.
struct SignInFlow: View {
    @Bindable var model: SignInModel
    /// Draws the field focused, or not, whatever has focus: snapshots show focus with no
    /// keyboard. Nil in the app, where each screen focuses its field when it appears.
    var focus: Bool?

    private enum Page: Hashable {
        case code
    }

    var body: some View {
        NavigationStack(path: path) {
            EmailScreen(model: model, focus: focus)
                .navigationDestination(for: Page.self) { _ in
                    CodeScreen(model: model, focus: focus)
                }
        }
        .tint(Palette.action)
    }

    private var path: Binding<[Page]> {
        Binding(
            get: { model.step == .code ? [.code] : [] },
            set: { pages in
                if pages.isEmpty, model.step == .code { model.changeEmail() }
            })
    }
}

/// A02-email: one email field and Send a code, which is available only for a plausible address
/// and goes once; a failure keeps the address (handoff 1). After a sign-in the server ended, a
/// notice under the subtitle says so until a code is sent (handoff 7's `auth.email.signedOut`).
struct EmailScreen: View {
    @Bindable var model: SignInModel
    let focus: Bool?
    @FocusState private var focused: Bool
    /// Codes sent from the keyboard's return key that are on their way, or just ended
    /// (`onSubmit`).
    @State private var returnSends = 0

    var body: some View {
        SetupScroll {
            SetupHeading(title: "auth.email.title", subtitle: Text("auth.email.subtitle"))
            // A neutral body line, not an invalid-address failure (IMPL §4): no icon, no border,
            // no field hint. With no frame, it takes the subtitle's role, ink and gap above it,
            // and the field keeps its gap below (built from spec, W-10).
            if let notice {
                Text(verbatim: notice)
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.l)
            }
            LabelledField(Text("auth.email.label"), isFocused: focus ?? focused) {
                // The placeholder repeats the label's words (handoff 7's frame 1, `auth.email.
                // placeholder`), in `secondaryText`, drawn over a field that has none of its own
                // (an empty title) and hidden from VoiceOver: the field carries the label and says
                // it once (W-08), its value being the address and nothing. A prompt would be read
                // as an empty field's value, and so would a title or a label view, which a
                // `TextField` also draws as its placeholder; no accessibility value takes its
                // place, an empty one being ignored (`ios` runs 43091597765 and 43094144185). The
                // address is read-only while a code is on its way, so what is typed is offered to
                // the model, which declines it, and the field shows what the model kept.
                ModelText(held: { model.email }, offer: { model.email = $0 }) { text in
                    TextField(String(), text: text)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .onSubmit {
                            // Only a Return that starts a send or comes during one, counted,
                            // so no Return ends another's cover. The count is held a moment
                            // past the send's end, or past a Return made during a send (which
                            // `sendCode()` ignores): a send can end before the field's lost
                            // focus reaches `onChange(of: focused)`, as A03's save that failed
                            // at once did (`ProfileForm`; not seen on this screen, whose
                            // stand-ins have no failing send).
                            guard model.canSend || model.isSending else { return }
                            returnSends += 1
                            Task {
                                await model.sendCode()
                                try? await Task.sleep(for: .milliseconds(100))
                                returnSends -= 1
                            }
                        }
                        .focused($focused)
                        .overlay(alignment: .leading) {
                            if model.email.isEmpty {
                                Text("auth.email.label")
                                    .foregroundStyle(Palette.secondaryText)
                                    .lineLimit(1)
                                    .allowsHitTesting(false)
                                    .accessibilityHidden(true)
                            }
                        }
                }
            }
            .padding(.top, SetupGap.field)
            if let failure {
                InlineError(Text(verbatim: failure.words))
                    .padding(.top, Spacing.m)
            }
            Button {
                Task { await model.sendCode() }
            } label: {
                Text("auth.email.send")
            }
            .buttonStyle(.tadayoPrimary(isBusy: model.isSending))
            .disabled(!model.canSend)
            .padding(.top, Spacing.xxl)
            Text("auth.email.helper")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .padding(.top, Spacing.xl)
        }
        .navigationTitle(Text("auth.signIn.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if focus == nil { focused = true } }
        // Return ends a field's editing, so a code sent from it would leave the address with no
        // focus and no keyboard while it goes. The focus is put back while a code is on its way,
        // whether Return or Send a code started it, so the field keeps it as it does when Send a
        // code is tapped (handoff 7's `busyPrimary.field`: "keep first responder and keyboard if
        // already shown"). `returnSends` covers the moments between Return and the send's start,
        // and 100 milliseconds past the send's end, or past a Return made during a send; once a
        // code is sent the focus is A02-code's, so nothing is put back then. Whether the keyboard
        // dips on the way is a device check: focus set again on Return makes it go down and come
        // back up (Apple's developer forums, thread 770226).
        .onChange(of: focused) { _, now in
            if !now, model.step == .email, returnSends > 0 || model.isSending { focused = true }
        }
        .announcing(failure?.words)
        // Said politely, so VoiceOver first says what it says of the screen that just appeared.
        .announcing(notice, politely: true, initial: true)
        // "Sending a code.", once, as the request begins; the button says "In progress" itself.
        .onChange(of: model.isSending) { was, now in
            if let words = SignInAnnouncement.sending(from: was, to: now) {
                Announcement.post(words)
            }
        }
    }

    private var notice: String? {
        SignInAnnouncement.signedOutNotice(signInEnded: model.signInEnded)
    }

    /// This screen's own failures, sending the first code (handoff 4's `failureStates`). It stays
    /// under A02-code, which shows and says its own, so they aren't shown here or said twice.
    private var failure: SignInModel.Failure? {
        switch model.failure {
        case .sendNetwork, .sendRefused: model.failure
        case .verifyNetwork, .codeNotVerified, .verifyUnavailable, nil: nil
        }
    }
}

/// A02-code and A02-code-error: one one-time-code field on the number pad, Verify code on six
/// digits and a tap, a fixed row below it that waits a minute and then offers a new code, and
/// Change email address (handoff 1; handoff 2's A02-code-error; handoff 7's frames 4 to 8, 18,
/// 19, 24 and 25). A code's failure takes the two-line region between the field and Verify code,
/// which is kept even when empty; only a code the server didn't verify marks the field, which
/// keeps its digits and its focus. A new code's failure has a block of its own under the row,
/// beside a code's line, never in its place (handoff 7's `authForm.resendFailure`). With the
/// keyboard up, Verify code stays in the column unless the column, scrolled to its top, would
/// leave it under the keyboard or nearer than 12 points; then it is pinned 12 above the keyboard,
/// as frame 19 draws it at the largest size (`KeyboardFooter`; `authForm.keyboardFooter`). While
/// VoiceOver runs it stays in the column, where it is read in its place, before the resend row
/// (`codeAccessibilityOrder`), and VoiceOver is expected to scroll it into view as it reaches it:
/// VoiceOver reads a pinned footer after the whole column (FQ97's default). Switch Control and
/// Full Keyboard Access still get it pinned, so they reach it last too, but on screen, without
/// scrolling (FQ97 says so).
struct CodeScreen: View {
    @Bindable var model: SignInModel
    let focus: Bool?
    /// Whether a keyboard shows, for a test, which has none: nil in the app, where the screen
    /// reads it from its own frame (`readingKeyboardRoom`).
    var keyboard: Bool?
    /// Whether VoiceOver runs, for a test, which can't turn it on: nil in the app, where the
    /// environment says.
    var voiceOver: Bool?
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @FocusState private var focused: Bool
    /// Whether this minute's "Send a new code is available." has been said.
    @State private var availability = SignInAnnouncement.ResendAvailability()
    /// The screen's room above the keyboard, the foot of the error region in the column as
    /// measured and as held at its tallest while a code is checked with the keyboard up
    /// (`KeyboardFooter.heldFoot`), and Verify code's height: where Verify code would end in the
    /// column, and whether it fits.
    @State private var room = KeyboardRoom()
    @State private var regionFoot: CGFloat = 0
    @State private var heldFoot: CGFloat = 0
    @State private var verifyHeight: CGFloat = 0
    /// The labelled field's identity, to scroll to.
    private static let field = "code.field"

    var body: some View {
        ScrollViewReader { scroll in
            column
                // Verify code pinned 12 above the keyboard, with no motion as it goes there (T48).
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if pinsVerify {
                        SetupFooter(bottom: Spacing.m) { verify }
                    }
                }
                .transaction(value: pinsVerify) { $0.animation = nil }
                .readingKeyboardRoom($room)
                // Once Verify code is pinned, the field, its label first, is scrolled to the top
                // of the screen, so the pinned button covers none of it: the keyboard's own
                // scrolling keeps the field clear of the keyboard, not of the button over it,
                // and `ios` run 43181241212 drew the button over the field's last 12 points.
                // Frame 19 is scrolled so, the field under the navigation bar and the error
                // continuing behind the button.
                .onChange(of: pinsVerify) { _, pinned in
                    if pinned { scroll.scrollTo(Self.field, anchor: .top) }
                }
                // Each time the keyboard comes up or goes, the held foot starts from the region
                // as it is.
                .onChange(of: keyboardShows) { heldFoot = regionFoot }
        }
        .navigationTitle(Text("auth.signIn.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(!model.canChangeEmail)
        .onAppear { if focus == nil { focused = true } }
        .task(id: model.resendDue) { await model.waitForResend() }
        // A new code clears the digits: the field takes the focus back (handoff 1; handoff 7's
        // `authForm.resendSuccess`), and VoiceOver says where it went and that the minute began
        // again (`vo.resend.success`).
        .onChange(of: model.resendDue) { _, due in
            guard let words = SignInAnnouncement.newCode(to: model.address, due: due) else {
                return
            }
            availability.newMinute()
            if focus == nil { focused = true }
            Announcement.post(words)
        }
        .announcing(model.failure?.words)
        .announcing(model.resendFailure?.words)
        // "Send a new code is available.", once a minute, once Send a new code is offered and no
        // check keeps it inactive: `SignInAnnouncement.ResendAvailability` decides from the
        // model's two values whenever either changes.
        .onChange(of: model.canResend) { sayANewCodeIsAvailable() }
        // "Verifying code." and "Sending a new code…", once each, as the request begins; the
        // button and the row say the rest themselves.
        .onChange(of: model.isVerifying) { was, now in
            if let words = SignInAnnouncement.verifying(from: was, to: now) {
                Announcement.post(words)
            }
            sayANewCodeIsAvailable()
        }
        .onChange(of: model.isResending) { was, now in
            if let words = SignInAnnouncement.resending(from: was, to: now) {
                Announcement.post(words)
            }
        }
    }

    /// The column: the heading, the field, the error region, Verify code where it isn't pinned,
    /// the resend row, a new code's failure and Change email address.
    private var column: some View {
        SetupScroll {
            SetupHeading(
                title: "auth.code.title",
                subtitle: Text(verbatim: sentTo(breakable(model.address)))
                    .accessibilityLabel(Text(verbatim: sentTo(model.address))))
            LabelledField(
                Text("auth.code.label"), isFocused: focus ?? focused,
                isInvalid: model.failure == .codeNotVerified,
                error: model.failure.map { Text(verbatim: $0.words) }
            ) {
                // The code is read-only while it is checked or a new code is on its way, and the
                // model keeps six digits at most: `ModelText` shows what it kept.
                ModelText(held: { model.code }, offer: { model.code = $0 }) { text in
                    TextField(
                        text: text,
                        prompt: Text("auth.code.placeholder")
                            .foregroundStyle(Palette.secondaryText)
                    ) {
                        Text("auth.code.label")
                    }
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                }
            }
            .id(Self.field)
            .padding(.top, SetupGap.field)
            errorRegion
                .background {
                    GeometryReader { region in
                        Color.clear.onChange(
                            of: region.frame(in: .named(SetupColumn.space)).maxY, initial: true
                        ) { _, foot in
                            regionFoot = foot
                            // The code's line clears as its check begins, in the same update,
                            // so the foot it leaves is measured while the check runs.
                            heldFoot = KeyboardFooter.heldFoot(
                                heldFoot, now: foot, holding: keyboardShows && model.isVerifying)
                        }
                    }
                }
            if !pinsVerify {
                verify
            }
            // 8 under Verify code, as frames 6 to 8 and 24 draw it.
            resendRow
                .padding(.top, Spacing.s)
            // A new code's failure, 8 under the row and 8 above Change email address (frame 8;
            // `resendToFailure`); with none, Change email address is right under the row, as
            // frames 6 and 24 draw it.
            if let resendFailure = model.resendFailure {
                InlineError(Text(verbatim: resendFailure.words))
                    .padding(.vertical, Spacing.s)
            }
            Button("auth.changeEmail") { model.changeEmail() }
                .buttonStyle(.tadayoText)
                .disabled(!model.canChangeEmail)
        }
        // Scrolling keeps the keyboard up, so the rest of the error, the resend row and Change
        // email address are reached with the field focused and Verify code still pinned (handoff
        // 7's `authForm.AX5`: "Scroll to access them without dismissing keyboard"), where Apple's
        // documentation has a scroll view dismiss it on a scroll by default, from iOS 16.
        .scrollDismissesKeyboard(.never)
    }

    /// Verify code, busy while the code is checked; its height is measured wherever it is, the
    /// same in the column and pinned, since both are 20 in from each edge.
    private var verify: some View {
        Button {
            Task { await model.verify() }
        } label: {
            Text("auth.code.verify")
        }
        .buttonStyle(.tadayoPrimary(isBusy: model.isVerifying))
        .disabled(!model.canVerify)
        .background {
            GeometryReader { button in
                Color.clear.onChange(of: button.size.height, initial: true) { _, height in
                    verifyHeight = height
                }
            }
        }
    }

    /// Whether Verify code is pinned above the keyboard: where it would end in the column, the
    /// column scrolled to its top, against the screen's height above the keyboard, and never
    /// while VoiceOver runs (`KeyboardFooter.pinsAction`; the error region is above it, so its
    /// foot doesn't move as Verify code is pinned, and the screen's height counts the footer's
    /// room). The region's foot is held at its tallest while a code is checked with the keyboard
    /// up, so a pinned, busy Verify code stays pinned as the check clears the code's line, until
    /// the check ends and the next line shows; otherwise it follows what is measured, so nothing
    /// measured as the screen settles, or before a smaller text size, keeps a pin.
    private var pinsVerify: Bool {
        KeyboardFooter.pinsAction(
            bottom: Double(heldFoot + verifyHeight), visibleHeight: Double(room.height),
            keyboardShows: keyboardShows, voiceOverRuns: voiceOver ?? voiceOverEnabled,
            gap: Double(Spacing.m))
    }

    /// Whether a keyboard, or a hardware keyboard's bar, shows.
    private var keyboardShows: Bool {
        keyboard ?? (room.keyboard > 0)
    }

    /// "Send a new code is available.", politely, when `ResendAvailability` says so.
    private func sayANewCodeIsAvailable() {
        if let words = availability.words(
            canResend: model.canResend, isVerifying: model.isVerifying)
        {
            Announcement.post(words, politely: true)
        }
    }

    /// FQ68's line, "Sent to ben@example.com".
    private func sentTo(_ address: String) -> String {
        String(format: String(localized: "auth.code.sentTo"), address)
    }

    /// The address with a break allowed after its "@" and each dot (a zero-width space), so at
    /// the largest text it wraps there, not inside a word: "Sent to ben@" over "example.com",
    /// not "ben@example.co" over "m". VoiceOver reads the address as it is.
    private func breakable(_ address: String) -> String {
        address.replacingOccurrences(of: "@", with: "@\u{200B}")
            .replacingOccurrences(of: ".", with: ".\u{200B}")
    }

    /// Two `metadata` lines reserved under the field, so a failure never moves what's below it
    /// (handoff 1, PDF p20); a longer line at a large text size grows it. 12 above it and 16
    /// below it (`handoff7.spacing.fieldErrorGap` and `errorToActionMinimum`): 62 points in all,
    /// the two lines 34 as `TypeRole` sets them, where handoff 7's frames draw 8 + 36 + 16 = 60,
    /// the written values winning (V-03).
    private var errorRegion: some View {
        ZStack(alignment: .topLeading) {
            Text(verbatim: " \n ")
                .textRole(.metadata)
                .hidden()
                .accessibilityHidden(true)
            if let failure = model.failure {
                InlineError(Text(verbatim: failure.words))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Spacing.m)
        .padding(.bottom, Spacing.l)
    }

    /// One row at least 44 points high, at the leading edge (handoff 7's frames 4 to 8): the
    /// minute's static sentence in `metadata`, then Send a new code in the same place, with no
    /// ticking label and no disabled link (handoff 1; `authForm.resendStaticWait`). While a new
    /// code is on its way, the system's indicator, 16 points at every text size, 8 before
    /// "Sending a new code…" in `textAction`, both in `secondaryText` (frame 7); the indicator
    /// says nothing to VoiceOver, so the words are read once. Where the words wrap, at the
    /// largest sizes, the indicator stays level with their first line, as a mark beside wrapped
    /// words does elsewhere (`InlineError`'s icon, the drop card's rows); no frame draws the row
    /// there.
    private var resendRow: some View {
        Group {
            if model.isResending {
                HStack(alignment: .firstLineCenter, spacing: Spacing.s) {
                    BusyIndicator(tint: Palette.secondaryText)
                        .frame(width: Size.busyIndicator, height: Size.busyIndicator)
                        .accessibilityHidden(true)
                    Text("auth.code.resending")
                        .textRole(.textAction)
                        .foregroundStyle(Palette.secondaryText)
                }
            } else if model.canResend {
                Button("auth.code.resend") { Task { await model.resend() } }
                    .buttonStyle(.tadayoText)
                    .disabled(model.isVerifying)
            } else {
                Text("auth.code.resendWait")
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
            }
        }
        .frame(maxWidth: .infinity, minHeight: Size.touchTarget, alignment: .leading)
    }
}

extension SignInModel.Failure {
    /// The delivered line for each failure (handoff 4's `failureStates` and `auth` keys,
    /// `codeVerificationFailure`; FQ86), each naming the action that failed (T43).
    var words: String {
        switch self {
        case .sendNetwork: String(localized: "auth.error.sendNetwork")
        case .sendRefused: String(localized: "auth.firstSend.refused")
        case .verifyNetwork: String(localized: "auth.error.verifyNetwork")
        case .codeNotVerified: String(localized: "auth.code.notVerified")
        case .verifyUnavailable: String(localized: "auth.error.verifyUnavailable")
        }
    }
}

extension SignInModel.ResendFailure {
    /// The delivered line for each (handoff 4's `failureStates` and `auth.resend.refused`; handoff
    /// 7's `auth.code.resendNetwork` and `auth.code.resendRefused` have the same words).
    var words: String {
        switch self {
        case .network: String(localized: "auth.error.resendNetwork")
        case .refused: String(localized: "auth.resend.refused")
        }
    }
}
