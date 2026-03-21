# Emory documentation

| Doc | Scope |
|-----|--------|
| [apps/desktop.md](./apps/desktop.md) | Electron app: 7-tab layout, IPC, preload, stores, UI components |
| [packages/core.md](./packages/core.md) | Face engine, quality, liveness, appearance, grading services |
| [packages/db.md](./packages/db.md) | SQLite adapter, repositories, schema through v6 (indexes, conversations), retention |
| [architecture/cloud-sync.md](./architecture/cloud-sync.md) | Cloud sync protocol design and migration path |
| [architecture/conversation-recording.md](./architecture/conversation-recording.md) | Face-linked mic capture, debounce rules, IPC + storage layout |
| [architecture/remote-ingest-tailscale.md](./architecture/remote-ingest-tailscale.md) | Remote ingest hub: Tailscale, HTTP `/health`, settings persistence, IPC |
| [architecture/remote-discovery.md](./architecture/remote-discovery.md) | UDP multicast beacon for phone discovery (manual config remains first-class) |
| [architecture/ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md) | **iOS implementer guide:** Tailscale, `/health`, UDP beacon, manual config, planned WSS/WebRTC |
| [agents/gstack.md](./agents/gstack.md) | **gstack** skills: local **`.agents/`** (gitignored), clone + `./setup`, Windows/Git Bash, optional Cursor stubs |

Start with **desktop** for end-to-end behaviour, then **core** / **db** for types and persistence.

## Quick Reference

### Project structure

```
emory/
├── apps/
│   └── desktop/          # Electron + React desktop simulator
├── packages/
│   ├── core/             # Face recognition, quality, liveness services
│   └── db/               # SQLite adapter, repositories, types
├── docs/                 # Documentation
└── turbo.json            # Turborepo config
```

### Key services

- **FaceService** — ONNX-based face detection (SCRFD) + recognition (ArcFace), match threshold 0.45
- **QualityService** — Frame quality assessment (blur, brightness, angle)
- **LivenessService** — Anti-spoofing (texture, motion, depth)
- **AppearanceService** — Embedding clustering and appearance change detection
- **CleanupService** — Automated data retention management (desktop main process)

### Key features (Phase 0A complete)

- Real-time face detection + identification via webcam
- Margin-gated identity locking with vote-based consensus and confusion detection
- Hardened active learning with quality gates, identity verification, and margin checks
- Person profiles with key facts, relationships, conversation starters
- Encounter logging and session management
- Unknown person tracking with confident unknown path
- Analytics dashboard
- Embedding gallery — visual face thumbnails, grouped by person, delete/reassign
- Connections graph — interactive force-directed relationship web
- On-demand voice response ("Who is that?")
- Liveness detection (anti-spoofing)
- Similar face warnings on registration
- Person merge/dedup
- Configurable data retention
- Settings UI with real-time threshold tuning

### UI tabs (sidebar order)

1. Camera — live webcam feed with face detection overlays
2. People — registered person list and management
3. Connections — interactive D3 force-directed relationship graph
4. Activity — real-time event log (recognition, registration, auto-learn)
5. Analytics — encounter stats, frequent visitors, unknowns
6. Embeddings — face thumbnail gallery with bulk delete/reassign
7. Settings — thresholds, display, retention configuration

See [CHANGELOG.md](./CHANGELOG.md) for documentation-only edits.
