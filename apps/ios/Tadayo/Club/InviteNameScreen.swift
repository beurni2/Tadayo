import SwiftUI
import TadayoCore
import TadayoDesign

/// G01-invite-name (handoff 2's frame), pushed over the setup list with the inline title "Create
/// an invitation", the system's Back and no tab bar:
/// - "Who is it for?", the club's name and "Make a separate link for each person."
///   (`ClubSetupHeading`);
/// - 47 under the line, as A02-email's field sits under its line (`SetupGap.field`), Person’s
///   name's field (`LabelledField`);
/// - a failure's line 12 under the field, said once as it shows: "Couldn’t create the invitation
///   link for {name}." with the network's or a refusal's line (`createInvitation.createFailure`);
/// - 32 under the field, or the line, Create link and share, in the column as the frame draws it,
///   and "No contacts access needed." 20 under it in `metadata` `secondaryText` (spec 04).
///
/// The field takes the focus on arrival, as the frame draws the keyboard up, unless VoiceOver
/// runs, whose focus is left to the system (A03's rule, `authForm.profileArrivalFocus`). Create
/// link and share waits for a name with something in it besides spaces and no longer than 40
/// characters (FQ70; over 40 there are no words yet, item 67). It proposes the person and makes
/// their link, kept before the share sheet opens (`InviteNameModel`); while it goes, the name is
/// read-only and the button busy. Once the share sheet closes, shared or not, the screen returns
/// to the list, where the person's row now is (`finished`): a cancelled share leaves their link
/// Not shared, and Share link there shares the same link (`createInvitation.retention`).
struct InviteNameScreen: View {
    let model: InviteNameModel
    let finished: @MainActor () -> Void
    /// Whether the field shows focused, for a snapshot: nil in the app.
    var focus: Bool?
    /// Whether VoiceOver runs, for a test, which can't turn it on: nil in the app.
    var voiceOver: Bool?
    @Environment(\.shareLink) private var shareLink
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @FocusState private var focused: Bool
    @State private var sharing = false
    /// The field has had the focus since the screen appeared.
    @State private var tookFocus = false

    var body: some View {
        SetupScroll {
            ClubSetupHeading(
                title: "inviteName.title", club: model.club.name, line: "inviteName.body")
            LabelledField(Text("inviteName.nameLabel"), isFocused: focus ?? focused) {
                ModelText(held: { model.name }, offer: { model.name = $0 }) { text in
                    TextField(String(), text: text)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .onSubmit { Task { await createAndShare() } }
                        .focused($focused)
                }
            }
            .padding(.top, SetupGap.field)
            if let line {
                InlineError(Text(verbatim: line))
                    .padding(.top, Spacing.m)
            }
            Button {
                Task { await createAndShare() }
            } label: {
                Text("inviteName.create")
            }
            .buttonStyle(.tadayoPrimary(isBusy: model.isCreating))
            .disabled(!model.canCreate || sharing)
            .padding(.top, Spacing.xxxl)
            Text("inviteName.noContacts")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xl)
        }
        .scrollDismissesKeyboard(.never)
        .navigationTitle(Text("inviteName.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .onChange(of: focused) { _, now in
            if now { tookFocus = true }
            // The keyboard stays while the link is made (`busyPrimary.field`).
            if !now, model.isCreating { focused = true }
        }
        .task { await takeFocusOnArrival() }
        .announcing(line)
    }

    /// The failure's line, naming the person.
    private var line: String? {
        model.failure.map { $0.words(for: model.failureName) }
    }

    /// Create link and share: the link, then the share sheet, then back to the list.
    private func createAndShare() async {
        guard model.canCreate, !sharing else { return }
        guard let url = await model.createLinkAndShare() else { return }
        sharing = true
        let completed = await shareLink(url)
        await model.shareFinished(completed: completed)
        sharing = false
        finished()
    }

    /// Asks for the field's focus every 50 milliseconds, for 2 seconds at most, until it has it,
    /// as A03 does (`ProfileForm.takeFocusOnArrival`): a request made while the stack is still
    /// pushing the screen can be dropped.
    private func takeFocusOnArrival() async {
        guard focus == nil, !(voiceOver ?? voiceOverEnabled) else { return }
        tookFocus = false
        let deadline = ContinuousClock.now + .seconds(2)
        while !tookFocus, !Task.isCancelled, ContinuousClock.now < deadline {
            if focused {
                focused = false
                try? await Task.sleep(for: .milliseconds(20))
            }
            focused = true
            try? await Task.sleep(for: .milliseconds(50))
        }
    }
}

extension InviteNameModel.Failure {
    /// "Couldn’t create the invitation link for {name}." with "Check your connection and try
    /// again." only when no answer came, else "Try again." (`createInvitation.createFailure`,
    /// handoff 8's rule for network failures).
    func words(for name: String) -> String {
        switch self {
        case .network: InvitationsScreen.words("inviteName.failed.network", name)
        case .other: InvitationsScreen.words("inviteName.failed.refused", name)
        }
    }
}
