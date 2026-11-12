import Testing

@testable import TadayoCore

/// The avatar's initial, or the person symbol where there is none (`AvatarInitial.of`; the plan's
/// TL-08, from handoff 7's `avatarWithoutInitial.initialRule` and the check's D-14 and X-20). The
/// fixtures are the contract's own words: a letter in any script or a decimal digit gives an
/// initial; emoji, symbols, punctuation and a name with nothing visible give none. The cases no
/// source decides (a superscript digit, a roman numeral, a circled letter, a leading U+200B or
/// blank filler) are marked as this slice's defaults.
@Suite struct AvatarInitialTests {
    @Test func aLetterInAnyScriptIsTheInitialInCapitals() {
        #expect(AvatarInitial.of("Ben") == "B")
        #expect(AvatarInitial.of("élodie") == "É")
        #expect(AvatarInitial.of("日本") == "日")
        #expect(AvatarInitial.of("Ørjan") == "Ø")
        #expect(AvatarInitial.of("한결") == "한")
        // A modifier letter (Lm) is a letter.
        #expect(AvatarInitial.of("ʰa") == "ʰ")
        // ℹ carries the Emoji property but is a letter (Ll); its emoji form holds U+FE0F.
        #expect(AvatarInitial.of("\u{2139}") == "\u{2139}")
        #expect(AvatarInitial.of("\u{2139}\u{FE0F}") == nil)
    }

    /// The whole first grapheme, mark and all: "e" with a combining acute (U+0301) is "É", as
    /// the precomposed letter is.
    @Test func aCombiningMarkStaysWithItsLetter() {
        let initial = AvatarInitial.of("e\u{301}lodie")
        #expect(initial == "É")
        #expect(initial?.unicodeScalars.count == 2)
    }

    @Test func aDecimalDigitInAnyScriptIsTheInitial() {
        #expect(AvatarInitial.of("3D") == "3")
        #expect(AvatarInitial.of("\u{663}") == "\u{663}")
    }

    @Test func emojiSymbolsAndPunctuationHaveNone() {
        #expect(AvatarInitial.of("\u{1F600}") == nil)
        // A keycap: a digit, U+FE0F and the enclosing keycap mark, one grapheme.
        #expect(AvatarInitial.of("1\u{FE0F}\u{20E3}") == nil)
        #expect(AvatarInitial.of("\u{1F1EF}\u{1F1F5}") == nil)
        #expect(AvatarInitial.of("\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}") == nil)
        // A digit with U+FE0F is an emoji's form of it.
        #expect(AvatarInitial.of("3\u{FE0F}") == nil)
        // A skin-tone modifier joins the letter before it, and draws as a swatch of colour.
        #expect(AvatarInitial.of("A\u{1F3FD}") == nil)
        #expect(AvatarInitial.of("a\u{1F3FD}na") == nil)
        for name in ["-", "(", "@", "#Ben", "*"] {
            #expect(AvatarInitial.of(name) == nil, "\(name)")
        }
    }

    @Test func aNameWithNothingVisibleHasNone() {
        #expect(AvatarInitial.of("") == nil)
        #expect(AvatarInitial.of("   ") == nil)
        #expect(AvatarInitial.of("\n\t") == nil)
        #expect(AvatarInitial.of("\u{200B}") == nil)
        // FQ70's blank fillers alone.
        for filler in ["\u{115F}", "\u{1160}", "\u{2800}", "\u{3164}", "\u{FFA0}"] {
            #expect(AvatarInitial.of(filler) == nil, "\(filler.unicodeScalars.map(\.value))")
        }
        // A mark with nothing to sit on.
        #expect(AvatarInitial.of("\u{301}") == nil)
        #expect(AvatarInitial.of("\u{301}Ben") == nil)
    }

    /// Spaces and line breaks around the name are passed over, as before.
    @Test func theNameIsReadFromItsFirstVisibleCharacter() {
        #expect(AvatarInitial.of("  ben") == "B")
        #expect(AvatarInitial.of("\nben ") == "B")
    }

    /// The defaults where no source decides, the fallback unless the character is a letter or a
    /// decimal digit by Unicode's own category: a superscript digit (No), a roman numeral (Nl),
    /// which `Character.isLetter` would take, and a circled letter (So), which it would take too.
    @Test func numbersThatArentDecimalDigitsAndLetterlikeSymbolsHaveNone() {
        #expect(AvatarInitial.of("²") == nil)
        #expect(AvatarInitial.of("Ⅷ") == nil)
        #expect(AvatarInitial.of("ⓐ") == nil)
        // A digit with a combining mark is no longer a digit alone in its grapheme.
        #expect(AvatarInitial.of("3\u{301}") == nil)
    }

    /// The default for what draws nothing before the first visible character (FQ70 lets a name
    /// hold one): passed over, as "first visible grapheme" reads, so the letter after it is the
    /// initial.
    @Test func charactersThatDrawNothingAreSkipped() {
        for invisible in ["\u{200B}", "\u{200D}", "\u{2060}", "\u{FEFF}", "\u{FE0F}", "\u{034F}"] {
            #expect(
                AvatarInitial.of(invisible + "Ben") == "B",
                "\(invisible.unicodeScalars.map(\.value))")
        }
        // FQ70's blank fillers, U+2800 a symbol (So) that Unicode doesn't say to ignore.
        for filler in ["\u{115F}", "\u{1160}", "\u{2800}", "\u{3164}", "\u{FFA0}"] {
            #expect(
                AvatarInitial.of(filler + "Ben") == "B", "\(filler.unicodeScalars.map(\.value))")
        }
    }

    /// A cluster that starts with a blank is judged by the first scalar in it that draws
    /// something: an accent or a skin-tone modifier on a blank has no initial, as a mark with
    /// nothing to sit on hasn't, and a Hangul vowel after the leading filler is a letter.
    @Test func aBlankThatCarriesSomethingIsJudgedByWhatItCarries() {
        #expect(AvatarInitial.of("\u{3164}\u{301}Ben") == nil)
        #expect(AvatarInitial.of("\u{115F}\u{301}Ben") == nil)
        #expect(AvatarInitial.of("\u{2800}\u{301}Ben") == nil)
        #expect(AvatarInitial.of("\u{3164}\u{1F3FD}Ben") == nil)
        #expect(AvatarInitial.of("\u{115F}\u{1161}") == "\u{115F}\u{1161}")
    }

    /// Capitals as built: one letter can become two, and a Georgian letter becomes its Mtavruli
    /// capital.
    @Test func capitalsAsBuilt() {
        #expect(AvatarInitial.of("ßen") == "SS")
        #expect(AvatarInitial.of("\u{10DC}\u{10D8}\u{10DC}\u{10DD}") == "\u{1C9C}")
    }
}
