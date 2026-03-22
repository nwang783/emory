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
    @State private var isEnrolling = false
    @State private var enrollmentResult: String?
    @State private var showEnrollmentResult = false
    @State private var detailPerson: Person?
    @State private var recentMemories: [PersonMemory] = []
    @State private var recentEncounters: [EncounterSummary] = []
    @State private var isLoading = false
    @State private var loadError: String?
    @State private var headerVisible = false
    @State private var cardsVisible = false

    private var resolvedPerson: Person { detailPerson ?? person }
    private var relationshipColor: Color { EmoryTheme.relationshipColor(for: resolvedPerson.relationship) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // MARK: Hero header
                heroHeader

                // MARK: Content cards
                VStack(spacing: 16) {
                    if isLoading && !settings.isMockMode {
                        ProgressView("Loading details…")
                            .padding(.vertical, 20)
                    } else if let loadError, !settings.isMockMode {
                        errorBanner(loadError)
                    }

                    // Key facts card
                    profileCard(icon: "sparkles", color: EmoryTheme.secondary, title: "Key Facts") {
                        if resolvedPerson.keyFacts.isEmpty {
                            emptyHint(icon: "sparkles", text: "Important details about \(resolvedPerson.name) will appear here.")
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(resolvedPerson.keyFacts, id: \.self) { fact in
                                    factRow(fact, color: EmoryTheme.secondary)
                                }
                            }
                        }
                    }

                    // Important dates card
                    profileCard(icon: "calendar", color: EmoryTheme.warmAccent, title: "Important Dates") {
                        if resolvedPerson.importantDates.isEmpty {
                            emptyHint(icon: "calendar.badge.clock", text: "Birthdays, anniversaries, and special days go here.")
                        } else {
                            VStack(spacing: 10) {
                                ForEach(resolvedPerson.importantDates, id: \.label) { date in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(date.label)
                                                .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                                                .foregroundStyle(EmoryTheme.textPrimary)
                                            Text(date.date)
                                                .font(.system(size: settings.fontSize.captionSize))
                                                .foregroundStyle(EmoryTheme.textSecondary)
                                        }
                                        Spacer()
                                        Image(systemName: "calendar")
                                            .foregroundStyle(EmoryTheme.warmAccent.opacity(0.5))
                                    }
                                }
                            }
                        }
                    }

                    // Recent topics card
                    profileCard(icon: "bubble.left.and.bubble.right", color: EmoryTheme.primary, title: "Recent Topics") {
                        if resolvedPerson.lastTopics.isEmpty {
                            emptyHint(icon: "bubble.left.and.bubble.right", text: "Topics from conversations will appear here.")
                        } else {
                            FlowLayout(spacing: 8) {
                                ForEach(resolvedPerson.lastTopics, id: \.self) { topic in
                                    Text(topic)
                                        .font(.system(size: settings.fontSize.captionSize))
                                        .foregroundStyle(EmoryTheme.primary)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(EmoryTheme.primary.opacity(0.08))
                                        .clipShape(Capsule())
                                }
                            }
                        }
                    }

                    // Conversation starters card
                    if !resolvedPerson.conversationStarters.isEmpty {
                        profileCard(icon: "text.bubble", color: EmoryTheme.tertiary, title: "Try Saying") {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(resolvedPerson.conversationStarters, id: \.self) { starter in
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: "quote.opening")
                                            .font(.system(size: 12))
                                            .foregroundStyle(EmoryTheme.tertiary.opacity(0.6))
                                            .padding(.top, 3)
                                        Text(starter)
                                            .font(.system(size: settings.fontSize.bodySize))
                                            .foregroundStyle(EmoryTheme.textPrimary)
                                            .italic()
                                    }
                                }
                            }
                        }
                    }

                    // Recent memories card
                    profileCard(icon: "brain.head.profile", color: EmoryTheme.secondary, title: "Recent Memories") {
                        if recentMemories.isEmpty {
                            emptyHint(icon: "brain.head.profile", text: "Extracted conversation memories will show up here.")
                        } else {
                            VStack(spacing: 12) {
                                ForEach(recentMemories) { memory in
                                    HStack(alignment: .top, spacing: 12) {
                                        ZStack {
                                            Circle()
                                                .fill(memoryColor(for: memory.memoryType).opacity(0.12))
                                                .frame(width: 36, height: 36)
                                            Image(systemName: iconForMemoryType(memory.memoryType))
                                                .font(.system(size: 14))
                                                .foregroundStyle(memoryColor(for: memory.memoryType))
                                        }
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(memory.memoryText)
                                                .font(.system(size: settings.fontSize.captionSize, weight: .medium))
                                                .foregroundStyle(EmoryTheme.textPrimary)
                                            Text(memory.memoryDate)
                                                .font(.system(size: settings.fontSize.captionSize - 2))
                                                .foregroundStyle(EmoryTheme.textSecondary)
                                        }
                                        Spacer()
                                    }
                                }
                            }
                        }
                    }

                    // Recent encounters card
                    profileCard(icon: "person.wave.2", color: EmoryTheme.primary, title: "Recent Encounters") {
                        if recentEncounters.isEmpty {
                            emptyHint(icon: "person.wave.2", text: "When \(resolvedPerson.name) is recognized, encounters will appear here.")
                        } else {
                            VStack(spacing: 10) {
                                ForEach(recentEncounters) { encounter in
                                    HStack(spacing: 12) {
                                        Circle()
                                            .fill(encounter.isImportant ? EmoryTheme.secondary : EmoryTheme.primary.opacity(0.15))
                                            .frame(width: 8, height: 8)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(encounter.personName)
                                                .font(.system(size: settings.fontSize.captionSize, weight: .medium))
                                                .foregroundStyle(EmoryTheme.textPrimary)
                                            Text(encounter.startedAt)
                                                .font(.system(size: settings.fontSize.captionSize - 2))
                                                .foregroundStyle(EmoryTheme.textSecondary)
                                        }
                                        Spacer()
                                        if encounter.isImportant {
                                            Image(systemName: "star.fill")
                                                .font(.system(size: 12))
                                                .foregroundStyle(EmoryTheme.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Notes card
                    if let notes = resolvedPerson.notes, !notes.isEmpty {
                        profileCard(icon: "note.text", color: EmoryTheme.primary, title: "Notes") {
                            Text(notes)
                                .font(.system(size: settings.fontSize.bodySize))
                                .foregroundStyle(EmoryTheme.textPrimary)
                        }
                    }

                    // Action buttons
                    VStack(spacing: 12) {
                        if settings.isMockMode {
                            actionButton(icon: "plus.circle.fill", label: "Add Note", color: EmoryTheme.secondary) {
                                showAddNote = true
                            }
                        }

                        actionButton(icon: "faceid", label: "Enroll Face", color: EmoryTheme.primary) {
                            Haptics.medium()
                            showEnrollConfirmation = true
                        }

                        if settings.isMockMode {
                            actionButton(icon: "person.badge.minus", label: "Remove Person", color: EmoryTheme.destructive.opacity(0.75)) {
                                showRemoveConfirmation = true
                            }
                        } else {
                            Text("This mobile view is currently read-only.")
                                .font(.system(size: settings.fontSize.captionSize))
                                .foregroundStyle(EmoryTheme.textSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 40)
                .opacity(cardsVisible ? 1 : 0)
                .offset(y: cardsVisible ? 0 : 20)
            }
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("About \(resolvedPerson.name)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            InactivityManager.shared.setLastViewedPerson(person)
            withAnimation(.easeOut(duration: 0.4)) { headerVisible = true }
            withAnimation(.easeOut(duration: 0.5).delay(0.15)) { cardsVisible = true }
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
                Task { await enrollFace() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will register \(resolvedPerson.name)'s face so the glasses can recognize them. Make sure they're in front of the camera.")
        }
        .alert(isEnrolling ? "Enrolling..." : "Enrollment Result", isPresented: $showEnrollmentResult) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(enrollmentResult ?? "")
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

    // MARK: - Hero header

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            // Background gradient using relationship color
            LinearGradient(
                colors: [relationshipColor.opacity(0.18), relationshipColor.opacity(0.04), EmoryTheme.background],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 280)

            // Decorative circles
            Circle()
                .fill(relationshipColor.opacity(0.06))
                .frame(width: 200, height: 200)
                .offset(x: 160, y: -60)

            Circle()
                .fill(relationshipColor.opacity(0.04))
                .frame(width: 120, height: 120)
                .offset(x: -30, y: -100)

            HStack(alignment: .bottom, spacing: 20) {
                // Face thumbnail
                ZStack {
                    Circle()
                        .fill(EmoryTheme.cardBackground)
                        .frame(width: 108, height: 108)
                        .shadow(color: relationshipColor.opacity(0.2), radius: 16, y: 6)

                    if let photoAsset = resolvedPerson.photoName,
                       UIImage(named: photoAsset) != nil {
                        Image(photoAsset)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                    } else {
                        FaceThumbnailView(
                            faceThumbnail: resolvedPerson.faceThumbnail,
                            fallbackSystemImage: "person.circle.fill",
                            size: 100
                        )
                    }

                    // Colored ring
                    Circle()
                        .stroke(relationshipColor.opacity(0.35), lineWidth: 3)
                        .frame(width: 106, height: 106)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(resolvedPerson.name)
                        .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)

                    HStack(spacing: 6) {
                        Circle()
                            .fill(relationshipColor)
                            .frame(width: 8, height: 8)
                        Text(resolvedPerson.relationship)
                            .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                            .foregroundStyle(relationshipColor)
                    }

                    if let lastSeen = resolvedPerson.lastSeen, !lastSeen.isEmpty {
                        Text("Last seen \(lastSeen)")
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                            .padding(.top, 2)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .clipped()
        .opacity(headerVisible ? 1 : 0)
        .offset(y: headerVisible ? 0 : -10)
    }

    // MARK: - Card components

    @ViewBuilder
    private func profileCard<Content: View>(
        icon: String,
        color: Color,
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(color.opacity(0.12))
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(color)
                }
                Text(title)
                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Spacer()
            }

            content()
        }
        .padding(18)
        .emoryCard()
    }

    private func factRow(_ text: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(color.opacity(0.4))
                .frame(width: 6, height: 6)
                .padding(.top, 7)
            Text(text)
                .font(.system(size: settings.fontSize.bodySize))
                .foregroundStyle(EmoryTheme.textPrimary)
            Spacer()
        }
    }

    private func emptyHint(icon: String, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(EmoryTheme.primary.opacity(0.3))
            Text(text)
                .font(.system(size: settings.fontSize.captionSize))
                .foregroundStyle(EmoryTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(EmoryTheme.warmAccent)
            Text(message)
                .font(.system(size: settings.fontSize.captionSize))
                .foregroundStyle(EmoryTheme.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EmoryTheme.warmAccent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func actionButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(label)
                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color)
            .clipShape(Capsule())
        }
    }

    // MARK: - Helpers

    private func memoryColor(for memoryType: String) -> Color {
        switch memoryType {
        case "event": return EmoryTheme.primary
        case "preference": return EmoryTheme.destructive
        case "relationship": return EmoryTheme.secondary
        case "health": return EmoryTheme.warmAccent
        case "routine": return EmoryTheme.primary
        default: return EmoryTheme.secondary
        }
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

    private func enrollFace() async {
        isEnrolling = true
        enrollmentResult = "Capturing frame and sending to desktop for enrollment..."
        showEnrollmentResult = true

        do {
            let client = try DesktopApiClient.fromSettings()

            // Grab the current frame from the streaming view model
            // If streaming, use the live frame; otherwise prompt user
            guard let currentFrame = await getEnrollmentFrame() else {
                enrollmentResult = "No video frame available. Start streaming from the Glasses tab first, then come back and try again."
                isEnrolling = false
                return
            }

            // Convert to JPEG
            guard let jpegData = currentFrame.jpegData(compressionQuality: 0.8) else {
                enrollmentResult = "Failed to encode image. Please try again."
                isEnrolling = false
                return
            }

            print("[Enroll] Sending \(jpegData.count / 1024)KB JPEG for person \(person.id)")

            let response = try await client.enrollFace(personId: person.id, jpegData: jpegData)

            if response.success {
                enrollmentResult = "\(resolvedPerson.name)'s face has been enrolled successfully! The glasses will now recognize them."
                print("[Enroll] Success! embeddingId=\(response.embeddingId ?? "nil")")
            } else {
                enrollmentResult = response.error ?? "Enrollment failed. Make sure the person's face is clearly visible."
                print("[Enroll] Failed: \(response.error ?? "unknown")")
            }
        } catch {
            enrollmentResult = "Could not connect to desktop: \(error.localizedDescription)"
            print("[Enroll] Error: \(error.localizedDescription)")
        }

        isEnrolling = false
    }

    /// Gets the latest frame from the active streaming session for enrollment
    private func getEnrollmentFrame() async -> UIImage? {
        return StreamViewModel.currentEnrollmentFrame
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
