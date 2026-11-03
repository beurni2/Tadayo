import SwiftUI

/// The book's one recurring detail: a rounded shape whose top-right corner is folded (book p6,
/// p34). The fold is decorative, never a separate action (handoff 0's brand-components).
public struct FoldedShape: Shape {
    public var radius: CGFloat
    public var fold: CGFloat

    public init(radius: CGFloat, fold: CGFloat = Size.fold) {
        self.radius = radius
        self.fold = fold
    }

    public func path(in rect: CGRect) -> Path {
        let r = min(radius, rect.width / 2, rect.height / 2)
        let f = min(fold, rect.width - r, rect.height - r)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - f, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + f))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addArc(
            center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r,
            startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r,
            startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r,
            startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }
}

/// The fold's edge: down the cut corner's width, then across to the side, as handoff 0 draws it.
struct FoldLine: Shape {
    var fold: CGFloat = Size.fold

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX - fold, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - fold, y: rect.minY + fold))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + fold))
        return path
    }
}

extension View {
    /// Fills the view's background with a cover in the folded shape, with the fold's edge.
    func foldedBackground(_ cover: Cover, radius: CGFloat) -> some View {
        background {
            ZStack {
                FoldedShape(radius: radius).fill(cover.fill)
                FoldLine().stroke(Palette.foldCornerLine, lineWidth: Size.foldLine)
            }
            .accessibilityHidden(true)
        }
    }
}
