# B1 · ios · an answer the app can't read keeps its command's key (`ios/b1-unreadable-keeps-key`)

Branch `ios/b1-unreadable-keeps-key`, from `main` at `ed1b036` (#119). Written on 24 November 2026. It fixes the outside audit's finding A8, the first of the three iOS findings the founder said to go ahead with at 10:02 UTC on 2026-11-24 (A8, then A9, then B3). No screen, string or snapshot changes: what changes is which failure an answer becomes, and whether a command's retry sends the same key (T19).

## 1. What fails, checked on `main` at `ed1b036`

`APIFailure.refused` (`packages/swift/TadayoCore/Sources/TadayoCore/Account.swift`) meant two things: the server refused, and the server answered and the app couldn't read the answer.

- `TadayoAPIClient.failure(_:)` (`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`) turned every error that wasn't a session's or the network's into `.refused`. That covers a body that doesn't decode, a missing or changed `Cache-Control`, and an enum value this build doesn't know (the generator makes each enum closed, so a value the contract adds later fails to decode).
- `TadayoAPIClient.failure(status:)` turned a 2xx the operation doesn't document into `.refused` too.
- The mappers in `TadayoAPIClient+Clubs.swift` threw `.refused` for content that breaks the contract. That includes a club, invitation, revision, decision or link state it doesn't know, a date that isn't one, and a link that isn't exactly an invitation link. It also includes a link for another candidate and a revoke answered for another invitation.

Every model that makes an idempotency key keeps it only for `.network` and `.unavailable`, and clears it on any other failure:

- `CreateClubModel.create()`;
- `InviteNameModel.createLinkAndShare()`, for both the proposal's key and the link's;
- `InvitationListModel.make(for:)`;
- `ProfileModel.save(_:)`;
- `InvitationModel.accept()`.

The audit named the first two. The other three have the same shape, so this branch fixes all five. `InviteNameModel.propose()` also cleared its key before checking that the answer adds exactly the person named, then threw `.refused` when it didn't.

The cost: the server deploys on every merge and TestFlight builds lag behind. So one value added to a 201 makes the app say "Couldn't create the club. Try again.", and each tap after that is a new action with a new key. Each one makes another club, proposes the same person again, makes another link or saves again. T19 says the key is created when the action starts and reused on every retry.

## 2. The change

- **`TadayoCore`:** `APIFailure.unreadable` is new: an answer this build couldn't read. That means a success the contract doesn't list, a body or header that doesn't match it, or an answer to something other than what was asked. `refused`'s comment now says what's left: a refusal the contract documents, or an error status it doesn't list.
- **`TadayoAPI`:**
  - `failure(status:)` gives `.unreadable` for a 2xx, `.unavailable` from 500 and `.refused` for any other status.
  - `failure(_:)` gives `.unreadable` for any error that isn't a session's, a `URLError` or a cancellation, when no answer came with it. When the server did answer and the body or a header couldn't be read, the status decides, since it still says what the server did: a 401 is `.signedOut`, a 429 is `.unavailable`, and any other status is read as `failure(status:)` reads one. So only a success is `.unreadable`, and a refusal whose body this build can't read stays `.refused` (round 1's finding 1).
  - Every mapper's contract break throws `.unreadable`.
  - These stay `.refused`: a 400, an error code the operation doesn't document for its status (`failure(_:among:)`), `IDEMPOTENCY_CONFLICT`, an undocumented 4xx, and a 4xx whose body this build can't read (an error code the contract added later, a body that isn't JSON, or no `Cache-Control`).
  - Two answers change from `main` besides the 2xx ones: a 401 whose body can't be read ends the session, as every readable 401 does, and a 429 or 5xx whose body can't be read is `.unavailable`. On `main` both were `.refused`.
- **The five models:** each treats `.unreadable` as it treats `.unavailable`. The failure is `.other` ("… Try again.") and the key is kept, so the retry sends the same key and body. If the server did carry the command out, it replays its first answer. If it didn't, it carries the command out once.
  - `InvitationListModel.make(for:)` doesn't read the list again for it, just as it doesn't for `.unavailable`.
  - `InviteNameModel.propose()` keeps its key until the answer adds exactly the person. If the answer doesn't, it throws `.unreadable`.
- **Reads** carry no key. They show `.unreadable` as they showed `.refused`, through their `default` arms, so nothing they show changes.
- **What the person sees** is the same words as before. While the server keeps answering in a way this build can't read, each retry gets the same failure, and no key is carried out twice. For a club, a proposal, a profile or an acceptance, nothing is made twice either. A link is the exception: if the server keeps sending a link URL outside the contract's pattern, the retry's replay carries no URL, so the model makes one more link under a new key, whose answer is unreadable again. So each tap makes one link, as on `main` (round 1's finding 3). A new build is what fixes it. The lanes' agreement keeps this rare: the app learns an enum value before the server sends it (`ClubCallsTests.everyValueTheContractNamesHasItsOwnCase`).
- **Not changed:**
  - `approve` and `decline` have no model yet (the plan's `ios/b1-approve`). Their calls in `TadayoAPIClient` map the same way, so their model only has to keep its key for `.unreadable` too.
  - `InviteNameModel.makeLink(for:)` still throws `.refused` when the link book can't keep the second call's answer, which has no link.
  - `createDrop` (B2) will follow this pattern.

## 3. Tests, written first

**`TadayoCore`**

Six new tests. Run against the old models with `APIFailure.unreadable` added, all six failed (7 issues); with the change they pass.

- `CreateClubModelTests.anUnreadableAnswerKeepsTheKeyForTheRetry`; `anAnswerAfterTheSessionEndedIsDropped` also covers `.unreadable` now.
- `ProfileModelTests.anUnreadableAnswerKeepsTheKeyAndBody`.
- `InvitationModelTests.anUnreadableAnswerKeepsTheKey`.
- `InvitationListModelTests.anUnreadableLinkAnswerKeepsTheKeyForTheRetry`: the retry's replay, with no link, makes one more link under a new key, and the list isn't read again.
- `InviteNameModelTests.anUnreadableProposalOrLinkKeepsItsKey` and `aProposalAnswerWithoutThePersonKeepsItsKey`.

`CreateClubModelTests.aRefusalKeepsTheNameAndTheNextTapIsANewAction` stays as it was: a refusal still ends its action.

**`TadayoAPI`**

The behaviour these tests check has changed, so five tests are renamed and now expect `.unreadable`:

- `TadayoAPIClientTests.anAnswerThatBreaksTheContractIsRefusedNotTrusted` is now `anAnswerThatBreaksTheContractIsUnreadableNotTrusted`.
- In `ClubCallsTests`:
  - `aDayWhoseDateIsNotADateIsRefused` is now `aDayWhoseDateIsNotADateIsUnreadable`;
  - `aLinkThatIsNotExactlyAnInvitationLinkIsRefused` is now `aLinkThatIsNotExactlyAnInvitationLinkIsUnreadable`;
  - `aLinkForAnotherCandidateIsRefused` is now `aLinkForAnotherCandidateIsUnreadable`;
  - `anAnswerThatBreaksTheContractIsRefused` is now `anAnswerThatBreaksTheContractIsUnreadable`.

New cases:

- the audit's own case, a 201 to `createClub` with a club state this build doesn't know (`archived`);
- an undocumented 200 to `createClub`;
- a 201 to `propose` that isn't a revision;
- a body that isn't JSON in a 200 to `accept`;
- a revoke answered for another invitation;
- in `TadayoAPIClientTests.eachAnswerBecomesItsFailure`, an undocumented 202 to `me` and 204 to `update`;
- `.unreadable` in `aFailureSaysNothingOfTheAnswer` (T52).

The refusals keep their tests as they were (`eachAnswerBecomesItsFailure`, `eachClubAnswerBecomesItsFailure`).

The control: run against `main`'s two client files, six of these tests fail (29 issues), each the old `.refused` where `.unreadable` is expected. The six are `eachAnswerBecomesItsFailure`, the two `anAnswerThatBreaksTheContract…` tests, `aDayWhoseDateIsNotADateIsUnreadable` and the two link tests.

After round 1, for an answer whose body can't be read:

- `TadayoAPIClientTests.anAnswerWhoseBodyCannotBeReadIsReadByItsStatus` is new. It covers a 409 and a 403 with a code the contract doesn't name, a 400 in HTML and a 404 without `Cache-Control` (each `.refused`), a 429 that isn't JSON (`.unavailable`), and a second 401 that isn't JSON (`.signedOut`).
- `ClubCallsTests.eachClubAnswerBecomesItsFailure` gains a 409 to `propose` with a code the contract doesn't name and a 410 to `accept` that isn't JSON, both `.refused`.
- The control: run against the first commit's `TadayoAPIClient.swift` (`1c88186`), both tests fail (8 issues), each `.unreadable` where the status's failure is expected.

## 4. Verification

- In the session (Swift 6.4.2 on Linux):
  - `swift test --package-path packages/swift/TadayoCore`: 505 tests in 30 suites;
  - `swift test --package-path packages/swift/TadayoAPI`: 53 tests in 2 suites;
  - `swift format lint --strict --configuration apps/ios/.swift-format` on both packages.
- The branch's `ios` run, still to read at the PR's head: the app compiles against the new case (no exhaustive `switch` over `APIFailure` in the app), and every test runs on both runtimes with every snapshot matching. The run's id and result go in the journal's section 4.2 row and the PR.
- **Not verifiable here:** a real unreadable answer from `dev`, which would need the server to send one.

## 5. Review

One fresh reviewer, the founder's cap for a lower-risk PR being two rounds. The rounds go here.

**Round 1, at `1c88186`:** no must-fix, two should-fix, three notes. The reviewer reran both controls and got the same counts.

1. Should-fix: a refusal whose body couldn't be read had become `.unreadable`, against the comments and this plan. Fixed: `failure(_:)` reads the status of an answer that came, as section 2 says, with the tests and control in section 3.
2. Should-fix: section 4 claimed the `ios` run before it was read. Fixed: it says the run is still to read.
3. Note: "nothing is made twice" wasn't true for a link whose URL breaks the pattern. Fixed: section 2 now says each tap makes one link then, as on `main`.
4. Note: revoke shows "Couldn't revoke …" for `.unreadable`, though the server may have revoked. No change: it's what `.unavailable` does, revoke carries no key, and the list read after it shows what happened.
5. Note: the journal's T7 row still said `createLinkAndShare` "refuses" an answer with no recognisable person. Fixed: it says the proposal's key is kept.
