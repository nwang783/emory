import SwiftUI

// MARK: - Inactivity Reminder View
// A warm, friendly overlay that appears after inactivity.
// Gently reminds the user what the app does and offers
// to take them back to the person they were viewing.

struct InactivityReminderView: View {
    @State private var inactivityManager = InactivityManager.shared
    @State private var settings = AppSettings.shared
    @State private var isWaving = false

    var body: some View {
        if inactivityManager.showReminder {
            ZStack {
                // Dimmed background
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                    .onTapGesture {
                        inactivityManager.dismissReminder()
                    }

                // Reminder card
                VStack(spacing: 20) {
                    // Friendly icon
                    ZStack {
                        Circle()
                            .fill(EmoryTheme.primary.opacity(0.15))
                            .frame(width: 80, height: 80)
                        Image(systemName: "hand.wave.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(EmoryTheme.primary)
                            .rotationEffect(.degrees(isWaving ? 20 : -20), anchor: .bottomTrailing)
                            .animation(
                                .easeInOut(duration: 0.4).repeatForever(autoreverses: true),
                                value: isWaving
                            )
                    }
                    .onAppear { isWaving = true }
                    .onDisappear { isWaving = false }

                    // Message
                    VStack(spacing: 8) {
                        Text("Hi there!")
                            .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                            .foregroundStyle(EmoryTheme.textPrimary)

                        Text("This is Emory, your memory companion. It helps you recognize and remember the people you love.")
                            .font(.system(size: settings.fontSize.bodySize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    // Action buttons
                    VStack(spacing: 12) {
                        if let person = inactivityManager.lastViewedPerson {
                            NavigationLink(destination: PersonDetailView(person: person)) {
                                HStack(spacing: 8) {
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 16))
                                    Text("Back to \(person.name)")
                                        .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(EmoryTheme.primary)
                                .clipShape(Capsule())
                            }
                            .simultaneousGesture(TapGesture().onEnded {
                                inactivityManager.dismissReminder()
                            })
                        }

                        Button {
                            inactivityManager.dismissReminder()
                        } label: {
                            Text("I'm okay, thanks!")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                                .foregroundStyle(EmoryTheme.primary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(EmoryTheme.primary.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(28)
                .background(EmoryTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
                .padding(.horizontal, 32)
                .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
    }
}
