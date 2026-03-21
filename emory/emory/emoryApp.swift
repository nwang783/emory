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

    init() {
        do {
            try Wearables.configure()
        } catch {
            print("[App] Failed to configure Wearables SDK: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .onOpenURL { url in
                    Task {
                        try? await Wearables.shared.handleUrl(url)
                    }
                }
        }
    }
}
