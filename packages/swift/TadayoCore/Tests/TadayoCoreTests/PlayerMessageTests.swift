import Testing

@testable import TadayoCore

/// The player's messages (`PlayerMessage.read`; T39: "postMessage origin and schema are
/// validated"; TECH-DESIGN section 4).
@Suite struct PlayerMessageTests {
    private func read(_ json: String, origin: String = "https://www.tiktok.com")
        -> Result<PlayerMessage, PlayerMessage.Refusal>
    {
        PlayerMessage.read(origin: origin, json: json)
    }

    @Test func eachOfThePlayersMessagesIsRead() {
        #expect(read(#"{"x-tiktok-player":true,"type":"onPlayerReady"}"#) == .success(.ready))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerReady","value":null}"#)
                == .success(.ready))
        let states: [(Int, PlayerMessage.Playback)] = [
            (-1, .initial), (0, .ended), (1, .playing), (2, .paused), (3, .buffering),
        ]
        for (value, playback) in states {
            #expect(
                read(#"{"x-tiktok-player":true,"type":"onStateChange","value":\#(value)}"#)
                    == .success(.state(playback)))
        }
        #expect(
            read(
                #"{"x-tiktok-player":true,"type":"onCurrentTime","value":{"currentTime":1.5,"duration":30,"x":"y"}}"#
            ) == .success(.time(current: 1.5, duration: 30)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onMute","value":true}"#)
                == .success(.muted(true)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onMute","value":0}"#)
                == .success(.muted(false)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onVolumeChange","value":80}"#)
                == .success(.volume(80)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onImageChange","value":2}"#)
                == .success(.image(2)))
    }

    /// TikTok's documented error: `{errorCode, errorType}`. An error without a readable code,
    /// and the deprecated `onError` (a `MediaError.code`, no code of TikTok's), are still errors.
    @Test func anErrorIsReadWithOrWithoutItsCode() {
        #expect(
            read(
                #"{"x-tiktok-player":true,"type":"onPlayerError","value":{"errorCode":1001,"errorType":"INVALID_VIDEO"}}"#
            ) == .success(.error(code: 1001)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerError","value":{"errorType":"X"}}"#)
                == .success(.error(code: nil)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerError","value":1001}"#)
                == .success(.error(code: nil)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerError"}"#)
                == .success(.error(code: nil)))
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onError","value":4}"#)
                == .success(.error(code: nil)))
    }

    @Test(arguments: [
        "https://tiktok.com", "https://www.tiktok.com/", "http://www.tiktok.com",
        "https://www.tiktok.com.example.com", "https://m.tiktok.com", "https://tadayo.app",
        "null", "", "https://www.tiktok.com:8443", "HTTPS://WWW.TIKTOK.COM",
    ])
    func anotherOriginIsRefused(origin: String) {
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerReady"}"#, origin: origin)
                == .failure(.origin))
    }

    @Test(arguments: [
        "", "null", "[]", "\"onPlayerReady\"", "{", #"{"type":"onPlayerReady"}"#,
        #"{"x-tiktok-player":false,"type":"onPlayerReady"}"#,
        #"{"x-tiktok-player":1,"type":"onPlayerReady"}"#,
        #"{"x-tiktok-player":"true","type":"onPlayerReady"}"#,
        #"{"x-tiktok-player":true}"#, #"{"x-tiktok-player":true,"type":7}"#,
    ])
    func anotherShapeIsRefused(json: String) {
        #expect(read(json) == .failure(.shape))
    }

    @Test func anUnknownTypeIsRefused() {
        #expect(read(#"{"x-tiktok-player":true,"type":"play"}"#) == .failure(.type))
        #expect(read(#"{"x-tiktok-player":true,"type":"onplayerready"}"#) == .failure(.type))
        #expect(read(#"{"x-tiktok-player":true,"type":""}"#) == .failure(.type))
    }

    @Test(arguments: [
        #"{"x-tiktok-player":true,"type":"onStateChange"}"#,
        #"{"x-tiktok-player":true,"type":"onStateChange","value":4}"#,
        #"{"x-tiktok-player":true,"type":"onStateChange","value":1.5}"#,
        #"{"x-tiktok-player":true,"type":"onStateChange","value":"1"}"#,
        #"{"x-tiktok-player":true,"type":"onStateChange","value":true}"#,
        #"{"x-tiktok-player":true,"type":"onCurrentTime","value":3}"#,
        #"{"x-tiktok-player":true,"type":"onCurrentTime","value":{"currentTime":1}}"#,
        #"{"x-tiktok-player":true,"type":"onCurrentTime","value":{"currentTime":-1,"duration":3}}"#,
        #"{"x-tiktok-player":true,"type":"onCurrentTime","value":{"currentTime":"1","duration":3}}"#,
        #"{"x-tiktok-player":true,"type":"onMute","value":2}"#,
        #"{"x-tiktok-player":true,"type":"onMute"}"#,
        #"{"x-tiktok-player":true,"type":"onVolumeChange","value":-1}"#,
        #"{"x-tiktok-player":true,"type":"onVolumeChange","value":{}}"#,
        #"{"x-tiktok-player":true,"type":"onImageChange","value":-1}"#,
        #"{"x-tiktok-player":true,"type":"onImageChange","value":0.5}"#,
    ])
    func aValueItsTypeDoesNotCarryIsRefused(json: String) {
        #expect(read(json) == .failure(.value))
    }

    @Test func aMessageOverTheLimitIsRefusedUnread() {
        let padding = String(repeating: "a", count: PlayerMessage.limit)
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerReady","pad":"\#(padding)"}"#)
                == .failure(.length))
        let fits = String(repeating: "a", count: PlayerMessage.limit - 60)
        #expect(
            read(#"{"x-tiktok-player":true,"type":"onPlayerReady","pad":"\#(fits)"}"#)
                == .success(.ready))
    }
}
