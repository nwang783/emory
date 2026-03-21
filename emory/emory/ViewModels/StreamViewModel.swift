import SwiftUI
import UIKit
import Observation

// MARK: - Stream View Model
// Drives all UI state for the dashboard. Subscribes to the
// MetaWearablesService streams and tracks FPS, frame count,
// and debug events.
// Uses @Observable (Swift 5.9+ / Observation framework) instead of
// ObservableObject/@Published for Xcode 26 compatibility.

@MainActor
@Observable
final class StreamViewModel {

    // MARK: - State

    var connectionState: ConnectionState = .disconnected
    var sessionState: SessionState = .idle

    // Video
    var currentFrame: UIImage?
    var frameCount: Int = 0
    var fps: Double = 0.0
    var resolution: String = "—"
    var lastFrameTime: Date?

    // Audio
    var audioAvailable: Bool = false
    var audioLevel: Float = 0.0
    var isMicCapturing: Bool = false
    var isRecording: Bool = false
    var isPlayingRecording: Bool = false
    var hasRecording: Bool = false
    var recordingDuration: TimeInterval = 0

    // Debug
    var debugEvents: [DebugEvent] = []

    // Snapshot
    var lastSnapshot: UIImage?

    // MARK: - Private

    private let service: MetaWearablesService
    private let micService = MicrophoneCaptureService()
    private var streamTasks: [Task<Void, Never>] = []
    private var fpsTimer: Timer?
    private var framesThisSecond: Int = 0

    // MARK: - Init

    init(service: MetaWearablesService? = nil) {
        // Use real service for glasses, mock for testing
        self.service = service ?? RealMetaWearablesService()
        log("ViewModel initialized (real mode)")
        subscribeToStreams()
    }

    // MARK: - Actions

    func startSession() {
        log("Starting session...")
        let service = self.service

        // Reset counters
        frameCount = 0
        fps = 0
        framesThisSecond = 0
        startFPSTimer()

        let task = Task {
            do {
                try await service.start()
                log("Session started successfully")

                // Start iPhone mic capture alongside glasses video
                do {
                    try self.micService.start()
                    self.isMicCapturing = true
                    self.log("Microphone capture started")
                } catch {
                    self.log("Mic start failed: \(error.localizedDescription)", level: .error)
                }
            } catch {
                log("Failed to start session: \(error.localizedDescription)", level: .error)
            }
        }
        streamTasks.append(task)
    }

    func stopSession() {
        log("Stopping session...")
        let service = self.service

        // Stop mic capture
        micService.stop()
        isMicCapturing = false
        audioLevel = 0.0
        log("Microphone capture stopped")

        let task = Task {
            await service.stop()
            log("Session stopped")
        }
        streamTasks.append(task)
        stopFPSTimer()
    }

    func startMicOnly() {
        guard !isMicCapturing else { return }
        log("Starting mic-only mode (no glasses)...")
        do {
            try micService.start()
            isMicCapturing = true
            log("Mic-only mode active")
        } catch {
            log("Mic start failed: \(error.localizedDescription)", level: .error)
        }
    }

    func stopMicOnly() {
        guard isMicCapturing else { return }
        micService.stop()
        isMicCapturing = false
        audioLevel = 0.0
        log("Mic-only mode stopped")
    }

    func startRecording() {
        micService.startRecording()
        isRecording = true
        log("Recording started — hold to record")
    }

    func stopRecording() {
        micService.stopRecording()
        isRecording = false
        hasRecording = micService.hasRecording
        recordingDuration = micService.recordingDuration
        log("Recording stopped (\(String(format: "%.1f", recordingDuration))s)")
    }

    func playRecording() {
        guard hasRecording else { return }
        log("Playing recording...")
        isPlayingRecording = true
        micService.playRecording()

        // Poll for playback completion
        Task {
            while micService.isPlaying {
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            self.isPlayingRecording = false
            self.log("Playback finished")
        }
    }

    func stopPlayback() {
        micService.stopPlayback()
        isPlayingRecording = false
        log("Playback stopped")
    }

    func captureSnapshot() {
        log("Capturing snapshot...")
        let service = self.service

        Task {
            if let image = await service.captureSnapshot() {
                self.lastSnapshot = image
                log("Snapshot captured (\(Int(image.size.width))x\(Int(image.size.height)))")
            } else {
                log("Snapshot failed — no active stream", level: .warning)
            }
        }
    }

    // MARK: - Stream Subscriptions

    private func subscribeToStreams() {
        let service = self.service

        // Connection state
        let connTask = Task {
            for await state in service.connectionStateStream {
                self.connectionState = state
                self.log("Connection: \(state.rawValue)")
            }
        }

        // Session state
        let sessTask = Task {
            for await state in service.sessionStateStream {
                self.sessionState = state
                self.log("Session: \(state.rawValue)")
            }
        }

        // Video frames
        let frameTask = Task {
            for await frame in service.videoFrameStream {
                self.currentFrame = frame
                self.frameCount += 1
                self.framesThisSecond += 1
                self.lastFrameTime = Date()
                self.resolution = "\(Int(frame.size.width))x\(Int(frame.size.height))"
            }
        }

        // Audio status
        let audioTask = Task {
            for await available in service.audioStatusStream {
                self.audioAvailable = available
                self.log("Audio: \(available ? "available" : "unavailable")")
            }
        }

        // Mic audio level
        let micTask = Task {
            for await level in self.micService.audioLevelStream {
                self.audioLevel = level
            }
        }

        streamTasks.append(contentsOf: [connTask, sessTask, frameTask, audioTask, micTask])
    }

    // MARK: - FPS Tracking

    private func startFPSTimer() {
        fpsTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                self.fps = Double(self.framesThisSecond)
                self.framesThisSecond = 0
            }
        }
    }

    private func stopFPSTimer() {
        fpsTimer?.invalidate()
        fpsTimer = nil
    }

    // MARK: - Debug Logging

    func log(_ message: String, level: DebugEvent.Level = .info) {
        let event = DebugEvent(message, level: level)
        debugEvents.insert(event, at: 0)

        // Keep last 200 events to avoid unbounded growth
        if debugEvents.count > 200 {
            debugEvents = Array(debugEvents.prefix(200))
        }
    }

    func cleanup() {
        streamTasks.forEach { $0.cancel() }
        fpsTimer?.invalidate()
        micService.stop()
    }
}
