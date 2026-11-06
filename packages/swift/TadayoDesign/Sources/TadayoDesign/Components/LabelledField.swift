import SwiftUI

/// A text field with its visible label above it (book p34: "Visible labels"): the label in
/// `fieldLabel` 13/18 bold, the field at least 54 points high on `surface`, radius 10, with a
/// 1-point `inputBorder`, its value in `body` (brand revision 1.1; handoff 4's
/// `componentGeometry.field`). The screen gives the field itself, so it keeps the system's
/// keyboard, content type and AutoFill (T45).
///
/// Focus draws a 2-point `focusRing` outside a 2-point gap whenever the field is first responder,
/// by touch or by keyboard, and an invalid field a 1-point `destructive` border: both at once
/// when a focused field is invalid, and an error never takes the focus away (handoff 2 and 4's
/// `fieldFocus`). `isFocused` is passed in, so a snapshot can show focus with no keyboard. The
/// label is the field's accessibility label, and isn't read twice. An invalid field's `error`, the
/// line the screen shows for it, is its accessibility hint, so VoiceOver says why on coming back
/// to the field, not only once when it's announced (handoff 1: "Keep error text associated with
/// its field"). Its value stays what was typed.
public struct LabelledField<Field: View>: View {
    let label: Text
    let isFocused: Bool
    let isInvalid: Bool
    let error: Text?
    let field: Field

    public init(
        _ label: Text, isFocused: Bool, isInvalid: Bool = false, error: Text? = nil,
        @ViewBuilder field: () -> Field
    ) {
        self.label = label
        self.isFocused = isFocused
        self.isInvalid = isInvalid
        self.error = error
        self.field = field()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.input)
        let ring = Size.focusRingGap + Size.focusRingWidth / 2
        VStack(alignment: .leading, spacing: Spacing.s) {
            label
                .textRole(.fieldLabel)
                .foregroundStyle(Palette.primaryText)
                .accessibilityHidden(true)
            field
                .textRole(.body)
                .foregroundStyle(Palette.primaryText)
                .tint(Palette.action)
                .padding(.horizontal, Size.fieldInset)
                .padding(.vertical, Spacing.s)
                .frame(maxWidth: .infinity, minHeight: Size.fieldMinHeight, alignment: .leading)
                .background(Palette.surface, in: shape)
                .overlay {
                    shape.strokeBorder(
                        isInvalid ? Palette.destructive : Palette.inputBorder, lineWidth: 1)
                }
                .overlay {
                    if isFocused {
                        RoundedRectangle(cornerRadius: Radius.input + ring)
                            .stroke(Palette.focusRing, lineWidth: Size.focusRingWidth)
                            .padding(-ring)
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityLabel(label)
                // Always the same modifier, an empty hint when valid, so the field keeps its
                // identity, and its focus, as the error comes and goes.
                .accessibilityHint(isInvalid ? error ?? Text(verbatim: "") : Text(verbatim: ""))
        }
    }
}
