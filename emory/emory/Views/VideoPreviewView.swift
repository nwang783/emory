import SwiftUI

// MARK: - Video Preview View
// Renders the latest camera frame from the glasses (or mock).
// Shows resolution and FPS as a compact badge overlay.

struct VideoPreviewView: View {
    let frame: UIImage?
    let resolution: String
    let fps: Double
    let lastFrameTime: Date?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // Frame display
            if let frame = frame {
                Image(uiImage: frame)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            } else {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemGray6))
                    .frame(height: 220)
                    .overlay(
                        VStack(spacing: 8) {
                            Image(systemName: "video.slash")
                                .font(.system(size: 36))
                                .foregroundStyle(Color(.systemGray3))
                            Text("No Video Feed")
                                .font(.system(size: 13))
                                .foregroundStyle(Color(.systemGray3))
                        }
                    )
            }

            // Resolution + FPS badge
            if frame != nil {
                Text("\(resolution) \u{2022} \(String(format: "%.0ffps", fps))")
                    .font(.system(size: 11, weight: .medium).monospaced())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.black.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(10)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(.systemGray2), lineWidth: 2.5)
        )
        .contentShape(Rectangle())
    }
}
