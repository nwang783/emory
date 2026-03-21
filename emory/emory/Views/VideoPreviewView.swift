import SwiftUI

// MARK: - Video Preview View
// Renders the latest camera frame from the glasses (or mock).
// Shows resolution, timestamp, and FPS overlay.

struct VideoPreviewView: View {
    let frame: UIImage?
    let resolution: String
    let fps: Double
    let lastFrameTime: Date?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Frame display
            if let frame = frame {
                Image(uiImage: frame)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.black)
                    .overlay(
                        VStack(spacing: 8) {
                            Image(systemName: "video.slash")
                                .font(.system(size: 40))
                                .foregroundStyle(.gray)
                            Text("No Video Feed")
                                .font(.caption)
                                .foregroundStyle(.gray)
                        }
                    )
            }

            // Stats overlay
            if frame != nil {
                VStack(alignment: .leading, spacing: 2) {
                    Text(resolution)
                    Text(String(format: "%.1f FPS", fps))
                    if let time = lastFrameTime {
                        Text(DateFormatter.debugFormatter.string(from: time))
                    }
                }
                .font(.caption2.monospaced())
                .foregroundStyle(.white)
                .padding(8)
                .background(.black.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(8)
            }
        }
        .frame(maxHeight: 300)
        .contentShape(Rectangle())
    }
}
