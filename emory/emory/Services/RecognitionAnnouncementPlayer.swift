import AVFoundation
import Foundation

@MainActor
final class RecognitionAnnouncementPlayer {
    static let shared = RecognitionAnnouncementPlayer()

    private var audioPlayer: AVAudioPlayer?

    private init() {}

    func playAnnouncement(for personId: String) async throws {
        let client = try DesktopApiClient.fromSettings()
        let response = try await client.fetchRecognitionAnnouncement(personId: personId)
        try await playAudio(data: response.audioData)
    }

    func stop() {
        audioPlayer?.stop()
        audioPlayer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func playAudio(data: Data) async throws {
        guard !data.isEmpty else {
            throw NSError(domain: "RecognitionAnnouncementPlayer", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Announcement audio was empty"
            ])
        }

        stop()

        let session = AVAudioSession.sharedInstance()
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
            player.stop()
            audioPlayer = nil
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            throw error
        }

        audioPlayer = nil
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
