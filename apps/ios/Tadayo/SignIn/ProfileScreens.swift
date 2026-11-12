import SwiftUI
import TadayoCore
import TadayoDesign

/// A02-age (handoff 7's frames 26 and 9): one confirmation, I’m 18 or older, with no birthdate,
/// checkbox or second screen (FQ13), pinned 44 points above the safe area, and Leave sign-in in
/// the bar's leading place, where no back chevron is, so going back can't skip the step. Leave
/// sign-in ends this sign-in, doesn't mean the person is under 18, and returns to A02-email, since
/// Welcome (A01) comes in B1; it is inactive while the confirmation is saved. A failure is A02-age's
/// own line, 16 points above the button (`handoff7.spacing.errorToActionMinimum`).
struct AgeScreen: View {
    let model: ProfileModel
    let leave: @MainActor () async -> Void

    var body: some View {
        NavigationStack {
            SetupScroll {
                SetupHeading(
                    title: "auth.age.title", subtitle: Text("auth.age.body"),
                    subtitleGap: Spacing.xxl)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom, spacing: Spacing.l) {
                    if let failure = model.failure {
                        InlineError(Text(verbatim: failure.ageWords))
                    }
                    Button {
                        Task { await model.confirmAge() }
                    } label: {
                        Text("auth.age.confirm")
                    }
                    .buttonStyle(.tadayoPrimary(isBusy: model.isSaving))
                    .disabled(model.isSaving)
                }
            }
            .navigationTitle(Text("auth.signIn.navTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    LeaveSignInButton(leave: leave)
                        .disabled(model.isSaving)
                }
            }
            .announcing(model.failure?.ageWords)
            // "Saving your age confirmation.", once, as the request begins; the button says
            // "In progress" itself.
            .onChange(of: model.isSaving) { was, now in
                if let words = SignInAnnouncement.savingAge(from: was, to: now) {
                    Announcement.post(words)
                }
            }
        }
        .tint(Palette.action)
    }
}

/// A03-profile (handoff 1's frame 5): a name, required, and a photo, optional, with the 68-point
/// avatar showing the name's initial as it's typed. Add photo is drawn and does nothing in B0
/// (FQ85; the picker is B3's). Continue waits for a name with something in it besides spaces and
/// no longer than 40 characters (FQ70). There's no back once the age is recorded.
struct ProfileScreen: View {
    @Bindable var model: ProfileModel
    /// As `SignInFlow.focus`. The field isn't focused on arrival: the frame shows no keyboard.
    var focus: Bool?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            SetupScroll {
                SetupHeading(title: "auth.profile.title", subtitle: Text("auth.profile.subtitle"))
                VStack(spacing: 0) {
                    Avatar(name: model.name, size: .profile)
                    Button("auth.profile.addPhoto") {}
                        .buttonStyle(.tadayoText)
                        .padding(.top, Spacing.s)
                    Text("auth.profile.optional")
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, Spacing.xxxl)
                LabelledField(Text("auth.profile.nameLabel"), isFocused: focus ?? focused) {
                    TextField(String(), text: $model.name)
                        .textContentType(.givenName)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit { Task { await model.saveName() } }
                        .focused($focused)
                }
                .padding(.top, Spacing.xxl)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                    if let failure = model.failure {
                        InlineError(Text(verbatim: failure.words))
                    }
                    Button {
                        Task { await model.saveName() }
                    } label: {
                        Text("auth.profile.continue")
                    }
                    .buttonStyle(.tadayoPrimary(isBusy: model.isSaving))
                    .disabled(!model.canContinue)
                }
            }
            .navigationTitle(Text("auth.profile.navTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .announcing(model.failure?.words)
        }
        .tint(Palette.action)
    }
}

extension ProfileModel.Failure {
    /// A03-profile's lines: "Check your connection" only when no answer came (handoff 4's
    /// `auth.profile`).
    var words: String {
        switch self {
        case .network: String(localized: "auth.profile.networkFailure")
        case .other: String(localized: "auth.profile.saveFailed")
        }
    }

    /// A02-age's own lines, which name the age confirmation (handoff 7's `auth.age.network` and
    /// `auth.age.refused`); `ProfileModel` is shared with A03, which keeps the profile's.
    var ageWords: String {
        switch self {
        case .network: String(localized: "auth.age.network")
        case .other: String(localized: "auth.age.refused")
        }
    }
}
