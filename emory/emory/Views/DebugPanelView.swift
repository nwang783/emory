import SwiftUI

// MARK: - Debug Panel View
// Scrollable list of timestamped debug events.
// Shows frame count, FPS, and connection logs.

struct DebugPanelView: View {
    let events: [DebugEvent]
    let frameCount: Int
    let fps: Double

    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with toggle
            Button {
                withAnimation { isExpanded.toggle() }
            } label: {
                HStack {
                    Image(systemName: "ladybug")
                    Text("Debug Panel")
                        .font(.subheadline.bold())

                    Spacer()

                    // Quick stats
                    Text("\(frameCount) frames")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.0f fps", fps))
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                }
                .foregroundStyle(.primary)
            }

            if isExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(events.prefix(30)) { event in
                            HStack(alignment: .top, spacing: 6) {
                                Text(DateFormatter.debugFormatter.string(from: event.timestamp))
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.secondary)

                                Text("[\(event.level.rawValue)]")
                                    .font(.caption2.monospaced().bold())
                                    .foregroundStyle(colorForLevel(event.level))

                                Text(event.message)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.primary)
                            }
                        }
                    }
                }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func colorForLevel(_ level: DebugEvent.Level) -> Color {
        switch level {
        case .info: return .primary
        case .warning: return .orange
        case .error: return .red
        }
    }
}
