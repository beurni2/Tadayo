import Foundation
import OpenAPIURLSession

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// The Tadayo API, as the app calls it. The generated `Client` stays internal.
public struct TadayoAPIClient: Sendable {
    let client: Client

    /// A client for `serverURL`, whose requests go through `session`.
    public init(serverURL: URL, session: URLSession) {
        client = Client(
            serverURL: serverURL,
            transport: URLSessionTransport(configuration: .init(session: session))
        )
    }
}
