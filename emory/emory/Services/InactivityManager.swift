import SwiftUI
import UIKit
import Observation

// MARK: - Inactivity Manager
// Monitors user touch activity and triggers a gentle reminder
// after a period of inactivity. Designed for dementia patients
// who may forget they're holding the phone.

@MainActor
@Observable
final class InactivityManager {

    static let shared = InactivityManager()

    // MARK: - State

    var showReminder = false
    var lastViewedPerson: Person?

    // MARK: - Configuration

    let timeoutSeconds: TimeInterval = 120 // 2 minutes

    // MARK: - Private

    private var inactivityTimer: Timer?

    private init() {
        resetTimer()
    }

    // MARK: - Touch Received

    func userDidInteract() {
        if showReminder {
            withAnimation(.easeOut(duration: 0.3)) {
                showReminder = false
            }
        }
        resetTimer()
    }

    // MARK: - Track Last Viewed Person

    func setLastViewedPerson(_ person: Person?) {
        lastViewedPerson = person
    }

    // MARK: - Timer

    private func resetTimer() {
        inactivityTimer?.invalidate()
        inactivityTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.triggerReminder()
            }
        }
    }

    private func triggerReminder() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.warning)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            let tap = UIImpactFeedbackGenerator(style: .medium)
            tap.impactOccurred()
        }

        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            showReminder = true
        }
    }

    func dismissReminder() {
        withAnimation(.easeOut(duration: 0.3)) {
            showReminder = false
        }
        resetTimer()
    }
}

// MARK: - Touch Intercept View
// A transparent UIView that detects touches and passes them through
// to the views underneath. No UIWindow hacking needed.

struct TouchInterceptView: UIViewRepresentable {
    let onTouch: () -> Void

    func makeUIView(context: Context) -> PassthroughTouchView {
        let view = PassthroughTouchView()
        view.onTouch = onTouch
        return view
    }

    func updateUIView(_ uiView: PassthroughTouchView, context: Context) {
        uiView.onTouch = onTouch
    }
}

class PassthroughTouchView: UIView {
    var onTouch: (() -> Void)?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // Notify on touch, then return nil so the touch passes through
        if event?.type == .touches {
            onTouch?()
        }
        return nil
    }
}
