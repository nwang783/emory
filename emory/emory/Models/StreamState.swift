import Foundation

// MARK: - Connection State
// Represents the Bluetooth/device connection to Meta glasses

enum ConnectionState: String, CaseIterable {
    case disconnected = "Disconnected"
    case connecting = "Connecting"
    case connected = "Connected"

    var color: String {
        switch self {
        case .disconnected: return "red"
        case .connecting: return "orange"
        case .connected: return "green"
        }
    }
}

// MARK: - Session State
// Represents the streaming session lifecycle
// Maps to Meta SDK's StreamSessionState in the real implementation

enum SessionState: String, CaseIterable {
    case idle = "Idle"
    case starting = "Starting"
    case streaming = "Streaming"
    case paused = "Paused"
    case stopping = "Stopping"
    case error = "Error"

    var color: String {
        switch self {
        case .idle: return "gray"
        case .starting: return "orange"
        case .streaming: return "green"
        case .paused: return "yellow"
        case .stopping: return "orange"
        case .error: return "red"
        }
    }
}

// MARK: - Frame Info
// Metadata about the most recent video frame

struct FrameInfo {
    let resolution: String
    let timestamp: Date
    let frameNumber: Int
}
