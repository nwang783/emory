import AVFoundation

// MARK: - Audio Route Detector
// Monitors AVAudioSession for Bluetooth audio routes from Meta glasses.
// The Meta DAT SDK has NO audio API, so we detect audio availability
// by checking if the glasses appear as a Bluetooth audio input/output.

@MainActor
final class AudioRouteDetector {
    /// Async stream that emits `true` when a Meta glasses Bluetooth
    /// audio route is detected, `false` otherwise.
    func audioAvailabilityStream() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            // Check current route immediately
            let initialAvailable = Self.isMetaAudioRouteActive()
            continuation.yield(initialAvailable)

            // Observe route changes
            let observerToken = NotificationCenter.default.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: nil,
                queue: .main
            ) { _ in
                let available = Self.isMetaAudioRouteActive()
                continuation.yield(available)
            }

            continuation.onTermination = { _ in
                NotificationCenter.default.removeObserver(observerToken)
            }
        }
    }

    /// Check if any current audio route input/output is from Meta glasses.
    nonisolated static func isMetaAudioRouteActive() -> Bool {
        isMetaInputRouteActive() || isMetaOutputRouteActive()
    }

    nonisolated static func isMetaInputRouteActive() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.inputs.contains(where: isMetaBluetoothPort)
    }

    nonisolated static func isMetaOutputRouteActive() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains(where: isMetaBluetoothPort)
    }

    nonisolated static func metaBluetoothInputPort() -> AVAudioSessionPortDescription? {
        AVAudioSession.sharedInstance().availableInputs?.first(where: isMetaBluetoothPort)
    }

    nonisolated private static func isMetaBluetoothPort(_ port: AVAudioSessionPortDescription) -> Bool {
        let isBluetoothType = [
            AVAudioSession.Port.bluetoothA2DP,
            AVAudioSession.Port.bluetoothHFP,
            AVAudioSession.Port.bluetoothLE
        ].contains(port.portType)

        let name = port.portName.lowercased()
        let isMetaDevice = name.contains("ray-ban") || name.contains("meta")

        return isBluetoothType && isMetaDevice
    }
}
