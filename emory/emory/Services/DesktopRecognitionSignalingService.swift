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

        guard !AppSettings.shared.isMockMode else {
            teardownSocket(status: .disconnected)
            return
        }

        do {
            let client = try DesktopApiClient.fromSettings()
            let health = try await client.fetchHealth()
            let url = try client.signalingWebSocketURL(health: health, role: "mobile")

            let task = session.webSocketTask(with: url)
            webSocketTask = task
            task.resume()
            connectionStatus = .connected
            reconnectDelay = 1_000_000_000

            receiveTask = Task { [weak self] in
                await self?.receiveLoop()
            }
        } catch {
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
        guard let data = text.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(DesktopSignalingEnvelope.self, from: data)
        else { return }

        switch envelope.type {
        case "emory_sig_ping_relay":
            guard let relay = try? JSONDecoder().decode(DesktopSignalingPingRelay.self, from: data) else { return }
            sendPingRelayAck(seq: relay.seq)
        case "person_focus_changed":
            guard let event = try? JSONDecoder().decode(DesktopPersonFocusEvent.self, from: data) else { return }
            focusContinuation?.yield(event)
        default:
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
