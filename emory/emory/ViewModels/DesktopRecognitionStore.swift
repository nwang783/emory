import Foundation
import Observation

@MainActor
@Observable
final class DesktopRecognitionStore {
    struct PresentedRecognition: Identifiable, Equatable {
        let person: Person
        let sequence: Int
        let detectedAt: Date
        var detailPerson: Person?
        var recentMemories: [PersonMemory]
        var recentEncounters: [EncounterSummary]
        var isLoadingDetail: Bool

        var id: String { "\(person.id)-\(sequence)" }

        var resolvedPerson: Person { detailPerson ?? person }
    }

    static let shared = DesktopRecognitionStore()

    var isConnected = false
    var statusText = "Disconnected"
    var lastError: String?
    var lastRecognizedName: String?
    var presentedRecognition: PresentedRecognition?

    private let signalingService = DesktopRecognitionSignalingService()
    private var eventTask: Task<Void, Never>?
    private var detailFetchTask: Task<Void, Never>?
    private var lastSequence = 0
    private let defaults = UserDefaults.standard
    private var dismissedRecognitionSignature: String? {
        didSet {
            if let dismissedRecognitionSignature, !dismissedRecognitionSignature.isEmpty {
                defaults.set(dismissedRecognitionSignature, forKey: Self.dismissedRecognitionKey)
            } else {
                defaults.removeObject(forKey: Self.dismissedRecognitionKey)
            }
        }
    }

    private static let dismissedRecognitionKey = "desktop_recognition.dismissed_signature"

    private init() {
        dismissedRecognitionSignature = defaults.string(forKey: Self.dismissedRecognitionKey)

        signalingService.onStatusChange = { [weak self] status in
            Task { @MainActor in
                self?.handleStatusChange(status)
            }
        }

        eventTask = Task {
            for await event in signalingService.focusEventStream {
                self.handleFocusEvent(event)
            }
        }
    }

    func refreshConnection() {
        lastSequence = 0
        lastRecognizedName = nil
        presentedRecognition = nil

        guard !AppSettings.shared.isMockMode else {
            signalingService.stop()
            handleStatusChange(.disconnected)
            return
        }

        signalingService.start()
    }

    func dismissPresentedRecognition() {
        if let recognition = presentedRecognition {
            dismissedRecognitionSignature = makeDismissalSignature(
                personId: recognition.person.id,
                sequence: recognition.sequence
            )
        }
        presentedRecognition = nil
    }

    private func handleStatusChange(_ status: DesktopRecognitionSignalingService.ConnectionStatus) {
        switch status {
        case .disconnected:
            isConnected = false
            statusText = "Disconnected"
            lastError = nil
        case .connecting:
            isConnected = false
            statusText = "Connecting"
            lastError = nil
        case .connected:
            isConnected = true
            statusText = "Connected"
            lastError = nil
        case .error(let message):
            isConnected = false
            statusText = "Disconnected"
            lastError = message
        }
    }

    private func handleFocusEvent(_ event: DesktopPersonFocusEvent) {
        guard event.sequence > lastSequence else { return }
        lastSequence = event.sequence

        guard let recognizedPerson = event.person else {
            return
        }

        lastRecognizedName = recognizedPerson.name

        let signature = makeDismissalSignature(personId: recognizedPerson.id, sequence: event.sequence)
        if dismissedRecognitionSignature == signature {
            return
        }

        presentedRecognition = PresentedRecognition(
            person: recognizedPerson.asPersonSummary(),
            sequence: event.sequence,
            detectedAt: Date(timeIntervalSince1970: event.ts),
            recentMemories: [],
            recentEncounters: [],
            isLoadingDetail: true
        )

        detailFetchTask?.cancel()
        detailFetchTask = Task {
            await fetchDetail(for: recognizedPerson.id)
        }
    }

    private func fetchDetail(for personId: String) async {
        do {
            let client = try DesktopApiClient.fromSettings()
            let response = try await client.fetchPersonDetail(personId: personId)
            guard !Task.isCancelled, presentedRecognition?.person.id == personId else { return }
            presentedRecognition?.detailPerson = response.person.asPerson()
            presentedRecognition?.recentMemories = response.recentMemories.map { $0.asPersonMemory() }
            presentedRecognition?.recentEncounters = response.recentEncounters.map { $0.asEncounterSummary() }
            presentedRecognition?.isLoadingDetail = false
        } catch {
            guard !Task.isCancelled else { return }
            presentedRecognition?.isLoadingDetail = false
        }
    }

    private func makeDismissalSignature(personId: String, sequence: Int) -> String {
        let backend = AppSettings.shared.backendURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(backend)|\(personId)|\(sequence)"
    }
}
