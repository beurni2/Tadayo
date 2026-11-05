import SwiftUI
import UIKit

/// The colour tokens by role, light and dark (T44), from brand revision 1.1 (FQ45, ADR-027):
/// `design/reference/brand/brand-tokens.md`, copied from `brand-tokens.json`, and the fold line
/// from handoff 4's `component-contracts.json` (`supplementalTokens.foldCornerLine`).
///
/// Each token resolves against the view's own appearance, so dark mode is a real dark theme
/// (book p26), and photographs never pass through any of these (T44).
public enum Palette {
    public static let canvas = Color(light: 0xFAFBF8, dark: 0x121D19)
    public static let surface = Color(light: 0xF0F2EC, dark: 0x203027)
    public static let primaryText = Color(light: 0x182B25, dark: 0xF7F8F2)
    public static let secondaryText = Color(light: 0x607067, dark: 0xB6C3B7)
    public static let action = Color(light: 0x284CDB, dark: 0xAFBEFF)
    public static let onAction = Color(light: 0xFFFFFF, dark: 0x18233B)
    public static let actionPressed = Color(light: 0x203FB7, dark: 0x96A9F2)
    public static let onActionPressed = Color(light: 0xFFFFFF, dark: 0x18233B)
    public static let actionDisabled = Color(light: 0xE2E6DF, dark: 0x35463A)
    public static let onActionDisabled = Color(light: 0x4F5E55, dark: 0xBAC6BD)
    public static let focusRing = Color(light: 0x284CDB, dark: 0xAFBEFF)
    public static let separator = Color(light: 0xDCE2DA, dark: 0x35463A)
    public static let accent = Color(light: 0xF0E4A8, dark: 0xE4D8A2)
    public static let onAccent = Color(light: 0x182B25, dark: 0x182B25)
    public static let destructive = Color(light: 0xAD3529, dark: 0xFFB4A5)
    public static let inputBorder = Color(light: 0x778579, dark: 0x8C9B90)
    /// The avatar on canvas or surface.
    public static let avatarCanvas = Color(light: 0xE1E5F6, dark: 0x35463A)
    public static let onAvatarCanvas = Color(light: 0x182B25, dark: 0xF7F8F2)
    /// The avatar on any of the six covers.
    public static let avatarOnCover = Color(light: 0x182B25, dark: 0x182B25)
    public static let onAvatarOnCover = Color(light: 0xFAFBF8, dark: 0xFAFBF8)
    /// The Highlight label on a photograph, the same in both themes.
    public static let photoLabel = Color(light: 0xFAFBF8, dark: 0xFAFBF8)
    public static let onPhotoLabel = Color(light: 0x182B25, dark: 0x182B25)
    /// The folded corner's decorative edge, the same in both themes, drawn at `Size.foldLine`.
    public static let foldCornerLine = Color(light: 0x8C8F84, dark: 0x8C8F84)

    /// The six cover colours, in slot order. A sender keeps one slot (FQ41); a cover's colour
    /// never comes from hidden media, popularity or permission (book p6).
    public static let covers: [Cover] = [
        Cover(fill: Color(light: 0xEEDFC4, dark: 0xDFCFB3)),
        Cover(fill: Color(light: 0xE1E5F6, dark: 0xD4D9EC)),
        Cover(fill: Color(light: 0xDFE7D9, dark: 0xD0DCC9)),
        Cover(fill: Color(light: 0xF1DFD6, dark: 0xE5D2C8)),
        Cover(fill: Color(light: 0xDCE9EB, dark: 0xCCDEE1)),
        Cover(fill: Color(light: 0xEADFED, dark: 0xDDCFE2)),
    ]

    /// The cover for a slot, 0 to 5; any other number wraps, so a view never fails on one.
    public static func cover(slot: Int) -> Cover {
        covers[((slot % covers.count) + covers.count) % covers.count]
    }
}

/// A cover colour with its ink, #182B25 in both themes (`onCover1` to `onCover6`), so pale covers
/// keep dark ink (book p35).
public struct Cover: Sendable {
    public let fill: Color
    public let ink = Color(light: 0x182B25, dark: 0x182B25)
}

extension Color {
    /// A colour with a light and a dark value, resolved against the view's appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(
            uiColor: UIColor { traits in
                UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
            })
    }
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
