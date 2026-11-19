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

    @Test func aRefusedMessageChangesNothingAndIsLogged() {
        let viewer = model()
        viewer.open()
        viewer.received(origin: "https://example.com", json: ready, attempt: 1)
        viewer.received(origin: origin, json: #"{"type":"onPlayerReady"}"#, attempt: 1)
        viewer.received(origin: origin, json: #"{"x-tiktok-player":true,"type":"x"}"#, attempt: 1)
        #expect(viewer.phase == .loading)
        #expect(
            viewer.log.suffix(3) == [
                "message refused: origin", "message refused: shape", "message refused: type",
            ])
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
        viewer.decided(.stop, for: .init(url: URL(string: "tiktok://video/1"), mainFrame: true))
        #expect(
            viewer.log == [
                "load 1", "frame stopped: example.com", "frame allowed: www.tiktok.com",
                "new window asked: example.com", "page stopped: video",
            ])
        #expect(!viewer.log.joined().contains("token"))
        for index in 0..<(VideoViewerModel.logLimit + 10) { viewer.note("line \(index)") }
        #expect(viewer.log.count == VideoViewerModel.logLimit)
        #expect(viewer.log.last == "line \(VideoViewerModel.logLimit + 9)")
    }
}
