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
    /// 393-point window, disabled while it is busy.
    private func draw(_ title: String, busy: Bool, size: DynamicTypeSize = .large) -> Drawn {
        let view =
            Button {
            } label: {
                Text(verbatim: title)
            }
            .buttonStyle(.tadayoPrimary(isBusy: busy))
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
    /// row of its own, centred, above the label, and the button is taller than one line of the
    /// label alone would make it.
    func testTheIndicatorTakesARowOfItsOwnWhereTheLabelCantFit() {
        let drawn = draw("I’m 18 or older", busy: true, size: .accessibility5)
        let frame = drawn.indicators.first ?? .zero
        XCTAssertEqual(frame.midX, drawn.frame.midX, accuracy: 1, "\(frame), \(drawn.frame)")
        XCTAssertLessThan(frame.midY, drawn.frame.midY, "\(frame), \(drawn.frame)")
        XCTAssertGreaterThanOrEqual(
            frame.minY - drawn.frame.minY, Spacing.m, "\(frame), \(drawn.frame)")
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
}
