import { describe, expect, it } from "vitest";
import { lintString } from "./rules.ts";

const rules = (text: string) => lintString(text).map((f) => `${f.rule}:${f.match}`);

describe("T41: one vocabulary", () => {
  it.each([
    ["Sent", "banned-word:Sent"],
    ["Photo sent to Debby", "banned-word:sent"],
    ["Back to the dressing room", "banned-word:dressing room"],
    ["Friday's edition", "banned-word:edition"],
    ["Ready for publication", "banned-word:publication"],
    ["Quota used", "banned-word:Quota"],
    ["Two quotas left", "banned-word:quotas"],
  ])("refuses %j", (text, expected) => {
    expect(rules(text)).toEqual([expected]);
  });

  it.each([
    "Added",
    "Saved to Drafts",
    "Photo opens Friday at 7 AM",
    "Your consent is needed",
    "Present in Memories",
    "A sentence about Friday 6 November",
    "Send a new code",
  ])("lets %j through", (text) => {
    expect(rules(text)).toEqual([]);
  });
});

describe("T42: names, not inferred pronouns", () => {
  it.each([
    ["Her pick", "gendered-pronoun:Her"],
    ["It's his day", "gendered-pronoun:his"],
    ["She added a photo", "gendered-pronoun:She"],
    ["Ask him first", "gendered-pronoun:him"],
    ["He's in Memories", "gendered-pronoun:He"],
    ["Debby chose it herself", "gendered-pronoun:herself"],
  ])("refuses %j", (text, expected) => {
    expect(rules(text)).toEqual([expected]);
  });

  it.each([
    "Debby's pick",
    "Your pick appears first",
    "They added a photo",
    "This is the day",
    "Here it is",
    "The theme",
  ])("lets %j through", (text) => {
    expect(rules(text)).toEqual([]);
  });
});

describe("T43: no exclamation marks", () => {
  it.each(["It's your day!", "Welcome！", "Done‼"])("refuses %j", (text) => {
    expect(rules(text)).toEqual([expect.stringMatching(/^exclamation:/u)]);
  });

  it.each(["It's your day", "Nothing added for this day", "Photo opens Friday at 7 AM."])("lets %j through", (text) => {
    expect(rules(text)).toEqual([]);
  });
});

it("reports every finding in one string", () => {
  expect(rules("Sent to her!")).toEqual(["banned-word:Sent", "gendered-pronoun:her", "exclamation:!"]);
});
