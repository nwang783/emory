import SwiftUI

// MARK: - Main Tab View
// Bottom tab bar with Home, Glasses, and Help tabs.

struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var hasOpenedGlassesTab = false

    var body: some View {
        TabView(selection: $selectedTab) {
            // Home tab
            NavigationStack {
                HomeView()
            }
            .tabItem {
                Image(systemName: "house.fill")
                Text("Home")
            }
            .tag(0)

            // Glasses tab — only create StreamDashboardView once user visits this tab
            NavigationStack {
                if hasOpenedGlassesTab {
                    StreamDashboardView()
                } else {
                    Color.clear
                }
            }
            .tabItem {
                Image(systemName: "eye.fill")
                Text("Glasses")
            }
            .tag(1)

            // Help tab
            NavigationStack {
                HelpView()
            }
            .tabItem {
                Image(systemName: "questionmark.circle.fill")
                Text("Help")
            }
            .tag(2)
        }
        .tint(EmoryTheme.primary)
        .onChange(of: selectedTab) { _, newTab in
            if newTab == 1 {
                hasOpenedGlassesTab = true
            }
        }
    }
}

// MARK: - Help View

struct HelpView: View {
    @State private var settings = AppSettings.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Icon
                ZStack {
                    Circle()
                        .fill(EmoryTheme.primary.opacity(0.15))
                        .frame(width: 80, height: 80)
                    Image(systemName: "questionmark.circle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(EmoryTheme.primary)
                }
                .padding(.top, 20)

                Text("How can we help?")
                    .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                    .foregroundStyle(EmoryTheme.textPrimary)

                VStack(spacing: 12) {
                    helpCard(
                        icon: "eye.fill",
                        title: "Using Your Glasses",
                        description: "Tap 'Glasses' at the bottom, then tap 'Start Stream' to begin."
                    )

                    helpCard(
                        icon: "person.2.fill",
                        title: "Adding People",
                        description: "Go to Home, tap 'People', then tap the + button to add someone new."
                    )

                    helpCard(
                        icon: "mic.fill",
                        title: "Testing Audio",
                        description: "Go to Glasses, tap 'Start Mic', then hold 'Hold to Record' to test."
                    )

                    helpCard(
                        icon: "phone.fill",
                        title: "Need More Help?",
                        description: "Ask your caregiver or family member for assistance."
                    )
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("Help")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func helpCard(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(EmoryTheme.primary.opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(EmoryTheme.primary)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Text(description)
                    .font(.system(size: settings.fontSize.captionSize))
                    .foregroundStyle(EmoryTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(16)
        .emoryCard()
    }
}
