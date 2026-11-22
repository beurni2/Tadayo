import SwiftUI
import TadayoCore
import TadayoDesign

/// `G02-link-entry-signed-in` (handoff 4's frame): I have an invite's paste step, pushed onto the
/// tab with the inline title "Invitation", the system's Back and no tab bar:
/// - "Have an invitation?" and "Paste the link, or open it where it was shared." (`SetupHeading`);
/// - 72 under them, where handoff 4's frame and handoff 9's frames 3 to 5 draw it
///   (`SetupGap.linkField`), the Invitation link field (`LabelledField`), with "Paste invitation
///   link" drawn over it while it's empty, as A02-email's placeholder is, hidden from VoiceOver;
/// - the line for what went wrong 12 under the field (`InlineError`), said once as it shows:
///   handoff 4's `linkEntry.invalid`, `.clipboardEmpty` and `.cannotCheck`, and, built from spec,
///   "Couldn’t check the invitation link. Try again." for a check answered with a refusal or a
///   server error (handoff 8's rule; asked in design handoff 9). Only a link that isn't one marks
///   the field invalid;
/// - 16 under the field, or the line, the system's paste control (`PasteButton`, T45), which reads
///   the clipboard only when it's tapped (handoff 2), labelled "Paste an invitation link." for
///   VoiceOver (`link.paste.vo`). It draws nothing in a snapshot, which can't render the system's
///   secure control; the UI test finds it on the paste step;
/// - 32 under it, "We’ll check the link before showing the club or its people." in `metadata`
///   `secondaryText`;
/// - Continue pinned 44 above the safe area's bottom, or above the keyboard, disabled until the
///   field holds something besides spaces, labelled "Check the invitation link." for VoiceOver
///   (`link.continue.vo`). While the link is checked it shows its busy form, the field is
///   read-only (the model keeps what it held) and Paste waits.
///
/// What's typed may hold a token: the field takes no autocorrection, capitalization or learned
/// words, uses the URL keyboard and content type, and is redacted from the app switcher's
/// snapshot (`privacySensitive`). The field doesn't take the focus on arrival, as the frame draws
/// no keyboard. The check keeps the focus where it is (`handoff9.linkEntry.keyboard`), and a line
/// under the field keeps it there; an answer that takes the person on gives it up as the
/// invitation is pushed over the field, so Back returns to the field with no keyboard over
/// Continue, as on arrival (`check()`).
struct LinkEntryScreen: View {
    let model: InvitationLinkEntryModel
    /// Continue: checks the link and shows what it found.
    let proceed: @MainActor () async -> Void
    /// Whether the field shows focused, for a snapshot: nil in the app.
    var focus: Bool?
    @FocusState private var focused: Bool

    var body: some View {
        SetupScroll {
            SetupHeading(title: "linkEntry.title", subtitle: Text("linkEntry.body"))
            LabelledField(
                Text("linkEntry.label"), isFocused: focus ?? focused,
                isInvalid: model.problem == .invalid, error: line.map { Text(verbatim: $0) }
            ) {
                ModelText(held: { model.text }, offer: { model.text = $0 }) { text in
                    TextField(String(), text: text)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit { Task { await check() } }
                        .focused($focused)
                        .privacySensitive()
                        .overlay(alignment: .leading) {
                            if model.text.isEmpty {
                                Text("linkEntry.placeholder")
                                    .foregroundStyle(Palette.secondaryText)
                                    .lineLimit(1)
                                    .allowsHitTesting(false)
                                    .accessibilityHidden(true)
                            }
                        }
                }
            }
            .padding(.top, SetupGap.linkField)
            if let line {
                InlineError(Text(verbatim: line))
                    .padding(.top, Spacing.m)
            }
            PasteButton(payloadType: String.self) { strings in
                Task { @MainActor in model.pasted(strings.first) }
            }
            .labelStyle(.titleAndIcon)
            .buttonBorderShape(.roundedRectangle)
            .tint(Palette.action)
            .disabled(model.isChecking)
            .accessibilityLabel(Text("linkEntry.paste.vo"))
            .padding(.top, Spacing.l)
            Text("invitation.checkFirst")
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxxl)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                Button {
                    Task { await check() }
                } label: {
                    Text("linkEntry.continue")
                }
                .buttonStyle(.tadayoPrimary(isBusy: model.isChecking))
                .disabled(!model.canContinue)
                .accessibilityLabel(Text("linkEntry.continue.vo"))
            }
        }
        .navigationTitle(Text("invitation.nav"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .announcing(line)
    }

    /// Continue, or Return: the link checked, and, once the answer has pushed the invitation over
    /// the field or opened the club, the field's focus given up while the field is still on
    /// screen. Given up only as the field left the screen (`onDisappear`), Continue was out of
    /// reach after Back on both iOS versions (`InvitationUITests`), read as the keyboard back
    /// over it.
    private func check() async {
        await proceed()
        if model.invitation != nil || model.opened != nil { focused = false }
    }

    /// The line under the field.
    private var line: String? {
        switch model.problem {
        case .invalid: String(localized: "linkEntry.invalid")
        case .clipboardEmpty: String(localized: "linkEntry.clipboardEmpty")
        case .cannotCheck(.network): String(localized: "linkEntry.cannotCheck")
        case .cannotCheck(.other): String(localized: "linkEntry.cannotCheck.refused")
        case nil: nil
        }
    }
}
