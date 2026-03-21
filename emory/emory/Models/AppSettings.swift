import Foundation
import Observation

@MainActor
@Observable
final class AppSettings {
    static let shared = AppSettings()

    var isMockMode: Bool {
        didSet { defaults.set(isMockMode, forKey: Keys.isMockMode) }
    }

    var backendURL: String {
        didSet { defaults.set(backendURL, forKey: Keys.backendURL) }
    }

    var fontSize: EmoryTheme.FontSize {
        didSet { defaults.set(fontSize.rawValue, forKey: Keys.fontSize) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let isMockMode = "app_settings.is_mock_mode"
        static let backendURL = "app_settings.backend_url"
        static let fontSize = "app_settings.font_size"
    }

    private init() {
        let defaults = UserDefaults.standard
        self.isMockMode = defaults.object(forKey: Keys.isMockMode) as? Bool ?? true
        self.backendURL = defaults.string(forKey: Keys.backendURL) ?? "http://127.0.0.1:18763"
        self.fontSize = EmoryTheme.FontSize(rawValue: defaults.string(forKey: Keys.fontSize) ?? "") ?? .medium
    }
}
