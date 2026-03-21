import UIKit

// Conditional import — this file only compiles when the Meta DAT SDK
// is added via SPM. Until then, the app uses MockMetaWearablesService.
#if canImport(MWDATCore) && canImport(MWDATCamera)
import MWDATCore
import MWDATCamera

// MARK: - Real Meta Wearables Service
// Wraps the Meta Wearables DAT SDK for actual glasses connectivity.
//
// Integration steps (do these in Xcode BEFORE this file will compile):
// 1. File → Add Package Dependencies
// 2. URL: https://github.com/facebook/meta-wearables-dat-ios
// 3. Add products: MWDATCore, MWDATCamera (and MWDATMockDevice for testing)
// 4. Link to your app target

@MainActor
final class RealMetaWearablesService: MetaWearablesService {

    // MARK: - Private State

    private var streamSession: StreamSession?
    private var deviceSelector: AutoDeviceSelector?
    private var listenerTokens: [AnyListenerToken] = []
    private let audioDetector = AudioRouteDetector()

    // Continuations for async streams (nonisolated-safe via @unchecked Sendable wrapper)
    private var connectionContinuation: AsyncStream<ConnectionState>.Continuation?
    private var sessionContinuation: AsyncStream<SessionState>.Continuation?
    private var frameContinuation: AsyncStream<UIImage>.Continuation?

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

    lazy var videoFrameStream: AsyncStream<UIImage> = {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            self.frameContinuation = continuation
        }
    }()

    lazy var audioStatusStream: AsyncStream<Bool> = {
        // Use AVAudioSession-based detection since the Meta DAT SDK
        // has no audio API. Detects Bluetooth routes from Ray-Ban glasses.
        audioDetector.audioAvailabilityStream()
    }()

    // MARK: - SDK Initialization
    // Call this ONCE at app launch (e.g., in App.init)

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

            // Wait for registration to complete
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
        // Devices won't show until permission is granted
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

        // Step 4: Create stream session with auto device selector
        let selector = AutoDeviceSelector(wearables: wearables)
        self.deviceSelector = selector

        let config = StreamSessionConfig(
            videoCodec: .raw,
            resolution: .high,      // 720x1280
            frameRate: 15
        )

        let session = StreamSession(
            streamSessionConfig: config,
            deviceSelector: selector
        )
        self.streamSession = session

        // Subscribe to session state changes
        let sessionCont = self.sessionContinuation
        let stateToken = session.statePublisher.listen { state in
            print("[DAT] Session state: \(state)")
            Task { @MainActor in
                switch state {
                case .stopped:      sessionCont?.yield(.idle)
                case .waitingForDevice, .starting: sessionCont?.yield(.starting)
                case .streaming:    sessionCont?.yield(.streaming)
                case .paused:       sessionCont?.yield(.paused)
                case .stopping:     sessionCont?.yield(.stopping)
                @unknown default:   sessionCont?.yield(.idle)
                }
            }
        }
        listenerTokens.append(stateToken)

        // Subscribe to video frames
        let frameCont = self.frameContinuation
        let frameToken = session.videoFramePublisher.listen { [weak self] frame in
            if let image = frame.makeUIImage() {
                print("[DAT] Got frame: \(Int(image.size.width))x\(Int(image.size.height))")
                frameCont?.yield(image)
                Task { @MainActor in
                    self?.updateCurrentFrame(image)
                }
            }
        }
        listenerTokens.append(frameToken)

        // Subscribe to errors
        let connCont = self.connectionContinuation
        let errorToken = session.errorPublisher.listen { error in
            print("[DAT] Stream ERROR: \(error)")
            Task { @MainActor in
                switch error {
                case .deviceNotFound, .deviceNotConnected:
                    connCont?.yield(.disconnected)
                    sessionCont?.yield(.error)
                case .permissionDenied:
                    sessionCont?.yield(.error)
                case .hingesClosed, .thermalCritical:
                    sessionCont?.yield(.paused)
                default:
                    sessionCont?.yield(.error)
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

        // Cancel all listener subscriptions
        listenerTokens.removeAll()

        sessionContinuation?.yield(.idle)
        connectionContinuation?.yield(.disconnected)
    }

    // MARK: - Capture Snapshot

    func captureSnapshot() async -> UIImage? {
        return currentFrame
    }

    // Keep a reference to the latest frame for snapshot use
    private var currentFrame: UIImage?

    func updateCurrentFrame(_ image: UIImage) {
        currentFrame = image
    }
}

#else

// MARK: - Stub when SDK not imported
// This allows the project to compile without the Meta DAT SDK.
// The app will use MockMetaWearablesService until the SDK is added.

final class RealMetaWearablesService: MetaWearablesService {
    var connectionStateStream: AsyncStream<ConnectionState> {
        AsyncStream { $0.yield(.disconnected); $0.finish() }
    }
    var sessionStateStream: AsyncStream<SessionState> {
        AsyncStream { $0.yield(.idle); $0.finish() }
    }
    var videoFrameStream: AsyncStream<UIImage> {
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
