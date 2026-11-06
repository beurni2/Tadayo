import SwiftUI
import TadayoCore
import TadayoDesign

/// A02-age (handoff 1's frame 4): one confirmation, I’m 18 or older, with no birthdate, checkbox
/// or second screen (FQ13), and Leave sign-in, which ends this sign-in and doesn't mean the person
/// is under 18. The frame's back chevron leaves sign-in too, so going back can't skip the step;
/// it returns to A02-email, since Welcome (A01) comes in B1.
struct AgeScreen: View {
    let model: ProfileModel
    let leave: @MainActor () async -> Void

    var body: some View {
        NavigationStack {
            SetupScroll {
                SetupHeading(
                    title: "auth.age.title", subtitle: Text("auth.age.body"),
                    subtitleGap: Spacing.xxxl)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SetupFooter(bottom: Spacing.s) {
                    if let failure = model.failure {
                        InlineError(Text(verbatim: failure.words))
                    }
                    Button {
                        Task { await model.confirmAge() }
                    } label: {
                        Text("auth.age.confirm")
                    }
                    .buttonStyle(.tadayoPrimary(isBusy: model.isSaving))
                    .disabled(model.isSaving)
                    Button("auth.age.leave") { Task { await leave() } }
                        .buttonStyle(.tadayoText)
                }
            }
            .navigationTitle(Text("auth.signIn.navTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await leave() }
                    } label: {
                        Image(systemName: "chevron.backward")
                    }
                    .modifier(SystemBackColour())
                    .accessibilityLabel(Text("auth.age.leave"))
                }
            }
            .announcing(model.failure?.words)
        }
        .tint(Palette.action)
    }
}

/// The colour of the system's own back button, for the chevron that stands in for it: the tint
/// before iOS 26, the label's colour on iOS 26's glass (T45), as A02-code's back button is.
private struct SystemBackColour: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.tint(.primary)
        } else {
            content
        }
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
                SetupFooter(bottom: SetupGap.profileFooter) {
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
    /// "Check your connection" only when no answer came (handoff 4's `auth.profile`). A02-age has
    /// no line of its own yet: it uses the profile's until handoff 7 gives one.
    var words: String {
        switch self {
        case .network: String(localized: "auth.profile.networkFailure")
        case .other: String(localized: "auth.profile.saveFailed")
        }
    }
}
