import Foundation

struct Person: Identifiable, Hashable {
    struct ImportantDate: Hashable {
        let label: String
        let date: String
    }

    let id: String
    var name: String
    var relationship: String
    var notes: String?
    var bio: String?
    var lastSeen: String?
    var createdAt: String?
    var isSelf: Bool
    var keyFacts: [String]
    var conversationStarters: [String]
    var importantDates: [ImportantDate]
    var lastTopics: [String]
    var faceThumbnail: String?
    var photoName: String?

    init(
        id: String = UUID().uuidString,
        name: String,
        relationship: String,
        notes: String? = nil,
        bio: String? = nil,
        lastSeen: String? = nil,
        createdAt: String? = nil,
        isSelf: Bool = false,
        keyFacts: [String] = [],
        conversationStarters: [String] = [],
        importantDates: [ImportantDate] = [],
        lastTopics: [String] = [],
        faceThumbnail: String? = nil,
        photoName: String? = nil
    ) {
        self.id = id
        self.name = name
        self.relationship = relationship
        self.notes = notes
        self.bio = bio
        self.lastSeen = lastSeen
        self.createdAt = createdAt
        self.isSelf = isSelf
        self.keyFacts = keyFacts
        self.conversationStarters = conversationStarters
        self.importantDates = importantDates
        self.lastTopics = lastTopics
        self.faceThumbnail = faceThumbnail
        self.photoName = photoName
    }

    static let samplePeople: [Person] = [
        Person(
            name: "Ryan",
            relationship: "Grandson",
            notes: "He visits often and loves talking about school.",
            keyFacts: ["Goes to UVA", "Planning to propose soon"],
            importantDates: [ImportantDate(label: "Birthday", date: "June 2")],
            lastTopics: ["School", "His girlfriend"]
        ),
        Person(
            name: "Sarah",
            relationship: "Daughter",
            notes: "Calls every evening.",
            keyFacts: ["Lives nearby", "Brings groceries on Sundays"],
            importantDates: [ImportantDate(label: "Anniversary", date: "September 14")],
            lastTopics: ["Family dinner plans"]
        ),
    ]
}

struct PersonMemory: Identifiable, Hashable {
    let id: String
    let memoryText: String
    let memoryType: String
    let memoryDate: String
    let confidence: Double?
    let createdAt: String
}

struct EncounterSummary: Identifiable, Hashable {
    let id: String
    let personId: String
    let personName: String
    let startedAt: String
    let endedAt: String?
    let isImportant: Bool
}

struct MemoryGroup: Identifiable, Hashable {
    let person: Person
    let memories: [PersonMemory]

    var id: String { person.id }
}
