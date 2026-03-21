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

    // MARK: - State

    private let audioEngine = AVAudioEngine()
    private var levelContinuation: AsyncStream<Float>.Continuation?
    private(set) var isCapturing = false

    // Ring buffer of recent audio for future backend use (~10 seconds)
    private var recentBuffers: [AVAudioPCMBuffer] = []
    private let maxBufferCount = 300 // ~10s at 1024 samples / 48kHz

    // Recording state
    private(set) var isRecording = false
    private var recordingBuffers: [AVAudioPCMBuffer] = []
    private var recordingFormat: AVAudioFormat?

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

    func start() throws {
        guard !isCapturing else { return }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [
            .defaultToSpeaker,
            .allowBluetooth
        ])
        try session.setActive(true)

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        print("[Mic] Starting capture: \(format.sampleRate)Hz, \(format.channelCount)ch")

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            let level = Self.computeRMS(buffer)
            self?.levelContinuation?.yield(level)

            // Store buffer for future backend use + recording
            DispatchQueue.main.async {
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
        print("[Mic] Capture started")
    }

    // MARK: - Stop Capture

    func stop() {
        guard isCapturing else { return }

        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        isCapturing = false
        recentBuffers.removeAll()
        levelContinuation?.yield(0.0)
        print("[Mic] Capture stopped")
    }

    // MARK: - Get Recent Buffers (for future backend use)

    func getRecentBuffers() -> [AVAudioPCMBuffer] {
        return recentBuffers
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
