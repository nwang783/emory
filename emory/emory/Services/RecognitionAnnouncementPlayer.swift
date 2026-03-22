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
        let client = try DesktopApiClient.fromSettings()
        let response = try await client.fetchRecognitionAnnouncement(personId: personId)
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
        sessionSnapshot = SessionSnapshot(
            category: session.category,
            mode: session.mode,
            options: session.categoryOptions,
            shouldReactivate: MicrophoneCaptureService.shared.isCapturing
        )
        try session.setCategory(.playback, mode: .spokenAudio, options: [.allowBluetoothA2DP])
        try session.setActive(true)

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
            } else {
                try session.setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            print("[RecognitionAnnouncement] Failed to restore audio session: \(error.localizedDescription)")
        }
    }
}
