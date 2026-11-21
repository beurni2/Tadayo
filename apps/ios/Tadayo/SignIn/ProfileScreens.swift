import SwiftUI
import TadayoCore
import TadayoDesign

/// A02-age (handoff 7's frames 26 and 9): one confirmation, I’m 18 or older, with no birthdate,
/// checkbox or second screen (FQ13), pinned 44 points above the safe area, and Leave sign-in in
/// the bar's leading place, where no back chevron is, so going back can't skip the step. Leave
/// sign-in ends this sign-in, doesn't mean the person is under 18, and returns to A02-email, since
/// Welcome (A01) comes in B1; it is inactive while the confirmation is saved. A failure is A02-age's
/// own line, 24 points above the button's frame, as A02-email's is: its ink ends about 25 points
/// above it, as frame 9's does, and its line box at least 16
/// (`handoff7.spacing.errorToActionMinimum`, a minimum measured between line boxes, which a text's
/// frame sits inside).
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
                SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom, spacing: Spacing.xxl) {
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

/// A03-profile (handoff 7's frames 10, 11, 20 and 27, redrawing handoff 1's frame 5): a name,
/// required, and a photo, optional, with the 68-point avatar showing the name's initial as it's
/// typed, or the person symbol until a name gives one (`Avatar`). Add photo is drawn and does
/// nothing in B0 (FQ85; the picker is B3's). Continue waits for a name with something in it
/// besides spaces and no longer than 40 characters (FQ70). There's no back once the age is
/// recorded: Leave sign-in, in the bar's leading place as on A02-age (`LeaveSignInButton`;
/// `ageExit`: "Same on A03."), ends this sign-in and returns to A02-email, the age staying
/// recorded on the server.
struct ProfileScreen: View {
    let model: ProfileModel
    let leave: @MainActor () async -> Void
    /// As `SignInFlow.focus`. Nil in the app, where the field is focused on arrival unless
    /// VoiceOver runs (`ProfileForm`).
    var focus: Bool?
    /// Whether VoiceOver runs, for a test, which can't turn it on: nil in the app, as
    /// `CodeScreen.voiceOver`.
    var voiceOver: Bool?

    var body: some View {
        NavigationStack {
            ProfileForm(model: model, leave: leave, focus: focus, voiceOver: voiceOver)
        }
        .tint(Palette.action)
    }
}

/// A03-profile's content inside its navigation stack, apart from `ProfileScreen` so a hosted test
/// can put a stand-in keyboard inside the stack, where the screen meets it (a safe area inset
/// outside a navigation stack doesn't reach the screen in it: `ios` run 43192475721).
///
/// The column scrolls, title, helper, avatar, Add photo and Optional, the name's label and field,
/// then the name's one line, if any, 12 under the field (`handoff7.spacing.fieldErrorGap`), with
/// no invalid border: a save's failure, or, while the name is longer than 40 characters, "Use 40
/// characters or fewer for your name." in its place (`auth.profile.tooLong`; X-19), the name kept
/// as typed and never cut. Continue is pinned under the column, 12 above the keyboard
/// (`authForm.keyboardFooter`: "Continue and Verify code pinned above keyboard with 12-point
/// clear gap"), or, with none, 44 above the safe area's bottom (`formFooterToSafeAreaBottom`).
/// As the keyboard comes up, and as a line shows, the column is scrolled so the field, and its
/// line, stay in view above Continue, and the keyboard stays up (IMPLEMENTATION.md: "The body
/// scrolls to keep the field and error reachable above Continue; it does not dismiss the
/// keyboard"); scrolling the column doesn't dismiss it either.
///
/// While the name is saved it is read-only, not disabled, so it keeps its focus and its keyboard;
/// Add photo and Leave sign-in are inactive; Continue is busy and says "In progress"; and
/// VoiceOver says "Saving your profile." once (`busyPrimary`). A failure keeps the name and the
/// focus.
struct ProfileForm: View {
    let model: ProfileModel
    let leave: @MainActor () async -> Void
    let focus: Bool?
    /// Whether a keyboard shows, for a test, which has none: nil in the app, where the screen
    /// reads it from its own frame (`readingKeyboardRoom`).
    var keyboard: Bool?
    /// As `ProfileScreen.voiceOver`.
    var voiceOver: Bool?
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @FocusState private var focused: Bool
    /// Saves made from the keyboard's return key that are on their way, or just ended
    /// (`onSubmit`).
    @State private var returnSaves = 0
    @State private var room = KeyboardRoom()
    /// The name field has had the focus since the screen last appeared.
    @State private var tookFocus = false
    /// The 8 clear points under the name's field, or 8 under its line's own 8 when one shows: the
    /// foot the column is scrolled to.
    private static let footID = "profile.foot"

    var body: some View {
        ScrollViewReader { scroll in
            column
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    SetupFooter(bottom: footerBottom) {
                        Button {
                            Task { await model.saveName() }
                        } label: {
                            Text("auth.profile.continue")
                        }
                        .buttonStyle(.tadayoPrimary(isBusy: model.isSaving))
                        .disabled(!model.canContinue)
                    }
                }
                // The keyboard is the footer's own padding, not a safe area the column and the
                // footer give way to, so the column's room ends at the footer, with the keyboard
                // under it, in the same update as the column is scrolled: on iOS 17.5 and 18.6
                // the room the keyboard took from the column reached the scroll view only as the
                // keyboard rose, after the scroll below, which then moved nothing, and the
                // keyboard's own scrolling left the bare text field at Continue's footer and the
                // rest of the field behind it (a one-run probe, `ios` runs 43362003842,
                // 43362011553 and 43362014173: a copy of this column with the keyboard as a safe
                // area left its foot 24 under the footer's top as the keyboard came up on 17.5
                // and 18.6 and none on 26.5; with the keyboard as the footer's padding, none on
                // all three; the UI tests found the field under Continue on 17.5 and 18.6 in
                // runs 43358826308 and 43357265573). The same column scrolled once the keyboard
                // was up reached the footer on all three either way. iOS 17 and 18 are no longer
                // supported (ADR-033); the padding stays, since it held on every version measured
                // and the UI tests check it on iOS 27.2 and 26.5 (`docs/plans/ios-b0-ios26.md`,
                // section 3).
                .ignoresSafeArea(.keyboard, edges: .bottom)
                // The foot at the column's visible bottom, so the field ends 8 + 8 = 16 above
                // Continue, or its line, 12 under it, 8 + 8 + 8 = 24 (the line box, which reaches
                // past the last line's frame, at least 16 above: `errorToActionMinimum`, measured
                // between line boxes, as A02-age's is): as a line shows, and as the keyboard comes
                // up, since the keyboard's own scrolling keeps the field clear of the keyboard,
                // not of Continue over it (`ios` run 43336877808 drew Continue over the field's
                // last 8 points, its focus ring's last 12, on an iPhone 17 at the default size),
                // and again each time a keyboard already up changes height (another keyboard,
                // a hardware keyboard's bar giving way to the software one), since a column keeps
                // its offset as the room under it shrinks. The column moves only as far as it
                // must, and not at all where it is clear.
                // Each scroll is made twice, inside the update and again in the main queue's next
                // turn, as `CodeScreen`'s is (`docs/plans/ios-b0-pin-scroll-turn.md`): made inside
                // the update alone, it can leave the accessibility tree stale on iOS 26.5, the
                // name's field read in its unscrolled place under Continue
                // (`docs/plans/ios-b0-profile-scroll-turn.md`). The second asks for the place the
                // first reached.
                .onChange(of: line) { _, shown in
                    guard shown != nil else { return }
                    scrollToFoot(scroll)
                }
                .onChange(of: keyboardRise, initial: true) { _, rise in
                    guard rise > 0 else { return }
                    scrollToFoot(scroll)
                }
        }
        // Read around the column, which ignores the keyboard, so the room is the screen's own.
        .readingKeyboardRoom($room)
        .navigationTitle(Text("auth.profile.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                LeaveSignInButton(leave: leave)
                    .disabled(model.isSaving)
            }
        }
        // Focused on arrival, at every text size (IMPLEMENTATION.md: "A03-profile-empty is
        // focused on arrival"), except while VoiceOver runs, whose focus is left to the system,
        // with no first responder asked for, so the screen can be announced first
        // (`authForm.profileArrivalFocus`: "unless VoiceOver focus would be stolen"; the check's
        // C-01; that VoiceOver says A03 as it replaces A02-age is a device check). Nothing is
        // said of Switch Control (needs item 58). Asked for until the field has it
        // (`takeFocusOnArrival`).
        .task { await takeFocusOnArrival() }
        // Return ends a field's editing; the focus is put back while a save goes, whether
        // Return or Continue started it, so the keyboard stays (`busyPrimary.field`: "keep
        // first responder and keyboard if already shown"). `returnSaves` covers the moments
        // between Return and the save's start, and after a save that ends at once.
        .onChange(of: focused) { _, now in
            if now { tookFocus = true }
            if !now, returnSaves > 0 || model.isSaving { focused = true }
        }
        // A save's failure is said once, as it comes (`announcementPolicy.failures`), not again
        // when it shows once more after the too-long line; the too-long line politely, after
        // the character VoiceOver echoes as it is typed (needs item 58), each time it shows.
        .announcing(model.failure?.words)
        .announcing(model.nameIsTooLong ? tooLong : nil, politely: true)
        // "Saving your profile.", once, as the request begins; the button says "In progress"
        // itself.
        .onChange(of: model.isSaving) { was, now in
            if let words = SignInAnnouncement.savingProfile(from: was, to: now) {
                Announcement.post(words)
            }
        }
    }

    private var column: some View {
        SetupScroll {
            SetupHeading(title: "auth.profile.title", subtitle: Text("auth.profile.subtitle"))
            // The circle centred, Add photo and Optional at the leading edge under it, as the
            // frames and the component sheet's text action draw them (X-25, VM-03).
            VStack(alignment: .leading, spacing: 0) {
                Avatar(name: model.name, size: .profile)
                    .frame(maxWidth: .infinity)
                Button("auth.profile.addPhoto") {}
                    .buttonStyle(.tadayoText)
                    .disabled(model.isSaving)
                    .padding(.top, Spacing.s)
                Text("auth.profile.optional")
                    .textRole(.metadata)
                    .foregroundStyle(Palette.secondaryText)
            }
            .padding(.top, Spacing.xxxl)
            LabelledField(Text("auth.profile.nameLabel"), isFocused: focus ?? focused) {
                // The placeholder repeats the label's words (frames 10 and 20,
                // `auth.profile.placeholder`), drawn and hidden from VoiceOver as A02-email's is,
                // so the field says them once (W-08, W-14). The name is read-only while it is
                // saved: what is typed is offered to the model, which declines it, and the field
                // shows what the model kept (`ModelText`).
                ModelText(held: { model.name }, offer: { model.name = $0 }) { text in
                    TextField(String(), text: text)
                        .textContentType(.givenName)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit {
                            // Only a Return that starts a save, counted, so one made as the
                            // last ends can't end its cover. The count is held a moment past
                            // the save's end: a save that fails at once ends before the field's
                            // lost focus reaches `onChange(of: focused)`, which then put nothing
                            // back and the keyboard went (`ios` run 43358826308, iOS 17.5).
                            guard model.canContinue else { return }
                            returnSaves += 1
                            Task {
                                await model.saveName()
                                try? await Task.sleep(for: .milliseconds(100))
                                returnSaves -= 1
                            }
                        }
                        .focused($focused)
                        .overlay(alignment: .leading) {
                            if model.name.isEmpty {
                                Text("auth.profile.nameLabel")
                                    .foregroundStyle(Palette.secondaryText)
                                    .lineLimit(1)
                                    .allowsHitTesting(false)
                                    .accessibilityHidden(true)
                            }
                        }
                }
            }
            .padding(.top, Spacing.xxl)
            if let line {
                InlineError(Text(verbatim: line))
                    .padding(.top, Spacing.m)
                    .padding(.bottom, Spacing.s)
            }
            Color.clear
                .frame(height: Spacing.s)
                .id(Self.footID)
        }
        .scrollDismissesKeyboard(.never)
    }

    /// Asks for the name field's focus every 50 milliseconds, for 2 seconds at most, until the
    /// field has it, with no test override and VoiceOver off. The root shows A03 in a navigation
    /// stack of its own in place of A02-age's, and while the old stack is still going a request is
    /// dropped: `ios` run 43334901167's probe found a field shown that way took no focus asked for
    /// as it appeared or from a task, and took it when asked 300 milliseconds later, while a
    /// field shown in a fresh window, as A02-email is at launch, took it at once (the UI tests
    /// found no field focused on A03 in runs 43331873714 and 43334901167;
    /// `ArrivalFocusTests.testA03TakesTheFocusAsItReplacesA02Age`). The probe read the focus state
    /// as unchanged after each dropped request, and as true once a field shown in a fresh window
    /// had held the focus for half a second; it read nothing yet the instant the swapped-in field
    /// took a late request, within 20 milliseconds, so `onChange(of: focused)` is taken to say
    /// when one is taken, and the hosted test holds that the field keeps the focus, unbroken,
    /// for 2.5 seconds after it takes it. Should the state read true with no report, the request
    /// is withdrawn and made again, as its getter would then hold a request not yet taken.
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

    /// The name's one line: "Use 40 characters or fewer for your name." while the name is too
    /// long, in place of a save's failure if one is still shown (the plan's section 6.12), else
    /// the failure; nothing for a name that is fine, typed or not.
    private var line: String? {
        model.nameIsTooLong ? tooLong : model.failure?.words
    }

    private var tooLong: String { String(localized: "auth.profile.tooLong") }

    /// Continue 12 above the keyboard, which reaches `room.keyboard` above the safe area's
    /// bottom (`authForm.keyboardFooter`), or 44 above the safe area's bottom with none
    /// (`formFooterToSafeAreaBottom`); a test's keyboard, which has no height, takes the 12.
    private var footerBottom: CGFloat {
        keyboardShows ? Spacing.m + room.keyboard : SetupGap.formFooterToSafeAreaBottom
    }

    /// Whether a keyboard, or a hardware keyboard's bar, shows.
    private var keyboardShows: Bool {
        keyboardRise > 0
    }

    /// How far a keyboard, or a hardware keyboard's bar, reaches up into the screen: 0 while none
    /// shows, and 1 for a test's keyboard, which has no height.
    private var keyboardRise: CGFloat {
        keyboard.map { $0 ? 1 : 0 } ?? room.keyboard
    }

    /// The column's foot to its visible bottom, now and again in the main queue's next turn.
    private func scrollToFoot(_ scroll: ScrollViewProxy) {
        scroll.scrollTo(Self.footID, anchor: .bottom)
        DispatchQueue.main.async { scroll.scrollTo(Self.footID, anchor: .bottom) }
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
