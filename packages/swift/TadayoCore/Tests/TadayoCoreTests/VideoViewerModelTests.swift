import Foundation
import Testing

@testable import TadayoCore

/// The viewer's states (`VideoViewerModel`; spec 17's table; T39: "One active player, created
/// only on a tap; paused on close, backgrounding and navigation, then released").
@MainActor @Suite struct VideoViewerModelTests {
    private let origin = "https://www.tiktok.com"
    private let ready = #"{"x-tiktok-player":true,"type":"onPlayerReady"}"#

    private func model() -> VideoViewerModel {
        VideoViewerModel(post: TikTokPost(link: "https://www.tiktok.com/@a/video/123")!)
    }

    private func state(_ value: Int) -> String {
        #"{"x-tiktok-player":true,"type":"onStateChange","value":\#(value)}"#
    }

    private func error(_ code: Int) -> String {
        #"{"x-tiktok-player":true,"type":"onPlayerError","value":{"errorCode":\#(code),"errorType":"E"}}"#
    }

    @Test func nothingLoadsBeforeTheTap() {
        let viewer = model()
        #expect(viewer.phase == .idle)
        #expect(!viewer.showsPlayer)
        // Nothing but the tap starts it: a message, a failure and a timeout change nothing.
        viewer.received(origin: origin, json: ready, attempt: 0)
        viewer.loadFailed(offline: true, attempt: 0)
        viewer.timedOut(attempt: 0)
        viewer.playerEnded(attempt: 0)
        viewer.retry()
        #expect(viewer.phase == .idle)
        #expect(viewer.attempt == 0)
    }

    @Test func theTapLoadsAndThePlayersWordEndsTheLoadingShell() {
        let viewer = model()
        viewer.open()
        #expect(viewer.phase == .loading)
        #expect(viewer.showsPlayer)
        #expect(viewer.attempt == 1)
        viewer.open()
        #expect(viewer.attempt == 1)
        viewer.received(origin: origin, json: ready, attempt: 1)
        #expect(viewer.phase == .ready(.initial))
        viewer.received(origin: origin, json: state(1), attempt: 1)
        #expect(viewer.phase == .ready(.playing))
        // A late "ready" doesn't take the playing state back.
        viewer.received(origin: origin, json: ready, attempt: 1)
        #expect(viewer.phase == .ready(.playing))
        viewer.received(origin: origin, json: state(2), attempt: 1)
        #expect(viewer.phase == .ready(.paused))
        // Once the player has answered, the timeout no longer applies.
        viewer.timedOut(attempt: 1)
        #expect(viewer.phase == .ready(.paused))
    }

    @Test func aStateAloneAlsoEndsTheLoadingShell() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: state(3), attempt: 1)
        #expect(viewer.phase == .ready(.buffering))
    }

    @Test func aMessageFromAnotherOriginChangesNothingAndIsLogged() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: "https://example.com", json: ready, attempt: 1)
        viewer.received(origin: "https://example.com", json: #""[tea-sdk]ready""#, attempt: 1)
        viewer.received(origin: "null", json: state(1), attempt: 1)
        #expect(viewer.phase == .loading)
        #expect(
            viewer.log.suffix(3) == [
                "message refused: origin", "message refused: origin", "message refused: origin",
            ])
        viewer.timedOut(attempt: 1)
        #expect(viewer.phase == .failed(.timeout))
    }

    /// What CI's simulator saw of the real player on 2026-11-20: it drew itself and sent no
    /// `onPlayerReady`, only `"[tea-sdk]ready"`, a string. Anything from TikTok's origin says
    /// the player's page is there, so the loading shell ends and the timeout no longer applies;
    /// the message is still refused, and a refused message moves nothing once the player shows.
    @Test(arguments: [
        (#""[tea-sdk]ready""#, "shape"), (#"{"type":"onPlayerReady"}"#, "shape"),
        (#"{"x-tiktok-player":true,"type":"x"}"#, "type"),
        (#"{"x-tiktok-player":true,"type":"onStateChange","value":9}"#, "value"),
    ])
    func aRefusedMessageFromThePlayersOriginEndsTheLoadingShell(json: String, refusal: String) {
        let viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: json, attempt: 1)
        #expect(viewer.phase == .ready(.initial))
        #expect(viewer.log.suffix(2) == ["message refused: \(refusal)", "player page answered"])
        viewer.timedOut(attempt: 1)
        #expect(viewer.phase == .ready(.initial))
        viewer.received(origin: origin, json: state(1), attempt: 1)
        viewer.received(origin: origin, json: json, attempt: 1)
        #expect(viewer.phase == .ready(.playing))
        #expect(viewer.log.last == "message refused: \(refusal)")
    }

    /// The real player's words for a post that doesn't exist, as CI's simulator read them on
    /// 2026-11-20, in their order: the deprecated `onError` first, which decides nothing, then
    /// `onPlayerError` 1001.
    @Test func theDeprecatedErrorWaitsForThePlayersOwn() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: #""[tea-sdk]ready""#, attempt: 1)
        viewer.received(
            origin: origin, json: #"{"type":"onError","value":1,"x-tiktok-player":true}"#,
            attempt: 1)
        #expect(viewer.phase == .ready(.initial))
        #expect(viewer.log.last == "message onError")
        viewer.received(
            origin: origin,
            json:
                #"{"type":"onPlayerError","value":{"errorCode":1001,"errorType":"INVALID_VIDEO"},"x-tiktok-player":true}"#,
            attempt: 1)
        #expect(viewer.phase == .failed(.unavailable))
        // And alone, while loading: it ends the loading shell like any word of the player's,
        // and fails nothing.
        let other = model()
        other.open()
        other.received(
            origin: origin, json: #"{"type":"onError","value":4,"x-tiktok-player":true}"#,
            attempt: 1)
        #expect(other.phase == .ready(.initial))
    }

    @Test func eachFailureHasItsState() {
        var viewer = model()
        viewer.open()
        viewer.timedOut(attempt: 1)
        #expect(viewer.phase == .failed(.timeout))
        #expect(!viewer.showsPlayer)

        viewer = model()
        viewer.open()
        viewer.loadFailed(offline: true, attempt: 1)
        #expect(viewer.phase == .failed(.network))

        viewer = model()
        viewer.open()
        viewer.loadFailed(offline: false, attempt: 1)
        #expect(viewer.phase == .failed(.cannotPlay))

        viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: error(1001), attempt: 1)
        #expect(viewer.phase == .failed(.unavailable))

        viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: ready, attempt: 1)
        viewer.received(origin: origin, json: error(3001), attempt: 1)
        #expect(viewer.phase == .failed(.cannotPlay))

        viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: state(1), attempt: 1)
        viewer.playerEnded(attempt: 1)
        #expect(viewer.phase == .failed(.cannotPlay))
    }

    /// The viewer never asks the player to start by itself, so its autoplay error is no failure.
    @Test func theAutoplayErrorIsNoFailure() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: ready, attempt: 1)
        viewer.received(origin: origin, json: error(3002), attempt: 1)
        #expect(viewer.phase == .ready(.initial))
    }

    @Test func retryIsANewLoadAndTheOldOnesWordsAreIgnored() {
        let viewer = model()
        viewer.open()
        viewer.timedOut(attempt: 1)
        viewer.retry()
        #expect(viewer.phase == .loading)
        #expect(viewer.attempt == 2)
        viewer.received(origin: origin, json: ready, attempt: 1)
        viewer.loadFailed(offline: true, attempt: 1)
        viewer.timedOut(attempt: 1)
        viewer.playerEnded(attempt: 1)
        #expect(viewer.phase == .loading)
        viewer.received(origin: origin, json: ready, attempt: 2)
        #expect(viewer.phase == .ready(.initial))
        // Retry is for a failure only.
        viewer.retry()
        #expect(viewer.attempt == 2)
    }

    @Test func closeEndsItFromAnyStateAndNothingArrivesAfter() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: origin, json: state(1), attempt: 1)
        viewer.close()
        #expect(viewer.phase == .idle)
        #expect(!viewer.showsPlayer)
        viewer.received(origin: origin, json: state(1), attempt: 1)
        viewer.loadFailed(offline: false, attempt: 1)
        #expect(viewer.phase == .idle)
        // A second viewing is a new tap and a new load.
        viewer.open()
        #expect(viewer.attempt == 2)
    }

    @Test func thePersonIsAskedOnceBeforeLeaving() {
        let viewer = model()
        viewer.open()
        let first = URL(string: "https://www.tiktok.com/@a/video/123")!
        let second = URL(string: "https://example.com/")!
        viewer.decided(.ask(first), for: .init(url: first, mainFrame: true))
        #expect(viewer.leaving == first)
        // A second address while the first is asked is stopped, not queued.
        viewer.decided(.ask(second), for: .init(url: second, mainFrame: false, newWindow: true))
        #expect(viewer.leaving == first)
        #expect(viewer.answerLeaving(leave: false) == nil)
        #expect(viewer.leaving == nil)
        viewer.decided(.ask(second), for: .init(url: second, mainFrame: true))
        #expect(viewer.answerLeaving(leave: true) == second)
        #expect(viewer.leaving == nil)
        #expect(viewer.answerLeaving(leave: true) == nil)
    }

    @Test func nothingIsAskedOnceTheViewerIsClosed() {
        let viewer = model()
        viewer.open()
        viewer.close()
        let url = URL(string: "https://example.com/")!
        viewer.decided(.ask(url), for: .init(url: url, mainFrame: true))
        #expect(viewer.leaving == nil)
        // Close also drops a question that was showing.
        viewer.open()
        viewer.decided(.ask(url), for: .init(url: url, mainFrame: true))
        viewer.close()
        #expect(viewer.leaving == nil)
    }

    /// The log names hosts and message types, never a path or a query, and keeps its newest
    /// lines.
    @Test func theLogHoldsHostsOnlyAndIsBounded() {
        let viewer = model()
        viewer.open()
        let secret = URL(string: "https://example.com/private/path?token=abc")!
        viewer.decided(.stop, for: .init(url: secret, mainFrame: false))
        viewer.decided(.allow, for: .init(url: viewer.post.player, mainFrame: false))
        viewer.decided(.ask(secret), for: .init(url: secret, mainFrame: false, newWindow: true))
        // Another scheme's "host" is whatever the page wrote, an id here: the scheme alone is
        // logged. A host and a scheme are cut short.
        viewer.decided(
            .stop, for: .init(url: URL(string: "tiktok://6718335390845095173/x"), mainFrame: true))
        let long = String(repeating: "a", count: 400)
        viewer.decided(
            .stop, for: .init(url: URL(string: "https://\(long).example/"), mainFrame: false))
        viewer.decided(.stop, for: .init(url: URL(string: "\(long)://x"), mainFrame: true))
        #expect(
            viewer.log == [
                "load 1", "frame stopped: example.com", "frame allowed: www.tiktok.com",
                "new window asked: example.com", "page stopped: tiktok",
                "frame stopped: " + String(repeating: "a", count: VideoViewerModel.hostLimit),
                "page stopped: " + String(repeating: "a", count: VideoViewerModel.schemeLimit),
            ])
        #expect(!viewer.log.joined().contains("token"))
        #expect(!viewer.log.joined().contains("6718335390845095173"))
        for index in 0..<(VideoViewerModel.logLimit + 10) { viewer.note("line \(index)") }
        #expect(viewer.log.count == VideoViewerModel.logLimit)
        #expect(viewer.log.last == "line \(VideoViewerModel.logLimit + 9)")
    }
}
