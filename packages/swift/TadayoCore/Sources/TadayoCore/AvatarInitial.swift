/// The initial an avatar draws when a person has no photograph, or none (handoff 7's
/// `avatarWithoutInitial.initialRule`: "First visible grapheme after trimming: a Unicode letter in
/// any script or a decimal digit can be shown. Emoji, symbols, punctuation and unsupported/missing
/// glyphs use person fallback"; the check's D-14 and X-20). With none, the avatar draws the person
/// symbol.
///
/// The words are read as Unicode defines them, on the first visible grapheme cluster's first
/// scalar (`docs/plans/ios-b0-adopt-handoff-7/gaps.md`, appendix B, run on the Swift that CI
/// pins): a letter is a General_Category of Lu, Ll, Lt, Lm or Lo, and a decimal digit is Nd alone
/// in its cluster. `Character.isLetter` would take a roman numeral (Ⅷ) and a circled letter (ⓐ),
/// `isWholeNumber` a superscript digit (²), and `isNumber` a keycap; and since a digit carries the
/// Emoji property, a cluster is an emoji, and has no initial, when it holds U+FE0F or an
/// enclosing mark (the keycap 1️⃣). A mark with nothing to sit on, a letter-number such as Ⅷ and
/// an other-number such as ² have no stated outcome, so they take the fallback, the reading that
/// never draws a character the rule doesn't name.
///
/// "Visible" leaves out what draws nothing: spaces and line breaks, as the name was always
/// trimmed, and also controls, format characters (U+200B) and the code points Unicode says to
/// ignore when drawing (U+034F, U+FE0F, the Hangul fillers), which FQ70's default lets a name hold
/// before a visible character; the contract says "first visible", and no source says such a
/// character ends the rule (the plan's TL-08: a default, not a source's reading).
///
/// The delivery's "unsupported/missing glyphs" clause is not read here: no source names the font
/// or what counts as missing (the plan's section 4.2), so a letter the device can't draw shows the
/// font's missing-glyph box until Claude Design says (`design/reference/INVENTORY.md`, Known
/// differences). Capitals as built (`uppercased()`, so "ß" is "SS"): no source says initials are
/// capitals, nor that they aren't.
public enum AvatarInitial {
    /// The name's initial in capitals, its whole first visible grapheme ("élodie" is "É"), or nil
    /// where the avatar draws the person symbol.
    public static func of(_ name: String) -> String? {
        guard let first = name.first(where: { !drawsNothing($0) }) else { return nil }
        let scalars = first.unicodeScalars
        guard let lead = scalars.first,
            !scalars.contains(where: {
                $0 == "\u{FE0F}" || $0.properties.generalCategory == .enclosingMark
            })
        else { return nil }
        switch lead.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter:
            return String(first).uppercased()
        case .decimalNumber where scalars.count == 1:
            return String(first)
        default:
            return nil
        }
    }

    /// Whether a cluster draws nothing: every scalar in it a space or line break, a control, a
    /// format character, or one Unicode says to ignore when drawing.
    static func drawsNothing(_ character: Character) -> Bool {
        character.unicodeScalars.allSatisfy { scalar in
            let properties = scalar.properties
            return properties.isWhitespace || properties.isDefaultIgnorableCodePoint
                || properties.generalCategory == .control
                || properties.generalCategory == .format
        }
    }
}
