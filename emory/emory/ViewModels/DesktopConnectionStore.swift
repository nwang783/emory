import Foundation
import Observation
import os.log

@MainActor
@Observable
final class DesktopConnectionStore {
    static let shared = DesktopConnectionStore()

    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "emory", category: "DesktopConnection")

    var isTesting = false
    var isConnected = false
    var statusText = "Disconnected"
    var lastError: String?
    var friendlyName: String?

    private init() {}

    func testConnection() async {
        isTesting = true
        defer { isTesting = false }

        do {
            let client = try DesktopApiClient.fromSettings()
            let base = client.baseURL.absoluteString
            Self.logger.info("Test Connection: GET \(base, privacy: .public)/health")
            let health = try await client.fetchHealth()
            isConnected = health.ok
            friendlyName = health.friendlyName
            lastError = nil
            statusText = health.ok ? "Connected" : "Unavailable"
            Self.logger.info("Desktop health ok=\(health.ok) friendlyName=\(health.friendlyName, privacy: .public) instanceId=\(health.instanceId, privacy: .public)")
        } catch {
            Self.logger.error("Desktop connection failed: \(error.localizedDescription, privacy: .public)")
            markDisconnected(reason: error.localizedDescription)
        }
    }

    func markConnected(friendlyName: String? = nil) {
        isConnected = true
        lastError = nil
        self.friendlyName = friendlyName ?? self.friendlyName
        statusText = "Connected"
    }

    func markDisconnected(reason: String) {
        isConnected = false
        friendlyName = nil
        lastError = reason
        statusText = "Disconnected"
    }
}
