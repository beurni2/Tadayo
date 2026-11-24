import Observation
import SwiftUI
import TadayoCore

/// PROBE ONLY (`ios/b1-opening-probe`, never merged): `Probe`'s trace, kept for the UI tests to
/// read from one accessibility element over the tabs.
@MainActor @Observable final class ProbeTrace {
    static let shared = ProbeTrace()
    var lines: [String] = []

    func note(_ line: String) {
        lines.append(line)
        if lines.count > 90 { lines.removeFirst(lines.count - 90) }
    }
}

/// PROBE ONLY: the trace as one element's label, `probe.trace`, drawn almost invisibly, never hit.
struct ProbeTraceView: View {
    var body: some View {
        Text("·")
            .font(.system(size: 6))
            .opacity(0.05)
            .allowsHitTesting(false)
            .accessibilityLabel(Text(ProbeTrace.shared.lines.joined(separator: " | ")))
            .accessibilityIdentifier("probe.trace")
    }
}
