import SwiftUI

struct MemoriesView: View {
    @State private var settings = AppSettings.shared
    @State private var memoriesStore = MemoriesStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Memories")
                        .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    Text("Helpful moments and facts grouped by person.")
                        .font(.system(size: settings.fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textSecondary)
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)

                if memoriesStore.isLoading && !settings.isMockMode {
                    ProgressView("Loading memories...")
                        .padding(.horizontal, 24)
                } else if let errorMessage = memoriesStore.errorMessage, !settings.isMockMode {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Couldn’t load memories from the desktop.")
                            .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            .foregroundStyle(EmoryTheme.textPrimary)
                        Text(errorMessage)
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                        Button("Retry") {
                            Task { await memoriesStore.loadMemories() }
                        }
                        .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                        .foregroundStyle(EmoryTheme.primary)
                    }
                    .padding(20)
                    .emoryCard()
                    .padding(.horizontal, 24)
                } else if memoriesStore.groups.isEmpty {
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(EmoryTheme.tertiary.opacity(0.10))
                                .frame(width: 72, height: 72)
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 30))
                                .foregroundStyle(EmoryTheme.tertiary.opacity(0.5))
                        }
                        VStack(spacing: 6) {
                            Text("No memories yet")
                                .font(.system(size: settings.fontSize.titleSize, weight: .semibold))
                                .foregroundStyle(EmoryTheme.textPrimary)
                            Text("Once conversations are processed on desktop, they’ll appear here grouped by person.")
                                .font(.system(size: settings.fontSize.captionSize))
                                .foregroundStyle(EmoryTheme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .padding(.horizontal, 20)
                    .emoryCard()
                    .padding(.horizontal, 24)
                } else {
                    ForEach(memoriesStore.groups) { group in
                        VStack(alignment: .leading, spacing: 16) {
                            NavigationLink(destination: PersonDetailView(person: group.person)) {
                                HStack(spacing: 14) {
                                    FaceThumbnailView(
                                        faceThumbnail: group.person.faceThumbnail,
                                        fallbackSystemImage: group.person.photoName ?? "person.circle.fill",
                                        size: 56
                                    )

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(group.person.name)
                                            .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                                            .foregroundStyle(EmoryTheme.textPrimary)
                                        Text(group.person.relationship)
                                            .font(.system(size: settings.fontSize.captionSize))
                                            .foregroundStyle(EmoryTheme.primary)
                                    }

                                    Spacer()

                                    Text("\(group.memories.count)")
                                        .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                                        .foregroundStyle(EmoryTheme.secondary)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(EmoryTheme.secondary.opacity(0.12))
                                        .clipShape(Capsule())
                                }
                            }

                            VStack(spacing: 12) {
                                ForEach(group.memories) { memory in
                                    memoryRow(memory)
                                }
                            }
                        }
                        .padding(20)
                        .emoryCard()
                        .padding(.horizontal, 24)
                    }
                }
            }
            .padding(.bottom, 32)
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("Memories")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(settings.isMockMode)-\(settings.backendURL)") {
            await memoriesStore.loadMemories()
        }
    }

    private func memoryRow(_ memory: PersonMemory) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(memoryColor(memory.memoryType).opacity(0.14))
                    .frame(width: 40, height: 40)
                Image(systemName: memoryIcon(memory.memoryType))
                    .font(.system(size: 16))
                    .foregroundStyle(memoryColor(memory.memoryType))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(memory.memoryText)
                    .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Text(memory.memoryDate)
                    .font(.system(size: settings.fontSize.captionSize))
                    .foregroundStyle(EmoryTheme.textSecondary)
            }

            Spacer()
        }
    }

    private func memoryIcon(_ memoryType: String) -> String {
        switch memoryType {
        case "event": return "calendar"
        case "preference": return "heart"
        case "relationship": return "person.2"
        case "health": return "cross.case"
        case "routine": return "clock"
        default: return "sparkles"
        }
    }

    private func memoryColor(_ memoryType: String) -> Color {
        switch memoryType {
        case "preference": return EmoryTheme.destructive
        case "routine": return EmoryTheme.primary
        default: return EmoryTheme.secondary
        }
    }
}
