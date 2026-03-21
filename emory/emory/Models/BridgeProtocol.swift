import Foundation

struct ServerMessage: Decodable {
    let type: String
}

struct FaceBounds: Codable, Equatable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct FaceMatch: Codable, Equatable, Identifiable {
    let personId: String
    let name: String
    let relationship: String?
    let similarity: Double
    let bbox: FaceBounds

    var id: String { personId }
}

struct FaceResultMessage: Codable, Equatable {
    let type: String
    let ts: Double
    let matches: [FaceMatch]
    let unknowns: Int
    let ms: Double
}

struct TranscriptMemory: Codable, Equatable {
    let text: String
    let type: String?
}

struct TranscriptMessage: Codable, Equatable {
    let type: String
    let personId: String
    let text: String
    let memories: [TranscriptMemory]
}

struct ServerStatusMessage: Codable, Equatable {
    let type: String
    let ready: Bool
    let faceReady: Bool
    let peopleCount: Int
}
