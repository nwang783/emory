import SwiftUI

// MARK: - Main Tab View
// Bottom tab bar with Home, Glasses, Help, and Settings tabs.

struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var hasOpenedGlassesTab = false
    @State private var settings = AppSettings.shared
    @State private var recognitionStore = DesktopRecognitionStore.shared
    @State private var captureDebugStore = ConversationCaptureDebugStore.shared
    @State private var showFullProfile = false
    @State private var profilePerson: Person?
    
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
            
            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Image(systemName: "gearshape.fill")
                Text("Settings")
            }
            .tag(3)
        }
        .tint(EmoryTheme.primary)
        .onChange(of: selectedTab) { _, newTab in
            if newTab == 1 {
                hasOpenedGlassesTab = true
            }
        }
        .task(id: "\(settings.isMockMode)-\(settings.backendURL)") {
            recognitionStore.refreshConnection()
        }
        .overlay(alignment: .top) {
            if let banner = captureDebugStore.banner {
                ConversationCaptureDebugBanner(state: banner)
                    .padding(.top, 12)
                    .padding(.horizontal, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if let presentation = recognitionStore.presentedRecognition {
                RecognitionPopupView(
                    presentation: presentation,
                    onViewProfile: {
                        profilePerson = presentation.resolvedPerson
                        recognitionStore.dismissPresentedRecognition()
                        showFullProfile = true
                    },
                    onDismiss: {
                        recognitionStore.dismissPresentedRecognition()
                    }
                )
            }
        }
        .fullScreenCover(isPresented: $showFullProfile) {
            if let person = profilePerson {
                NavigationStack {
                    PersonDetailView(person: person)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Done") {
                                    showFullProfile = false
                                }
                            }
                        }
                }
                .overlay {
                    if let presentation = recognitionStore.presentedRecognition {
                        RecognitionPopupView(
                            presentation: presentation,
                            onViewProfile: {
                                // Switch to the new person's profile
                                profilePerson = presentation.resolvedPerson
                                recognitionStore.dismissPresentedRecognition()
                            },
                            onDismiss: {
                                recognitionStore.dismissPresentedRecognition()
                            }
                        )
                    }
                }
            }
        }
    }
}

private struct ConversationCaptureDebugBanner: View {
    let state: ConversationCaptureDebugStore.BannerState

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.16))
                    .frame(width: 34, height: 34)
                Image(systemName: iconName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(accentColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(EmoryTheme.textPrimary)
                Text(state.detail)
                    .font(.system(size: 13))
                    .foregroundStyle(EmoryTheme.textSecondary)
                    .lineLimit(2)
            }

            Spacer()

            if state.kind == .recording || state.kind == .uploading {
                ProgressView()
                    .tint(accentColor)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(accentColor.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 16, y: 6)
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: state)
    }

    private var accentColor: Color {
        switch state.kind {
        case .recording:
            return EmoryTheme.destructive
        case .uploading:
            return EmoryTheme.primary
        case .uploaded:
            return EmoryTheme.secondary
        case .failed:
            return .orange
        }
    }

    private var iconName: String {
        switch state.kind {
        case .recording:
            return "mic.fill"
        case .uploading:
            return "arrow.up.circle.fill"
        case .uploaded:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
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
