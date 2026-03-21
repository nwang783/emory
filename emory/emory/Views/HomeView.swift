import SwiftUI

// MARK: - Home View
// Large, friendly welcome screen for dementia patients.
// Two oversized card buttons for People and Memories.

struct HomeView: View {
    @State private var settings = AppSettings.shared
    @State private var connectionStore = DesktopConnectionStore.shared

    @State private var showHeader = false
    @State private var showWelcome = false
    @State private var showAccentLine = false
    @State private var showPeopleCard = false
    @State private var showMemoriesCard = false
    @State private var accentBreathing = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image("EmoryLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 36)

                Spacer()

                HStack(spacing: 6) {
                    Circle()
                        .fill(connectionStore.isConnected ? EmoryTheme.secondary : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(connectionStore.friendlyName ?? connectionStore.statusText)
                        .font(.system(size: settings.fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textSecondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .opacity(showHeader ? 1 : 0)
            .offset(y: showHeader ? 0 : -20)

            Spacer()

            VStack(spacing: 8) {
                Text("Hello! Who would")
                    .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Text("you like to see")
                    .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Text("today?")
                    .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                    .foregroundStyle(EmoryTheme.textPrimary)

                RoundedRectangle(cornerRadius: 2)
                    .fill(EmoryTheme.primary)
                    .frame(width: showAccentLine ? 60 : 0, height: 4)
                    .opacity(accentBreathing ? 0.5 : 1.0)
                    .padding(.top, 4)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            .opacity(showWelcome ? 1 : 0)
            .scaleEffect(showWelcome ? 1 : 0.9)

            Spacer()

            VStack(spacing: 20) {
                NavigationLink(destination: PeopleView()) {
                    HomeCardButton(
                        icon: "person.2.fill",
                        title: "People",
                        color: EmoryTheme.primary,
                        fontSize: settings.fontSize
                    )
                }
                .buttonStyle(BounceButtonStyle())
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
                .opacity(showPeopleCard ? 1 : 0)
                .offset(y: showPeopleCard ? 0 : 40)

                NavigationLink(destination: MemoriesView()) {
                    HomeCardButton(
                        icon: "brain.head.profile",
                        title: "Memories",
                        color: EmoryTheme.secondary,
                        fontSize: settings.fontSize
                    )
                }
                .buttonStyle(BounceButtonStyle())
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
                .opacity(showMemoriesCard ? 1 : 0)
                .offset(y: showMemoriesCard ? 0 : 40)
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(EmoryTheme.background.ignoresSafeArea())
        .task(id: "\(settings.isMockMode)-\(settings.backendURL)") {
            guard !settings.isMockMode else { return }
            await connectionStore.testConnection()
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                showHeader = true
            }
            withAnimation(.easeOut(duration: 0.6).delay(0.2)) {
                showWelcome = true
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.5)) {
                showAccentLine = true
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.75).delay(0.6)) {
                showPeopleCard = true
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.75).delay(0.75)) {
                showMemoriesCard = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) {
                withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                    accentBreathing = true
                }
            }
        }
    }
}

struct BounceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.93 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct HomeCardButton: View {
    let icon: String
    let title: String
    let color: Color
    let fontSize: EmoryTheme.FontSize

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 80, height: 80)
                Image(systemName: icon)
                    .font(.system(size: 32))
                    .foregroundStyle(color)
            }

            Text(title)
                .font(.system(size: fontSize.titleSize, weight: .semibold))
                .foregroundStyle(EmoryTheme.textPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(
            ZStack {
                EmoryTheme.cardBackground
                LinearGradient(
                    colors: [color.opacity(0.03), Color.clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(color.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: color.opacity(0.12), radius: 12, x: 0, y: 4)
    }
}
