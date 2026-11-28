import SwiftUI

/// Two views: the first at the top, the second at the bottom, at least `spacing` apart, in at
/// least `minHeight`. The whole grows with its content, so a card keeps its minimum height at the
/// default text size and its footer at the bottom, and grows at larger sizes (book p34). Welcome
/// pins its routes so to the foot of a screen its column doesn't fill (`A01-welcome`).
public struct PinnedFooterLayout: Layout {
    var minHeight: CGFloat
    var spacing: CGFloat

    public init(minHeight: CGFloat, spacing: CGFloat) {
        self.minHeight = minHeight
        self.spacing = spacing
    }

    public func sizeThatFits(
        proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) -> CGSize {
        let width = proposal.width
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
        let content = sizes.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, sizes.count - 1))
        return CGSize(
            width: width ?? sizes.map(\.width).max() ?? 0, height: max(minHeight, content))
    }

    public func placeSubviews(
        in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) {
        guard let top = subviews.first else { return }
        let proposed = ProposedViewSize(width: bounds.width, height: nil)
        top.place(at: CGPoint(x: bounds.minX, y: bounds.minY), proposal: proposed)
        guard subviews.count > 1, let bottom = subviews.last else { return }
        let height = bottom.sizeThatFits(proposed).height
        bottom.place(at: CGPoint(x: bounds.minX, y: bounds.maxY - height), proposal: proposed)
    }
}
