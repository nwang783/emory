import AVFoundation
import Foundation

@MainActor
final class RecognitionAnnouncementPlayer {
    private struct SessionSnapshot {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
        let shouldReactivate: Bool
    }

    static let shared = RecognitionAnnouncementPlayer()

    private var audioPlayer: AVAudioPlayer?
    private var sessionSnapshot: SessionSnapshot?

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
        sessionSnapshot = SessionSnapshot(
            category: session.category,
            mode: session.mode,
            options: session.categoryOptions,
            shouldReactivate: MicrophoneCaptureService.shared.isCapturing
        )
        try session.setCategory(
            .playAndRecord,
            mode: .default,
            options: [
                .defaultToSpeaker,
                .duckOthers,
                .interruptSpokenAudioAndMixWithOthers,
            ]
        )
        if let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try? session.setPreferredInput(builtInMic)
        }
        try session.setActive(true)
        logAudioSession("after-playback-config", session: session)

        let player = try AVAudioPlayer(data: data)
        player.prepareToPlay()
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

        guard let sessionSnapshot else {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return
        }

        self.sessionSnapshot = nil

        do {
            try session.setCategory(sessionSnapshot.category, mode: sessionSnapshot.mode, options: sessionSnapshot.options)
            if sessionSnapshot.shouldReactivate {
                try session.setActive(true)
                MicrophoneCaptureService.shared.refreshCaptureAfterSessionChange()
                logAudioSession("after-session-restore-reactivated", session: session)
            } else {
                try session.setActive(false, options: .notifyOthersOnDeactivation)
                logAudioSession("after-session-restore-deactivated", session: session)
            }
        } catch {
            print("[RecognitionAnnouncement] Failed to restore audio session: \(error.localizedDescription)")
        }
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
