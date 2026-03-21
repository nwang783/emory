//
//  emoryApp.swift
//  emory
//
//  Created by Ryan Daniel LeKuch on 3/21/26.
//

import SwiftUI
import MWDATCore

@main
struct emoryApp: App {

    // SDK configured lazily — only when glasses tab is used
    static var isSDKConfigured = false

    static func configureSDKIfNeeded() {
        guard !isSDKConfigured else { return }
        do {
            try Wearables.configure()
            isSDKConfigured = true
            print("[App] Wearables SDK configured")
        } catch {
            print("[App] Failed to configure Wearables SDK: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .overlay {
                    TouchInterceptView {
                        InactivityManager.shared.userDidInteract()
                    }
                    .allowsHitTesting(true)
                }
                .overlay {
                    InactivityReminderView()
                }
                .onOpenURL { url in
                    Task {
                        emoryApp.configureSDKIfNeeded()
                        try? await Wearables.shared.handleUrl(url)
                    }
                }
        }
    }
}
