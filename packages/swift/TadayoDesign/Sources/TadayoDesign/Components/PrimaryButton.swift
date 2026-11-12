import SwiftUI
import UIKit

/// The main action: full width, at least 50 points high, label 16/22 bold, radius 13 (book p34,
/// p35; brand revision 1.1's "Buttons and fields", `design/reference/claude-design/handoff-1/IMPLEMENTATION.md`).
/// Default `action`/`onAction`; pressed `actionPressed`/`onActionPressed`; disabled
/// `actionDisabled`/`onActionDisabled`, with no opacity multiplier. Keyboard focus, never an
/// ordinary touch, draws a 2-point `focusRing` outside a 2-point canvas gap (handoff 4's
/// `buttonFocus`). Its label grows with the text.
///
/// Busy, while its request is on its way (handoff 7's `busyPrimary`; frames 2 and 4): the button
/// keeps its height, its label and its colours, and the screen disables it so a second tap does
/// nothing. The system's activity indicator, 16 points at every text size (`BusyIndicator`),
/// sits 8 before the label, which stays where it is idle, centred between two 24-point slots,
/// one on each side. Where the label can't fit between the slots (the largest text sizes, a long
/// label on a narrow phone) the indicator moves to a row of its own, centred above the label,
/// which the button reserves idle and busy alike, so it grows by that row whether or not it
/// is busy and nothing moves when the request starts. Which of the two is used is decided
/// by `ViewThatFits` from the label's own width, the same idle as busy. Its accessibility label
/// is unchanged and its value is "In progress" (`busy.value.vo`), said by VoiceOver after the
/// label; the indicator itself is hidden from VoiceOver, so the words aren't said twice. Busy
/// is a request state, not the disabled colour state: the fill stays `action`. A button that
/// can be busy opts in (`tadayoPrimary(isBusy:)`); no other primary button changes. No
/// delivery draws I’m 18 or older or Continue busy, or any busy button at the largest text
/// size, so those are built from the written contract (INVENTORY.md).
public struct PrimaryButtonStyle: ButtonStyle {
    let isBusy: Bool
    let canBeBusy: Bool

    public init(isBusy: Bool = false, canBeBusy: Bool = false) {
        self.isBusy = isBusy
        self.canBeBusy = canBeBusy
    }

    public func makeBody(configuration: Configuration) -> some View {
        PrimaryButton(configuration: configuration, isBusy: isBusy, canBeBusy: canBeBusy)
    }
}

private struct PrimaryButton: View {
    let configuration: ButtonStyleConfiguration
    let isBusy: Bool
    let canBeBusy: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        PrimaryButtonFace(
            isPressed: configuration.isPressed, isFocused: isFocused,
            isEnabled: isEnabled || isBusy, isBusy: isBusy, canBeBusy: canBeBusy
        ) {
            configuration.label
        }
        .focusEffectDisabled()
    }
}

/// The primary button's appearance in one state, which `PrimaryButtonStyle` feeds from the
/// button. The Lab draws each of the sheet's four states with it (default, pressed, disabled,
/// keyboard focus, busy), since a snapshot can't press a button or give it keyboard focus.
public struct PrimaryButtonFace<Label: View>: View {
    let isPressed: Bool
    let isFocused: Bool
    let isEnabled: Bool
    let isBusy: Bool
    let canBeBusy: Bool
    let label: Label

    public init(
        isPressed: Bool = false, isFocused: Bool = false, isEnabled: Bool = true,
        isBusy: Bool = false, canBeBusy: Bool = false, @ViewBuilder label: () -> Label
    ) {
        self.isPressed = isPressed
        self.isFocused = isFocused
        self.isEnabled = isEnabled
        self.isBusy = isBusy
        self.canBeBusy = canBeBusy || isBusy
        self.label = label()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.button)
        let ring = Size.focusRingGap + Size.focusRingWidth / 2
        content
            .foregroundStyle(ink)
            .padding(.horizontal, Spacing.l)
            .padding(.vertical, Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Size.primaryButtonHeight)
            .background(fill, in: shape)
            .contentShape(shape)
            .overlay {
                if isFocused {
                    RoundedRectangle(cornerRadius: Radius.button + ring)
                        .stroke(Palette.focusRing, lineWidth: Size.focusRingWidth)
                        .padding(-ring)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityValue(isBusy ? busyValue : "")
    }

    /// The label alone, or, in a button that can be busy, the label and its indicator.
    @ViewBuilder private var content: some View {
        if canBeBusy {
            ViewThatFits(in: .horizontal) {
                // The label on one line between the two slots, the indicator in the leading one,
                // its right edge 8 before the label.
                text
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, Size.busySlot)
                    .overlay(alignment: .leading) { indicator }
                // The label can't fit between them: the indicator's own row above it, 8 clear.
                VStack(spacing: Spacing.s) {
                    indicator
                    text
                }
            }
        } else {
            text.frame(maxWidth: .infinity)
        }
    }

    private var text: some View {
        label
            .textRole(.button)
            .multilineTextAlignment(.center)
    }

    /// The indicator while busy and its empty room while idle: the same 16-point box, so the
    /// label and the button's height are the same in both, and no indicator turns unseen.
    @ViewBuilder private var indicator: some View {
        if isBusy {
            BusyIndicator(tint: ink)
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
                .accessibilityHidden(true)
        } else {
            Color.clear
                .frame(width: Size.busyIndicator, height: Size.busyIndicator)
                .accessibilityHidden(true)
        }
    }

    private var busyValue: String {
        String(localized: "busy.value.vo", bundle: .module)
    }

    private var fill: Color {
        if !isEnabled { return Palette.actionDisabled }
        return isPressed ? Palette.actionPressed : Palette.action
    }

    private var ink: Color {
        if !isEnabled { return Palette.onActionDisabled }
        return isPressed ? Palette.onActionPressed : Palette.onAction
    }
}

/// The system's activity indicator, 16 points whatever the text size. SwiftUI's own `ProgressView`
/// grows with Dynamic Type, to about 56 points at the largest, and the contract is 16 at every
/// size (handoff 7's `busyPrimary.indicatorSize`), so this holds the UIKit indicator, which keeps
/// its own size, in a 16-point box and scales it by the factor that makes it 16 (T45: it is
/// the system's indicator, which turns as the system's does).
private struct BusyIndicator: UIViewRepresentable {
    let tint: Color

    func makeUIView(context: Context) -> UIView {
        let box = UIView()
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.hidesWhenStopped = false
        spinner.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: box.centerYAnchor),
        ])
        let scale = Size.busyIndicator / max(spinner.intrinsicContentSize.width, 1)
        spinner.transform = CGAffineTransform(scaleX: scale, y: scale)
        spinner.startAnimating()
        return box
    }

    func updateUIView(_ box: UIView, context: Context) {
        (box.subviews.first as? UIActivityIndicatorView)?.color = UIColor(tint)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIView, context: Context) -> CGSize? {
        CGSize(width: Size.busyIndicator, height: Size.busyIndicator)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    public static var tadayoPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }

    /// The primary button, busy while its request is on its way.
    public static func tadayoPrimary(isBusy: Bool) -> PrimaryButtonStyle {
        PrimaryButtonStyle(isBusy: isBusy, canBeBusy: true)
    }
}
