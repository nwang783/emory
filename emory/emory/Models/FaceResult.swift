import Foundation

// MARK: - Face Result
// Data model for face recognition results received from the bridge server.

struct FaceMatch: Codable, Identifiable {
    var id: String { personId }
    let personId: String
    let name: String
    let relationship: String?
    let similarity: Double
    let bbox: FaceBBox
}

struct FaceBBox: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct FaceResultMessage: Codable {
    let type: String
    let ts: Double
    let matches: [FaceMatch]
    let unknowns: Int
    let ms: Int
}

struct TranscriptMessage: Codable {
    let type: String
    let personId: String
    let text: String
    let memories: [MemoryItem]
}

struct MemoryItem: Codable {
    let text: String
    let type: String?
}

struct ServerStatusMessage: Codable {
    let type: String
    let ready: Bool
    let faceReady: Bool
    let peopleCount: Int
}

// Generic message for type detection
struct ServerMessage: Codable {
    let type: String
}
