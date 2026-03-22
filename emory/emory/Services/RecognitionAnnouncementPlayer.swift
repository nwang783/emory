import AVFoundation
import Foundation

@MainActor
final class RecognitionAnnouncementPlayer {
    static let shared = RecognitionAnnouncementPlayer()

    private var player: AVPlayer?
    private var sessionSnapshot: MediaPlaybackAudioSession.Snapshot?
    private var tempAudioURL: URL?

    private init() {}

    func playAnnouncement(for personId: String) async throws {
        print("[RecognitionAnnouncement] Requesting announcement for personId=\(personId)")
        let client = try DesktopApiClient.fromSettings()
        let response = try await client.fetchRecognitionAnnouncement(personId: personId)
        print(
            "[RecognitionAnnouncement] Received announcement audio " +
            "personId=\(personId) bytes=\(response.audioData.count) mime=\(response.mimeType) " +
            "fingerprint=\(response.fingerprint ?? "none")"
        )
        try await playAudio(data: response.audioData, mimeType: response.mimeType)
    }

    func stop() {
        stopPlayback()
        restoreAudioSessionIfNeeded()
    }

    private func playAudio(data: Data, mimeType: String) async throws {
        guard !data.isEmpty else {
            throw NSError(domain: "RecognitionAnnouncementPlayer", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Announcement audio was empty"
            ])
        }

        stopPlayback()

        let session = AVAudioSession.sharedInstance()
        logAudioSession("before-playback-config", session: session)
        sessionSnapshot = try MediaPlaybackAudioSession.begin(mode: .moviePlayback)
        logAudioSession("after-playback-config", session: session)

        let audioURL = try writeTempAudioFile(data: data, mimeType: mimeType)
        tempAudioURL = audioURL
        let item = AVPlayerItem(url: audioURL)
        let player = AVPlayer(playerItem: item)
        player.volume = 1.0
        self.player = player

        print("[RecognitionAnnouncement] Starting AVPlayer announcement url=\(audioURL.lastPathComponent)")

        player.play()

        do {
            while !Task.isCancelled {
                if let error = item.error {
                    throw error
                }
                if item.status == .failed {
                    throw item.error ?? NSError(domain: "RecognitionAnnouncementPlayer", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "Announcement playback failed to start"
                    ])
                }
                if item.status == .readyToPlay,
                   player.timeControlStatus != .waitingToPlayAtSpecifiedRate,
                   player.currentItem == nil || item.currentTime() >= item.duration {
                    break
                }
                try Task.checkCancellation()
                try await Task.sleep(for: .milliseconds(100))
            }
        } catch {
            stopPlayback()
            restoreAudioSessionIfNeeded()
            throw error
        }

        stopPlayback()
        restoreAudioSessionIfNeeded()
    }

    private func stopPlayback() {
        player?.pause()
        player = nil
        if let tempAudioURL {
            try? FileManager.default.removeItem(at: tempAudioURL)
            self.tempAudioURL = nil
        }
    }

    private func restoreAudioSessionIfNeeded() {
        let session = AVAudioSession.sharedInstance()
        let snapshot = sessionSnapshot
        self.sessionSnapshot = nil
        MediaPlaybackAudioSession.restore(snapshot)
        logAudioSession("after-session-restore", session: session)
    }

    private func writeTempAudioFile(data: Data, mimeType: String) throws -> URL {
        let ext = if mimeType.lowercased().contains("mpeg") || mimeType.lowercased().contains("mp3") {
            "mp3"
        } else if mimeType.lowercased().contains("wav") {
            "wav"
        } else {
            "bin"
        }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("emory-announcements", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
        try data.write(to: url, options: [.atomic])
        return url
    }

    private func logAudioSession(_ label: String, session: AVAudioSession) {
        let inputs = session.currentRoute.inputs
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: ", ")
        let outputs = session.currentRoute.outputs
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: ", ")
        let availableInputs = (session.availableInputs ?? [])
            .map { "\($0.portType.rawValue):\($0.portName)" }
            .joined(separator: ", ")
        let preferredInput = session.preferredInput.map { "\($0.portType.rawValue):\($0.portName)" } ?? "none"
        let hasMetaOutput = session.currentRoute.outputs.contains { port in
            let name = port.portName.lowercased()
            return name.contains("ray-ban") || name.contains("meta")
        }

        print(
            "[RecognitionAnnouncement] Session \(label) " +
            "category=\(session.category.rawValue) mode=\(session.mode.rawValue) " +
            "preferredInput=\(preferredInput) metaRoute=\(AudioRouteDetector.isMetaAudioRouteActive()) " +
            "metaInput=\(AudioRouteDetector.isMetaInputRouteActive()) metaOutput=\(hasMetaOutput) inputs=[\(inputs)] outputs=[\(outputs)] " +
            "availableInputs=[\(availableInputs)]"
        )
    }
}
