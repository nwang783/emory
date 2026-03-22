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
        guard let person = event.person else {
            currentFocusedPersonId = nil
            cancelAnnouncementPlayback()
            conversationCaptureCoordinator.finishActiveConversation(reason: event.reason)
            return
        }

        let previousFocusedPersonId = currentFocusedPersonId
        if let previousFocusedPersonId, previousFocusedPersonId != person.id {
            cancelAnnouncementPlayback()
            conversationCaptureCoordinator.finishActiveConversation(reason: "focus_changed")
        }
        self.currentFocusedPersonId = person.id

        guard AppSettings.shared.recognitionAnnouncementsEnabled else {
            cancelAnnouncementPlayback()
            conversationCaptureCoordinator.beginConversationCapture(for: person)
            return
        }

        conversationCaptureCoordinator.finishActiveConversation(reason: "announcements_enabled")

        if activeAnnouncementPersonId == person.id, announcementTask != nil {
            print("[RecognitionExperience] Keeping announcement in progress for \(person.name)")
            return
        }

        activeAnnouncementPersonId = person.id

        if let skipReason = announcementSkipReason(for: person.id) {
            print("[RecognitionExperience] Skipping announcement for \(person.name): \(skipReason); recording remains disabled while announcements are enabled")
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
                    self.announcementTask = nil
                    print("[RecognitionExperience] Announcement finished for \(person.name); recording remains disabled while announcements are enabled")
                }
            } catch is CancellationError {
                await MainActor.run {
                    self.onAnnouncementStateChange?(person.id, false)
                    self.announcementTask = nil
                }
            } catch {
                print("[RecognitionExperience] Announcement failed for \(person.name): \(error.localizedDescription)")
                await MainActor.run {
                    self.onAnnouncementStateChange?(person.id, false)
                    self.announcementTask = nil
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

    private func announcementSkipReason(for personId: String) -> String? {
        let settings = AppSettings.shared
        let hasRoutableMetaPromptDevice =
            AudioRouteDetector.isMetaOutputRouteActive() || AudioRouteDetector.metaBluetoothInputPort() != nil
        if settings.recognitionAnnouncementsRequireMetaRoute && !hasRoutableMetaPromptDevice {
            return "meta_prompt_route_required_but_unavailable"
        }

        if let lastPlayedAt = lastAnnouncementAtByPersonId[personId],
           Date().timeIntervalSince(lastPlayedAt) < announcementCooldown {
            return "cooldown_active"
        }

        return nil
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
