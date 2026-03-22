import SwiftUI
import UIKit
import Observation
import QuartzCore

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

    private var service: MetaWearablesService?
    private let micService = MicrophoneCaptureService()
    let bridgeService = BridgeServerService()
    private var streamTasks: [Task<Void, Never>] = []
    private var fpsTimer: Timer?
    private var framesThisSecond: Int = 0
    private var lastAudioLevelUpdate: Date = .distantPast
    private var isStreaming: Bool = false

    // MARK: - Init (lightweight — no SDK or stream work)

    init() {
        log("ViewModel ready")
    }

    // MARK: - Actions

    func startSession() {
        guard !isStreaming else { return }
        isStreaming = true
        log("Starting session...")

        // Configure SDK on first use, not at app launch
        emoryApp.configureSDKIfNeeded()

        // Create service lazily — only when user taps Start
        let svc = RealMetaWearablesService()
        self.service = svc

        // Forward mic audio to bridge server
        micService.onAudioBuffer = { [weak self] buffer, sampleRate, channels in
            self?.bridgeService.sendAudioChunk(buffer, sampleRate: sampleRate, channels: channels)
        }

        // Reset counters
        frameCount = 0
        fps = 0
        framesThisSecond = 0

        // Subscribe to streams FIRST so continuations are ready
        subscribeToStreams(service: svc)
        subscribeToBridge()
        connectBridgeIfConfigured()
        startFPSTimer()

        // Yield once to let the for-await loops start and register continuations
        let task = Task {
            await Task.yield()

            do {
                try await svc.start()
                self.log("Session started successfully")
                self.bridgeService.sendSessionStart()

                // Start mic capture alongside glasses video — route depends on user setting
                let audioSrc = AppSettings.shared.audioSource
                do {
                    try self.micService.start(audioSource: audioSrc)
                    self.isMicCapturing = true
                    self.log("Microphone capture started (source: \(audioSrc.rawValue))")
                } catch {
                    self.log("Mic start failed: \(error.localizedDescription)", level: .error)
                }
            } catch {
                self.log("Failed to start session: \(error.localizedDescription)", level: .error)
            }
        }
        streamTasks.append(task)
    }

    func stopSession() {
        guard isStreaming else { return }
        log("Stopping session...")

        // Stop mic capture
        bridgeService.sendSessionEnd()
        micService.stop()
        isMicCapturing = false
        audioLevel = 0.0
        log("Microphone capture stopped")

        let svc = self.service
        let task = Task {
            await svc?.stop()
            self.log("Session stopped")
        }
        streamTasks.append(task)
        stopFPSTimer()

        // Cancel all stream subscriptions
        cleanup()
        isStreaming = false
        sessionState = .idle
        connectionState = .disconnected
        currentFrame = nil
    }

    func startMicOnly() {
        guard !isMicCapturing else { return }
        log("Starting mic-only mode (no glasses)...")
        do {
            try micService.start(audioSource: AppSettings.shared.audioSource)
            isMicCapturing = true

            // Subscribe to mic level if not already
            if streamTasks.isEmpty {
                let micTask = Task {
                    for await level in self.micService.audioLevelStream {
                        let now = Date()
                        if now.timeIntervalSince(self.lastAudioLevelUpdate) >= 0.1 {
                            self.audioLevel = level
                            self.lastAudioLevelUpdate = now
                        }
                    }
                }
                streamTasks.append(micTask)
            }

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
        // Cancel mic task
        streamTasks.forEach { $0.cancel() }
        streamTasks.removeAll()
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
        let svc = self.service

        Task {
            if let image = await svc?.captureSnapshot() {
                self.lastSnapshot = image
                log("Snapshot captured (\(Int(image.size.width))x\(Int(image.size.height)))")
            } else {
                log("Snapshot failed — no active stream", level: .warning)
            }
        }
    }

    // MARK: - Stream Subscriptions (only called when session starts)

    private func subscribeToStreams(service: MetaWearablesService) {
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

        // Video frames — use VideoFrameData for efficient pipeline
        let frameTask = Task {
            for await var frameData in service.videoFrameStream {
                self.frameCount += 1
                self.framesThisSecond += 1
                self.lastFrameTime = Date()

                // Get display image if available (nil with HEVC codec)
                if let displayImage = frameData.displayImage {
                    self.currentFrame = displayImage
                    self.resolution = "\(Int(displayImage.size.width))x\(Int(displayImage.size.height))"
                }

                // Send to bridge — uses HEVC data directly when available
                if self.bridgeService.connectionStatus == .connected {
                    self.bridgeService.sendFrame(frameData, timestamp: Date())
                }
            }
        }

        // Audio status
        let audioTask = Task {
            for await available in service.audioStatusStream {
                self.audioAvailable = available
                self.log("Audio: \(available ? "available" : "unavailable")")
            }
        }

        // Mic audio level — throttled
        let micTask = Task {
            for await level in self.micService.audioLevelStream {
                let now = Date()
                if now.timeIntervalSince(self.lastAudioLevelUpdate) >= 0.1 {
                    self.audioLevel = level
                    self.lastAudioLevelUpdate = now
                }
            }
        }

        streamTasks.append(contentsOf: [connTask, sessTask, frameTask, audioTask, micTask])
    }

    // MARK: - FPS Tracking

    private func startFPSTimer() {
        stopFPSTimer()
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

    private static func webSocketIngestURL(fromBackendHTTP raw: String) -> String? {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              let host = url.host,
              !host.isEmpty,
              scheme == "http" || scheme == "https"
        else { return nil }
        let wsScheme = scheme == "https" ? "wss" : "ws"
        let port = url.port ?? 18_763
        return "\(wsScheme)://\(host):\(port)/ingest?role=publisher"
    }

    private func connectBridgeIfConfigured() {
        let raw = AppSettings.shared.backendURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }

        let wsURL: String?
        if raw.hasPrefix("ws://") || raw.hasPrefix("wss://") {
            var url = raw
            while url.hasSuffix("/") { url.removeLast() }
            if !url.contains("/ingest") {
                url += "/ingest?role=publisher"
            }
            wsURL = url
        } else if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            wsURL = Self.webSocketIngestURL(fromBackendHTTP: raw)
        } else {
            wsURL = nil
        }

        guard let ws = wsURL else {
            log("Bridge: no WebSocket URL (set http://… or ws://… in Settings)", level: .warning)
            return
        }
        log("Bridge: connecting \(ws)")
        connectBridge(url: ws)
    }

    private func subscribeToBridge() {
        let faceTask = Task {
            for await result in self.bridgeService.faceResultStream {
                self.recognizedFaces = result.matches
                if !result.matches.isEmpty {
                    let names = result.matches.map { $0.name }.joined(separator: ", ")
                    self.log("Recognized: \(names) (\(result.ms)ms)")
                }
            }
        }

        let transcriptTask = Task {
            for await transcript in self.bridgeService.transcriptStream {
                self.lastTranscript = transcript.text
                self.log("Transcript: \(transcript.text.prefix(60))...")
            }
        }

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
        service = nil
        isStreaming = false
    }
}
