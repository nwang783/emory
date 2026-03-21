import UIKit
import CoreMedia

// Conditional import — this file only compiles when the Meta DAT SDK
// is added via SPM. Until then, the app uses MockMetaWearablesService.
#if canImport(MWDATCore) && canImport(MWDATCamera)
import MWDATCore
import MWDATCamera

// MARK: - Real Meta Wearables Service
// Wraps the Meta Wearables DAT SDK for actual glasses connectivity.
// Uses HEVC (.hvc1) codec for hardware-accelerated encoding on the glasses.
// Forwards CMSampleBuffer directly to avoid unnecessary UIImage conversions.

@MainActor
final class RealMetaWearablesService: MetaWearablesService {

    // MARK: - Private State

    private var streamSession: StreamSession?
    private var deviceSelector: AutoDeviceSelector?
    private var listenerTokens: [AnyListenerToken] = []
    private let audioDetector = AudioRouteDetector()

    private var connectionContinuation: AsyncStream<ConnectionState>.Continuation?
    private var sessionContinuation: AsyncStream<SessionState>.Continuation?
    private var frameContinuation: AsyncStream<VideoFrameData>.Continuation?

    // MARK: - Streams

    lazy var connectionStateStream: AsyncStream<ConnectionState> = {
        AsyncStream { continuation in
            self.connectionContinuation = continuation
            continuation.yield(.disconnected)
        }
    }()

    lazy var sessionStateStream: AsyncStream<SessionState> = {
        AsyncStream { continuation in
            self.sessionContinuation = continuation
            continuation.yield(.idle)
        }
    }()

    lazy var videoFrameStream: AsyncStream<VideoFrameData> = {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            self.frameContinuation = continuation
        }
    }()

    lazy var audioStatusStream: AsyncStream<Bool> = {
        audioDetector.audioAvailabilityStream()
    }()

    // MARK: - SDK Initialization

    static func configure() throws {
        try Wearables.configure()
    }

    // MARK: - Start

    func start() async throws {
        let wearables = Wearables.shared
        connectionContinuation?.yield(.connecting)
        sessionContinuation?.yield(.starting)

        // Step 1: Register with Meta AI companion app
        print("[DAT] Current registration state: \(wearables.registrationState)")
        if wearables.registrationState != .registered {
            print("[DAT] Calling startRegistration()...")
            try await wearables.startRegistration()
            print("[DAT] startRegistration() returned, waiting for .registered state...")

            for await state in wearables.registrationStateStream() {
                print("[DAT] Registration state changed: \(state)")
                if state == .registered {
                    break
                }
            }
        }
        print("[DAT] Registered!")

        // Step 2: Request camera permission
        print("[DAT] Requesting camera permission...")
        let permStatus = try await wearables.requestPermission(.camera)
        print("[DAT] Camera permission: \(permStatus)")
        guard permStatus == .granted else {
            print("[DAT] Camera permission denied!")
            connectionContinuation?.yield(.disconnected)
            sessionContinuation?.yield(.error)
            return
        }

        // Step 3: Wait for a device to appear
        print("[DAT] Waiting for device to appear in devicesStream...")
        var foundDevice = false
        for await devices in wearables.devicesStream() {
            print("[DAT] Devices update: \(devices.count) device(s)")
            if !devices.isEmpty {
                foundDevice = true
                connectionContinuation?.yield(.connected)
                print("[DAT] Device found! Starting stream session...")
                break
            }
        }

        guard foundDevice else {
            print("[DAT] No device found")
            connectionContinuation?.yield(.disconnected)
            sessionContinuation?.yield(.error)
            return
        }

        // Step 4: Create stream session — use HEVC for hardware encoding on glasses
        let selector = AutoDeviceSelector(wearables: wearables)
        self.deviceSelector = selector

        let config = StreamSessionConfig(
            videoCodec: .raw,        // Raw frames — makeUIImage works, bridge gets JPEG fallback
            resolution: .high,       // 720x1280
            frameRate: 15
        )

        let session = StreamSession(
            streamSessionConfig: config,
            deviceSelector: selector
        )
        self.streamSession = session

        // Subscribe to session state changes
        let stateToken = session.statePublisher.listen { [weak self] state in
            print("[DAT] Session state: \(state)")
            Task { @MainActor in
                guard let self = self else { return }
                switch state {
                case .stopped:      self.sessionContinuation?.yield(.idle)
                case .waitingForDevice, .starting: self.sessionContinuation?.yield(.starting)
                case .streaming:    self.sessionContinuation?.yield(.streaming)
                case .paused:       self.sessionContinuation?.yield(.paused)
                case .stopping:     self.sessionContinuation?.yield(.stopping)
                @unknown default:   self.sessionContinuation?.yield(.idle)
                }
            }
        }
        listenerTokens.append(stateToken)

        // Subscribe to video frames — always yield, even if UIImage creation fails
        let frameToken = session.videoFramePublisher.listen { [weak self] frame in
            let sampleBuffer = frame.sampleBuffer
            let image = frame.makeUIImage() // May be nil with HEVC codec

            let frameData: VideoFrameData
            if let image = image {
                frameData = VideoFrameData(sampleBuffer: sampleBuffer, image: image)
            } else {
                frameData = VideoFrameData(sampleBuffer: sampleBuffer)
            }

            print("[DAT] Got frame (image=\(image != nil ? "yes" : "nil"), sbuf=yes)")

            Task { @MainActor in
                guard let self = self else { return }
                self.frameContinuation?.yield(frameData)
                if let image = image {
                    self.currentFrame = image
                }
            }
        }
        listenerTokens.append(frameToken)

        // Subscribe to errors
        let errorToken = session.errorPublisher.listen { [weak self] error in
            print("[DAT] Stream ERROR: \(error)")
            Task { @MainActor in
                guard let self = self else { return }
                switch error {
                case .deviceNotFound, .deviceNotConnected:
                    self.connectionContinuation?.yield(.disconnected)
                    self.sessionContinuation?.yield(.error)
                case .permissionDenied:
                    self.sessionContinuation?.yield(.error)
                case .hingesClosed, .thermalCritical:
                    self.sessionContinuation?.yield(.paused)
                default:
                    self.sessionContinuation?.yield(.error)
                }
            }
        }
        listenerTokens.append(errorToken)

        // Step 5: Start the stream
        print("[DAT] Calling session.start()...")
        await session.start()
        print("[DAT] session.start() returned")
    }

    // MARK: - Stop

    func stop() async {
        if let session = streamSession {
            await session.stop()
        }
        streamSession = nil
        listenerTokens.removeAll()
        sessionContinuation?.yield(.idle)
        connectionContinuation?.yield(.disconnected)
    }

    // MARK: - Capture Snapshot

    func captureSnapshot() async -> UIImage? {
        return currentFrame
    }

    private var currentFrame: UIImage?
}

#else

// MARK: - Stub when SDK not imported

final class RealMetaWearablesService: MetaWearablesService {
    var connectionStateStream: AsyncStream<ConnectionState> {
        AsyncStream { $0.yield(.disconnected); $0.finish() }
    }
    var sessionStateStream: AsyncStream<SessionState> {
        AsyncStream { $0.yield(.idle); $0.finish() }
    }
    var videoFrameStream: AsyncStream<VideoFrameData> {
        AsyncStream { $0.finish() }
    }
    var audioStatusStream: AsyncStream<Bool> {
        AsyncStream { $0.yield(false); $0.finish() }
    }

    func start() async throws {
        print("[RealMetaWearablesService] SDK not imported. Add MWDATCore + MWDATCamera via SPM.")
    }
    func stop() async {}
    func captureSnapshot() async -> UIImage? { nil }
}

#endif
