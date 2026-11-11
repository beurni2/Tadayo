import SwiftUI

/// A text field over a model that may decline what is typed, and shows only what it kept.
///
/// A `TextField` bound straight to a property whose setter ignores a write keeps the typed
/// character on screen, because SwiftUI sets the field only when the binding's value changes and a
/// declined write leaves it as it was: in `ios` run 43088016760 a letter typed into the address
/// while a code was on its way left "ben@example.comx" in the field and "ben@example.com" in the
/// model. The same goes for a seventh digit of a code, which `SignInModel.code` caps at six.
///
/// The field here is bound to a copy of the text that every edit offers to the model and then
/// reads back, so what the field shows is what the model holds, and a change the model makes
/// itself (a code cleared for a new one) reaches the field too. The caret goes to the end when a
/// write is taken back, which is where the person was typing.
struct ModelText<Field: View>: View {
    private let held: () -> String
    private let offer: (String) -> Void
    private let field: (Binding<String>) -> Field
    @State private var shown: String

    /// `held` reads the model's text, `offer` writes the typed text to it, and `field` draws the
    /// field over the copy it is given.
    init(
        held: @escaping () -> String, offer: @escaping (String) -> Void,
        @ViewBuilder field: @escaping (Binding<String>) -> Field
    ) {
        self.held = held
        self.offer = offer
        self.field = field
        _shown = State(initialValue: held())
    }

    var body: some View {
        field($shown)
            .onChange(of: shown) { _, typed in
                offer(typed)
                take(held())
            }
            .onChange(of: held()) { _, now in take(now) }
    }

    private func take(_ now: String) {
        if shown != now { shown = now }
    }
}
