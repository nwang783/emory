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

    // Bridge server
    var bridgeStatus: BridgeServerService.ConnectionStatus = .disconnected
    var recognizedFaces: [FaceMatch] = []
    var lastTranscript: String?

    // MARK: - Private

    private let service: MetaWearablesService
    private let micService = MicrophoneCaptureService()
    let bridgeService = BridgeServerService()
    private var streamTasks: [Task<Void, Never>] = []
    private var fpsTimer: Timer?
    private var framesThisSecond: Int = 0

    // MARK: - Init

    init(service: MetaWearablesService? = nil) {
        // Use real service for glasses, mock for testing
        self.service = service ?? RealMetaWearablesService()
        log("ViewModel initialized (real mode)")

        // Forward mic audio to bridge server
        micService.onAudioBuffer = { [weak self] buffer, sampleRate, channels in
            self?.bridgeService.sendAudioChunk(buffer, sampleRate: sampleRate, channels: channels)
        }

        subscribeToStreams()
        subscribeToBridge()
        connectBridgeIfConfigured()
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
                self.bridgeService.sendSessionStart()

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
        bridgeService.sendSessionEnd()
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

        // Poll for playback completion — track the task so cleanup can cancel it
        let task = Task {
            while !Task.isCancelled && micService.isPlaying {
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            if !Task.isCancelled {
                self.isPlayingRecording = false
                self.log("Playback finished")
            }
        }
        streamTasks.append(task)
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

        // Video frames — also forward to bridge server
        let frameTask = Task {
            for await frame in service.videoFrameStream {
                self.currentFrame = frame
                self.frameCount += 1
                self.framesThisSecond += 1
                self.lastFrameTime = Date()
                self.resolution = "\(Int(frame.size.width))x\(Int(frame.size.height))"

                // Send to bridge server for face recognition
                self.bridgeService.sendVideoFrame(frame, timestamp: Date())
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
        debugEvents.append(event)

        // Keep last 100 events to avoid unbounded growth
        if debugEvents.count > 100 {
            debugEvents.removeFirst(debugEvents.count - 100)
        }
    }

    // MARK: - Bridge Server

    func connectBridge(url: String) {
        log("Connecting to bridge: \(url)")
        bridgeService.connect(to: url)
        bridgeStatus = bridgeService.connectionStatus
    }

    func disconnectBridge() {
        bridgeService.disconnect()
        bridgeStatus = .disconnected
        log("Bridge disconnected")
    }

    private func connectBridgeIfConfigured() {
        let url = AppSettings.shared.backendURL
        if !url.isEmpty && url.hasPrefix("ws://") {
            connectBridge(url: url)
        }
    }

    private func subscribeToBridge() {
        // Face recognition results
        let faceTask = Task {
            for await result in self.bridgeService.faceResultStream {
                self.recognizedFaces = result.matches
                if !result.matches.isEmpty {
                    let names = result.matches.map { $0.name }.joined(separator: ", ")
                    self.log("Recognized: \(names) (\(result.ms)ms)")
                }
            }
        }

        // Transcripts
        let transcriptTask = Task {
            for await transcript in self.bridgeService.transcriptStream {
                self.lastTranscript = transcript.text
                self.log("Transcript: \(transcript.text.prefix(60))...")
            }
        }

        // Server status
        let statusTask = Task {
            for await status in self.bridgeService.statusStream {
                self.log("Bridge: face=\(status.faceReady), people=\(status.peopleCount)")
            }
        }

        streamTasks.append(contentsOf: [faceTask, transcriptTask, statusTask])
    }

    func cleanup() {
        streamTasks.forEach { $0.cancel() }
        streamTasks.removeAll()
        fpsTimer?.invalidate()
        fpsTimer = nil
        micService.stop()
        bridgeService.disconnect()
    }

}
