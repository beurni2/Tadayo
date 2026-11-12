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
    /// A code sent from the keyboard's return key is on its way.
    @State private var sendingFromReturn = false

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
                            sendingFromReturn = true
                            Task {
                                await model.sendCode()
                                sendingFromReturn = false
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
        // focus and no keyboard while it goes. The focus is put back, so the field keeps it as it
        // does when Send a code is tapped (handoff 7's `busyPrimary.field`: "keep first responder
        // and keyboard if already shown"). Whether the keyboard dips on the way is a device check:
        // focus set again on Return makes it go down and come back up (Apple's developer forums,
        // thread 770226).
        .onChange(of: focused) { _, now in
            if !now, sendingFromReturn { focused = true }
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
/// beside a code's line, never in its place (handoff 7's `authForm.resendFailure`).
struct CodeScreen: View {
    @Bindable var model: SignInModel
    let focus: Bool?
    @FocusState private var focused: Bool

    var body: some View {
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
            .padding(.top, SetupGap.field)
            errorRegion
            Button {
                Task { await model.verify() }
            } label: {
                Text("auth.code.verify")
            }
            .buttonStyle(.tadayoPrimary(isBusy: model.isVerifying))
            .disabled(!model.canVerify)
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
            if focus == nil { focused = true }
            Announcement.post(words)
        }
        .announcing(model.failure?.words)
        .announcing(model.resendFailure?.words)
        .announcing(SignInAnnouncement.resendAvailable(model.canResend), politely: true)
        // "Verifying code." and "Sending a new code…", once each, as the request begins; the
        // button and the row say the rest themselves.
        .onChange(of: model.isVerifying) { was, now in
            if let words = SignInAnnouncement.verifying(from: was, to: now) {
                Announcement.post(words)
            }
        }
        .onChange(of: model.isResending) { was, now in
            if let words = SignInAnnouncement.resending(from: was, to: now) {
                Announcement.post(words)
            }
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
    /// below it (`handoff7.spacing.fieldErrorGap` and `errorToActionMinimum`): 64 points in all
    /// where handoff 7's frames draw 60, the written values winning (V-03).
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
    /// says nothing to VoiceOver, so the words are read once.
    private var resendRow: some View {
        Group {
            if model.isResending {
                HStack(spacing: Spacing.s) {
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
