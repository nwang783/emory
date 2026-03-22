import AVFoundation

// MARK: - Microphone Capture Service
// Captures audio from the iPhone's built-in microphone using AVAudioEngine.
// Provides a real-time audio level stream for UI and stores recent buffers
// for future backend processing (e.g., speech-to-text, AI assistant).
//
// This runs independently of the Meta DAT SDK — video comes from glasses,
// audio comes from iPhone mic.

@MainActor
final class MicrophoneCaptureService {
    struct ConversationRecordingFile {
        let url: URL
        let duration: TimeInterval
        let mimeType: String
    }

    static let shared = MicrophoneCaptureService()

    // MARK: - State

    private let audioEngine = AVAudioEngine()
    private var levelContinuation: AsyncStream<Float>.Continuation?
    private(set) var isCapturing = false

    // Ring buffer of recent audio for future backend use (~10 seconds)
    // Accessed only on bufferQueue to avoid main thread contention
    private var recentBuffers: [AVAudioPCMBuffer] = []
    private let maxBufferCount = 300 // ~10s at 1024 samples / 48kHz
    private let bufferQueue = DispatchQueue(label: "com.emory.audioBuffers")

    // Recording state
    private(set) var isRecording = false
    private var recordingBuffers: [AVAudioPCMBuffer] = []
    private var recordingFormat: AVAudioFormat?
    private(set) var isConversationRecording = false
    private var conversationRecordingFile: AVAudioFile?
    private var conversationRecordingURL: URL?
    private var conversationRecordingStartedAt: Date?
    private var conversationRecordingWriteError: String?

    // External audio callback (for bridge server forwarding)
    var onAudioBuffer: ((AVAudioPCMBuffer, Double, Int) -> Void)?

    // Playback state
    private var audioPlayer: AVAudioPlayerNode?
    private var playbackEngine: AVAudioEngine?
    private(set) var isPlaying = false
    private(set) var hasRecording = false
    private(set) var recordingDuration: TimeInterval = 0

    // MARK: - Audio Level Stream

    lazy var audioLevelStream: AsyncStream<Float> = {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            self.levelContinuation = continuation
            continuation.yield(0.0)
        }
    }()

    // MARK: - Start Capture

    func start(audioSource: AudioSource = .iphone) throws {
        guard !isCapturing else { return }

        let session = AVAudioSession.sharedInstance()

        // voiceChat mode enables AGC + echo cancellation + noise suppression
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [
            .defaultToSpeaker,
            .allowBluetooth,
            .allowBluetoothA2DP
        ])
        try session.setActive(true)

        Self.selectPreferredInput(source: audioSource)

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        let activeInput = session.currentRoute.inputs.first
        print("[Mic] Starting capture: \(format.sampleRate)Hz, \(format.channelCount)ch, source=\(audioSource.rawValue), activePort=\(activeInput?.portName ?? "none")")

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            let level = Self.computeRMS(buffer)
            self.levelContinuation?.yield(level)

            // Forward to bridge server if callback is set
            self.onAudioBuffer?(buffer, format.sampleRate, Int(format.channelCount))

            if self.isConversationRecording, let file = self.conversationRecordingFile {
                do {
                    try file.write(from: buffer)
                } catch {
                    self.conversationRecordingWriteError = error.localizedDescription
                    self.isConversationRecording = false
                    self.conversationRecordingFile = nil
                    print("[Mic] Conversation recording write failed: \(error.localizedDescription)")
                }
            }

            // Store buffer on a background queue to avoid main thread contention
            self.bufferQueue.async { [weak self] in
                guard let self = self else { return }
                self.recentBuffers.append(buffer)
                if self.recentBuffers.count > self.maxBufferCount {
                    self.recentBuffers.removeFirst()
                }
                if self.isRecording {
                    self.recordingBuffers.append(buffer)
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
        isCapturing = true

        // Monitor audio route changes — restart engine if route switches
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self, self.isCapturing else { return }
            let reason = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
                .flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }
            let currentInput = AVAudioSession.sharedInstance().currentRoute.inputs.first?.portName ?? "none"
            print("[Mic] Route changed: reason=\(reason?.rawValue ?? 99), input=\(currentInput)")

            // Restart engine to pick up new route
            if !self.audioEngine.isRunning {
                print("[Mic] Engine stopped after route change, restarting...")
                try? self.audioEngine.start()
            }
        }

        print("[Mic] Capture started")
    }

    // MARK: - Stop Capture

    func stop() {
        guard isCapturing else { return }

        NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        isCapturing = false
        bufferQueue.sync { recentBuffers.removeAll() }
        levelContinuation?.yield(0.0)
        print("[Mic] Capture stopped")
    }

    // MARK: - Get Recent Buffers (for future backend use)

    func getRecentBuffers() -> [AVAudioPCMBuffer] {
        return bufferQueue.sync { recentBuffers }
    }

    // MARK: - Recording

    func startRecording() {
        guard isCapturing, !isRecording else { return }
        recordingBuffers.removeAll()
        recordingFormat = audioEngine.inputNode.outputFormat(forBus: 0)
        isRecording = true
        print("[Mic] Recording started")
    }

    func stopRecording() {
        guard isRecording else { return }
        isRecording = false
        hasRecording = !recordingBuffers.isEmpty

        if let format = recordingFormat, !recordingBuffers.isEmpty {
            let totalFrames = recordingBuffers.reduce(0) { $0 + Int($1.frameLength) }
            recordingDuration = Double(totalFrames) / format.sampleRate
        }

        print("[Mic] Recording stopped: \(recordingBuffers.count) buffers, \(String(format: "%.1f", recordingDuration))s")
    }

    func startConversationRecording() throws {
        guard isCapturing else {
            throw NSError(domain: "MicrophoneCaptureService", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Microphone capture is not active"
            ])
        }
        guard !isConversationRecording else { return }

        let format = audioEngine.inputNode.outputFormat(forBus: 0)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("emory-conversations", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
        let url = dir.appendingPathComponent(UUID().uuidString).appendingPathExtension("wav")
        let file = try AVAudioFile(
            forWriting: url,
            settings: format.settings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        )

        conversationRecordingFile = file
        conversationRecordingURL = url
        conversationRecordingStartedAt = Date()
        conversationRecordingWriteError = nil
        isConversationRecording = true
        print("[Mic] Conversation recording started: \(url.lastPathComponent)")
    }

    func stopConversationRecording() -> ConversationRecordingFile? {
        guard isConversationRecording || conversationRecordingURL != nil else { return nil }

        let url = conversationRecordingURL
        let startedAt = conversationRecordingStartedAt
        let writeError = conversationRecordingWriteError

        isConversationRecording = false
        conversationRecordingFile = nil
        conversationRecordingURL = nil
        conversationRecordingStartedAt = nil
        conversationRecordingWriteError = nil

        guard let url else { return nil }

        if let writeError {
            try? FileManager.default.removeItem(at: url)
            print("[Mic] Conversation recording discarded after write error: \(writeError)")
            return nil
        }

        let duration = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        print("[Mic] Conversation recording stopped: \(url.lastPathComponent), \(String(format: "%.1f", duration))s")
        return ConversationRecordingFile(url: url, duration: duration, mimeType: "audio/wav")
    }

    // MARK: - Playback

    func playRecording() {
        guard hasRecording, !isPlaying, !recordingBuffers.isEmpty, let format = recordingFormat else { return }

        // Stop mic capture temporarily so we can hear playback
        let wasCapturing = isCapturing
        if wasCapturing {
            audioEngine.inputNode.removeTap(onBus: 0)
            audioEngine.stop()
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)

            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)

            try engine.start()
            self.playbackEngine = engine
            self.audioPlayer = player
            self.isPlaying = true

            // Merge all buffers into one
            let totalFrames = recordingBuffers.reduce(0) { $0 + Int($1.frameLength) }
            guard let mergedBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(totalFrames)) else {
                print("[Mic] Failed to create merged buffer")
                return
            }

            var offset: AVAudioFrameCount = 0
            for buf in recordingBuffers {
                let frames = buf.frameLength
                guard let srcData = buf.floatChannelData, let dstData = mergedBuffer.floatChannelData else { continue }
                for ch in 0..<Int(format.channelCount) {
                    dstData[ch].advanced(by: Int(offset)).update(from: srcData[ch], count: Int(frames))
                }
                offset += frames
            }
            mergedBuffer.frameLength = offset

            player.scheduleBuffer(mergedBuffer) { [weak self] in
                DispatchQueue.main.async {
                    self?.stopPlayback()
                    if wasCapturing {
                        try? self?.start()
                    }
                }
            }
            player.play()
            print("[Mic] Playback started")
        } catch {
            print("[Mic] Playback failed: \(error)")
            isPlaying = false
            if wasCapturing {
                try? start()
            }
        }
    }

    func stopPlayback() {
        audioPlayer?.stop()
        playbackEngine?.stop()
        audioPlayer = nil
        playbackEngine = nil
        isPlaying = false
        print("[Mic] Playback stopped")
    }

    // MARK: - Audio Route Selection

    /// Sets `AVAudioSession.preferredInput` to the built-in mic or a Bluetooth (Ray-Ban) input.
    private static func selectPreferredInput(source: AudioSource) {
        let session = AVAudioSession.sharedInstance()
        guard let availableInputs = session.availableInputs else {
            print("[Mic] No available inputs to select from")
            return
        }

        print("[Mic] Available inputs: \(availableInputs.map { "\($0.portName) (\($0.portType.rawValue))" })")

        switch source {
        case .iphone:
            let builtIn = availableInputs.first { $0.portType == .builtInMic }
            if let mic = builtIn {
                do {
                    try session.setPreferredInput(mic)
                    print("[Mic] Preferred input → iPhone built-in mic")
                } catch {
                    print("[Mic] Failed to set preferred input to built-in: \(error.localizedDescription)")
                }
            }

        case .rayBans:
            let bluetooth = availableInputs.first { port in
                let isBT = [
                    AVAudioSession.Port.bluetoothHFP,
                    AVAudioSession.Port.bluetoothA2DP,
                    AVAudioSession.Port.bluetoothLE
                ].contains(port.portType)
                let name = port.portName.lowercased()
                let isMeta = name.contains("ray-ban") || name.contains("meta")
                return isBT && isMeta
            }
            // If no Meta device found, fall back to any Bluetooth input
            let anyBluetooth = bluetooth ?? availableInputs.first { port in
                [AVAudioSession.Port.bluetoothHFP,
                 AVAudioSession.Port.bluetoothA2DP,
                 AVAudioSession.Port.bluetoothLE].contains(port.portType)
            }
            if let bt = anyBluetooth {
                do {
                    try session.setPreferredInput(bt)
                    print("[Mic] Preferred input → \(bt.portName) (\(bt.portType.rawValue))")
                } catch {
                    print("[Mic] Failed to set preferred input to Bluetooth: \(error.localizedDescription)")
                }
            } else {
                print("[Mic] No Bluetooth input found — falling back to default")
            }
        }
    }

    // MARK: - RMS Computation

    private static func computeRMS(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0.0 }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return 0.0 }

        let samples = channelData[0]
        var sum: Float = 0.0
        for i in 0..<frames {
            let sample = samples[i]
            sum += sample * sample
        }

        let rms = sqrt(sum / Float(frames))

        // Normalize to 0.0 - 1.0 range (RMS is typically 0.0 - 0.5 for speech)
        let normalized = min(rms * 3.0, 1.0)
        return normalized
    }
}
