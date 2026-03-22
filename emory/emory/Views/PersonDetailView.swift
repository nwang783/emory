import CoreTransferable
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

private struct PickedVideoFile: Transferable, Sendable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in
            let temporaryDirectory = FileManager.default.temporaryDirectory
            let fileExtension = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let destinationURL = temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: false)
                .appendingPathExtension(fileExtension)

            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try? FileManager.default.removeItem(at: destinationURL)
            }

            try FileManager.default.copyItem(at: received.file, to: destinationURL)
            return .init(url: destinationURL)
        }
    }
}

// MARK: - Person Detail View
// Shows a person's profile and recent memory context.

struct PersonDetailView: View {
    let person: Person
    @State private var settings = AppSettings.shared
    @State private var profileVideoStore = ProfileVideoStore.shared
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
    @State private var showVideoSourcePicker = false
    @State private var showPhotoLibraryPicker = false
    @State private var showVideoFileImporter = false
    @State private var selectedVideoPickerItem: PhotosPickerItem?
    @State private var isImportingVideo = false
    @State private var videoImportErrorMessage: String?
    @State private var showVideoPlayer = false

    private var resolvedPerson: Person { detailPerson ?? person }
    private var relationshipColor: Color { EmoryTheme.relationshipColor(for: resolvedPerson.relationship) }
    private var profileVideoMetadata: ProfileVideoMetadata? { profileVideoStore.metadata(for: person.id) }
    private var profileVideoURL: URL? { profileVideoStore.videoURL(for: person.id) }
    private var profileVideoThumbnailURL: URL? { profileVideoStore.thumbnailURL(for: person.id) }

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

                    profileCard(icon: "video.fill", color: relationshipColor, title: "Message Video") {
                        if let metadata = profileVideoMetadata,
                           profileVideoURL != nil {
                            Button {
                                Haptics.light()
                                showVideoPlayer = true
                            } label: {
                                VStack(alignment: .leading, spacing: 14) {
                                    ZStack {
                                        ProfileVideoThumbnailView(thumbnailURL: profileVideoThumbnailURL)
                                            .frame(maxWidth: .infinity)
                                            .frame(height: 188)

                                        Image(systemName: "play.circle.fill")
                                            .font(.system(size: 54))
                                            .foregroundStyle(.white)
                                            .shadow(color: Color.black.opacity(0.28), radius: 10, y: 4)
                                    }

                                    HStack {
                                        Label(metadata.durationText, systemImage: "clock.fill")
                                        Spacer()
                                        Text(metadata.fileSizeText)
                                    }
                                    .font(.system(size: settings.fontSize.captionSize, weight: .medium))
                                    .foregroundStyle(EmoryTheme.textSecondary)

                                    Text("Tap to play the prerecorded message.")
                                        .font(.system(size: settings.fontSize.captionSize))
                                        .foregroundStyle(EmoryTheme.textSecondary)
                                }
                            }
                            .buttonStyle(.plain)
                            .contentShape(RoundedRectangle(cornerRadius: 18))
                            .accessibilityLabel("Play message video for \(resolvedPerson.name)")
                        } else if isImportingVideo {
                            HStack(spacing: 12) {
                                ProgressView()
                                    .tint(relationshipColor)
                                Text("Importing video…")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                                    .foregroundStyle(EmoryTheme.textPrimary)
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                emptyHint(
                                    icon: "video.badge.plus",
                                    text: "Add a calming prerecorded message for \(resolvedPerson.name) to watch from their profile."
                                )

                                Button {
                                    showVideoSourcePicker = true
                                } label: {
                                    Label("Upload Video", systemImage: "square.and.arrow.up")
                                        .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                                        .foregroundStyle(relationshipColor)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 10)
                                        .background(relationshipColor.opacity(0.10))
                                        .clipShape(Capsule())
                                }
                            }
                        }
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
                                            Text(friendlyDate(memory.memoryDate))
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
                                            Text(friendlyDate(encounter.startedAt))
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
                            Text("Most profile details are read-only on mobile, but message videos can be updated here.")
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
        .sheet(isPresented: $showVideoPlayer) {
            if let videoURL = profileVideoURL {
                ProfileVideoPlayerSheet(title: resolvedPerson.name, url: videoURL)
            }
        }
        .confirmationDialog(
            profileVideoMetadata == nil ? "Add Message Video" : "Change Message Video",
            isPresented: $showVideoSourcePicker,
            titleVisibility: .visible
        ) {
            Button("Choose from Library") {
                showPhotoLibraryPicker = true
            }
            Button("Browse Files") {
                showVideoFileImporter = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Pick the prerecorded video you want available in \(resolvedPerson.name)'s profile.")
        }
        .photosPicker(
            isPresented: $showPhotoLibraryPicker,
            selection: $selectedVideoPickerItem,
            matching: .videos,
            preferredItemEncoding: .automatic
        )
        .fileImporter(
            isPresented: $showVideoFileImporter,
            allowedContentTypes: [.movie]
        ) { result in
            switch result {
            case .success(let url):
                Task {
                    await importVideo(from: url, requiresSecurityScopedAccess: true)
                }
            case .failure(let error):
                videoImportErrorMessage = error.localizedDescription
            }
        }
        .onChange(of: selectedVideoPickerItem) { _, newValue in
            guard let newValue else { return }

            Task {
                await importPickedVideo(from: newValue)
            }
        }
        .alert("Video Upload Failed", isPresented: Binding(
            get: { videoImportErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    videoImportErrorMessage = nil
                }
            }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(videoImportErrorMessage ?? "")
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

                    if profileVideoMetadata != nil {
                        ZStack {
                            Circle()
                                .fill(Color.white)
                                .frame(width: 32, height: 32)
                                .shadow(color: Color.black.opacity(0.12), radius: 8, y: 3)

                            Image(systemName: "video.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(relationshipColor)
                        }
                        .offset(x: 36, y: -36)
                    }
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

                    Button {
                        showVideoSourcePicker = true
                    } label: {
                        HStack(spacing: 8) {
                            if isImportingVideo {
                                ProgressView()
                                    .tint(relationshipColor)
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: profileVideoMetadata == nil ? "square.and.arrow.up" : "arrow.triangle.2.circlepath")
                                    .font(.system(size: 14, weight: .semibold))
                            }

                            Text(profileVideoMetadata == nil ? "Upload Video" : "Change Video")
                                .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                        }
                        .foregroundStyle(relationshipColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.72))
                        .clipShape(Capsule())
                    }
                    .padding(.top, 12)
                    .disabled(isImportingVideo)
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

    /// Converts ISO date strings like "2026-03-22T15:15:00Z" to "March 22, 2026 at 3:15 PM"
    private func friendlyDate(_ isoString: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Try with fractional seconds first, then without
        let date = iso.date(from: isoString) ?? {
            iso.formatOptions = [.withInternetDateTime]
            return iso.date(from: isoString)
        }()

        guard let date else { return isoString }

        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func importPickedVideo(from item: PhotosPickerItem) async {
        defer { selectedVideoPickerItem = nil }

        do {
            guard let pickedVideo = try await item.loadTransferable(type: PickedVideoFile.self) else {
                throw ProfileVideoStoreError.noVideoSelected
            }
            await importVideo(from: pickedVideo.url, requiresSecurityScopedAccess: false)
        } catch {
            videoImportErrorMessage = error.localizedDescription
        }
    }

    private func importVideo(from url: URL, requiresSecurityScopedAccess: Bool) async {
        if requiresSecurityScopedAccess {
            let didStartAccessing = url.startAccessingSecurityScopedResource()
            defer {
                if didStartAccessing {
                    url.stopAccessingSecurityScopedResource()
                }
            }
        }

        isImportingVideo = true
        defer { isImportingVideo = false }

        do {
            _ = try await profileVideoStore.importVideo(personId: person.id, from: url)
            Haptics.success()
        } catch {
            videoImportErrorMessage = error.localizedDescription
        }
    }

    private func enrollFace() async {
        isEnrolling = true
        enrollmentResult = "Capturing frame and sending to desktop for enrollment..."
        showEnrollmentResult = true

        do {
            let client = try DesktopApiClient.fromSettings()

            // Grab the current frame from the streaming view model
            guard let currentFrame = await getEnrollmentFrame() else {
                enrollmentResult = "No video frame available. Start streaming from the Glasses tab first, then come back and try again."
                isEnrolling = false
                return
            }

            // Convert to JPEG on a background thread to avoid blocking the stream
            let jpegData: Data? = await Task.detached(priority: .userInitiated) {
                currentFrame.jpegData(compressionQuality: 0.7)
            }.value

            guard let jpegData else {
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
