import Foundation

@MainActor
final class RecognitionExperienceCoordinator {
    static let shared = RecognitionExperienceCoordinator()

    var onAnnouncementStateChange: ((String?, Bool) -> Void)?

    private let announcementPlayer = RecognitionAnnouncementPlayer.shared
    private let conversationCaptureCoordinator = ConversationCaptureCoordinator.shared
    private var announcementTask: Task<Void, Never>?
    private var activeAnnouncementPersonId: String?
    private var currentFocusedPersonId: String?
    private var lastAnnouncementAtByPersonId: [String: Date] = [:]
    private let announcementCooldown: TimeInterval = 90

    private init() {}

    func handleFocusEvent(_ event: DesktopPersonFocusEvent) {
        cancelAnnouncementPlayback()

        guard let person = event.person else {
            currentFocusedPersonId = nil
            conversationCaptureCoordinator.finishActiveConversation(reason: event.reason)
            return
        }

        if let currentFocusedPersonId, currentFocusedPersonId != person.id {
            conversationCaptureCoordinator.finishActiveConversation(reason: "focus_changed")
        }
        self.currentFocusedPersonId = person.id
        activeAnnouncementPersonId = person.id

        guard shouldPlayAnnouncement(for: person.id) else {
            conversationCaptureCoordinator.beginConversationCapture(for: person)
            return
        }

        onAnnouncementStateChange?(person.id, true)

        announcementTask = Task { [weak self] in
            guard let self = self else { return }

            do {
                try await self.announcementPlayer.playAnnouncement(for: person.id)
                guard !Task.isCancelled else { return }

                await MainActor.run {
                    self.lastAnnouncementAtByPersonId[person.id] = Date()
                    self.onAnnouncementStateChange?(person.id, false)
                    if self.activeAnnouncementPersonId == person.id {
                        self.conversationCaptureCoordinator.beginConversationCapture(for: person)
                    }
                }
            } catch is CancellationError {
                await MainActor.run {
                    self.onAnnouncementStateChange?(person.id, false)
                }
            } catch {
                print("[RecognitionExperience] Announcement failed for \(person.name): \(error.localizedDescription)")
                await MainActor.run {
                    self.onAnnouncementStateChange?(person.id, false)
                    if self.activeAnnouncementPersonId == person.id {
                        self.conversationCaptureCoordinator.beginConversationCapture(for: person)
                    }
                }
            }
        }
    }

    func handleConnectionStatus(_ status: DesktopRecognitionSignalingService.ConnectionStatus) {
        conversationCaptureCoordinator.handleConnectionStatus(status)

        switch status {
        case .disconnected, .error:
            activeAnnouncementPersonId = nil
            currentFocusedPersonId = nil
            cancelAnnouncementPlayback()
        case .connecting, .connected:
            break
        }
    }

    private func shouldPlayAnnouncement(for personId: String) -> Bool {
        let settings = AppSettings.shared
        guard settings.recognitionAnnouncementsEnabled else { return false }

        if settings.recognitionAnnouncementsRequireMetaRoute && !AudioRouteDetector.isMetaAudioRouteActive() {
            return false
        }

        if let lastPlayedAt = lastAnnouncementAtByPersonId[personId],
           Date().timeIntervalSince(lastPlayedAt) < announcementCooldown {
            return false
        }

        return true
    }

    private func cancelAnnouncementPlayback() {
        let previousPersonId = activeAnnouncementPersonId
        announcementTask?.cancel()
        announcementTask = nil
        announcementPlayer.stop()
        activeAnnouncementPersonId = nil

        if let previousPersonId {
            onAnnouncementStateChange?(previousPersonId, false)
        }
    }
}
