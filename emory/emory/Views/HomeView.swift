import SwiftUI

// MARK: - Home View
// Large, friendly welcome screen for dementia patients.
// Two oversized card buttons for People and Settings.

struct HomeView: View {
    @State private var settings = AppSettings.shared

    // Entry animation states
    @State private var showHeader = false
    @State private var showWelcome = false
    @State private var showAccentLine = false
    @State private var showPeopleCard = false
    @State private var showSettingsCard = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Emory")
                    .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                    .foregroundStyle(EmoryTheme.primary)

                Spacer()

                // Connection badge
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.gray)
                        .frame(width: 8, height: 8)
                    Text("Disconnected")
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

            // Welcome text
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

                // Accent line
                RoundedRectangle(cornerRadius: 2)
                    .fill(EmoryTheme.primary)
                    .frame(width: showAccentLine ? 60 : 0, height: 4)
                    .padding(.top, 4)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            .opacity(showWelcome ? 1 : 0)
            .scaleEffect(showWelcome ? 1 : 0.9)

            Spacer()

            // Card buttons
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
                .opacity(showPeopleCard ? 1 : 0)
                .offset(y: showPeopleCard ? 0 : 40)

                NavigationLink(destination: SettingsView()) {
                    HomeCardButton(
                        icon: "gearshape.fill",
                        title: "Settings",
                        color: EmoryTheme.secondary,
                        fontSize: settings.fontSize
                    )
                }
                .buttonStyle(BounceButtonStyle())
                .opacity(showSettingsCard ? 1 : 0)
                .offset(y: showSettingsCard ? 0 : 40)
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(EmoryTheme.background.ignoresSafeArea())
        .onAppear {
            // Staggered entry animation
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
                showSettingsCard = true
            }
        }
    }
}

// MARK: - Home Card Button

// MARK: - Bounce Button Style

struct BounceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.93 : 1.0)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Home Card Button (People)

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
        .background(EmoryTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .shadow(color: EmoryTheme.cardShadow, radius: 8, x: 0, y: 2)
    }
}

