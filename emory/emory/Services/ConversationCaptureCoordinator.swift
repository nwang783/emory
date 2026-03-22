import Foundation
import Observation

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
    private let debugStore = ConversationCaptureDebugStore.shared

    private init() {}

    func handleFocusEvent(_ event: DesktopPersonFocusEvent) {
        print("[ConversationCapture] Focus event reason=\(event.reason) person=\(event.person?.name ?? "none") sequence=\(event.sequence)")
        if let person = event.person {
            beginConversationCapture(for: person)
        } else {
            finishActiveConversation(reason: event.reason)
        }
    }

    func beginConversationCapture(for person: DesktopRecognizedPerson) {
        transitionToFocusedPerson(person)
    }

    func handleConnectionStatus(_ status: DesktopRecognitionSignalingService.ConnectionStatus) {
        print("[ConversationCapture] Signaling status changed: \(String(describing: status))")
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

        print("[ConversationCapture] Finishing recording for \(activeConversation.personName) reason=\(reason)")

        let recording = microphoneService.stopConversationRecording()
        stopOwnedMicrophoneIfNeeded()

        guard let recording else {
            debugStore.clear()
            return
        }
        guard recording.duration >= minimumUploadDuration else {
            try? FileManager.default.removeItem(at: recording.url)
            print("[ConversationCapture] Dropped short recording (\(String(format: "%.1f", recording.duration))s) reason=\(reason)")
            debugStore.clear()
            return
        }

        let personId = activeConversation.personId
        let personName = activeConversation.personName
        let recordedAt = activeConversation.recordedAt
        debugStore.show(
            .uploading,
            title: "Uploading",
            detail: "Sending conversation with \(personName)"
        )

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
                print("[ConversationCapture] Started microphone capture for automatic conversation recording")
            }
            try microphoneService.startConversationRecording()
            activeConversation = ActiveConversation(
                personId: person.id,
                personName: person.name,
                recordedAt: Date()
            )
            debugStore.show(
                .recording,
                title: "Recording",
                detail: "Listening for \(person.name)"
            )
            print("[ConversationCapture] Started recording for \(person.name)")
        } catch {
            stopOwnedMicrophoneIfNeeded()
            debugStore.show(
                .failed,
                title: "Recording Failed",
                detail: error.localizedDescription,
                autoClearAfter: 6
            )
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
            print(
                "[ConversationCapture] Uploading \(recording.url.lastPathComponent) for \(personName) " +
                "duration=\(String(format: "%.1f", recording.duration))s bytes=\(data.count)"
            )
            _ = try await client.uploadConversationRecording(
                personId: personId,
                recordedAt: recordedAt,
                durationMs: Int((recording.duration * 1000).rounded()),
                mimeType: recording.mimeType,
                audioData: data
            )
            try? FileManager.default.removeItem(at: recording.url)
            debugStore.show(
                .uploaded,
                title: "Uploaded",
                detail: "Conversation with \(personName) was sent",
                autoClearAfter: 4
            )
            print("[ConversationCapture] Uploaded recording for \(personName)")
        } catch {
            debugStore.show(
                .failed,
                title: "Upload Failed",
                detail: "Could not send conversation with \(personName)",
                autoClearAfter: 8
            )
            print("[ConversationCapture] Upload failed for \(personName): \(error.localizedDescription)")
        }
    }

    private func stopOwnedMicrophoneIfNeeded() {
        if ownsMicrophoneCapture {
            microphoneService.stop()
            ownsMicrophoneCapture = false
            print("[ConversationCapture] Stopped microphone capture owned by automatic conversation recording")
        }
    }
}

@MainActor
@Observable
final class ConversationCaptureDebugStore {
    enum Kind: Equatable {
        case recording
        case uploading
        case uploaded
        case failed
    }

    struct BannerState: Equatable {
        let kind: Kind
        let title: String
        let detail: String
    }

    static let shared = ConversationCaptureDebugStore()

    var banner: BannerState?
    private var clearToken = 0

    private init() {}

    func show(_ kind: Kind, title: String, detail: String, autoClearAfter delay: TimeInterval? = nil) {
        clearToken += 1
        let token = clearToken
        banner = BannerState(kind: kind, title: title, detail: detail)

        guard let delay else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            guard self.clearToken == token else { return }
            self.banner = nil
        }
    }

    func clear() {
        clearToken += 1
        banner = nil
    }
}
