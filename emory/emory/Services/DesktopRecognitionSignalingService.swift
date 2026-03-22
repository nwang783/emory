import Foundation

@MainActor
final class DesktopRecognitionSignalingService {
    enum ConnectionStatus: Equatable {
        case disconnected
        case connecting
        case connected
        case error(String)
    }

    var onStatusChange: ((ConnectionStatus) -> Void)?

    private var connectionStatus: ConnectionStatus = .disconnected {
        didSet { onStatusChange?(connectionStatus) }
    }

    private let session = URLSession(configuration: .default)
    private var webSocketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectDelay: UInt64 = 1_000_000_000
    private var shouldReconnect = false

    private var focusContinuation: AsyncStream<DesktopPersonFocusEvent>.Continuation?

    lazy var focusEventStream: AsyncStream<DesktopPersonFocusEvent> = {
        AsyncStream { continuation in
            self.focusContinuation = continuation
        }
    }()

    func start() {
        shouldReconnect = true
        reconnectDelay = 1_000_000_000
        reconnectTask?.cancel()
        Task {
            await connectFromSettings()
        }
    }

    func stop() {
        shouldReconnect = false
        reconnectTask?.cancel()
        reconnectTask = nil
        teardownSocket(status: .disconnected)
    }

    private func connectFromSettings() async {
        teardownSocket(status: .connecting)
        print("[Signaling] Attempting connection...")

        guard !AppSettings.shared.isMockMode else {
            print("[Signaling] Mock mode is ON — skipping signaling connection")
            teardownSocket(status: .disconnected)
            return
        }

        do {
            let client = try DesktopApiClient.fromSettings()
            print("[Signaling] Fetching health from \(AppSettings.shared.backendURL)...")
            let health = try await client.fetchHealth()
            let url = try client.signalingWebSocketURL(health: health, role: "mobile")
            print("[Signaling] Connecting WebSocket to \(url)...")

            let task = session.webSocketTask(with: url)
            webSocketTask = task
            task.resume()
            connectionStatus = .connected
            reconnectDelay = 1_000_000_000
            print("[Signaling] Connected!")

            receiveTask = Task { [weak self] in
                await self?.receiveLoop()
            }
        } catch {
            print("[Signaling] Connection failed: \(error.localizedDescription)")
            connectionStatus = .error(error.localizedDescription)
            scheduleReconnect()
        }
    }

    private func receiveLoop() async {
        guard let task = webSocketTask else { return }

        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    await handleTextMessage(text)
                case .data(let data):
                    await handleTextMessage(String(decoding: data, as: UTF8.self))
                @unknown default:
                    break
                }
            } catch {
                handleDisconnect(error: error.localizedDescription)
                return
            }
        }
    }

    private func handleTextMessage(_ text: String) async {
        print("[Signaling] Received message: \(text.prefix(200))")

        guard let data = text.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(DesktopSignalingEnvelope.self, from: data)
        else {
            print("[Signaling] Failed to decode envelope")
            return
        }

        switch envelope.type {
        case "emory_sig_ping_relay":
            guard let relay = try? JSONDecoder().decode(DesktopSignalingPingRelay.self, from: data) else { return }
            sendPingRelayAck(seq: relay.seq)
        case "person_focus_changed":
            print("[Signaling] Got person_focus_changed event!")
            guard let event = try? JSONDecoder().decode(DesktopPersonFocusEvent.self, from: data) else {
                print("[Signaling] Failed to decode DesktopPersonFocusEvent")
                return
            }
            print("[Signaling] Person: \(event.person?.name ?? "nil"), reason: \(event.reason), seq: \(event.sequence)")
            focusContinuation?.yield(event)
        default:
            print("[Signaling] Unknown message type: \(envelope.type)")
            break
        }
    }

    private func sendPingRelayAck(seq: Int) {
        let ack = DesktopSignalingPingRelay(type: "emory_sig_pong_relay", seq: seq)
        guard let data = try? JSONEncoder().encode(ack),
              let text = String(data: data, encoding: .utf8)
        else { return }

        webSocketTask?.send(.string(text)) { [weak self] error in
            guard let self else { return }
            if let error {
                Task { @MainActor in
                    self.handleDisconnect(error: error.localizedDescription)
                }
            }
        }
    }

    private func handleDisconnect(error: String?) {
        if case .disconnected = connectionStatus {
            return
        }

        connectionStatus = error.map { .error($0) } ?? .disconnected
        webSocketTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard shouldReconnect, !AppSettings.shared.isMockMode else { return }

        reconnectTask?.cancel()
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 30_000_000_000)

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard let self, !Task.isCancelled, self.shouldReconnect else { return }
            await self.connectFromSettings()
        }
    }

    private func teardownSocket(status: ConnectionStatus) {
        receiveTask?.cancel()
        receiveTask = nil

        if let task = webSocketTask {
            task.cancel(with: .goingAway, reason: nil)
        }
        webSocketTask = nil
        connectionStatus = status
    }
}
