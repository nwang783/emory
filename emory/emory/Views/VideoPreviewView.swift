import SwiftUI
import UIKit

// MARK: - Video Preview View
// Renders the latest camera frame from the glasses (or mock).
// Uses UIImageView via UIViewRepresentable for efficient frame updates.
// The video fills the preview box and gets clipped — not all content
// may be visible but that's fine for the dashboard view.

struct VideoPreviewView: View {
    let frame: UIImage?
    let resolution: String
    let fps: Double
    let lastFrameTime: Date?

    var body: some View {
        ZStack {
            // Frame display
            if frame != nil {
                EfficientImageView(image: frame)
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

            // FPS + resolution overlay (bottom-right)
            if frame != nil {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text("\(resolution) \u{2022} \(String(format: "%.0ffps", fps))")
                            .font(.system(size: 11, weight: .medium).monospaced())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(.black.opacity(0.6))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .padding(10)
                    }
                }
                .frame(height: 220)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.black.opacity(0.8), lineWidth: 3.5)
        )
        .contentShape(Rectangle())
    }
}

// MARK: - Efficient Image View
// UIViewRepresentable wrapping UIImageView with scaleAspectFill.
// The view constrains itself to the SwiftUI frame size and clips overflow.

struct EfficientImageView: UIViewRepresentable {
    let image: UIImage?

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.clipsToBounds = true

        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.tag = 100
        imageView.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: container.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        return container
    }

    func updateUIView(_ container: UIView, context: Context) {
        guard let imageView = container.viewWithTag(100) as? UIImageView else { return }
        imageView.image = image
    }
}
