import Foundation
import Observation

@MainActor
@Observable
final class DesktopConnectionStore {
    static let shared = DesktopConnectionStore()

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
            let health = try await client.fetchHealth()
            isConnected = health.ok
            friendlyName = health.friendlyName
            lastError = nil
            statusText = health.ok ? "Connected" : "Unavailable"
        } catch {
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
