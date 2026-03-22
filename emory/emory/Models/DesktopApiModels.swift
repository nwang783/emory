import Foundation

struct DesktopHealthResponse: Decodable {
    let ok: Bool
    let service: String
    let protoVersion: Int
    let instanceId: String
    let friendlyName: String
    let signalingPort: Int
    let wsSignalingPath: String?
    let conversationUploadPath: String?
}

struct DesktopPeopleResponse: Decodable {
    let people: [DesktopPerson]
}

struct DesktopPersonDetailResponse: Decodable {
    let person: DesktopPerson
    let recentMemories: [DesktopPersonMemory]
    let recentEncounters: [DesktopEncounter]
}

struct DesktopMemoriesResponse: Decodable {
    let memories: [DesktopPersonMemory]
}

struct DesktopMemoryGroupsResponse: Decodable {
    let groups: [DesktopMemoryGroup]
}

struct DesktopHomeResponse: Decodable {
    let `self`: DesktopPerson?
    let people: [DesktopPerson]
    let recentEncounters: [DesktopEncounter]
}

struct DesktopPerson: Decodable, Identifiable {
    struct ImportantDate: Decodable {
        let label: String
        let date: String
    }

    let id: String
    let name: String
    let relationship: String?
    let notes: String?
    let bio: String?
    let lastSeen: String?
    let createdAt: String
    let isSelf: Bool
    let keyFacts: [String]
    let conversationStarters: [String]
    let importantDates: [ImportantDate]
    let lastTopics: [String]
    let faceThumbnail: String?

    func asPerson() -> Person {
        Person(
            id: id,
            name: name,
            relationship: relationship?.isEmpty == false ? relationship! : "Person you know",
            notes: notes,
            bio: bio,
            lastSeen: lastSeen,
            createdAt: createdAt,
            isSelf: isSelf,
            keyFacts: keyFacts,
            conversationStarters: conversationStarters,
            importantDates: importantDates.map { Person.ImportantDate(label: $0.label, date: $0.date) },
            lastTopics: lastTopics,
            faceThumbnail: faceThumbnail
        )
    }
}

struct DesktopPersonMemory: Decodable, Identifiable {
    let id: String
    let personId: String
    let memoryText: String
    let memoryType: String
    let memoryDate: String
    let confidence: Double?
    let createdAt: String

    func asPersonMemory() -> PersonMemory {
        PersonMemory(
            id: id,
            memoryText: memoryText,
            memoryType: memoryType,
            memoryDate: memoryDate,
            confidence: confidence,
            createdAt: createdAt
        )
    }
}

struct DesktopEncounter: Decodable, Identifiable {
    let id: String
    let personId: String
    let personName: String
    let startedAt: String
    let endedAt: String?
    let avgConfidence: Double?
    let peakConfidence: Double?
    let isImportant: Bool
    let createdAt: String

    func asEncounterSummary() -> EncounterSummary {
        EncounterSummary(
            id: id,
            personId: personId,
            personName: personName,
            startedAt: startedAt,
            endedAt: endedAt,
            isImportant: isImportant
        )
    }
}

struct DesktopMemoryGroup: Decodable, Identifiable {
    let person: DesktopPerson
    let memories: [DesktopPersonMemory]

    var id: String { person.id }

    func asMemoryGroup() -> MemoryGroup {
        MemoryGroup(
            person: person.asPerson(),
            memories: memories.map { $0.asPersonMemory() }
        )
    }
}

struct DesktopSignalingEnvelope: Decodable {
    let type: String
}

struct DesktopSignalingPingRelay: Codable {
    let type: String
    let seq: Int
}

struct DesktopRecognizedPerson: Decodable, Equatable {
    let id: String
    let name: String
    let relationship: String?
    let similarity: Double
    let faceThumbnail: String?

    func asPersonSummary() -> Person {
        Person(
            id: id,
            name: name,
            relationship: relationship?.isEmpty == false ? relationship! : "Person you know",
            faceThumbnail: faceThumbnail
        )
    }
}

struct DesktopPersonFocusEvent: Decodable, Equatable {
    let type: String
    let sequence: Int
    let ts: Double
    let reason: String
    let person: DesktopRecognizedPerson?
}

struct DesktopConversationRecording: Decodable {
    let id: String
    let personId: String
    let recordedAt: String
    let audioPath: String
    let mimeType: String
    let durationMs: Int?
}

struct DesktopConversationUploadResponse: Decodable {
    let success: Bool
    let recording: DesktopConversationRecording?
    let memories: [DesktopPersonMemory]?
    let error: String?
}
