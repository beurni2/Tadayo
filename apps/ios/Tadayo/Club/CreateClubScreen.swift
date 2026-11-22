import SwiftUI
import TadayoCore
import TadayoDesign

/// G01-create and G01-create-failed (2.1's frame and handoff 8's frame 7), pushed onto the tab
/// with the inline title "Create a club", the system's Back and no tab bar:
/// - 2.1's words, kept where frame 7 draws "Name your club" and "A private place for your
///   people." until the next brief says which (`docs/plans/ios-b1-create.md` section 3; needs
///   item 66): "Your people, together." in `utilityTitle` 32/35, as a heading, and "Start a
///   private club with two to six people." close under it, as A02-email's title and line are
///   (`SetupHeading`);
/// - 24 under that, Club name's field (`LabelledField`), 54 high;
/// - after Continue to invitations failed, frame 7's line 12 under the field, with the failure
///   glyph and the field's border unchanged (`handoff8.failureStates`), said once as it shows;
/// - 24 under the field, or the line, the roster line in `body` `secondaryText`, and 24 under it
///   the Drafts note (`ShieldNote`, handoff 4's `approvalNote`: "the existing shield and surface
///   component");
/// - Continue to invitations pinned under the column, 44 above the safe area's bottom, or 12 above
///   the keyboard while one shows, as A03's Continue is (`authForm.keyboardFooter`).
///
/// Continue waits for a name with something in it besides spaces and no longer than 40
/// characters (FQ70; over 40 there are no words yet, item 67), and makes the club with the name,
/// trimmed, and the device's zone (FQ19). While it's made the name is read-only, not disabled, so
/// it keeps its focus and its keyboard, and Continue is busy and says "In progress"
/// (`busyPrimary`). A failure keeps the name, editable, and the focus. Once the club is made, the
/// tabs put its invitations in this screen's place (`TabsView`). Neither frame draws a keyboard,
/// so the field isn't focused on arrival.
struct CreateClubScreen: View {
    let model: CreateClubModel
    /// Whether the field shows focused, for a snapshot, which has no keyboard: nil in the app.
    var focus: Bool?
    /// Whether a keyboard shows, for a test, which has none: nil in the app, where the screen
    /// reads it from its own frame (`readingKeyboardRoom`).
    var keyboard: Bool?
    @FocusState private var focused: Bool
    @State private var room = KeyboardRoom()
    /// Creates started from the keyboard's return key that are on their way, or just ended.
    @State private var returnCreates = 0
    /// The 8 clear points under the field, or its line: the foot the column is scrolled to.
    private static let footID = "create.foot"

    var body: some View {
        ScrollViewReader { scroll in
            column
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    SetupFooter(bottom: footerBottom) {
                        Button {
                            Task { await model.create() }
                        } label: {
                            Text("create.continue")
                        }
                        .buttonStyle(.tadayoPrimary(isBusy: model.isCreating))
                        .disabled(!model.canContinue)
                    }
                }
                // The keyboard is the footer's own padding, as on A03 (`ProfileForm`), so the
                // column's room ends at the footer in the same update as it is scrolled.
                .ignoresSafeArea(.keyboard, edges: .bottom)
                .onChange(of: line) { _, shown in
                    if shown != nil { scroll.scrollTo(Self.footID, anchor: .bottom) }
                }
                .onChange(of: keyboardRise, initial: true) { _, rise in
                    if rise > 0 { scroll.scrollTo(Self.footID, anchor: .bottom) }
                }
        }
        .readingKeyboardRoom($room)
        .navigationTitle(Text("create.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        // The focus is put back while the club is made, whether Return or Continue started it, so
        // the keyboard stays (`busyPrimary.field`).
        .onChange(of: focused) { _, now in
            if !now, returnCreates > 0 || model.isCreating { focused = true }
        }
        .announcing(line)
    }

    private var column: some View {
        SetupScroll {
            SetupHeading(title: "create.title", subtitle: Text("create.subtitle"))
            LabelledField(Text("create.nameLabel"), isFocused: focus ?? focused) {
                ModelText(held: { model.name }, offer: { model.name = $0 }) { text in
                    TextField(String(), text: text)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit {
                            guard model.canContinue else { return }
                            returnCreates += 1
                            Task {
                                await model.create()
                                try? await Task.sleep(for: .milliseconds(100))
                                returnCreates -= 1
                            }
                        }
                        .focused($focused)
                }
            }
            .padding(.top, Spacing.xxl)
            if let line {
                InlineError(Text(verbatim: line))
                    .padding(.top, Spacing.m)
            }
            Color.clear
                .frame(height: Spacing.s)
                .id(Self.footID)
            Text("create.roster")
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.l)
            ShieldNote(Text("create.drafts"))
                .padding(.top, Spacing.xxl)
        }
        .scrollDismissesKeyboard(.never)
    }

    /// Frame 7's line, after Continue failed; nothing otherwise.
    private var line: String? { model.failure?.words }

    /// Continue 12 above the keyboard, or 44 above the safe area's bottom with none
    /// (`formFooterToSafeAreaBottom`), as A03's.
    private var footerBottom: CGFloat {
        keyboardRise > 0 ? Spacing.m + room.keyboard : SetupGap.formFooterToSafeAreaBottom
    }

    /// How far a keyboard reaches up into the screen: 0 while none shows, and 1 for a test's
    /// keyboard, which has no height.
    private var keyboardRise: CGFloat {
        keyboard.map { $0 ? 1 : 0 } ?? room.keyboard
    }
}

extension CreateClubModel.Failure {
    /// Frame 7's two lines: "Check your connection" only when no answer came
    /// (`handoff8.failureStates`).
    var words: String {
        switch self {
        case .network: String(localized: "create.failed.network")
        case .other: String(localized: "create.failed.refused")
        }
    }
}

/// A note on `surface` with a shield beside it (handoff 4's `approvalNote`, "the existing shield
/// and surface component"): the text in `metadata` 13/18 `secondaryText`, the 20-point `shield` in
/// `secondaryText` 12 before it, 16 in on every side, radius 12, the box as tall as its text.
/// The shield is decorative: VoiceOver reads the words alone (handoff 4: "The shield is
/// decorative to that spoken sentence").
struct ShieldNote: View {
    let text: Text
    @ScaledMetric(relativeTo: TypeRole.metadata.textStyle) private var shield: CGFloat = 20

    init(_ text: Text) {
        self.text = text
    }

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: "shield")
                .resizable()
                .scaledToFit()
                .frame(width: shield, height: shield)
                .accessibilityHidden(true)
            text
                .textRole(.metadata)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(Palette.secondaryText)
        .padding(Spacing.l)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
    }
}
