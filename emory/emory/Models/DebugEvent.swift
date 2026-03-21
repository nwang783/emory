import Foundation

// MARK: - Debug Event
// A timestamped log entry displayed in the debug panel

struct DebugEvent: Identifiable {
    let id = UUID()
    let timestamp: Date
    let message: String
    let level: Level

    enum Level: String {
        case info = "INFO"
        case warning = "WARN"
        case error = "ERROR"

        var color: String {
            switch self {
            case .info: return "primary"
            case .warning: return "orange"
            case .error: return "red"
            }
        }
    }

    init(_ message: String, level: Level = .info) {
        self.timestamp = Date()
        self.message = message
        self.level = level
    }
}
