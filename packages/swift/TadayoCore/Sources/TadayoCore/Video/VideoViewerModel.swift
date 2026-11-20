import Foundation
import Observation

/// The video viewer's state (screen E01; spec 17's table; T39). One model is one viewing of one
/// post: nothing loads until `open()` (the tap), the player's messages and the web view's
/// failures move it, and `close()` ends it, after which the view holds no web view.
///
/// Spike S3 builds it for the Lab, to learn how TikTok's player behaves in the isolated web
/// view; B7 puts the product's screen on it.
@MainActor @Observable public final class VideoViewerModel {
    public enum Failure: Sendable, Equatable {
        /// The player says the video is gone or can't be shown (TikTok's 1001).
        case unavailable
        /// The player failed for another reason, or its page didn't load.
        case cannotPlay
        /// No answer came in time.
        case timeout
        /// The device is offline, or the connection dropped.
        case network
    }

    public enum Phase: Sendable, Equatable {
        /// Before the tap, and after Close: no web view exists.
        case idle
        /// The fixed-size shell with Close, until the player's page answers.
        case loading
        /// The player is in place, with its own controls.
        case ready(PlayerMessage.Playback)
        case failed(Failure)
    }

    /// The two of TikTok's error codes the viewer tells apart ("Player Error Reporting"):
    /// 1001, INVALID_VIDEO, "Invalid Media ID, no video/photo found", and 3002, AUTOPLAY_ERROR.
    /// 2001, SERVER_ERROR, and 3001, PLAYBACK_ERROR, are failures to play.
    public enum ErrorCode {
        public static let invalidVideo = 1001
        public static let autoplay = 3002
    }

    public let post: TikTokPost
    public private(set) var phase = Phase.idle
    /// Counts each load, so the view makes a new web view for each and an old load's timeout or
    /// late message can be told from the present one's.
    public private(set) var attempt = 0
    /// The address the person is being asked about leaving Tadayo for, while the question shows.
    public private(set) var leaving: URL?
    /// What happened, newest last, for the spike's report: at most `logLimit` lines, with hosts
    /// and message types only, never a whole address.
    public private(set) var log: [String] = []
    public static let logLimit = 200

    public init(post: TikTokPost) {
        self.post = post
    }

    /// Whether the view holds a web view: from the tap until Close, a failure or a retry's start.
    public var showsPlayer: Bool {
        switch phase {
        case .loading, .ready: true
        case .idle, .failed: false
        }
    }

    /// The tap: the only way a player is made.
    public func open() {
        guard phase == .idle else { return }
        begin()
    }

    /// Retry, from a failure.
    public func retry() {
        guard case .failed = phase else { return }
        begin()
    }

    private func begin() {
        attempt += 1
        phase = .loading
        note("load \(attempt)")
    }

    /// Close: the view pauses the player and lets the web view go.
    public func close() {
        phase = .idle
        leaving = nil
        note("close")
    }

    /// The loading shell waited `VideoViewerModel.timeout` for `attempt` with no ready player.
    public func timedOut(attempt: Int) {
        guard attempt == self.attempt, phase == .loading else { return }
        fail(.timeout)
    }

    /// How long the loading shell waits for the player to say it is ready. A first value for the
    /// spike, which records how long the player takes.
    public static let timeout = Duration.seconds(20)

    /// One message from the shell, for `attempt`: read, logged, and acted on when it is the
    /// player's.
    public func received(origin: String, json: String, attempt: Int) {
        guard attempt == self.attempt, showsPlayer else { return }
        switch PlayerMessage.read(origin: origin, json: json) {
        case .failure(.origin):
            note("message refused: \(PlayerMessage.Refusal.origin.rawValue)")
        case .failure(let refusal):
            note("message refused: \(refusal.rawValue)")
            answered()
        case .success(let message):
            apply(message)
            if showsPlayer { answered() }
        }
    }

    /// Anything TikTok's origin posts from the player's frame, whatever its shape, says the
    /// player's page is there, so it ends the loading shell as `onPlayerReady` does. From CI's
    /// simulator on 2026-11-20 the player drew itself and never sent `onPlayerReady`, only a
    /// message of another shape (`docs/plans/ios-b0-spike-video.md`, section 5); without this
    /// the timeout would take a player that works off the screen. Such a message is still
    /// refused and still moves nothing else.
    private func answered() {
        guard phase == .loading else { return }
        phase = .ready(.initial)
        note("player page answered")
    }

    private func apply(_ message: PlayerMessage) {
        switch message {
        case .ready:
            note("message onPlayerReady")
            if phase == .loading { phase = .ready(.initial) }
        case .state(let playback):
            note("message onStateChange \(playback.rawValue)")
            // A state is the player's word that it runs, so it also ends the loading shell.
            phase = .ready(playback)
        case .error(let code):
            note("message onPlayerError \(code.map(String.init) ?? "no code")")
            switch code {
            case ErrorCode.autoplay: break
            case ErrorCode.invalidVideo: fail(.unavailable)
            default: fail(.cannotPlay)
            }
        case .mediaError:
            // The deprecated message comes just before `onPlayerError`, which says which
            // failure it is, so it is logged and decides nothing.
            note("message onError")
        case .time, .muted, .volume, .image:
            // Too frequent to log, and nothing the viewer shows.
            break
        }
    }

    /// The web view couldn't load the shell or the player's page: `offline` when the system
    /// says there is no connection.
    public func loadFailed(offline: Bool, attempt: Int) {
        guard attempt == self.attempt, showsPlayer else { return }
        fail(offline ? .network : .cannotPlay)
    }

    /// The web view's process ended (the system took its memory back).
    public func playerEnded(attempt: Int) {
        guard attempt == self.attempt, showsPlayer else { return }
        fail(.cannotPlay)
    }

    private func fail(_ failure: Failure) {
        phase = .failed(failure)
        note("failed: \(failure)")
    }

    /// A navigation the policy decided, for `attempt`: logged by its host alone, and, when the
    /// person is to be asked, kept until the answer. One question at a time: a second address
    /// while one is asked is stopped.
    public func decided(_ decision: VideoNavigation.Decision, for request: VideoNavigation.Request)
    {
        let host = request.url?.host ?? request.url?.scheme ?? "nothing"
        let frame = request.newWindow ? "new window" : request.mainFrame ? "page" : "frame"
        switch decision {
        case .allow:
            note("\(frame) allowed: \(host)")
        case .stop:
            note("\(frame) stopped: \(host)")
        case .ask(let url):
            guard showsPlayer, leaving == nil else {
                note("\(frame) stopped: \(host)")
                return
            }
            leaving = url
            note("\(frame) asked: \(host)")
        }
    }

    /// The person's answer: the address to open outside Tadayo, or nothing when they stay.
    public func answerLeaving(leave: Bool) -> URL? {
        defer { leaving = nil }
        note(leave ? "left" : "stayed")
        return leave ? leaving : nil
    }

    /// A line for the spike's log, from the view (how long the player took, what the app did
    /// when it went to the background).
    public func note(_ line: String) {
        log.append(line)
        if log.count > Self.logLimit { log.removeFirst(log.count - Self.logLimit) }
    }
}
