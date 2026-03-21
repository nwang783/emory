import SwiftUI

// MARK: - Debug Panel View
// Collapsible list of timestamped debug events.
// Starts collapsed; shows frame count, FPS, and connection logs when expanded.

struct DebugPanelView: View {
    let events: [DebugEvent]
    let frameCount: Int
    let fps: Double

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header toggle
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "terminal")
                        .font(.system(size: 16))
                        .foregroundStyle(EmoryTheme.textSecondary)

                    Text("Debug Logs")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(EmoryTheme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(EmoryTheme.textSecondary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
                .padding(18)
            }

            if isExpanded {
                Divider()
                    .padding(.horizontal, 16)

                // Quick stats
                HStack(spacing: 16) {
                    Label("\(frameCount) frames", systemImage: "photo.stack")
                    Label(String(format: "%.0f fps", fps), systemImage: "speedometer")
                }
                .font(.system(size: 12).monospaced())
                .foregroundStyle(EmoryTheme.textSecondary)
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 8)

                // Event log
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(events.suffix(30).reversed()) { event in
                        HStack(alignment: .top, spacing: 6) {
                            Text(DateFormatter.debugFormatter.string(from: event.timestamp))
                                .font(.caption2.monospaced())
                                .foregroundStyle(EmoryTheme.textSecondary)

                            Text("[\(event.level.rawValue)]")
                                .font(.caption2.monospaced().bold())
                                .foregroundStyle(colorForLevel(event.level))

                            Text(event.message)
                                .font(.caption2.monospaced())
                                .foregroundStyle(EmoryTheme.textPrimary)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }
        }
        .emoryCard()
    }

    private func colorForLevel(_ level: DebugEvent.Level) -> Color {
        switch level {
        case .info: return EmoryTheme.primary
        case .warning: return .orange
        case .error: return EmoryTheme.destructive
        }
    }
}
