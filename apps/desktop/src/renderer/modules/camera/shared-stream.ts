// Module-level shared ref so other components (e.g. RegisterFaceModal)
// can reuse the active webcam stream without requesting a second one.
// Windows webcams typically only allow a single active stream.
export const sharedStream: { current: MediaStream | null } = { current: null }
