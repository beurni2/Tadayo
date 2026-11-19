import Foundation

/// What TikTok's Embed Player tells its host page, read from one `postMessage` (TECH-DESIGN
/// section 4: "Script messages are accepted only from the expected origin, with the TikTok
/// player's message schema (`x-tiktok-player`, `onPlayerReady`, `onStateChange`,
/// `onPlayerError`)"; T39: "postMessage origin and schema are validated").
///
/// The shapes are those of TikTok's documentation, "Embed Player", "Player to host messages" and
/// "Player Error Reporting" (https://developers.tiktok.com/doc/embed-player, last updated
/// 28 October 2026, read on 2026-11-19; `docs/plans/ios-b0-spike-video.md`, section 3). A
/// message of any other shape is refused, and the spike's log says which refusal.
public enum PlayerMessage: Sendable, Equatable {
    /// `onStateChange`'s values.
    public enum Playback: Int, Sendable, Equatable {
        case initial = -1
        case ended = 0
        case playing = 1
        case paused = 2
        case buffering = 3
    }

    /// Why a message was refused.
    public enum Refusal: String, Error, Sendable, Equatable {
        /// It didn't come from `https://www.tiktok.com`.
        case origin
        /// It is longer than any player message (`limit`).
        case length
        /// It isn't a JSON object marked `"x-tiktok-player": true` with a `type`.
        case shape
        /// Its type isn't one of the player's.
        case type
        /// Its value isn't what its type carries.
        case value
    }

    case ready
    case state(Playback)
    case time(current: Double, duration: Double)
    case muted(Bool)
    case volume(Double)
    /// `onImageChange`: the picture an image post shows, counted from 0.
    case image(Int)
    /// `onPlayerError` with its `errorCode`, or the deprecated `onError`, whose number is the
    /// browser's `MediaError.code` and no code of TikTok's, so it is read with none.
    case error(code: Int?)

    /// The longest message read, in UTF-8 bytes.
    public static let limit = 4096

    /// Reads one message: `origin` is the `MessageEvent`'s origin as the browser gave it, and
    /// `json` its data as JSON text.
    public static func read(origin: String, json: String) -> Result<PlayerMessage, Refusal> {
        guard origin == TikTokPost.origin else { return .failure(.origin) }
        guard json.utf8.count <= limit else { return .failure(.length) }
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: Data(json.utf8)),
            envelope.marker
        else { return .failure(.shape) }
        switch envelope.type {
        case "onPlayerReady":
            return .success(.ready)
        case "onStateChange":
            guard case .number(let number) = envelope.value, let whole = Int(exactly: number),
                let playback = Playback(rawValue: whole)
            else { return .failure(.value) }
            return .success(.state(playback))
        case "onCurrentTime":
            guard case .object(let fields) = envelope.value,
                let current = fields["currentTime"], let duration = fields["duration"],
                current.isFinite, duration.isFinite, current >= 0, duration >= 0
            else { return .failure(.value) }
            return .success(.time(current: current, duration: duration))
        case "onMute":
            switch envelope.value {
            case .flag(let muted): return .success(.muted(muted))
            case .number(let number) where number == 0 || number == 1:
                return .success(.muted(number == 1))
            default: return .failure(.value)
            }
        case "onVolumeChange":
            guard case .number(let volume) = envelope.value, volume.isFinite, volume >= 0
            else { return .failure(.value) }
            return .success(.volume(volume))
        case "onImageChange":
            guard case .number(let number) = envelope.value, let index = Int(exactly: number),
                index >= 0
            else { return .failure(.value) }
            return .success(.image(index))
        case "onPlayerError":
            guard case .object(let fields) = envelope.value else {
                return .success(.error(code: nil))
            }
            return .success(.error(code: fields["errorCode"].flatMap { Int(exactly: $0) }))
        case "onError":
            return .success(.error(code: nil))
        default:
            return .failure(.type)
        }
    }

    private struct Envelope: Decodable {
        let marker: Bool
        let type: String
        let value: Value

        enum CodingKeys: String, CodingKey {
            case marker = "x-tiktok-player"
            case type, value
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            marker = try container.decode(Bool.self, forKey: .marker)
            type = try container.decode(String.self, forKey: .type)
            value = try container.decodeIfPresent(Value.self, forKey: .value) ?? .none
        }
    }

    /// A message's value: a number, a flag, an object's numbers (its other fields are left
    /// unread), or nothing this reads.
    private enum Value: Decodable {
        case none
        case number(Double)
        case flag(Bool)
        case object([String: Double])

        init(from decoder: any Decoder) throws {
            let container = try decoder.singleValueContainer()
            if container.decodeNil() {
                self = .none
            } else if let flag = try? container.decode(Bool.self) {
                self = .flag(flag)
            } else if let number = try? container.decode(Double.self) {
                self = .number(number)
            } else if let fields = try? container.decode([String: Field].self) {
                self = .object(fields.compactMapValues(\.number))
            } else {
                self = .none
            }
        }
    }

    private struct Field: Decodable {
        let number: Double?

        init(from decoder: any Decoder) throws {
            number = try? decoder.singleValueContainer().decode(Double.self)
        }
    }
}
