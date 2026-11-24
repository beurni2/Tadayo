/// PROBE ONLY (`ios/b1-opening-probe`, never merged): a trace of the root invitation's events,
/// which the UI tests print, to find why an accepted invitation's join can stay on
/// "Opening Kitchen table…".
@MainActor public enum Probe {
    public static var note: @MainActor (String) -> Void = { _ in }

    public static func id(_ object: AnyObject?) -> String {
        guard let object else { return "nil" }
        return String(UInt(bitPattern: ObjectIdentifier(object).hashValue) & 0xFFFF, radix: 16)
    }

    public static func short(_ value: Any, _ length: Int = 28) -> String {
        String(String(describing: value).prefix(length))
    }
}
