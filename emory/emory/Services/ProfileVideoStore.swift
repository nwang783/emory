import AVFoundation
import Foundation
import Observation
import UIKit

enum ProfileVideoStoreError: LocalizedError {
    case invalidMovie
    case noVideoSelected

    var errorDescription: String? {
        switch self {
        case .invalidMovie:
            return "Please choose a valid video file."
        case .noVideoSelected:
            return "No video was selected."
        }
    }
}

@MainActor
@Observable
final class ProfileVideoStore {
    static let shared = ProfileVideoStore()

    var recordsByPersonId: [String: ProfileVideoMetadata] = [:]

    private let fileManager = FileManager.default

    private init() {
        loadManifest()
    }

    func metadata(for personId: String) -> ProfileVideoMetadata? {
        recordsByPersonId[personId]
    }

    func videoURL(for personId: String) -> URL? {
        guard let metadata = recordsByPersonId[personId] else { return nil }
        let url = Self.profileVideosDirectory.appendingPathComponent(metadata.videoFileName, isDirectory: false)
        return fileManager.fileExists(atPath: url.path) ? url : nil
    }

    func thumbnailURL(for personId: String) -> URL? {
        guard let fileName = recordsByPersonId[personId]?.thumbnailFileName else { return nil }
        let url = Self.profileVideosDirectory.appendingPathComponent(fileName, isDirectory: false)
        return fileManager.fileExists(atPath: url.path) ? url : nil
    }

    func importVideo(personId: String, from sourceURL: URL) async throws -> ProfileVideoMetadata {
        let previous = recordsByPersonId[personId]

        let metadata = try await Task.detached(priority: .userInitiated) {
            try Self.importVideoRecord(personId: personId, from: sourceURL, previous: previous)
        }.value

        recordsByPersonId[personId] = metadata
        try saveManifest()
        return metadata
    }

    private func loadManifest() {
        do {
            guard fileManager.fileExists(atPath: Self.manifestURL.path) else {
                recordsByPersonId = [:]
                return
            }

            let data = try Data(contentsOf: Self.manifestURL)
            let decoded = try JSONDecoder().decode([ProfileVideoMetadata].self, from: data)

            var cleaned: [String: ProfileVideoMetadata] = [:]
            var didDropMissingFile = false

            for metadata in decoded {
                let videoURL = Self.profileVideosDirectory.appendingPathComponent(metadata.videoFileName, isDirectory: false)
                guard fileManager.fileExists(atPath: videoURL.path) else {
                    didDropMissingFile = true
                    continue
                }
                cleaned[metadata.personId] = metadata
            }

            recordsByPersonId = cleaned

            if didDropMissingFile {
                try saveManifest()
            }
        } catch {
            recordsByPersonId = [:]
        }
    }

    private func saveManifest() throws {
        try fileManager.createDirectory(at: Self.profileVideosDirectory, withIntermediateDirectories: true, attributes: nil)

        let ordered = recordsByPersonId.values.sorted { lhs, rhs in
            lhs.personId < rhs.personId
        }
        let data = try JSONEncoder().encode(ordered)
        try data.write(to: Self.manifestURL, options: [.atomic])
    }

    nonisolated private static var profileVideosDirectory: URL {
        let fileManager = FileManager.default
        let appSupport = try? fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let fallback = fileManager.temporaryDirectory
        let directory = (appSupport ?? fallback).appendingPathComponent("ProfileVideos", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
        return directory
    }

    nonisolated private static var manifestURL: URL {
        profileVideosDirectory.appendingPathComponent("manifest.json", isDirectory: false)
    }

    nonisolated private static func importVideoRecord(
        personId: String,
        from sourceURL: URL,
        previous: ProfileVideoMetadata?
    ) throws -> ProfileVideoMetadata {
        let fileManager = FileManager.default
        let safePersonId = sanitizedFileComponent(personId)
        let pathExtension = sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension.lowercased()
        let videoFileName = "\(safePersonId)-message.\(pathExtension)"
        let destinationURL = profileVideosDirectory.appendingPathComponent(videoFileName, isDirectory: false)

        try? fileManager.removeItem(at: destinationURL)

        if let previous, previous.videoFileName != videoFileName {
            let previousVideoURL = profileVideosDirectory.appendingPathComponent(previous.videoFileName, isDirectory: false)
            try? fileManager.removeItem(at: previousVideoURL)
        }

        if let previousThumbnail = previous?.thumbnailFileName {
            let previousThumbnailURL = profileVideosDirectory.appendingPathComponent(previousThumbnail, isDirectory: false)
            try? fileManager.removeItem(at: previousThumbnailURL)
        }

        try fileManager.copyItem(at: sourceURL, to: destinationURL)

        let asset = AVURLAsset(url: destinationURL)
        let hasVideoTrack = !asset.tracks(withMediaType: .video).isEmpty
        guard hasVideoTrack else {
            try? fileManager.removeItem(at: destinationURL)
            throw ProfileVideoStoreError.invalidMovie
        }

        let durationSeconds = max(asset.duration.seconds.isFinite ? asset.duration.seconds : 0, 0)
        let fileSizeBytes = Int64((try destinationURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)

        let thumbnailFileName = try createThumbnail(for: asset, personId: safePersonId)

        return ProfileVideoMetadata(
            personId: personId,
            videoFileName: videoFileName,
            thumbnailFileName: thumbnailFileName,
            durationSeconds: durationSeconds,
            fileSizeBytes: fileSizeBytes,
            updatedAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    nonisolated private static func createThumbnail(for asset: AVURLAsset, personId: String) throws -> String? {
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true

        let durationSeconds = max(asset.duration.seconds.isFinite ? asset.duration.seconds : 0, 0)
        let captureTime = CMTime(seconds: min(max(durationSeconds * 0.15, 0), max(durationSeconds, 0.1)), preferredTimescale: 600)

        do {
            let imageRef = try imageGenerator.copyCGImage(at: captureTime, actualTime: nil)
            let image = UIImage(cgImage: imageRef)
            guard let jpegData = image.jpegData(compressionQuality: 0.82) else {
                return nil
            }

            let thumbnailFileName = "\(personId)-message-thumbnail.jpg"
            let thumbnailURL = profileVideosDirectory.appendingPathComponent(thumbnailFileName, isDirectory: false)
            try jpegData.write(to: thumbnailURL, options: [.atomic])
            return thumbnailFileName
        } catch {
            return nil
        }
    }

    nonisolated private static func sanitizedFileComponent(_ rawValue: String) -> String {
        rawValue
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
    }
}
