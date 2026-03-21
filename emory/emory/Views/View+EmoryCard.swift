import SwiftUI
import UIKit

private struct EmoryCardModifier: ViewModifier {
    var elevated: Bool = false

    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
            .shadow(
                color: Color.black.opacity(elevated ? 0.10 : 0.06),
                radius: elevated ? 20 : 14,
                x: 0,
                y: elevated ? 10 : 6
            )
    }
}

extension View {
    func emoryCard() -> some View {
        modifier(EmoryCardModifier())
    }

    func emoryCardElevated() -> some View {
        modifier(EmoryCardModifier(elevated: true))
    }
}

struct Haptics {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
