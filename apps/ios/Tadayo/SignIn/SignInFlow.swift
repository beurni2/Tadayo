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
/// and goes once; a failure keeps the address (handoff 1).
struct EmailScreen: View {
    @Bindable var model: SignInModel
    let focus: Bool?
    @FocusState private var focused: Bool

    var body: some View {
        SetupScroll {
            SetupHeading(title: "auth.email.title", subtitle: Text("auth.email.subtitle"))
            LabelledField(Text("auth.email.label"), isFocused: focus ?? focused) {
                TextField(String(), text: $model.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .onSubmit { Task { await model.sendCode() } }
                    .focused($focused)
            }
            .padding(.top, SetupGap.field)
            if let failure = model.failure {
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
        .announcing(model.failure?.words)
    }
}

/// A02-code and A02-code-error: one one-time-code field on the number pad, Verify code on six
/// digits and a tap, a fixed row below it that waits a minute and then offers a new code, and
/// Change email address (handoff 1; handoff 2's A02-code-error). Every failure takes the
/// two-line region between the field and Verify code, which is kept even when empty; only a
/// code the server didn't verify marks the field, which keeps its digits and its focus.
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
                isInvalid: model.failure == .codeNotVerified
            ) {
                TextField(
                    text: $model.code,
                    prompt: Text("auth.code.placeholder").foregroundStyle(Palette.secondaryText)
                ) {
                    Text("auth.code.label")
                }
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
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
            resendRow
                .padding(.top, Spacing.m)
            Button("auth.changeEmail") { model.changeEmail() }
                .buttonStyle(.tadayoText)
                .disabled(!model.canChangeEmail)
                .padding(.top, Spacing.xs)
        }
        .navigationTitle(Text("auth.signIn.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(!model.canChangeEmail)
        .onAppear { if focus == nil { focused = true } }
        .task(id: model.resendDue) { await model.waitForResend() }
        // A new code clears the digits; the field takes the focus back (handoff 1).
        .onChange(of: model.resendDue) { _, due in
            if due != nil, focus == nil { focused = true }
        }
        .announcing(model.failure?.words)
        .announcing(
            model.canResend ? String(localized: "auth.code.resend") : nil, politely: true)
    }

    /// FQ68's line, "Sent to ben@example.com".
    private func sentTo(_ address: String) -> String {
        String(format: String(localized: "auth.code.sentTo"), address)
    }

    /// The address with a break allowed after its "@" and each dot (a zero-width space), so at
    /// the largest text it wraps there, not inside a word: "ben@example." over "com", not
    /// "ben@example.co" over "m". VoiceOver reads the address as it is.
    private func breakable(_ address: String) -> String {
        address.replacingOccurrences(of: "@", with: "@\u{200B}")
            .replacingOccurrences(of: ".", with: ".\u{200B}")
    }

    /// Two `metadata` lines reserved under the field, so a failure never moves what's below it
    /// (handoff 1, PDF p20); a longer line at a large text size grows it.
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
        .padding(.bottom, Spacing.m)
    }

    /// One 44-point row: the minute's static sentence, then Send a new code in the same place,
    /// with no ticking label and no disabled link (handoff 1). Sending, it says so, from handoff
    /// 1's PDF p20.
    private var resendRow: some View {
        Group {
            if model.isResending {
                waiting("auth.code.resending")
            } else if model.canResend {
                Button("auth.code.resend") { Task { await model.resend() } }
                    .buttonStyle(.tadayoText)
                    .disabled(model.isVerifying)
            } else {
                waiting("auth.code.resendWait")
            }
        }
        .frame(maxWidth: .infinity, minHeight: Size.touchTarget)
    }

    private func waiting(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .multilineTextAlignment(.center)
    }
}

extension SignInModel.Failure {
    /// The delivered line for each failure (handoff 4's `failureStates` and `auth` keys,
    /// `codeVerificationFailure`), each naming the action that failed (T43).
    var words: String {
        switch self {
        case .sendNetwork: String(localized: "auth.error.sendNetwork")
        case .sendRefused: String(localized: "auth.firstSend.refused")
        case .verifyNetwork: String(localized: "auth.error.verifyNetwork")
        case .codeNotVerified: String(localized: "auth.code.notVerified")
        case .verifyUnavailable: String(localized: "auth.error.verifyUnavailable")
        case .resendNetwork: String(localized: "auth.error.resendNetwork")
        case .resendRefused: String(localized: "auth.resend.refused")
        }
    }
}
