import SwiftUI
import UIKit

// MARK: - Person Detail View
// Shows a person's profile and recent memory context.

struct PersonDetailView: View {
    let person: Person
    @State private var settings = AppSettings.shared
    @State private var showAddNote = false
    @State private var newNoteTitle = ""
    @State private var newNoteSubtitle = ""
    @State private var showRemoveConfirmation = false
    @State private var showEnrollConfirmation = false
    @State private var detailPerson: Person?
    @State private var recentMemories: [PersonMemory] = []
    @State private var recentEncounters: [EncounterSummary] = []
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let photoAsset = resolvedPerson.photoName,
                   UIImage(named: photoAsset) != nil {
                    Image(photoAsset)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(height: 320)
                        .clipped()
                } else {
                    ZStack {
                        Rectangle()
                            .fill(EmoryTheme.primary.opacity(0.08))
                            .frame(height: 320)
                        FaceThumbnailView(
                            faceThumbnail: resolvedPerson.faceThumbnail,
                            fallbackSystemImage: "person.circle.fill",
                            size: 132
                        )
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(resolvedPerson.name)
                        .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    Text(resolvedPerson.relationship)
                        .font(.system(size: settings.fontSize.bodySize))
                        .foregroundStyle(EmoryTheme.primary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 20)
                .padding(.bottom, 24)

                if isLoading && !settings.isMockMode {
                    ProgressView("Loading details...")
                        .padding(.bottom, 24)
                } else if let loadError, !settings.isMockMode {
                    contentSection(title: "Connection") {
                        Text(loadError)
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                    }
                }

                contentSection(title: "Key Facts") {
                    if resolvedPerson.keyFacts.isEmpty {
                        illustratedEmptyState(
                            icon: "sparkles",
                            message: "No key facts yet",
                            hint: "Important details about \(resolvedPerson.name) will appear here."
                        )
                    } else {
                        ForEach(resolvedPerson.keyFacts, id: \.self) { fact in
                            detailRow(icon: "sparkles", color: EmoryTheme.secondary, title: fact)
                        }
                    }
                }

                contentSection(title: "Important Dates") {
                    if resolvedPerson.importantDates.isEmpty {
                        illustratedEmptyState(
                            icon: "calendar.badge.clock",
                            message: "No important dates saved",
                            hint: "Birthdays, anniversaries, and special days go here."
                        )
                    } else {
                        ForEach(resolvedPerson.importantDates, id: \.label) { date in
                            detailRow(icon: "calendar", color: EmoryTheme.primary, title: date.label, subtitle: date.date)
                        }
                    }
                }

                contentSection(title: "Recent Topics") {
                    if resolvedPerson.lastTopics.isEmpty {
                        illustratedEmptyState(
                            icon: "bubble.left.and.bubble.right",
                            message: "No recent topics yet",
                            hint: "Topics from conversations will appear here."
                        )
                    } else {
                        ForEach(resolvedPerson.lastTopics, id: \.self) { topic in
                            detailRow(icon: "bubble.left.and.bubble.right", color: EmoryTheme.primary, title: topic)
                        }
                    }
                }

                if !resolvedPerson.conversationStarters.isEmpty {
                    contentSection(title: "Conversation Starters") {
                        FlowLayout(spacing: 8) {
                            ForEach(resolvedPerson.conversationStarters, id: \.self) { starter in
                                HStack(spacing: 6) {
                                    Image(systemName: "text.bubble")
                                        .font(.system(size: 13))
                                    Text(starter)
                                        .font(.system(size: settings.fontSize.captionSize))
                                }
                                .foregroundStyle(EmoryTheme.primary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(EmoryTheme.primary.opacity(0.08))
                                .clipShape(Capsule())
                            }
                        }
                        .padding(.horizontal, 24)
                    }
                }

                contentSection(title: "Recent Memories") {
                    if recentMemories.isEmpty {
                        illustratedEmptyState(
                            icon: "brain.head.profile",
                            message: "No memories yet",
                            hint: "Extracted conversation memories will show up here."
                        )
                    } else {
                        ForEach(recentMemories) { memory in
                            detailRow(
                                icon: iconForMemoryType(memory.memoryType),
                                color: noteColor(for: iconForMemoryType(memory.memoryType)),
                                title: memory.memoryText,
                                subtitle: memory.memoryDate
                            )
                        }
                    }
                }

                contentSection(title: "Recent Encounters") {
                    if recentEncounters.isEmpty {
                        illustratedEmptyState(
                            icon: "person.wave.2",
                            message: "No recent encounters",
                            hint: "When \(resolvedPerson.name) is recognized, encounters will appear here."
                        )
                    } else {
                        ForEach(recentEncounters) { encounter in
                            detailRow(
                                icon: encounter.isImportant ? "star.fill" : "clock",
                                color: encounter.isImportant ? EmoryTheme.secondary : EmoryTheme.primary,
                                title: encounter.personName,
                                subtitle: encounter.startedAt
                            )
                        }
                    }
                }

                if let notes = resolvedPerson.notes, !notes.isEmpty {
                    contentSection(title: "Notes") {
                        Text(notes)
                            .font(.system(size: settings.fontSize.bodySize))
                            .foregroundStyle(EmoryTheme.textPrimary)
                            .padding(.horizontal, 24)
                    }
                }

                VStack(spacing: 12) {
                    if settings.isMockMode {
                        Button {
                            showAddNote = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 18))
                                Text("Add Note")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(EmoryTheme.secondary)
                            .clipShape(Capsule())
                        }
                    }

                    Button {
                        Haptics.medium()
                        showEnrollConfirmation = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "faceid")
                                .font(.system(size: 18))
                            Text("Enroll Face")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(EmoryTheme.primary)
                        .clipShape(Capsule())
                    }

                    if settings.isMockMode {
                        Button {
                            showRemoveConfirmation = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "person.badge.minus")
                                    .font(.system(size: 18))
                                Text("Remove Person")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(EmoryTheme.destructive.opacity(0.75))
                            .clipShape(Capsule())
                        }
                    } else {
                        Text("This mobile view is currently read-only.")
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 40)
            }
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("About \(resolvedPerson.name)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            InactivityManager.shared.setLastViewedPerson(person)
        }
        .confirmationDialog(
            "Are you sure you want to remove \(resolvedPerson.name)?",
            isPresented: $showRemoveConfirmation,
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {}
            Button("Keep", role: .cancel) {}
        } message: {
            Text("This will remove them from your circle. You can always add them back later.")
        }
        .alert("Enroll Face", isPresented: $showEnrollConfirmation) {
            Button("Start Enrollment") {
                // TODO: POST /enroll with person.id
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will register \(resolvedPerson.name)'s face so the glasses can recognize them. Make sure they're in front of the camera.")
        }
        .sheet(isPresented: $showAddNote) {
            AddNoteSheet(
                title: $newNoteTitle,
                subtitle: $newNoteSubtitle,
                fontSize: settings.fontSize
            ) {
                newNoteTitle = ""
                newNoteSubtitle = ""
                showAddNote = false
            }
        }
        .task(id: "\(settings.isMockMode)-\(settings.backendURL)-\(person.id)") {
            await loadDetail()
        }
    }

    private func noteColor(for icon: String) -> Color {
        if icon.contains("map") || icon.contains("house") { return EmoryTheme.primary }
        if icon.contains("person") { return EmoryTheme.secondary }
        if icon.contains("gift") || icon.contains("heart") { return EmoryTheme.destructive }
        if icon.contains("phone") || icon.contains("clock") { return EmoryTheme.primary }
        return EmoryTheme.secondary
    }

    private var resolvedPerson: Person {
        detailPerson ?? person
    }

    @ViewBuilder
    private func contentSection(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: settings.fontSize.titleSize, weight: .semibold))
                .foregroundStyle(EmoryTheme.textPrimary)
                .padding(.horizontal, 24)

            VStack(alignment: .leading, spacing: 12) {
                content()
            }
        }
        .padding(.bottom, 24)
    }

    private func detailRow(icon: String, color: Color, title: String, subtitle: String? = nil) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                    .foregroundStyle(EmoryTheme.textPrimary)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: settings.fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textSecondary)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 24)
    }

    private func illustratedEmptyState(icon: String, message: String, hint: String) -> some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(EmoryTheme.primary.opacity(0.06))
                    .frame(width: 52, height: 52)
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundStyle(EmoryTheme.primary.opacity(0.4))
            }
            Text(message)
                .font(.system(size: settings.fontSize.captionSize, weight: .medium))
                .foregroundStyle(EmoryTheme.textSecondary)
            Text(hint)
                .font(.system(size: settings.fontSize.captionSize - 2))
                .foregroundStyle(EmoryTheme.textSecondary.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 24)
    }

    private func iconForMemoryType(_ memoryType: String) -> String {
        switch memoryType {
        case "event": return "calendar"
        case "preference": return "heart"
        case "relationship": return "person.2"
        case "health": return "cross.case"
        case "routine": return "clock"
        default: return "sparkles"
        }
    }

    private func loadDetail() async {
        guard !settings.isMockMode else {
            detailPerson = person
            recentMemories = []
            recentEncounters = []
            loadError = nil
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let client = try DesktopApiClient.fromSettings()
            let response = try await client.fetchPersonDetail(personId: person.id)
            detailPerson = response.person.asPerson()
            recentMemories = response.recentMemories.map { $0.asPersonMemory() }
            recentEncounters = response.recentEncounters.map { $0.asEncounterSummary() }
            loadError = nil
            DesktopConnectionStore.shared.markConnected()
        } catch {
            loadError = error.localizedDescription
            DesktopConnectionStore.shared.markDisconnected(reason: error.localizedDescription)
        }
    }
}

struct AddNoteSheet: View {
    @Binding var title: String
    @Binding var subtitle: String
    let fontSize: EmoryTheme.FontSize
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("What would you like to remember?")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("e.g. Loves gardening", text: $title)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Any extra details? (optional)")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("e.g. Roses are her favorite", text: $subtitle)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button {
                    onSave()
                } label: {
                    Text("Save Note")
                        .font(.system(size: fontSize.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(title.isEmpty ? Color.gray : EmoryTheme.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(title.isEmpty)

                Spacer()
            }
            .padding(24)
            .background(EmoryTheme.background.ignoresSafeArea())
            .navigationTitle("Add Memory Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let containerWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > containerWidth && currentX > 0 {
                currentY += rowHeight + spacing
                currentX = 0
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: containerWidth, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentY += rowHeight + spacing
                currentX = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
