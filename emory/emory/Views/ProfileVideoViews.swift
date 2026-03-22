import AVKit
import SwiftUI
import UIKit

struct ProfileVideoThumbnailView: View {
    let thumbnailURL: URL?
    var cornerRadius: CGFloat = 18

    var body: some View {
        if let image = thumbnailImage {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(EmoryTheme.primary.opacity(0.08))
                VStack(spacing: 10) {
                    Image(systemName: "video.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(EmoryTheme.primary.opacity(0.75))
                    Text("Message Video")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                }
            }
        }
    }

    private var thumbnailImage: UIImage? {
        guard let thumbnailURL else { return nil }
        return UIImage(contentsOfFile: thumbnailURL.path)
    }
}

struct ProfileVideoPlayerSheet: View {
    let title: String
    let url: URL

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer
    @State private var sessionSnapshot: MediaPlaybackAudioSession.Snapshot?

    init(title: String, url: URL) {
        self.title = title
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                VideoPlayer(player: player)
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 24))

                Text("A prerecorded message for \(title).")
                    .font(.system(size: 15))
                    .foregroundStyle(EmoryTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()
            }
            .padding(20)
            .background(EmoryTheme.background.ignoresSafeArea())
            .navigationTitle("Message Video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            sessionSnapshot = try? MediaPlaybackAudioSession.begin(mode: .moviePlayback)
            player.volume = 1.0
            player.play()
        }
        .onDisappear {
            player.pause()
            player.seek(to: .zero)
            MediaPlaybackAudioSession.restore(sessionSnapshot)
            sessionSnapshot = nil
        }
    }
}
