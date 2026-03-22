import Foundation

@MainActor
final class ConversationCaptureCoordinator {
    private struct ActiveConversation {
        let personId: String
        let personName: String
        let recordedAt: Date
    }

    static let shared = ConversationCaptureCoordinator()

    private let microphoneService = MicrophoneCaptureService.shared
    private var activeConversation: ActiveConversation?
    private var ownsMicrophoneCapture = false

    private let minimumUploadDuration: TimeInterval = 1.5

    private init() {}

    func handleFocusEvent(_ event: DesktopPersonFocusEvent) {
        if let person = event.person {
            transitionToFocusedPerson(person)
        } else {
            finishActiveConversation(reason: event.reason)
        }
    }

    func handleConnectionStatus(_ status: DesktopRecognitionSignalingService.ConnectionStatus) {
        switch status {
        case .disconnected, .error:
            finishActiveConversation(reason: "signaling_disconnected")
        case .connecting, .connected:
            break
        }
    }

    func finishActiveConversation(reason: String) {
        guard let activeConversation else { return }
        self.activeConversation = nil

        let recording = microphoneService.stopConversationRecording()
        stopOwnedMicrophoneIfNeeded()

        guard let recording else { return }
        guard recording.duration >= minimumUploadDuration else {
            try? FileManager.default.removeItem(at: recording.url)
            print("[ConversationCapture] Dropped short recording (\(String(format: "%.1f", recording.duration))s) reason=\(reason)")
            return
        }

        let personId = activeConversation.personId
        let personName = activeConversation.personName
        let recordedAt = activeConversation.recordedAt

        Task {
            await self.upload(recording: recording, personId: personId, personName: personName, recordedAt: recordedAt)
        }
    }

    private func transitionToFocusedPerson(_ person: DesktopRecognizedPerson) {
        if activeConversation?.personId == person.id {
            return
        }

        if activeConversation != nil {
            finishActiveConversation(reason: "focus_changed")
        }

        do {
            if !microphoneService.isCapturing {
                try microphoneService.start(audioSource: AppSettings.shared.audioSource)
                ownsMicrophoneCapture = true
            }
            try microphoneService.startConversationRecording()
            activeConversation = ActiveConversation(
                personId: person.id,
                personName: person.name,
                recordedAt: Date()
            )
            print("[ConversationCapture] Started recording for \(person.name)")
        } catch {
            stopOwnedMicrophoneIfNeeded()
            print("[ConversationCapture] Failed to start recording for \(person.name): \(error.localizedDescription)")
        }
    }

    private func upload(
        recording: MicrophoneCaptureService.ConversationRecordingFile,
        personId: String,
        personName: String,
        recordedAt: Date,
    ) async {
        do {
            let data = try await Task.detached(priority: .utility) {
                try Data(contentsOf: recording.url)
            }.value
            let client = try DesktopApiClient.fromSettings()
            _ = try await client.uploadConversationRecording(
                personId: personId,
                recordedAt: recordedAt,
                durationMs: Int((recording.duration * 1000).rounded()),
                mimeType: recording.mimeType,
                audioData: data
            )
            try? FileManager.default.removeItem(at: recording.url)
            print("[ConversationCapture] Uploaded recording for \(personName)")
        } catch {
            print("[ConversationCapture] Upload failed for \(personName): \(error.localizedDescription)")
        }
    }

    private func stopOwnedMicrophoneIfNeeded() {
        if ownsMicrophoneCapture {
            microphoneService.stop()
            ownsMicrophoneCapture = false
        }
    }
}
