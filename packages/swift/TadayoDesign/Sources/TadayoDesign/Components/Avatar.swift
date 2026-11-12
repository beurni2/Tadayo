import SwiftUI
import TadayoCore

/// A person's photograph in a circle, or, with none, their initial on the fallback colours for
/// where it sits (spec 29's A03; brand revision 1.1's avatar placement: canvas or surface, or any
/// of the six covers). Where the name gives no initial (`AvatarInitial`: it doesn't start with a
/// letter or a decimal digit, or nothing is typed yet), the outlined SF Symbol `person` at 56
/// percent of the circle, in the same ink on the same fill (handoff 7's `avatarWithoutInitial`;
/// the check's D-14 and X-20). Decorative: the name beside it is what VoiceOver reads, so the
/// symbol isn't read either, neither as "person" nor as "No profile photo", which no contract
/// gives an element yet (the check's WM-04).
///
/// It keeps its size at every text size, initial and symbol included, while the name beside it
/// grows (handoff 4's `dynamicTypePolicy.avatarMarks`). A photograph has a 1-point `separator`
/// edge just outside its circle, in both themes (handoff 3's `photoAvatarEdge`).
public struct Avatar: View {
    /// What the avatar sits on, which picks its fallback colours.
    public enum Placement: Sendable {
        case canvas, cover
    }

    let name: String
    let photo: Image?
    let size: AvatarSize
    let placement: Placement

    public init(
        name: String, photo: Image? = nil, size: AvatarSize, on placement: Placement = .canvas
    ) {
        self.name = name
        self.photo = photo
        self.size = size
        self.placement = placement
    }

    public var body: some View {
        let role = Avatar.role(for: size)
        Group {
            if let photo {
                photo.resizable().scaledToFill()
            } else {
                mark(role)
                    .foregroundStyle(
                        placement == .cover ? Palette.onAvatarOnCover : Palette.onAvatarCanvas
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(placement == .cover ? Palette.avatarOnCover : Palette.avatarCanvas)
            }
        }
        .frame(width: size.rawValue, height: size.rawValue)
        .clipShape(Circle())
        .overlay {
            if photo != nil {
                Circle()
                    .strokeBorder(Palette.separator, lineWidth: Size.photoAvatarEdge)
                    .padding(-Size.photoAvatarEdge)
            }
        }
        .accessibilityHidden(true)
    }

    /// The initial in the size's type role, or, with none, the person symbol: the symbol's point
    /// size is 56 percent of the circle, at the regular weight every symbol here has, its middle
    /// 4 percent of the circle above the circle's, as handoff 7's sheet and frame 10 draw it at
    /// every size.
    @ViewBuilder private func mark(_ role: TypeRole) -> some View {
        if let initial = AvatarInitial.of(name) {
            Text(verbatim: initial)
                .font(.system(size: role.size, weight: role.weight))
                .lineLimit(1)
        } else {
            Image(systemName: "person")
                .font(.system(size: size.rawValue * Size.avatarGlyphRatio, weight: .regular))
                .offset(y: -size.rawValue * Size.avatarGlyphLift)
        }
    }

    static func role(for size: AvatarSize) -> TypeRole {
        switch size {
        case .profile: .avatarProfile
        case .row: .avatarRow
        case .card: .avatarCard
        case .rail: .avatarRail
        }
    }
}
