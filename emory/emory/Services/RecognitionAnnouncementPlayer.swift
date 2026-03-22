import AVFoundation
import Foundation

@MainActor
final class RecognitionAnnouncementPlayer {
    static let shared = RecognitionAnnouncementPlayer()

    private var audioPlayer: AVAudioPlayer?
    private var sessionSnapshot: MediaPlaybackAudioSession.Snapshot?

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
        try await playAudio(data: response.audioData)
    }

    func stop() {
        stopPlayback()
        restoreAudioSessionIfNeeded()
    }

    private func playAudio(data: Data) async throws {
        guard !data.isEmpty else {
            throw NSError(domain: "RecognitionAnnouncementPlayer", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Announcement audio was empty"
            ])
        }

        stopPlayback()

        let session = AVAudioSession.sharedInstance()
        logAudioSession("before-playback-config", session: session)
        sessionSnapshot = try MediaPlaybackAudioSession.begin(
            mode: .spokenAudio,
            options: [
                .duckOthers,
                .interruptSpokenAudioAndMixWithOthers,
            ]
        )
        logAudioSession("after-playback-config", session: session)

        let player = try AVAudioPlayer(data: data)
        player.prepareToPlay()
        player.volume = 1.0
        audioPlayer = player

        guard player.play() else {
            audioPlayer = nil
            throw NSError(domain: "RecognitionAnnouncementPlayer", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Announcement playback failed to start"
            ])
        }

        do {
            while player.isPlaying {
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
        audioPlayer?.stop()
        audioPlayer = nil
    }

    private func restoreAudioSessionIfNeeded() {
        let session = AVAudioSession.sharedInstance()
        let snapshot = sessionSnapshot
        self.sessionSnapshot = nil
        MediaPlaybackAudioSession.restore(snapshot)
        logAudioSession("after-session-restore", session: session)
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
