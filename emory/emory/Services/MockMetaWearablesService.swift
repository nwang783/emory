import UIKit

// MARK: - Mock Meta Wearables Service
// Simulates the Meta DAT SDK for Simulator testing.
// Generates lightweight synthetic frames at ~15fps and simulates
// connection/session state transitions.

@MainActor
final class MockMetaWearablesService: MetaWearablesService {

    // MARK: - State

    private var isRunning = false
    private var frameTask: Task<Void, Never>?
    private var frameCount = 0

    // Continuations for async streams
    private var connectionContinuation: AsyncStream<ConnectionState>.Continuation?
    private var sessionContinuation: AsyncStream<SessionState>.Continuation?
    private var frameContinuation: AsyncStream<VideoFrameData>.Continuation?
    private var audioContinuation: AsyncStream<Bool>.Continuation?

    // Cached renderer to avoid re-creating every frame
    private let frameWidth = 360
    private let frameHeight = 640
    private lazy var renderer = UIGraphicsImageRenderer(
        size: CGSize(width: frameWidth, height: frameHeight)
    )

    // MARK: - Streams

    lazy var connectionStateStream: AsyncStream<ConnectionState> = {
        AsyncStream { [weak self] continuation in
            self?.connectionContinuation = continuation
            continuation.yield(.disconnected)
        }
    }()

    lazy var sessionStateStream: AsyncStream<SessionState> = {
        AsyncStream { [weak self] continuation in
            self?.sessionContinuation = continuation
            continuation.yield(.idle)
        }
    }()

    lazy var videoFrameStream: AsyncStream<VideoFrameData> = {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { [weak self] continuation in
            self?.frameContinuation = continuation
        }
    }()

    lazy var audioStatusStream: AsyncStream<Bool> = {
        AsyncStream { [weak self] continuation in
            self?.audioContinuation = continuation
            continuation.yield(false)
        }
    }()

    // MARK: - Actions

    func start() async throws {
        guard !isRunning else { return }
        isRunning = true
        frameCount = 0

        // Simulate connection sequence
        connectionContinuation?.yield(.connecting)
        try await Task.sleep(nanoseconds: 500_000_000)

        connectionContinuation?.yield(.connected)
        sessionContinuation?.yield(.starting)
        try await Task.sleep(nanoseconds: 500_000_000)

        sessionContinuation?.yield(.streaming)
        audioContinuation?.yield(true)

        // Generate frames at ~15fps (matches real glasses rate)
        frameTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self else { break }
                let frame = self.generateSyntheticFrame()
                self.frameContinuation?.yield(VideoFrameData(image: frame))
                self.frameCount += 1
                try? await Task.sleep(nanoseconds: 66_000_000) // ~15fps
            }
        }
    }

    func stop() async {
        isRunning = false
        frameTask?.cancel()
        frameTask = nil

        sessionContinuation?.yield(.stopping)
        try? await Task.sleep(nanoseconds: 300_000_000)

        sessionContinuation?.yield(.idle)
        connectionContinuation?.yield(.disconnected)
        audioContinuation?.yield(false)
    }

    func captureSnapshot() async -> UIImage? {
        guard isRunning else { return nil }
        return generateSyntheticFrame()
    }

    // MARK: - Synthetic Frame Generation

    private func generateSyntheticFrame() -> UIImage {
        renderer.image { context in
            let rect = CGRect(x: 0, y: 0, width: frameWidth, height: frameHeight)

            // Cycle hue based on frame count for visual feedback
            let hue = CGFloat(frameCount % 360) / 360.0
            let color = UIColor(hue: hue, saturation: 0.6, brightness: 0.8, alpha: 1.0)
            color.setFill()
            context.fill(rect)

            // Draw frame counter + timestamp
            let text = "Frame \(frameCount)\n\(DateFormatter.debugFormatter.string(from: Date()))"
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 18, weight: .bold),
                .foregroundColor: UIColor.white
            ]
            let textRect = CGRect(x: 16, y: frameHeight / 2 - 24, width: frameWidth - 32, height: 60)
            (text as NSString).draw(in: textRect, withAttributes: attrs)

            // Draw "MOCK" watermark
            let watermark = "MOCK FEED"
            let wmAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .regular),
                .foregroundColor: UIColor.white.withAlphaComponent(0.5)
            ]
            let wmRect = CGRect(x: 16, y: 16, width: frameWidth - 32, height: 24)
            (watermark as NSString).draw(in: wmRect, withAttributes: wmAttrs)
        }
    }
}

// MARK: - Date Formatter Helper

extension DateFormatter {
    static let debugFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()
}
