import UIKit

// MARK: - MetaWearablesService Protocol
// Abstraction layer over the Meta Wearables DAT SDK.
// MockMetaWearablesService provides fake data for Simulator testing.
// RealMetaWearablesService wraps the actual SDK (Phase 3+).

@MainActor
protocol MetaWearablesService: AnyObject {
    // Start the connection + streaming session
    func start() async throws

    // Stop the session and disconnect
    func stop() async

    // Capture a single snapshot from the current stream
    func captureSnapshot() async -> UIImage?

    // Async streams for observing state changes
    var connectionStateStream: AsyncStream<ConnectionState> { get }
    var sessionStateStream: AsyncStream<SessionState> { get }
    var videoFrameStream: AsyncStream<UIImage> { get }
    var audioStatusStream: AsyncStream<Bool> { get }
}
