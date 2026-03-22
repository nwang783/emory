import Foundation
import UIKit
import AVFoundation
import CoreMedia

// MARK: - Bridge Server Service
// WebSocket client that sends video frames + audio to the bridge server
// and receives face recognition results + transcripts back.

private struct IngestPingRelay: Decodable {
    let type: String
    let seq: Int?
}

@MainActor
final class BridgeServerService {

    enum ConnectionStatus: Equatable {
        case disconnected
        case connecting
        case connected
        case error(String)
    }

    // MARK: - State

    private(set) var connectionStatus: ConnectionStatus = .disconnected
    private var webSocketTask: URLSessionWebSocketTask?
    private let urlSession = URLSession(configuration: .default)
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectDelay: UInt64 = 1_000_000_000 // 1 second, doubles up to 30s

    // Frame sampling
    private var frameCounter: Int = 0
    let frameSampleInterval: Int = 2 // Send every 2nd frame (~15fps to server)

    // Results
    private var faceResultContinuation: AsyncStream<FaceResultMessage>.Continuation?
    private var transcriptContinuation: AsyncStream<TranscriptMessage>.Continuation?
    private var statusContinuation: AsyncStream<ServerStatusMessage>.Continuation?

    lazy var faceResultStream: AsyncStream<FaceResultMessage> = {
        AsyncStream { continuation in
            self.faceResultContinuation = continuation
        }
    }()

    lazy var transcriptStream: AsyncStream<TranscriptMessage> = {
        AsyncStream { continuation in
            self.transcriptContinuation = continuation
        }
    }()

    lazy var statusStream: AsyncStream<ServerStatusMessage> = {
        AsyncStream { continuation in
            self.statusContinuation = continuation
        }
    }()

    private var serverURL: String = ""

    // MARK: - Connect

    func connect(to url: String) {
        disconnect()
        serverURL = url
        connectionStatus = .connecting

        // Convert ws:// URL to a proper URL
        guard let wsURL = URL(string: url) else {
            connectionStatus = .error("Invalid URL")
            return
        }

        let task = urlSession.webSocketTask(with: wsURL)
        task.resume()
        self.webSocketTask = task

        print("[Bridge] Connecting to \(url)...")

        // Start receive loop — the first successful receive confirms the connection is open
        receiveTask = Task { [weak self] in
            guard let self = self else { return }
            // Send a ping to verify the connection is actually open
            do {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    task.sendPing { error in
                        if let error = error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume()
                        }
                    }
                }
                self.connectionStatus = .connected
                self.reconnectDelay = 1_000_000_000
                print("[Bridge] Connected to \(url)")
            } catch {
                print("[Bridge] Ping failed, connection not ready: \(error.localizedDescription)")
                self.handleDisconnect()
                return
            }
            await self.receiveLoop()
        }
    }

    // MARK: - Disconnect

    func disconnect() {
        receiveTask?.cancel()
        reconnectTask?.cancel()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionStatus = .disconnected
    }

    // MARK: - Send Video Frame

    func sendFrame(_ frameData: VideoFrameData, timestamp: Date) {
        guard connectionStatus == .connected else { return }

        // Sample frames — only send every Nth frame
        frameCounter += 1
        guard frameCounter % frameSampleInterval == 0 else { return }

        // Try to extract compressed data from CMSampleBuffer (HEVC — no CPU cost)
        // Fall back to JPEG encoding if sample buffer not available (mock mode)
        let payloadData: Data
        let codec: String

        if let sampleBuffer = frameData.sampleBuffer,
           let dataBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) {
            // Extract HEVC data directly — zero CPU encoding cost
            let length = CMBlockBufferGetDataLength(dataBuffer)
            var rawData = Data(count: length)
            rawData.withUnsafeMutableBytes { ptr in
                if let baseAddress = ptr.baseAddress {
                    CMBlockBufferCopyDataBytes(dataBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
                }
            }
            payloadData = rawData
            codec = "hevc"
        } else {
            // Fallback: JPEG encode (for mock service or raw codec)
            var mutableFrame = frameData
            guard let image = mutableFrame.displayImage,
                  let jpeg = image.jpegData(compressionQuality: 0.7) else { return }
            payloadData = jpeg
            codec = "jpeg"
        }

        // Get dimensions from display image
        var mutableFrame = frameData
        let w = mutableFrame.displayImage.map { Int($0.size.width) } ?? 0
        let h = mutableFrame.displayImage.map { Int($0.size.height) } ?? 0

        // Build binary message
        let meta: [String: Any] = [
            "ts": timestamp.timeIntervalSince1970,
            "w": w,
            "h": h,
            "codec": codec,
        ]
        guard let metaJSON = try? JSONSerialization.data(withJSONObject: meta) else { return }

        var data = Data(capacity: 8 + metaJSON.count + payloadData.count)

        var messageType: UInt32 = 1
        data.append(Data(bytes: &messageType, count: 4))

        var metaLength = UInt32(metaJSON.count)
        data.append(Data(bytes: &metaLength, count: 4))

        data.append(metaJSON)
        data.append(payloadData)

        webSocketTask?.send(.data(data)) { [weak self] error in
            if let error = error {
                print("[Bridge] Frame send error: \(error.localizedDescription)")
                Task { @MainActor in
                    self?.handleDisconnect()
                }
            }
        }
    }

    // MARK: - Send Audio Chunk

    func sendAudioChunk(_ buffer: AVAudioPCMBuffer, sampleRate: Double, channels: Int) {
        guard connectionStatus == .connected else { return }
        guard let channelData = buffer.floatChannelData else { return }

        let frameCount = Int(buffer.frameLength)

        var pcmData = Data(capacity: frameCount * 2)
        for i in 0..<frameCount {
            let sample = channelData[0][i]
            let clamped = max(-1.0, min(1.0, sample))
            var int16Sample = Int16(clamped * 32767.0)
            pcmData.append(Data(bytes: &int16Sample, count: 2))
        }

        let meta: [String: Any] = [
            "ts": Date().timeIntervalSince1970,
            "dur": frameCount,
            "sr": Int(sampleRate),
            "ch": channels,
        ]
        guard let metaJSON = try? JSONSerialization.data(withJSONObject: meta) else { return }

        var data = Data(capacity: 8 + metaJSON.count + pcmData.count)

        var messageType: UInt32 = 2
        data.append(Data(bytes: &messageType, count: 4))

        var metaLength = UInt32(metaJSON.count)
        data.append(Data(bytes: &metaLength, count: 4))

        data.append(metaJSON)
        data.append(pcmData)

        webSocketTask?.send(.data(data)) { error in
            if let error = error {
                print("[Bridge] Audio send error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Send Session Events

    func sendSessionStart() {
        sendSimpleMessage(type: 3)
    }

    func sendSessionEnd() {
        sendSimpleMessage(type: 4)
    }

    private func sendSimpleMessage(type: UInt32) {
        guard connectionStatus == .connected else { return }

        var data = Data(capacity: 8)
        var messageType = type
        data.append(Data(bytes: &messageType, count: 4))
        var metaLength: UInt32 = 0
        data.append(Data(bytes: &metaLength, count: 4))

        webSocketTask?.send(.data(data)) { _ in }
    }

    // MARK: - Receive Loop

    private func receiveLoop() async {
        guard let ws = webSocketTask else { return }

        while !Task.isCancelled {
            do {
                let message = try await ws.receive()
                switch message {
                case .string(let text):
                    handleTextMessage(text)
                case .data(let data):
                    handleTextMessage(String(data: data, encoding: .utf8) ?? "")
                @unknown default:
                    break
                }
            } catch {
                print("[Bridge] Receive error: \(error.localizedDescription)")
                await MainActor.run {
                    handleDisconnect()
                }
                return
            }
        }
    }

    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        // Detect message type
        guard let baseMessage = try? JSONDecoder().decode(ServerMessage.self, from: data) else { return }

        switch baseMessage.type {
        case "face_result":
            if let result = try? JSONDecoder().decode(FaceResultMessage.self, from: data) {
                faceResultContinuation?.yield(result)
            }

        case "transcript":
            if let transcript = try? JSONDecoder().decode(TranscriptMessage.self, from: data) {
                transcriptContinuation?.yield(transcript)
            }

        case "status":
            if let status = try? JSONDecoder().decode(ServerStatusMessage.self, from: data) {
                statusContinuation?.yield(status)
                print("[Bridge] Server status: face=\(status.faceReady), people=\(status.peopleCount)")
            }

        case "error":
            print("[Bridge] Server error: \(text)")

        case "ingest_ping_relay":
            // Desktop viewer → ingest server → phone: reply so desktop can confirm phone path (see remote-ingest-camera-debug.md).
            if let relay = try? JSONDecoder().decode(IngestPingRelay.self, from: data) {
                let seq = relay.seq ?? 0
                let pong: [String: Any] = ["type": "ingest_pong_relay", "seq": seq]
                if let json = try? JSONSerialization.data(withJSONObject: pong),
                   let str = String(data: json, encoding: .utf8) {
                    webSocketTask?.send(.string(str)) { err in
                        if let err = err {
                            print("[Bridge] ingest_pong_relay send error: \(err.localizedDescription)")
                        }
                    }
                }
                print("[Bridge] ingest_ping_relay seq=\(seq) → ingest_pong_relay")
            }

        default:
            break
        }
    }

    // MARK: - Reconnection

    private func handleDisconnect() {
        guard connectionStatus == .connected || connectionStatus == .connecting else { return }
        connectionStatus = .disconnected
        webSocketTask = nil
        receiveTask?.cancel()

        print("[Bridge] Disconnected, will reconnect in \(reconnectDelay / 1_000_000_000)s")

        reconnectTask = Task { [weak self] in
            guard let self = self else { return }
            try? await Task.sleep(nanoseconds: self.reconnectDelay)
            guard !Task.isCancelled else { return }

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
            self.reconnectDelay = min(self.reconnectDelay * 2, 30_000_000_000)
            self.connect(to: self.serverURL)
        }
    }

    // MARK: - Health Check

    func checkHealth(url: String) async -> HealthResponse? {
        // Convert ws:// to http:// for health check
        let httpURL = url
            .replacingOccurrences(of: "ws://", with: "http://")
            .replacingOccurrences(of: "wss://", with: "https://")
        let healthURL = httpURL.hasSuffix("/") ? httpURL + "health" : httpURL + "/health"

        guard let healthEndpoint = URL(string: healthURL) else { return nil }

        do {
            var request = URLRequest(url: healthEndpoint)
            request.timeoutInterval = 5
            let (data, _) = try await URLSession.shared.data(for: request)
            return try JSONDecoder().decode(HealthResponse.self, from: data)
        } catch {
            print("[Bridge] Health check failed: \(error.localizedDescription)")
            return nil
        }
    }
}

// MARK: - Health Response (matches teammate's remote-ingest format)
struct HealthResponse: Codable {
    let ok: Bool
    let service: String
    let protoVersion: Int
    let instanceId: String
    let friendlyName: String
    let signalingPort: Int
    // Bridge-specific extras (optional)
    let faceReady: Bool?
    let peopleCount: Int?
    let wsReady: Bool?
}
