import SwiftUI

// MARK: - Stream Dashboard View
// Main screen of the app. Shows connection/session status,
// video preview, audio status, and debug panel.

struct StreamDashboardView: View {
    @State private var viewModel = StreamViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // MARK: Status Bar
                    statusSection

                    // MARK: Video Preview
                    VideoPreviewView(
                        frame: viewModel.currentFrame,
                        resolution: viewModel.resolution,
                        fps: viewModel.fps,
                        lastFrameTime: viewModel.lastFrameTime
                    )

                    // MARK: Controls
                    controlsSection

                    // MARK: Audio
                    AudioStatusView(
                        isAvailable: viewModel.audioAvailable,
                        isCapturing: viewModel.isMicCapturing,
                        audioLevel: viewModel.audioLevel
                    )

                    // MARK: Debug
                    DebugPanelView(
                        events: viewModel.debugEvents,
                        frameCount: viewModel.frameCount,
                        fps: viewModel.fps
                    )
                }
                .padding()
            }
            .navigationTitle("AI Glasses")
            .navigationBarTitleDisplayMode(.inline)
            .onDisappear { viewModel.cleanup() }
        }
    }

    // MARK: - Status Section

    private var statusSection: some View {
        HStack(spacing: 16) {
            // Connection status
            StatusBadge(
                label: "Connection",
                value: viewModel.connectionState.rawValue,
                color: colorForConnection(viewModel.connectionState)
            )

            // Session status
            StatusBadge(
                label: "Session",
                value: viewModel.sessionState.rawValue,
                color: colorForSession(viewModel.sessionState)
            )
        }
    }

    // MARK: - Controls Section

    private var controlsSection: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                // Start
                Button {
                    viewModel.startSession()
                } label: {
                    Label("Start Session", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(viewModel.sessionState == .streaming || viewModel.sessionState == .starting)

                // Stop
                Button {
                    viewModel.stopSession()
                } label: {
                    Label("Stop Session", systemImage: "stop.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(viewModel.sessionState == .idle || viewModel.sessionState == .stopping)
            }

            HStack(spacing: 12) {
                // Snapshot
                Button {
                    viewModel.captureSnapshot()
                } label: {
                    Label("Snapshot", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.sessionState != .streaming)

                // Send to backend (stub)
                Button {
                    viewModel.log("Send to Backend tapped (stub)")
                } label: {
                    Label("Send Frame", systemImage: "arrow.up.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.currentFrame == nil)
            }
        }
    }

    // MARK: - Color Helpers

    private func colorForConnection(_ state: ConnectionState) -> Color {
        switch state {
        case .disconnected: return .red
        case .connecting: return .orange
        case .connected: return .green
        }
    }

    private func colorForSession(_ state: SessionState) -> Color {
        switch state {
        case .idle: return .gray
        case .starting: return .orange
        case .streaming: return .green
        case .paused: return .yellow
        case .stopping: return .orange
        case .error: return .red
        }
    }
}

// MARK: - Status Badge
// Reusable pill showing a label + value with colored indicator

struct StatusBadge: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(value)
                    .font(.subheadline.bold())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Preview

#Preview {
    StreamDashboardView()
}
