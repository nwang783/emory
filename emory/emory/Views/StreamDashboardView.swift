import SwiftUI

// MARK: - Stream Dashboard View
// Live glasses streaming view with recognition banner overlay.
// Restyled with Emory theme for dementia patients.

struct StreamDashboardView: View {
    @State private var viewModel = StreamViewModel()
    @State private var settings = AppSettings.shared
    @State private var recognizedPerson: Person? = nil
    @State private var showRecognitionBanner = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // MARK: Video Preview with recognition overlay
                ZStack(alignment: .top) {
                    // Video preview with green glow when recognized
                    VideoPreviewView(
                        frame: viewModel.currentFrame,
                        resolution: viewModel.resolution,
                        fps: viewModel.fps,
                        lastFrameTime: viewModel.lastFrameTime
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(EmoryTheme.secondary, lineWidth: showRecognitionBanner ? 3 : 0)
                            .animation(.easeInOut(duration: 0.5), value: showRecognitionBanner)
                    )

                    // Status badges overlay
                    HStack(spacing: 8) {
                        StatusPill(
                            label: viewModel.connectionState.rawValue,
                            color: colorForConnection(viewModel.connectionState)
                        )
                        StatusPill(
                            label: viewModel.sessionState.rawValue,
                            color: colorForSession(viewModel.sessionState)
                        )
                    }
                    .padding(8)

                    // Recognition banner
                    if showRecognitionBanner, let person = recognizedPerson {
                        RecognitionBannerView(person: person)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.top, 40)
                    }
                }

                // MARK: Controls
                VStack(spacing: 10) {
                    // Start / Stop
                    if viewModel.sessionState == .streaming || viewModel.sessionState == .starting {
                        Button {
                            viewModel.stopSession()
                        } label: {
                            HStack {
                                Image(systemName: "stop.circle.fill")
                                Text("Stop Stream")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(EmoryTheme.destructive)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    } else {
                        Button {
                            viewModel.startSession()
                        } label: {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                Text("Start Stream")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(EmoryTheme.secondary)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }

                    HStack(spacing: 12) {
                        // Snapshot
                        Button {
                            viewModel.captureSnapshot()
                        } label: {
                            HStack {
                                Image(systemName: "camera.fill")
                                Text("Snapshot")
                                    .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            }
                            .foregroundStyle(EmoryTheme.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(EmoryTheme.primary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(viewModel.sessionState != .streaming)

                        // Send Frame
                        Button {
                            viewModel.log("Send to Backend tapped")
                        } label: {
                            HStack {
                                Image(systemName: "arrow.up.circle.fill")
                                Text("Send Frame")
                                    .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            }
                            .foregroundStyle(EmoryTheme.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(EmoryTheme.primary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(viewModel.currentFrame == nil)
                    }
                }

                // MARK: Mic Test
                HStack(spacing: 12) {
                    Button {
                        viewModel.startMicOnly()
                    } label: {
                        Label("Start Mic", systemImage: "mic.fill")
                            .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(EmoryTheme.primary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(viewModel.isMicCapturing)

                    Button {
                        viewModel.stopMicOnly()
                    } label: {
                        Label("Stop Mic", systemImage: "mic.slash")
                            .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!viewModel.isMicCapturing || viewModel.sessionState == .streaming)
                }

                // MARK: Audio
                AudioStatusView(
                    isAvailable: viewModel.audioAvailable,
                    isCapturing: viewModel.isMicCapturing,
                    audioLevel: viewModel.audioLevel,
                    isRecording: viewModel.isRecording,
                    isPlaying: viewModel.isPlayingRecording,
                    hasRecording: viewModel.hasRecording,
                    recordingDuration: viewModel.recordingDuration,
                    onRecordStart: { viewModel.startRecording() },
                    onRecordStop: { viewModel.stopRecording() },
                    onPlay: { viewModel.playRecording() },
                    onStopPlayback: { viewModel.stopPlayback() }
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
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("Emory")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { viewModel.cleanup() }
    }

    // MARK: - Helpers

    private func colorForConnection(_ state: ConnectionState) -> Color {
        switch state {
        case .disconnected: return .gray
        case .connecting: return .orange
        case .connected: return EmoryTheme.secondary
        }
    }

    private func colorForSession(_ state: SessionState) -> Color {
        switch state {
        case .idle: return .gray
        case .starting: return .orange
        case .streaming: return EmoryTheme.secondary
        case .paused: return .yellow
        case .stopping: return .orange
        case .error: return EmoryTheme.destructive
        }
    }

    // Simulate recognition for demo purposes
    func simulateRecognition() {
        recognizedPerson = PeopleStore.shared.people.first ?? Person.samplePeople.first
        withAnimation(.easeInOut(duration: 0.5)) {
            showRecognitionBanner = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            withAnimation(.easeInOut(duration: 0.5)) {
                showRecognitionBanner = false
            }
        }
    }
}

// MARK: - Status Pill

struct StatusPill: View {
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.black.opacity(0.6))
        .clipShape(Capsule())
    }
}

// MARK: - Recognition Banner

struct RecognitionBannerView: View {
    let person: Person

    var body: some View {
        HStack(spacing: 10) {
            Text("\u{1F44B}")
                .font(.title2)
            VStack(alignment: .leading, spacing: 1) {
                Text("This is \(person.name)")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                Text(person.relationship)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.9))
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(EmoryTheme.secondary.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 8)
    }
}

#Preview {
    StreamDashboardView()
}
