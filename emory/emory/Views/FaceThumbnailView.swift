import SwiftUI
import UIKit

struct FaceThumbnailView: View {
    let faceThumbnail: String?
    let fallbackSystemImage: String
    let size: CGFloat

    var body: some View {
        if let image = decodedImage {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
        } else {
            ZStack {
                Circle()
                    .fill(EmoryTheme.primary.opacity(0.1))
                    .frame(width: size, height: size)
                Image(systemName: fallbackSystemImage)
                    .font(.system(size: size * 0.46))
                    .foregroundStyle(EmoryTheme.primary.opacity(0.6))
            }
        }
    }

    private var decodedImage: UIImage? {
        guard let faceThumbnail, let data = Data(base64Encoded: faceThumbnail) else { return nil }
        return UIImage(data: data)
    }
}
