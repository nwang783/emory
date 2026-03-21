import SwiftUI

// MARK: - Audio Status View
// Shows microphone capture status with a live audio level meter.
// Includes hold-to-record button and playback controls.

struct AudioStatusView: View {
    let isAvailable: Bool
    let isCapturing: Bool
    let audioLevel: Float
    var isRecording: Bool = false
    var isPlaying: Bool = false
    var hasRecording: Bool = false
    var recordingDuration: TimeInterval = 0

    var onRecordStart: (() -> Void)? = nil
    var onRecordStop: (() -> Void)? = nil
    var onPlay: (() -> Void)? = nil
    var onStopPlayback: (() -> Void)? = nil

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
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(.systemGray5))

                        RoundedRectangle(cornerRadius: 4)
                            .fill(levelGradient)
                            .frame(width: max(4, CGFloat(audioLevel) * geometry.size.width))
                            .animation(.linear(duration: 0.05), value: audioLevel)
                    }
                }
                .frame(height: 8)
            }

            // Record + Playback controls
            if isCapturing {
                HStack(spacing: 12) {
                    // Hold-to-record button
                    Button {} label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(isRecording ? .red : .secondary)
                                .frame(width: 10, height: 10)
                                .overlay(
                                    Circle()
                                        .stroke(.white, lineWidth: 1)
                                )
                            Text(isRecording ? "Recording..." : "Hold to Record")
                                .font(.caption.bold())
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(isRecording ? Color.red.opacity(0.2) : Color(.tertiarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in
                                if !isRecording {
                                    onRecordStart?()
                                }
                            }
                            .onEnded { _ in
                                if isRecording {
                                    onRecordStop?()
                                }
                            }
                    )

                    // Play button
                    if hasRecording {
                        Button {
                            if isPlaying {
                                onStopPlayback?()
                            } else {
                                onPlay?()
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                                    .font(.caption)
                                Text(isPlaying ? "Stop" : String(format: "Play %.1fs", recordingDuration))
                                    .font(.caption.bold())
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(isPlaying ? Color.orange.opacity(0.2) : Color(.tertiarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Helpers

    private var statusColor: Color {
        if isRecording { return .red }
        if isCapturing { return .green }
        if isAvailable { return .orange }
        return .secondary
    }

    private var statusText: String {
        if isRecording { return "Recording Audio" }
        if isCapturing { return "Capturing Audio" }
        if isAvailable { return "Available" }
        return "Not Available"
    }

    private var iconName: String {
        if isRecording { return "record.circle" }
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
