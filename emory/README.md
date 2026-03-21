# Emory iOS (Ray-Ban Meta companion)

SwiftUI app under `emory/emory/`: glasses stream, microphone, Meta Wearables integration.

## Connect to the desktop hub (Tailscale)

Implementation spec for **discovering and talking to the Electron remote-ingest server** (HTTP health today; WSS/WebRTC later):

**→ [docs/architecture/ios-remote-ingest-client.md](../docs/architecture/ios-remote-ingest-client.md)**

That doc includes JSON schemas, default ports, multicast constants, suggested Swift module names, and ATS / Local Network notes.
