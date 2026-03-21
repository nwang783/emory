import Foundation

enum DesktopApiError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case requestFailed(Int)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Enter a valid desktop URL first."
        case .invalidResponse:
            return "The desktop returned an unreadable response."
        case .requestFailed(let statusCode):
            return "The desktop request failed with status \(statusCode)."
        }
    }
}

struct DesktopApiClient {
    let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
    }

    @MainActor
    static func fromSettings() throws -> DesktopApiClient {
        let raw = AppSettings.shared.backendURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: raw), let scheme = url.scheme, !scheme.isEmpty else {
            throw DesktopApiError.invalidBaseURL
        }
        return DesktopApiClient(baseURL: url)
    }

    func fetchHealth() async throws -> DesktopHealthResponse {
        try await get("health")
    }

    func fetchPeople() async throws -> DesktopPeopleResponse {
        try await get("api/v1/people")
    }

    func fetchPersonDetail(personId: String) async throws -> DesktopPersonDetailResponse {
        try await get("api/v1/people/\(personId)")
    }

    func fetchMemories(personId: String) async throws -> DesktopMemoriesResponse {
        try await get("api/v1/people/\(personId)/memories")
    }

    func fetchMemoryGroups() async throws -> DesktopMemoryGroupsResponse {
        try await get("api/v1/memories")
    }

    func fetchHome() async throws -> DesktopHomeResponse {
        try await get("api/v1/home")
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appending(path: path)
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw DesktopApiError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw DesktopApiError.requestFailed(http.statusCode)
        }
        return try decoder.decode(T.self, from: data)
    }
}
