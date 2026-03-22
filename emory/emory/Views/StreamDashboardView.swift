import SwiftUI

// MARK: - Stream Dashboard View
// Live glasses streaming view with recognition banner overlay.
// Restyled with Emory theme for dementia patients.

struct StreamDashboardView: View {
    private var viewModel = StreamViewModel.shared
    @State private var settings = AppSettings.shared
    @State private var recognizedPerson: Person? = nil
    @State private var showRecognitionBanner = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // MARK: Video Preview with recognition overlay
                ZStack(alignment: .top) {
                    VideoPreviewView(
                        frame: viewModel.currentFrame,
                        resolution: viewModel.resolution,
                        fps: viewModel.fps,
                        lastFrameTime: viewModel.lastFrameTime
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                showRecognitionBanner ? EmoryTheme.secondary : Color.clear,
                                lineWidth: 3
                            )
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
                    .padding(10)

                    // Recognition banner
                    if showRecognitionBanner, let person = recognizedPerson {
                        RecognitionBannerView(person: person)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .padding(.top, 44)
                    }
                }

                // MARK: Stream Control
                if viewModel.sessionState == .streaming || viewModel.sessionState == .starting {
                    Button {
                        Haptics.medium()
                        viewModel.stopSession()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 16, weight: .semibold))
                            Text("Stop Stream")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(EmoryTheme.primary)
                        .clipShape(Capsule())
                        .shadow(color: EmoryTheme.primary.opacity(0.3), radius: 8, y: 4)
                    }
                } else {
                    Button {
                        Haptics.medium()
                        viewModel.startSession()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 16, weight: .semibold))
                            Text("Start Stream")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(EmoryTheme.primary)
                        .clipShape(Capsule())
                        .shadow(color: EmoryTheme.primary.opacity(0.3), radius: 8, y: 4)
                    }
                }

                // MARK: Snapshot
                Button {
                    viewModel.captureSnapshot()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 16))
                        Text("Snapshot")
                            .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                    }
                    .foregroundStyle(EmoryTheme.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(EmoryTheme.cardBackground)
                    .clipShape(Capsule())
                    .shadow(color: EmoryTheme.cardShadow, radius: 8, x: 0, y: 2)
                }
                .disabled(viewModel.sessionState != .streaming)
                .opacity(viewModel.sessionState != .streaming ? 0.5 : 1.0)

                // MARK: Send Frame
                Button {
                    viewModel.log("Send to Backend tapped")
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 16))
                        Text("Send Frame")
                            .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                    }
                    .foregroundStyle(EmoryTheme.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(EmoryTheme.cardBackground)
                    .clipShape(Capsule())
                    .shadow(color: EmoryTheme.cardShadow, radius: 8, x: 0, y: 2)
                }
                .disabled(viewModel.currentFrame == nil)
                .opacity(viewModel.currentFrame == nil ? 0.5 : 1.0)

                // MARK: Mic Controls
                HStack(spacing: 12) {
                    Button {
                        Haptics.light()
                        if viewModel.isMicCapturing {
                            viewModel.stopMicOnly()
                        } else {
                            viewModel.startMicOnly()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: viewModel.isMicCapturing ? "mic.slash.fill" : "mic.fill")
                                .font(.system(size: 16))
                            Text(viewModel.isMicCapturing ? "Stop Mic" : "Start Mic")
                                .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(viewModel.isMicCapturing ? EmoryTheme.destructive.opacity(0.8) : EmoryTheme.secondary)
                        .clipShape(Capsule())
                    }
                }

                // MARK: Audio Monitoring
                AudioMonitoringCard(
                    audioLevel: viewModel.audioLevel,
                    isCapturing: viewModel.isMicCapturing,
                    fontSize: settings.fontSize
                )

                // MARK: Recording Controls
                if viewModel.isMicCapturing {
                    VStack(spacing: 12) {
                        // Hold-to-record button
                        Button {} label: {
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(viewModel.isRecording ? Color.red : EmoryTheme.textSecondary)
                                    .frame(width: 12, height: 12)
                                    .overlay(
                                        Circle().stroke(.white, lineWidth: 1)
                                    )
                                Text(viewModel.isRecording ? "Recording..." : "Hold to Record")
                                    .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            }
                            .foregroundStyle(viewModel.isRecording ? .red : EmoryTheme.textPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(viewModel.isRecording ? Color.red.opacity(0.1) : EmoryTheme.cardBackground)
                            .clipShape(Capsule())
                            .shadow(color: EmoryTheme.cardShadow, radius: 6, x: 0, y: 2)
                        }
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { _ in
                                    if !viewModel.isRecording {
                                        viewModel.startRecording()
                                    }
                                }
                                .onEnded { _ in
                                    if viewModel.isRecording {
                                        viewModel.stopRecording()
                                    }
                                }
                        )

                        // Playback button
                        if viewModel.hasRecording {
                            Button {
                                if viewModel.isPlayingRecording {
                                    viewModel.stopPlayback()
                                } else {
                                    viewModel.playRecording()
                                }
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: viewModel.isPlayingRecording ? "stop.fill" : "play.fill")
                                        .font(.system(size: 14))
                                    Text(viewModel.isPlayingRecording
                                         ? "Stop Playback"
                                         : "Play Recording (\(String(format: "%.1fs", viewModel.recordingDuration)))")
                                        .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(viewModel.isPlayingRecording ? .orange : EmoryTheme.primary)
                                .clipShape(Capsule())
                            }
                        }
                    }
                }

                // MARK: Debug Logs
                DebugPanelView(
                    events: viewModel.debugEvents,
                    frameCount: viewModel.frameCount,
                    fps: viewModel.fps
                )
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("Emory")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Back") {}
                    .foregroundStyle(EmoryTheme.textPrimary)
            }
        }
        // Don't cleanup on tab switch — let streaming continue in background.
        // Cleanup happens in stopSession() when user explicitly stops.
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
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
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
            Text("This is \(person.name) — \(person.relationship)")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(EmoryTheme.secondary.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 8)
    }
}

// MARK: - Audio Monitoring Card

struct AudioMonitoringCard: View {
    let audioLevel: Float
    let isCapturing: Bool
    let fontSize: EmoryTheme.FontSize

    private var decibelValue: Int {
        if audioLevel <= 0 { return -60 }
        let db = 20 * log10(audioLevel)
        return max(-60, min(0, Int(db)))
    }

    private var levelLabel: String {
        let db = decibelValue
        if db > -6 { return "Loud" }
        if db > -20 { return "Normal" }
        if db > -40 { return "Quiet" }
        return "Silent"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header row
            HStack(alignment: .top) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(EmoryTheme.primary)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Audio")
                        .font(.system(size: fontSize.bodySize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    Text("Monitoring")
                        .font(.system(size: fontSize.bodySize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(decibelValue) dB")
                        .font(.system(size: fontSize.captionSize, weight: .semibold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    Text("(\(levelLabel))")
                        .font(.system(size: fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textSecondary)
                }
            }

            // Segmented level meter
            SegmentedLevelMeter(level: audioLevel)

            // dB range labels
            HStack {
                Text("-60dB")
                    .font(.system(size: 11))
                    .foregroundStyle(EmoryTheme.textSecondary)
                Spacer()
                Text("0dB")
                    .font(.system(size: 11))
                    .foregroundStyle(EmoryTheme.textSecondary)
            }
        }
        .padding(20)
        .emoryCard()
    }
}

// MARK: - Segmented Level Meter

struct SegmentedLevelMeter: View {
    let level: Float
    private let segmentCount = 12

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<segmentCount, id: \.self) { index in
                let fraction = Float(index) / Float(segmentCount)
                RoundedRectangle(cornerRadius: 2)
                    .fill(colorForSegment(index: index, isActive: level > fraction))
                    .frame(height: 14)
            }
        }
        .animation(.linear(duration: 0.08), value: level)
    }

    private func colorForSegment(index: Int, isActive: Bool) -> Color {
        guard isActive else {
            return Color(.systemGray5)
        }
        let position = Float(index) / Float(segmentCount)
        if position < 0.55 {
            return EmoryTheme.secondary
        } else if position < 0.75 {
            return EmoryTheme.secondary.opacity(0.5)
        } else if position < 0.85 {
            return Color(red: 0.91, green: 0.83, blue: 0.30).opacity(0.7)
        } else {
            return Color(red: 0.88, green: 0.75, blue: 0.75).opacity(0.6)
        }
    }
}

#Preview {
    StreamDashboardView()
}
