import SwiftUI

/// A person's photograph in a circle, or, with none, their initial on the fallback colours for
/// where it sits (spec 29's A03; brand revision 1.1's avatar placement: canvas or surface, or any
/// of the six covers). Decorative: the name beside it is what VoiceOver reads.
public struct Avatar: View {
    /// What the avatar sits on, which picks its fallback colours.
    public enum Placement: Sendable {
        case canvas, cover
    }

    let name: String
    let photo: Image?
    let size: AvatarSize
    let placement: Placement
    /// The circle grows with the text, as its initial does, so the initial always fits inside it
    /// (book p26, T47).
    @ScaledMetric private var diameter: CGFloat

    public init(
        name: String, photo: Image? = nil, size: AvatarSize, on placement: Placement = .canvas
    ) {
        self.name = name
        self.photo = photo
        self.size = size
        self.placement = placement
        _diameter = ScaledMetric(
            wrappedValue: size.rawValue, relativeTo: Avatar.role(for: size).textStyle)
    }

    public var body: some View {
        Group {
            if let photo {
                photo.resizable().scaledToFill()
            } else {
                Text(Avatar.initial(of: name))
                    .textRole(Avatar.role(for: size))
                    .foregroundStyle(
                        placement == .cover ? Palette.onAvatarOnCover : Palette.onAvatarCanvas
                    )
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(placement == .cover ? Palette.avatarOnCover : Palette.avatarCanvas)
            }
        }
        .frame(width: diameter, height: diameter)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    static func role(for size: AvatarSize) -> TypeRole {
        switch size {
        case .profile: .avatarProfile
        case .row: .avatarRow
        case .card: .avatarCard
        case .rail: .avatarRail
        }
    }

    /// The first character of the name, as a person reads it (a whole grapheme, so "Élodie" is
    /// "É"), in capitals.
    static func initial(of name: String) -> String {
        guard let first = name.trimmingCharacters(in: .whitespacesAndNewlines).first else {
            return ""
        }
        return String(first).uppercased()
    }
}
