import SwiftUI

// MARK: - Settings View
// App configuration with large, accessible controls.

struct SettingsView: View {
    @State private var settings = AppSettings.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                // APPLICATION section
                settingsSection("APPLICATION") {
                    // Mock Mode
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Mock Mode")
                                .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                                .foregroundStyle(EmoryTheme.textPrimary)
                            Text("Simulator vs Real Data")
                                .font(.system(size: settings.fontSize.captionSize))
                                .foregroundStyle(EmoryTheme.textSecondary)
                        }
                        Spacer()
                        Toggle("", isOn: $settings.isMockMode)
                            .tint(EmoryTheme.primary)
                    }

                    Divider()

                    // Backend URL
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Backend URL")
                            .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                            .foregroundStyle(EmoryTheme.textPrimary)
                        TextField("https://api.example.com/", text: $settings.backendURL)
                            .font(.system(size: settings.fontSize.captionSize))
                            .padding(12)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }

                // DISPLAY section
                settingsSection("DISPLAY") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Font Size")
                            .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                            .foregroundStyle(EmoryTheme.textPrimary)

                        HStack(spacing: 8) {
                            ForEach(EmoryTheme.FontSize.allCases, id: \.self) { size in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        settings.fontSize = size
                                    }
                                } label: {
                                    Text(size.rawValue)
                                        .font(.system(size: 14, weight: settings.fontSize == size ? .semibold : .regular))
                                        .foregroundStyle(settings.fontSize == size ? EmoryTheme.primary : EmoryTheme.textPrimary)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(
                                            settings.fontSize == size
                                                ? EmoryTheme.primary.opacity(0.1)
                                                : Color.clear
                                        )
                                        .clipShape(Capsule())
                                        .overlay(
                                            Capsule()
                                                .stroke(
                                                    settings.fontSize == size
                                                        ? EmoryTheme.primary.opacity(0.3)
                                                        : Color.clear,
                                                    lineWidth: 1
                                                )
                                        )
                                }
                            }
                        }
                    }
                }

                // SYSTEM section
                settingsSection("SYSTEM") {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("About Emory")
                                .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                                .foregroundStyle(EmoryTheme.textPrimary)
                            Text("Legal, Privacy & Versions")
                                .font(.system(size: settings.fontSize.captionSize))
                                .foregroundStyle(EmoryTheme.textSecondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(EmoryTheme.textSecondary)
                    }

                    Divider()

                    HStack {
                        Text("Version")
                            .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                            .foregroundStyle(EmoryTheme.textPrimary)
                        Spacer()
                        Text("2.4.0 (Stable)")
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color(.systemGray6))
                            .clipShape(Capsule())
                    }
                }

                // Emory branding
                VStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(EmoryTheme.primary)
                            .frame(width: 64, height: 64)
                        Image(systemName: "eye.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(.white)
                    }

                    Text("Emory")
                        .font(.system(size: settings.fontSize.bodySize, weight: .bold))
                        .foregroundStyle(EmoryTheme.primary)

                    Text("Empowering independent living.")
                        .font(.system(size: settings.fontSize.captionSize))
                        .foregroundStyle(EmoryTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .emoryCard()
                .padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func settingsSection(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(EmoryTheme.textSecondary)
                .tracking(1)

            VStack(alignment: .leading, spacing: 16) {
                content()
            }
            .padding(16)
            .emoryCard()
        }
    }
}
