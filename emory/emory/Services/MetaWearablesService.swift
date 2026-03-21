import UIKit
import CoreMedia

// MARK: - MetaWearablesService Protocol
// Abstraction layer over the Meta Wearables DAT SDK.
// MockMetaWearablesService provides fake data for Simulator testing.
// RealMetaWearablesService wraps the actual SDK.

/// Wraps a video frame with both display image and raw sample buffer.
/// The display image is created lazily only when needed for UI rendering.
struct VideoFrameData: @unchecked Sendable {
    /// Raw CMSampleBuffer from the SDK — used for efficient bridge forwarding
    let sampleBuffer: CMSampleBuffer?

    /// Pre-rendered UIImage for display — nil if not yet created
    private var _displayImage: UIImage?

    /// Get or create a UIImage for display purposes
    var displayImage: UIImage? {
        mutating get {
            if let img = _displayImage { return img }
            guard let sb = sampleBuffer,
                  let pixelBuffer = CMSampleBufferGetImageBuffer(sb) else { return nil }
            let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
            let context = CIContext()
            guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else { return nil }
            let img = UIImage(cgImage: cgImage)
            _displayImage = img
            return img
        }
    }

    /// Create from a UIImage directly (for mock service)
    init(image: UIImage) {
        self._displayImage = image
        self.sampleBuffer = nil
    }

    /// Create from a CMSampleBuffer (for real SDK — HEVC or raw)
    init(sampleBuffer: CMSampleBuffer) {
        self.sampleBuffer = sampleBuffer
        self._displayImage = nil
    }

    /// Create from both (when SDK provides makeUIImage convenience)
    init(sampleBuffer: CMSampleBuffer, image: UIImage) {
        self.sampleBuffer = sampleBuffer
        self._displayImage = image
    }
}

@MainActor
protocol MetaWearablesService: AnyObject {
    func start() async throws
    func stop() async
    func captureSnapshot() async -> UIImage?

    var connectionStateStream: AsyncStream<ConnectionState> { get }
    var sessionStateStream: AsyncStream<SessionState> { get }
    var videoFrameStream: AsyncStream<VideoFrameData> { get }
    var audioStatusStream: AsyncStream<Bool> { get }
}
