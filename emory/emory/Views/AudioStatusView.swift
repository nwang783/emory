import SwiftUI

// MARK: - Audio Status View
// Shows microphone capture status with a live audio level meter.
// Audio comes from the iPhone mic (not the glasses — the Meta DAT SDK has no audio API).

struct AudioStatusView: View {
    let isAvailable: Bool
    let isCapturing: Bool
    let audioLevel: Float  // 0.0 to 1.0 normalized amplitude

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                // Status indicator
                Circle()
                    .fill(statusColor)
                    .frame(width: 12, height: 12)

                VStack(alignment: .leading, spacing: 2) {
                    Text("iPhone Microphone")
                        .font(.subheadline.bold())
                    Text(statusText)
                        .font(.caption)
                        .foregroundStyle(statusColor)
                }

                Spacer()

                // Level percentage when capturing
                if isCapturing {
                    Text(String(format: "%.0f%%", audioLevel * 100))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }

                Image(systemName: iconName)
                    .font(.title3)
                    .foregroundStyle(statusColor)
            }

            // Live audio level meter
            if isCapturing {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        // Background track
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(.systemGray5))

                        // Level bar with gradient
                        RoundedRectangle(cornerRadius: 4)
                            .fill(levelGradient)
                            .frame(width: max(4, CGFloat(audioLevel) * geometry.size.width))
                            .animation(.linear(duration: 0.05), value: audioLevel)
                    }
                }
                .frame(height: 8)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Helpers

    private var statusColor: Color {
        if isCapturing { return .green }
        if isAvailable { return .orange }
        return .secondary
    }

    private var statusText: String {
        if isCapturing { return "Capturing Audio" }
        if isAvailable { return "Available" }
        return "Not Available"
    }

    private var iconName: String {
        if isCapturing { return "mic.fill" }
        if isAvailable { return "mic.badge.plus" }
        return "mic.slash"
    }

    private var levelGradient: LinearGradient {
        LinearGradient(
            colors: [.green, .yellow, .red],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}
