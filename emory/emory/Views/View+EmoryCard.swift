import SwiftUI

private struct EmoryCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 14, x: 0, y: 6)
    }
}

extension View {
    func emoryCard() -> some View {
        modifier(EmoryCardModifier())
    }
}
