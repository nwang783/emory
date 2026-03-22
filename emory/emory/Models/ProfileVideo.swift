import Foundation

struct ProfileVideoMetadata: Codable, Hashable, Identifiable, Sendable {
    let personId: String
    let videoFileName: String
    let thumbnailFileName: String?
    let durationSeconds: Double
    let fileSizeBytes: Int64
    let updatedAt: String

    var id: String { personId }

    var durationText: String {
        let totalSeconds = max(Int(durationSeconds.rounded()), 0)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    var fileSizeText: String {
        ByteCountFormatter.string(fromByteCount: fileSizeBytes, countStyle: .file)
    }
}
