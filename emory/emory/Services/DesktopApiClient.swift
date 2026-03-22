import Foundation

enum DesktopApiError: LocalizedError {
    case invalidBaseURL
    case unsupportedURLScheme(String)
    case invalidResponse
    case requestFailed(Int)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Enter a valid desktop URL first (e.g. http://10.0.0.237:18763 — no path, not ws://)."
        case .unsupportedURLScheme(let scheme):
            return "Use http:// or https:// for this field (got \(scheme)://). WebSockets (ws://) are separate — see desktop Remote ingest docs."
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
        var raw = AppSettings.shared.backendURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while raw.hasSuffix("/") {
            raw.removeLast()
        }
        guard let url = URL(string: raw), let scheme = url.scheme, !scheme.isEmpty else {
            throw DesktopApiError.invalidBaseURL
        }
        let normalizedScheme = scheme.lowercased()
        guard normalizedScheme == "http" || normalizedScheme == "https" else {
            throw DesktopApiError.unsupportedURLScheme(normalizedScheme)
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

    func uploadConversationRecording(
        personId: String,
        recordedAt: Date,
        durationMs: Int?,
        mimeType: String,
        audioData: Data
    ) async throws -> DesktopConversationUploadResponse {
        var components = URLComponents(url: baseURL.appending(path: "api/v1/conversations/upload"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "personId", value: personId),
            URLQueryItem(name: "recordedAt", value: ISO8601DateFormatter().string(from: recordedAt)),
            URLQueryItem(name: "durationMs", value: durationMs.map(String.init))
        ].compactMap { item in
            guard item.value != nil else { return nil }
            return item
        }

        guard let url = components?.url else {
            throw DesktopApiError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.httpBody = audioData

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DesktopApiError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if let uploadError = try? decoder.decode(DesktopConversationUploadResponse.self, from: data),
               let message = uploadError.error,
               !message.isEmpty {
                throw NSError(domain: "DesktopApiClient", code: http.statusCode, userInfo: [
                    NSLocalizedDescriptionKey: message
                ])
            }
            throw DesktopApiError.requestFailed(http.statusCode)
        }

        return try decoder.decode(DesktopConversationUploadResponse.self, from: data)
    }

    func signalingWebSocketURL(health: DesktopHealthResponse, role: String) throws -> URL {
        guard let host = baseURL.host, !host.isEmpty else {
            throw DesktopApiError.invalidBaseURL
        }

        var components = URLComponents()
        components.scheme = baseURL.scheme?.lowercased() == "https" ? "wss" : "ws"
        components.host = host
        components.port = health.signalingPort
        components.path = (health.wsSignalingPath?.isEmpty == false ? health.wsSignalingPath! : "/signaling")
        components.queryItems = [URLQueryItem(name: "role", value: role)]

        guard let url = components.url else {
            throw DesktopApiError.invalidBaseURL
        }

        return url
    }

    // MARK: - Create Person + Face Enrollment

    struct CreatePersonResponse: Decodable {
        let success: Bool
        let person: CreatedPerson?
        let enrollment: EnrollmentResult?
        let error: String?

        struct CreatedPerson: Decodable {
            let id: String
            let name: String
            let relationship: String?
        }

        struct EnrollmentResult: Decodable {
            let success: Bool
            let embeddingId: String?
            let error: String?
        }
    }

    struct EnrollmentResponse: Decodable {
        let success: Bool
        let embeddingId: String?
        let facesDetected: Int?
        let error: String?
    }

    /// Creates a new person on the desktop and optionally enrolls their face from a JPEG image
    func createPerson(name: String, relationship: String?, jpegData: Data?) async throws -> CreatePersonResponse {
        let url = baseURL.appending(path: "api/v1/people")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        var body: [String: Any] = ["name": name]
        if let relationship, !relationship.isEmpty {
            body["relationship"] = relationship
        }
        if let jpegData {
            body["image"] = jpegData.base64EncodedString()
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DesktopApiError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            if let errorResponse = try? decoder.decode(CreatePersonResponse.self, from: data) {
                return errorResponse
            }
            throw DesktopApiError.requestFailed(http.statusCode)
        }
        return try decoder.decode(CreatePersonResponse.self, from: data)
    }

    func enrollFace(personId: String, jpegData: Data) async throws -> EnrollmentResponse {
        let url = baseURL.appending(path: "api/v1/people/\(personId)/enroll")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = jpegData
        request.timeoutInterval = 30

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DesktopApiError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            // Try to extract error message from response
            if let errorResponse = try? decoder.decode(EnrollmentResponse.self, from: data) {
                return errorResponse
            }
            throw DesktopApiError.requestFailed(http.statusCode)
        }
        return try decoder.decode(EnrollmentResponse.self, from: data)
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
