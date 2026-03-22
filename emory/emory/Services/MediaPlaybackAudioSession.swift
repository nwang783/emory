import AVFoundation

@MainActor
enum MediaPlaybackAudioSession {
    struct Snapshot {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
        let shouldReactivateCapture: Bool
    }

    static func begin(mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions = []) throws -> Snapshot {
        let session = AVAudioSession.sharedInstance()
        let snapshot = Snapshot(
            category: session.category,
            mode: session.mode,
            options: session.categoryOptions,
            shouldReactivateCapture: MicrophoneCaptureService.shared.isCapturing
        )

        try session.setCategory(.playback, mode: mode, options: options)
        try session.setActive(true)
        return snapshot
    }

    static func restore(_ snapshot: Snapshot?) {
        let session = AVAudioSession.sharedInstance()

        guard let snapshot else {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return
        }

        do {
            try session.setCategory(snapshot.category, mode: snapshot.mode, options: snapshot.options)
            if snapshot.shouldReactivateCapture {
                try session.setActive(true)
                MicrophoneCaptureService.shared.refreshCaptureAfterSessionChange()
            } else {
                try session.setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            print("[MediaPlaybackAudioSession] Failed to restore audio session: \(error.localizedDescription)")
        }
    }
}
