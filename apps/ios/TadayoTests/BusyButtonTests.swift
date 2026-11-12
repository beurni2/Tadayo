import SwiftUI
import TadayoDesign
import XCTest

/// The busy primary button's size, place and reading (handoff 7's `busyPrimary`; frames 2 and 4;
/// the sheet's "Primary action · busy"). A hosted test reads where the system's indicator is
/// drawn and what VoiceOver finds, on every iOS the compatibility runs cover, so what the
/// snapshots show on the newest is held on the others too. A snapshot judges how the button
/// looks; these hold what it must be: 16 points at every text size, 8 before the label, the
/// label and the button's height unmoved, a row of its own where the label can't fit, and
/// the label unchanged with the value "In progress".
@MainActor
final class BusyButtonTests: XCTestCase {
    private struct Drawn {
        /// The button's own element, as VoiceOver finds it.
        let button: AccessibilityElements.Element?
        let indicators: [CGRect]
        let elements: [AccessibilityElements.Element]

        var frame: CGRect { button?.frame ?? .zero }
    }

    private static let sizes: [DynamicTypeSize] = [
        .large, .xxxLarge, .accessibility1, .accessibility3, .accessibility5,
    ]

    /// A busy-capable primary button as a screen sets it: 20 points in from each side of a
    /// 393-point window, disabled while it is busy. With `canBeBusy` false it is the plain
    /// primary button, which keeps no room for an indicator.
    private func draw(
        _ title: String, busy: Bool, size: DynamicTypeSize = .large, canBeBusy: Bool = true
    ) -> Drawn {
        let style: PrimaryButtonStyle = canBeBusy ? .tadayoPrimary(isBusy: busy) : .tadayoPrimary
        let view =
            Button {
            } label: {
                Text(verbatim: title)
            }
            .buttonStyle(style)
            .disabled(busy)
            .padding(.horizontal, Spacing.inset)
            .environment(\.dynamicTypeSize, size)
        let layout = AccessibilityElements.layout(of: view)
        return Drawn(
            button: layout.elements.first { $0.label == title }, indicators: layout.indicators,
            elements: layout.elements)
    }

    /// SwiftUI's own indicator grew with the text, to about 56 points at the largest size; the
    /// contract is 16 at every size.
    func testTheIndicatorIs16PointsAtEveryTextSize() {
        for size in Self.sizes {
            let drawn = draw("Send a code", busy: true, size: size)
            XCTAssertEqual(drawn.indicators.count, 1, "\(size)")
            let frame = drawn.indicators.first ?? .zero
            XCTAssertEqual(frame.width, Size.busyIndicator, accuracy: 0.5, "\(size): \(frame)")
            XCTAssertEqual(frame.height, Size.busyIndicator, accuracy: 0.5, "\(size): \(frame)")
        }
    }

    /// Idle draws no indicator, and busy changes nothing about the button: the same place, the
    /// same height, at every size, for a label that fits between the slots and one that doesn't
    /// (the stacked row is reserved idle and busy alike).
    func testIdleAndBusyAreTheSameButton() {
        for size in Self.sizes {
            for title in ["Send a code", "I’m 18 or older"] {
                let idle = draw(title, busy: false, size: size)
                let busy = draw(title, busy: true, size: size)
                XCTAssertNotNil(idle.button, "\(title), \(size)")
                XCTAssertEqual(idle.indicators.count, 0, "\(title), \(size)")
                XCTAssertEqual(busy.indicators.count, 1, "\(title), \(size)")
                let name = "\(title), \(size)"
                XCTAssertEqual(idle.frame.minY, busy.frame.minY, accuracy: 0.5, name)
                XCTAssertEqual(idle.frame.height, busy.frame.height, accuracy: 0.5, name)
                XCTAssertEqual(idle.frame.width, busy.frame.width, accuracy: 0.5, name)
            }
        }
    }

    /// At the default size the label has room between the two slots: the indicator sits level
    /// with the label's middle, its right edge 8 before the label, and the label is centred in
    /// the button as it is idle (frame 2: the label starts where frame 1's does).
    func testTheIndicatorSits8PointsBeforeTheLabelWhichStaysCentred() {
        let title = "Send a code"
        let drawn = draw(title, busy: true)
        let frame = drawn.indicators.first ?? .zero
        let font = UIFont.systemFont(ofSize: 16, weight: .bold)
        let width = (title as NSString).size(withAttributes: [.font: font]).width
        let labelStart = drawn.frame.midX - width / 2
        let place = "\(frame) in \(drawn.frame)"
        XCTAssertEqual(frame.maxX, labelStart - Spacing.s, accuracy: 1.5, place)
        XCTAssertEqual(frame.midY, drawn.frame.midY, accuracy: 1, place)
        XCTAssertEqual(drawn.frame.height, Size.primaryButtonHeight, accuracy: 0.5)
    }

    /// At the largest size "I’m 18 or older" can't fit between the slots: the indicator is on a
    /// row of its own, centred, at the top of the button's face, and the label below it, 8 clear:
    /// the button is taller than the plain primary button with the same label by the indicator's
    /// 16 and the 8 between them, so an indicator drawn over the label, or with no room before
    /// it, fails.
    func testTheIndicatorTakesARowOfItsOwnWhereTheLabelCantFit() {
        let title = "I’m 18 or older"
        let drawn = draw(title, busy: true, size: .accessibility5)
        let plain = draw(title, busy: false, size: .accessibility5, canBeBusy: false)
        let frame = drawn.indicators.first ?? .zero
        let place = "\(frame) in \(drawn.frame), plain \(plain.frame)"
        XCTAssertNotNil(plain.button, place)
        XCTAssertEqual(frame.midX, drawn.frame.midX, accuracy: 1, place)
        XCTAssertEqual(frame.minY - drawn.frame.minY, Spacing.m, accuracy: 1, place)
        XCTAssertEqual(
            drawn.frame.height - plain.frame.height, Size.busyIndicator + Spacing.s, accuracy: 1,
            place)
    }

    /// VoiceOver finds the button with its own label and, only while it is busy, the value "In
    /// progress", dimmed as the screen disables it; the indicator isn't an element, so nothing
    /// else says "In progress".
    func testVoiceOverFindsTheLabelAndTheValueWhileBusy() {
        let busy = draw("Send a code", busy: true)
        XCTAssertEqual(busy.elements.map(\.label), ["Send a code"], "\(busy.elements)")
        XCTAssertEqual(busy.button?.value, "In progress")
        XCTAssertTrue(busy.button?.traits.contains(.button) ?? false)
        XCTAssertTrue(busy.button?.traits.contains(.notEnabled) ?? false)
        XCTAssertFalse(
            busy.elements.contains { $0.label.contains("In progress") }, "\(busy.elements)")

        let idle = draw("Send a code", busy: false)
        XCTAssertEqual(idle.elements.map(\.label), ["Send a code"], "\(idle.elements)")
        XCTAssertEqual(idle.button?.value, "")
        XCTAssertTrue(idle.button?.traits.contains(.button) ?? false)
        XCTAssertFalse(idle.button?.traits.contains(.notEnabled) ?? true)
    }

    /// The indicator says nothing itself, whoever holds it (`BusyIndicator`), so a screen that
    /// holds it without hiding it still says "In progress" no more than once. Drawn bare, with
    /// nothing hiding it, above UIKit's own indicator held the same way but left as UIKit makes
    /// it, which VoiceOver does find: that one shows the reading reaches an indicator inside a
    /// view SwiftUI holds, so the bare one's silence is its own.
    func testTheIndicatorSaysNothingWhoeverHoldsIt() {
        let view = VStack(spacing: 40) {
            BusyIndicator(tint: Palette.secondaryText)
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
            AsUIKitMakesIt()
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
            Text(verbatim: "Sending a new code…")
        }
        let layout = AccessibilityElements.layout(of: view)
        let elements = layout.elements
        XCTAssertEqual(layout.indicators.count, 2, "\(layout.indicators)")
        let indicators = layout.indicators.sorted { $0.minY < $1.minY }
        let bare = indicators.first ?? .zero
        let control = indicators.last ?? .zero
        XCTAssertTrue(
            elements.contains { $0.label == "Sending a new code…" }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.frame.intersects(control) }, "\(control) in \(elements)")
        XCTAssertFalse(elements.contains { $0.frame.intersects(bare) }, "\(bare) in \(elements)")
        let said = elements.filter { !$0.frame.intersects(control) }
            .flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0.contains("In progress") }
        XCTAssertEqual(said, [], "\(elements)")
    }
}

/// UIKit's indicator in a box, as `BusyIndicator` holds it, turning, but neither hidden from
/// VoiceOver: the control for `testTheIndicatorSaysNothingWhoeverHoldsIt`.
private struct AsUIKitMakesIt: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let box = UIView()
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: box.centerYAnchor),
        ])
        spinner.startAnimating()
        return box
    }

    func updateUIView(_ box: UIView, context: Context) {}
}
