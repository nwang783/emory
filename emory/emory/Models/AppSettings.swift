import Foundation
import Observation

/// Which microphone to capture audio from for the bridge stream.
enum AudioSource: String, CaseIterable, Identifiable {
    case iphone = "iPhone Mic"
    case rayBans = "Ray-Ban Glasses"

    var id: String { rawValue }
}

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

    var audioSource: AudioSource {
        didSet { defaults.set(audioSource.rawValue, forKey: Keys.audioSource) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let isMockMode = "app_settings.is_mock_mode"
        static let backendURL = "app_settings.backend_url"
        static let fontSize = "app_settings.font_size"
        static let audioSource = "app_settings.audio_source"
    }

    private init() {
        let defaults = UserDefaults.standard
        self.isMockMode = defaults.object(forKey: Keys.isMockMode) as? Bool ?? true
        self.backendURL = defaults.string(forKey: Keys.backendURL) ?? "http://127.0.0.1:18763"
        self.fontSize = EmoryTheme.FontSize(rawValue: defaults.string(forKey: Keys.fontSize) ?? "") ?? .medium
        self.audioSource = AudioSource(rawValue: defaults.string(forKey: Keys.audioSource) ?? "") ?? .iphone
    }
}
