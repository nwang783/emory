import SwiftUI

// MARK: - Home View
// Large, friendly welcome screen for dementia patients.
// Two oversized card buttons for People and Settings.

struct HomeView: View {
    @State private var settings = AppSettings.shared

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
                    .frame(width: 60, height: 4)
                    .padding(.top, 4)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)

            Spacer()

            // Card buttons
            VStack(spacing: 16) {
                NavigationLink(destination: PeopleView()) {
                    HomeCardButton(
                        icon: "person.2.fill",
                        title: "People",
                        color: EmoryTheme.primary,
                        fontSize: settings.fontSize
                    )
                }

                NavigationLink(destination: SettingsView()) {
                    HomeCardButton(
                        icon: "gearshape.fill",
                        title: "Settings",
                        color: EmoryTheme.secondary,
                        fontSize: settings.fontSize
                    )
                }
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(EmoryTheme.background.ignoresSafeArea())
    }
}

// MARK: - Home Card Button

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
        .emoryCard()
    }
}
