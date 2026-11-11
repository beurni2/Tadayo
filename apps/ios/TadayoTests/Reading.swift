import SwiftUI
import XCTest

/// What the hosted tests read through VoiceOver's eyes, shared by the components' tests
/// (`DropCardTests`, `DayHeaderTests`, `PersonRowTests`, `TargetBlockTests`).

/// ICU puts a narrow no-break space before AM and PM.
let seven = "7\u{202F}AM"

/// What VoiceOver finds in one element: its label, its value and hint (none unless given),
/// whether it is a button, and its custom actions (none unless given). In the drop card's states
/// no element but the receipt's action is a button: the taps that open a draft or explain the
/// opening time are B4's (Q07).
struct Read: Equatable, CustomStringConvertible {
    let label: String
    var value = ""
    var hint = ""
    var isButton = false
    var actions: [String] = []

    init(
        _ label: String, value: String = "", hint: String = "", isButton: Bool = false,
        actions: [String] = []
    ) {
        self.label = label
        self.value = value
        self.hint = hint
        self.isButton = isButton
        self.actions = actions
    }

    var description: String {
        "\"\(label)\" value \"\(value)\" hint \"\(hint)\"\(isButton ? " button" : "")"
            + (actions.isEmpty ? "" : " actions \(actions)")
    }
}

@MainActor func labels(_ view: some View) -> [String] {
    AccessibilityElements.of(view).map(\.label)
}

/// Every element of the view, in order, is exactly one of these, so nothing else is spoken.
@MainActor func assertReads(
    _ view: some View, _ expected: [Read], file: StaticString = #filePath, line: UInt = #line
) {
    let read = AccessibilityElements.of(view).map {
        Read(
            $0.label, value: $0.value, hint: $0.hint, isButton: $0.traits.contains(.button),
            actions: $0.actions)
    }
    XCTAssertEqual(read, expected, file: file, line: line)
}

/// A value's stored properties and their types, so a test fails when an input gains one.
func fields(_ value: Any) -> [String] {
    Mirror(reflecting: value).children.map {
        "\($0.label ?? "?"): \(String(describing: type(of: $0.value)))"
    }
}
