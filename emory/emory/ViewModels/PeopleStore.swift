import Foundation
import Observation

@MainActor
@Observable
final class PeopleStore {
    static let shared = PeopleStore()

    var people: [Person] = []
    var isLoading = false
    var errorMessage: String?

    private let connectionStore = DesktopConnectionStore.shared

    private init() {}

    func loadPeople() async {
        if AppSettings.shared.isMockMode {
            people = Person.samplePeople
            errorMessage = nil
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let client = try DesktopApiClient.fromSettings()
            let response = try await client.fetchPeople()
            people = response.people.map { $0.asPerson() }
            errorMessage = nil
            connectionStore.markConnected()
        } catch {
            people = []
            errorMessage = error.localizedDescription
            connectionStore.markDisconnected(reason: error.localizedDescription)
        }
    }
}
