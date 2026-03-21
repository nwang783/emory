import Foundation
import Observation

@MainActor
@Observable
final class MemoriesStore {
    static let shared = MemoriesStore()

    var groups: [MemoryGroup] = []
    var isLoading = false
    var errorMessage: String?

    private let connectionStore = DesktopConnectionStore.shared

    private init() {}

    func loadMemories() async {
        if AppSettings.shared.isMockMode {
            groups = mockGroups()
            errorMessage = nil
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let client = try DesktopApiClient.fromSettings()
            let response = try await client.fetchMemoryGroups()
            groups = response.groups.map { $0.asMemoryGroup() }
            errorMessage = nil
            connectionStore.markConnected()
        } catch {
            groups = []
            errorMessage = error.localizedDescription
            connectionStore.markDisconnected(reason: error.localizedDescription)
        }
    }

    private func mockGroups() -> [MemoryGroup] {
        let people = Person.samplePeople
        guard people.count >= 2 else { return [] }

        return [
            MemoryGroup(
                person: people[0],
                memories: [
                    PersonMemory(
                        id: UUID().uuidString,
                        memoryText: "Ryan is about to propose to his girlfriend.",
                        memoryType: "event",
                        memoryDate: "2026-03-20",
                        confidence: 0.92,
                        createdAt: "2026-03-20T18:30:00Z"
                    ),
                    PersonMemory(
                        id: UUID().uuidString,
                        memoryText: "Ryan goes to UVA.",
                        memoryType: "fact",
                        memoryDate: "2026-03-18",
                        confidence: 0.98,
                        createdAt: "2026-03-18T12:00:00Z"
                    ),
                ]
            ),
            MemoryGroup(
                person: people[1],
                memories: [
                    PersonMemory(
                        id: UUID().uuidString,
                        memoryText: "Sarah brings groceries on Sundays.",
                        memoryType: "routine",
                        memoryDate: "2026-03-16",
                        confidence: 0.89,
                        createdAt: "2026-03-16T09:30:00Z"
                    ),
                ]
            ),
        ]
    }
}
