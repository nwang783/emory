import SwiftUI

enum EmoryTheme {
    static let primary = Color(red: 0.19, green: 0.42, blue: 0.69)
    static let secondary = Color(red: 0.22, green: 0.60, blue: 0.44)
    static let destructive = Color(red: 0.75, green: 0.27, blue: 0.25)
    static let background = Color(red: 0.97, green: 0.96, blue: 0.93)
    static let cardBackground = Color.white
    static let cardShadow = Color.black.opacity(0.08)
    static let textPrimary = Color(red: 0.18, green: 0.18, blue: 0.20)
    static let textSecondary = Color(red: 0.42, green: 0.42, blue: 0.46)

    enum FontSize: String, CaseIterable {
        case small = "Small"
        case medium = "Medium"
        case large = "Large"

        var headlineSize: CGFloat {
            switch self {
            case .small: return 28
            case .medium: return 34
            case .large: return 40
            }
        }

        var titleSize: CGFloat {
            switch self {
            case .small: return 20
            case .medium: return 24
            case .large: return 28
            }
        }

        var bodySize: CGFloat {
            switch self {
            case .small: return 16
            case .medium: return 18
            case .large: return 22
            }
        }

        var captionSize: CGFloat {
            switch self {
            case .small: return 12
            case .medium: return 14
            case .large: return 16
            }
        }
    }
}
