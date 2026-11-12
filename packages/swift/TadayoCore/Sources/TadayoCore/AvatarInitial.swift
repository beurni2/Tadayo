/// The initial an avatar draws when a person has no photograph, or none (handoff 7's
/// `avatarWithoutInitial.initialRule`: "First visible grapheme after trimming: a Unicode letter in
/// any script or a decimal digit can be shown. Emoji, symbols, punctuation and unsupported/missing
/// glyphs use person fallback"; the check's D-14 and X-20). With none, the avatar draws the person
/// symbol.
///
/// The words are read as Unicode defines them, on the first visible grapheme cluster's first
/// scalar that draws something (`docs/plans/ios-b0-adopt-handoff-7/gaps.md`, appendix B, run on
/// the Swift that CI pins): a letter is a General_Category of Lu, Ll, Lt, Lm or Lo, and a decimal
/// digit is Nd alone in its cluster. `Character.isLetter` would take a roman numeral (Ⅷ) and a
/// circled letter (ⓐ), `isWholeNumber` a superscript digit (²), and `isNumber` a keycap; and since
/// a digit carries the Emoji property, a cluster is an emoji, and has no initial, when it holds
/// U+FE0F, an enclosing mark (the keycap 1️⃣) or a skin-tone modifier (U+1F3FB to U+1F3FF, which
/// joins the letter before it, so "A🏽" has none). ℹ (U+2139) also carries the Emoji property, but
/// it is a letter by its category, as "3" is a digit, and only its emoji form ℹ️ holds U+FE0F. A
/// mark with nothing to sit on, a letter-number such as Ⅷ and an other-number such as ² have no
/// stated outcome, so they take the fallback, the reading that never draws a character the rule
/// doesn't name.
///
/// "Visible" leaves out what draws nothing: spaces and line breaks, as the name was always
/// trimmed; controls and format characters (U+200B, U+2060, U+FEFF); the code points Unicode says
/// to ignore when drawing (U+034F, U+FE0F); and FQ70's blank fillers (U+115F, U+1160, U+2800,
/// U+3164, U+FFA0), the list the API's own test of a name that shows something uses
/// (`packages/contracts/src/common.ts`, `VISIBLE`). FQ70's default lets a name hold them before a
/// visible character, and they are passed over, so the letter after them is the initial: the
/// contract says "first visible", and no source says such a character ends the rule (the plan's
/// TL-08 lists a leading U+200B as a default, not a source's reading). gaps.md's check of the old
/// trimming (its row on profile.md line 519) found that it passed over U+200B but would have left
/// U+200D, U+2060 and U+FEFF to fall back; this reading treats every character that draws nothing
/// alike. Where one of them starts a cluster that holds a mark or a modifier, the cluster is judged
/// by that mark, so a blank carrying an accent has no initial.
///
/// The delivery's "unsupported/missing glyphs" clause is not read here: no source names the font
/// or what counts as missing (the plan's section 4.2), so a letter the device can't draw shows the
/// font's missing-glyph box until Claude Design says (`design/reference/INVENTORY.md`, Known
/// differences). Capitals as built (`uppercased()`): no source says initials are capitals, nor
/// that they aren't. So one letter can become two or three ("ß" is "SS", "ﬁ" is "FI", a Greek
/// letter with a iota subscript such as "ᾳ" is "ΑΙ"), and a Georgian letter becomes its Mtavruli
/// capital ("ნ" is "Ნ"), where Unicode's mapping for a word's first letter would keep it as typed.
public enum AvatarInitial {
    /// The name's initial in capitals, its whole first visible grapheme ("élodie" is "É"), or nil
    /// where the avatar draws the person symbol.
    public static func of(_ name: String) -> String? {
        guard let first = name.first(where: { !drawsNothing($0) }) else { return nil }
        let scalars = first.unicodeScalars
        guard let lead = scalars.first(where: { !drawsNothing($0) }),
            !scalars.contains(where: makesAnEmoji)
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

    /// Whether a cluster draws nothing: every scalar in it draws nothing.
    static func drawsNothing(_ character: Character) -> Bool {
        character.unicodeScalars.allSatisfy(drawsNothing)
    }

    /// Whether a scalar draws nothing: a space or line break, a control, a format character, one
    /// Unicode says to ignore when drawing, or one of FQ70's blank fillers.
    static func drawsNothing(_ scalar: Unicode.Scalar) -> Bool {
        let properties = scalar.properties
        return properties.isWhitespace || properties.isDefaultIgnorableCodePoint
            || properties.generalCategory == .control
            || properties.generalCategory == .format
            || blankFillers.contains(scalar)
    }

    /// FQ70's blank fillers, as `VISIBLE` lists them: the Hangul fillers, which Unicode also says
    /// to ignore when drawing, and U+2800 BRAILLE PATTERN BLANK, a symbol (So) that draws nothing.
    static let blankFillers: Set<Unicode.Scalar> = [
        "\u{115F}", "\u{1160}", "\u{2800}", "\u{3164}", "\u{FFA0}",
    ]

    /// Whether a scalar makes its cluster an emoji: U+FE0F, an enclosing mark or a skin-tone
    /// modifier.
    static func makesAnEmoji(_ scalar: Unicode.Scalar) -> Bool {
        scalar == "\u{FE0F}" || scalar.properties.generalCategory == .enclosingMark
            || scalar.properties.isEmojiModifier
    }
}
