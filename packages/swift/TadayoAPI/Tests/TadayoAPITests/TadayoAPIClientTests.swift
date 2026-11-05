import Foundation
import Testing

@testable import TadayoAPI

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

@Suite struct TadayoAPIClientTests {
    @Test func theClientIsGeneratedFromTheContract() {
        let api = TadayoAPIClient(
            serverURL: URL(string: "https://api-dev.tadayo.app")!,
            session: URLSession(configuration: .ephemeral)
        )
        _ = api.client
    }
}
