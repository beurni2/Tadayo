import SwiftUI
import TadayoCore
import TadayoDesign
import UIKit
import XCTest

@testable import Tadayo

/// A probe, removed in the commit after the one that adds it: what a real keyboard does to A03's
/// column on each iOS the runs use, where the UI tests found the column unmoved with the keyboard
/// up on iOS 18.6 and 17.5 (`ios` runs 43357265573 and 43358826308). It prints lines starting
/// "PROBE", for the run's log, and asserts nothing.
@MainActor
final class KeyboardScrollProbeTests: XCTestCase {
    func testProbeA03WithARealKeyboard() {
        let keyboard = KeyboardWatch()
        let model = ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: true, version: 1),
            accounts: ScriptedAccounts(updates: [.fail(.network)]), saved: { _ in },
            signedOut: {})
        let screen = ProbeWindow(ProfileScreen(model: model, leave: {}))
        settle(screen, keyboard, "P0-screen arrived", nil)
        model.name = "Ben"
        Task { await model.saveName() }
        series(screen, keyboard, "P0-screen failed", nil)
        screen.close()
        for mode in ProbeMode.allCases {
            let control = ProbeControl()
            let window = ProbeWindow(
                NavigationStack { ProbeForm(control: control, mode: mode) }.tint(Palette.action))
            settle(window, keyboard, "\(mode) arrived", control)
            control.showLine = true
            control.step += 1
            series(window, keyboard, "\(mode) line", control)
            if let scroll = window.scrollView {
                let was = scroll.contentOffset.y
                scroll.setContentOffset(CGPoint(x: 0, y: was + 150), animated: false)
                spin(0.4)
                report(window, keyboard, "\(mode) offset set to \(was + 150)", control)
            }
            window.close()
        }
    }

    private func settle(
        _ window: ProbeWindow, _ keyboard: KeyboardWatch, _ label: String,
        _ control: ProbeControl?
    ) {
        let focused = spin(3) { window.focusedField != nil }
        let shown = spin(3) { keyboard.shows }
        spin(1)
        print("PROBE \(label): focused \(focused) keyboard shown \(shown)")
        report(window, keyboard, label, control)
    }

    private func series(
        _ window: ProbeWindow, _ keyboard: KeyboardWatch, _ label: String,
        _ control: ProbeControl?
    ) {
        var waited = 0.0
        for at in [0.05, 0.25, 0.6, 1.2] {
            spin(at - waited)
            waited = at
            report(window, keyboard, "\(label) +\(at)s", control)
        }
    }

    private func report(
        _ window: ProbeWindow, _ keyboard: KeyboardWatch, _ label: String,
        _ control: ProbeControl?
    ) {
        window.window.layoutIfNeeded()
        var line = "PROBE \(label): keyboard \(keyboard.frame)"
        if let scroll = window.scrollView {
            line += " | scroll \(type(of: scroll)) frame \(scroll.convert(scroll.bounds, to: nil))"
            line += " size \(scroll.contentSize) offset \(scroll.contentOffset.y)"
            line += " inset \(scroll.contentInset) adjusted \(scroll.adjustedContentInset)"
            line += " safe \(scroll.safeAreaInsets)"
        } else {
            line += " | no scroll view"
        }
        if let field = window.anyField {
            line += " | field \(field.convert(field.bounds, to: nil))"
            line += " first \(field.isFirstResponder)"
        }
        if let control {
            line += " | room \(control.room.height) kb \(control.room.keyboard)"
            line += " footer \(control.footerTop) h \(control.footerHeight)"
            line += " foot \(control.footBottom) boxFoot \(control.boxBottom)"
        }
        print(line)
    }

    @discardableResult
    private func spin(_ seconds: TimeInterval, until done: () -> Bool = { false }) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while !done(), Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
        return done()
    }
}

/// The keyboard's last frame, from its notifications.
@MainActor
private final class KeyboardWatch {
    private(set) var frame = CGRect.zero
    private(set) var shows = false
    private var tokens: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        tokens.append(
            center.addObserver(
                forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main
            ) { [weak self] note in
                let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
                MainActor.assumeIsolated {
                    self?.shows = true
                    self?.frame = end ?? .zero
                }
            })
        tokens.append(
            center.addObserver(
                forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.shows = false
                    self?.frame = .zero
                }
            })
    }
}

/// A key window, 393 by 852 points, as `ArrivalFocusTests`' own.
@MainActor
private final class ProbeWindow {
    let window: UIWindow
    private let previous: UIWindow?

    init(_ view: some View) {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        previous = scene?.keyWindow
        window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        window.rootViewController = UIHostingController(
            rootView: view.environment(\.locale, Locale(identifier: "en_US")))
        window.makeKeyAndVisible()
    }

    var focusedField: UITextField? { Self.fields(in: window).first { $0.isFirstResponder } }
    var anyField: UITextField? { Self.fields(in: window).first }
    var scrollView: UIScrollView? { Self.scrolls(in: window).first }

    func close() {
        window.endEditing(true)
        let gone = Date().addingTimeInterval(1)
        while Date() < gone { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        window.isHidden = true
        window.rootViewController = nil
        previous?.makeKey()
    }

    private static func fields(in view: UIView) -> [UITextField] {
        let own = view as? UITextField
        return (own.map { [$0] } ?? []) + view.subviews.flatMap { fields(in: $0) }
    }

    private static func scrolls(in view: UIView) -> [UIScrollView] {
        let own = (view as? UIScrollView).flatMap { $0 is UITextView ? nil : $0 }
        return (own.map { [$0] } ?? []) + view.subviews.flatMap { scrolls(in: $0) }
    }
}

private enum ProbeMode: String, CaseIterable, CustomStringConvertible {
    /// The foot scrolled to the bottom, as A03 did at ac03192.
    case p1BottomFoot
    /// A marker as tall as the room above the footer, its bottom on the foot's, to the top.
    case p2TopMark
    /// The column and footer ignoring the keyboard, the footer padded by the keyboard's height,
    /// the foot scrolled to the bottom.
    case p3IgnoreKeyboard

    var description: String { rawValue }
}

@MainActor
@Observable
private final class ProbeControl {
    var step = 0
    var showLine = false
    var room = KeyboardRoom()
    var footerHeight: CGFloat = 0
    var footerTop: CGFloat = 0
    var footBottom: CGFloat = 0
    var boxBottom: CGFloat = 0
}

/// A03's column and footer, as `ProfileForm` lays them out, with a block in place of the heading
/// and avatar.
private struct ProbeForm: View {
    let control: ProbeControl
    let mode: ProbeMode
    @FocusState private var focused: Bool
    @State private var room = KeyboardRoom()
    @State private var footerHeight: CGFloat = 0
    @State private var name = "Ben"

    var body: some View {
        ScrollViewReader { scroll in
            column
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    SetupFooter(bottom: footerBottom) {
                        Button {
                        } label: {
                            Text(verbatim: "Continue")
                        }
                        .buttonStyle(.tadayoPrimary(isBusy: false))
                    }
                    .background {
                        GeometryReader { footer in
                            Color.clear.onChange(
                                of: footer.frame(in: .global), initial: true
                            ) { _, now in
                                footerHeight = now.height
                                control.footerHeight = now.height
                                control.footerTop = now.minY
                            }
                        }
                    }
                }
                .ignoresSafeArea(mode == .p3IgnoreKeyboard ? .keyboard : [], edges: .bottom)
                .readingKeyboardRoom(mode == .p3IgnoreKeyboard ? .constant(room) : $room)
                .onChange(of: control.step) { go(scroll) }
                .onChange(of: room.keyboard > 0, initial: true) { _, up in
                    if up { go(scroll) }
                }
                .onChange(of: aboveFooter) {
                    if room.keyboard > 0 { go(scroll) }
                }
        }
        .readingKeyboardRoom(mode == .p3IgnoreKeyboard ? $room : .constant(room))
        .onChange(of: room, initial: true) { _, now in control.room = now }
        .navigationTitle(Text(verbatim: "Probe"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { focused = true }
    }

    private var column: some View {
        SetupScroll {
            Color.gray.frame(height: 300)
            LabelledField(Text(verbatim: "Your name"), isFocused: focused) {
                TextField(String(), text: $name)
                    .focused($focused)
            }
            .padding(.top, Spacing.xxl)
            .background {
                GeometryReader { box in
                    Color.clear.onChange(of: box.frame(in: .global).maxY, initial: true) {
                        _, now in control.boxBottom = now
                    }
                }
            }
            if control.showLine {
                InlineError(Text(verbatim: "Check your connection and try again."))
                    .padding(.top, Spacing.m)
                    .padding(.bottom, Spacing.s)
            }
            Color.clear
                .frame(height: Spacing.s)
                .id("foot")
                .background {
                    GeometryReader { foot in
                        Color.clear.onChange(of: foot.frame(in: .global).maxY, initial: true) {
                            _, now in control.footBottom = now
                        }
                    }
                }
            Color.clear
                .frame(height: aboveFooter)
                .allowsHitTesting(false)
                .id("mark")
                .padding(.top, -aboveFooter)
        }
        .scrollDismissesKeyboard(.never)
    }

    private var footerBottom: CGFloat {
        guard room.keyboard > 0 else { return SetupGap.formFooterToSafeAreaBottom }
        return mode == .p3IgnoreKeyboard ? Spacing.m + room.keyboard : Spacing.m
    }

    private var aboveFooter: CGFloat { max(0, room.height - footerHeight) }

    private func go(_ scroll: ScrollViewProxy) {
        switch mode {
        case .p1BottomFoot, .p3IgnoreKeyboard: scroll.scrollTo("foot", anchor: .bottom)
        case .p2TopMark: scroll.scrollTo("mark", anchor: .top)
        }
    }
}
