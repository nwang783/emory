import SwiftUI

struct RecognitionPopupView: View {
    let presentation: DesktopRecognitionStore.PresentedRecognition
    let onViewProfile: () -> Void
    let onDismiss: () -> Void

    @State private var settings = AppSettings.shared
    @State private var isPulsing = false
    @State private var appeared = false

    private var person: Person { presentation.resolvedPerson }

    var body: some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    // Pulsing recognition ring + face thumbnail
                    ZStack {
                        Circle()
                            .stroke(EmoryTheme.secondary.opacity(isPulsing ? 0.0 : 0.35), lineWidth: 4)
                            .frame(width: 140, height: 140)
                            .scaleEffect(isPulsing ? 1.25 : 1.0)
                            .animation(
                                .easeOut(duration: 1.6).repeatForever(autoreverses: false),
                                value: isPulsing
                            )

                        Circle()
                            .stroke(EmoryTheme.secondary.opacity(0.25), lineWidth: 3)
                            .frame(width: 128, height: 128)

                        FaceThumbnailView(
                            faceThumbnail: person.faceThumbnail,
                            fallbackSystemImage: "person.circle.fill",
                            size: 120
                        )
                        .overlay(
                            Circle()
                                .stroke(EmoryTheme.cardBackground, lineWidth: 4)
                                .frame(width: 120, height: 120)
                        )
                    }

                    // Name + relationship
                    VStack(spacing: 6) {
                        Text(person.name)
                            .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                            .foregroundStyle(EmoryTheme.textPrimary)

                        Text(person.relationship)
                            .font(.system(size: settings.fontSize.bodySize))
                            .foregroundStyle(EmoryTheme.primary)
                    }

                    // "Recognized just now" badge
                    HStack(spacing: 6) {
                        Image(systemName: "eye.fill")
                            .font(.system(size: 12))
                        Text(recognizedTimeText)
                            .font(.system(size: settings.fontSize.captionSize, weight: .medium))
                    }
                    .foregroundStyle(EmoryTheme.secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(EmoryTheme.secondary.opacity(0.10))
                    .clipShape(Capsule())

                    // Info cards
                    if presentation.isLoadingDetail {
                        ProgressView()
                            .tint(EmoryTheme.primary)
                            .padding(.vertical, 8)
                    } else {
                        VStack(spacing: 10) {
                            // Key facts
                            if !person.keyFacts.isEmpty {
                                infoCard(
                                    icon: "sparkles",
                                    color: EmoryTheme.tertiary,
                                    title: "Key Facts",
                                    items: person.keyFacts.prefix(3).map { $0 }
                                )
                            }

                            // Recent topics
                            if !person.lastTopics.isEmpty {
                                infoCard(
                                    icon: "bubble.left.and.bubble.right",
                                    color: EmoryTheme.primary,
                                    title: "Recent Topics",
                                    items: person.lastTopics.prefix(2).map { $0 }
                                )
                            }

                            // Conversation starters
                            if !person.conversationStarters.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("Try Saying", systemImage: "text.bubble")
                                        .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                                        .foregroundStyle(EmoryTheme.textSecondary)

                                    FlowLayout(spacing: 6) {
                                        ForEach(person.conversationStarters.prefix(3), id: \.self) { starter in
                                            Text(starter)
                                                .font(.system(size: settings.fontSize.captionSize))
                                                .foregroundStyle(EmoryTheme.primary)
                                                .padding(.horizontal, 12)
                                                .padding(.vertical, 7)
                                                .background(EmoryTheme.primary.opacity(0.08))
                                                .clipShape(Capsule())
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(EmoryTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }

                            // Important dates
                            if !person.importantDates.isEmpty {
                                HStack(spacing: 8) {
                                    Image(systemName: "calendar")
                                        .font(.system(size: 14))
                                        .foregroundStyle(EmoryTheme.warmAccent)
                                    ForEach(person.importantDates.prefix(2), id: \.label) { date in
                                        Text("\(date.label): \(date.date)")
                                            .font(.system(size: settings.fontSize.captionSize))
                                            .foregroundStyle(EmoryTheme.textSecondary)
                                    }
                                    Spacer()
                                }
                                .padding(14)
                                .background(EmoryTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    }

                    // Action buttons
                    VStack(spacing: 10) {
                        Button(action: onViewProfile) {
                            HStack(spacing: 8) {
                                Image(systemName: "person.text.rectangle")
                                    .font(.system(size: 16))
                                Text("View Full Profile")
                                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(EmoryTheme.primary)
                            .clipShape(Capsule())
                        }

                        Button(action: onDismiss) {
                            Text("Dismiss")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                                .foregroundStyle(EmoryTheme.primary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(EmoryTheme.primary.opacity(0.08))
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(28)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(EmoryTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 28))
            .shadow(color: .black.opacity(0.18), radius: 24, y: 12)
            .padding(.horizontal, 24)
            .padding(.vertical, 60)
            .scaleEffect(appeared ? 1.0 : 0.88)
            .opacity(appeared ? 1.0 : 0)
        }
        .onAppear {
            isPulsing = true
            Haptics.success()
            withAnimation(.spring(response: 0.45, dampingFraction: 0.78)) {
                appeared = true
            }
        }
    }

    private func infoCard(icon: String, color: Color, title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                .foregroundStyle(EmoryTheme.textSecondary)

            ForEach(items, id: \.self) { item in
                HStack(spacing: 8) {
                    Circle()
                        .fill(color.opacity(0.5))
                        .frame(width: 5, height: 5)
                    Text(item)
                        .font(.system(size: settings.fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textPrimary)
                        .lineLimit(2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(EmoryTheme.background)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var recognizedTimeText: String {
        let elapsed = Date().timeIntervalSince(presentation.detectedAt)
        if elapsed < 5 { return "Recognized just now" }
        if elapsed < 60 { return "Recognized \(Int(elapsed))s ago" }
        return "Recognized \(Int(elapsed / 60))m ago"
    }
}
