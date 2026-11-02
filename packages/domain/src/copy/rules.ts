// The copy lint's rules (docs/INVARIANTS.md T41 to T43; docs/MILESTONES.md, B0).
// Each rule looks at one piece of system copy: a string the app, the web pages or a push
// shows. People's own words (captions, comments, names) never pass through here.

export type CopyRule = "banned-word" | "gendered-pronoun" | "exclamation";

export interface CopyFinding {
  rule: CopyRule;
  /** The text that broke the rule, as it appears in the string. */
  match: string;
  message: string;
}

// T41: never Dressing room, Edition, Publication, Quota or Sent. "Sent" is banned in every
// form a drop state could take ("Sent", "sent to Debby"), so copy says "Added" or names
// the action instead ("We emailed a code").
const BANNED_WORDS = /\b(dressing[\s-]+rooms?|editions?|publications?|quotas?|sent)\b/giu;

// T42: system copy uses the person's name, never a pronoun that infers a gender
// ("Debby's pick", not "Her pick").
const GENDERED_PRONOUNS = /\b(he|him|his|himself|she|her|hers|herself)\b/giu;

// T43: the voice is plain; no staged enthusiasm. Covers the ASCII mark, the full-width
// and the doubled forms.
const EXCLAMATION = /[!！‼]/gu;

export function lintString(text: string): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const m of text.matchAll(BANNED_WORDS)) {
    findings.push({
      rule: "banned-word",
      match: m[0],
      message: `"${m[0]}" is outside the vocabulary (T41): use spec 03's nouns, and "Added" for a committed drop`,
    });
  }
  for (const m of text.matchAll(GENDERED_PRONOUNS)) {
    findings.push({
      rule: "gendered-pronoun",
      match: m[0],
      message: `"${m[0]}" infers a gender (T42): use the person's name`,
    });
  }
  for (const m of text.matchAll(EXCLAMATION)) {
    findings.push({
      rule: "exclamation",
      match: m[0],
      message: "No exclamation marks in system copy (T43)",
    });
  }
  return findings;
}
