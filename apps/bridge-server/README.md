# Emory Bridge Server

Receives video frames + audio from the iOS app over WebSocket, runs face recognition, and sends results back.

**Shared logic:** face queue + DB matching live in [`@emory/bridge-live`](../../packages/bridge-live/) and are also used by the **Electron** app on **`/ingest?role=publisher`**. See [bridge-live-and-desktop.md](../../docs/architecture/bridge-live-and-desktop.md).

## Code index

| File | Purpose |
|------|---------|
| `src/index.ts` | HTTP server (`/`, `/health`), WebSocket, browser viewer fan-out, DB + `FaceService` init |
| `src/ws-handler.ts` | Binary/text routing, `FrameProcessor` + `AudioProcessor` |
| `src/protocol.ts` | `MSG_*` constants, JSON message types (aligned with `@emory/ingest-protocol` framing) |
| `src/audio-processor.ts` | Audio chunks → transcript pipeline hooks |
| `src/frame-processor.ts` | **Removed** — import `FrameProcessor` from `@emory/bridge-live` |

## Setup

```bash
cd apps/bridge-server
bun install
```

## Run

```bash
bun run dev
```

It prints the WebSocket URL — enter it in the iOS app under Settings → Backend URL.

### `better-sqlite3` / `NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED`

If you start the server with **Node** (or a different Node than the one that built native deps), you may see a mismatch: the `.node` binary was built for another ABI. From the **monorepo root**:

```bash
cd ../..
npm run rebuild:better-sqlite3
```

Then run bridge-server with the **same** Node, or keep using `bun run dev`. If **Electron desktop** later fails to load SQLite, from the **repo root** run `bun run rebuild:electron-native` (or `bun install`, which runs the root postinstall). Full notes: [better-sqlite3-node-version.md](../../docs/troubleshooting/better-sqlite3-node-version.md).

## Environment

Copy `.env.example` to `.env` and fill in API keys (optional — face recognition works without them, audio/memory features need them):

```bash
cp ../../.env.example .env
```

## Using Tailscale

If you're on eduroam or a network that blocks local connections, use Tailscale:

1. Install Tailscale on both the laptop and iPhone
2. Run `tailscale ip -4` on the laptop to get your Tailscale IP (e.g. `100.x.y.z`)
3. Start the bridge server: `bun run dev`
4. In the iOS app Settings, enter: `ws://100.x.y.z:18763`

That's it — Tailscale creates a direct tunnel that bypasses eduroam restrictions.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `ws://host:18763` | WebSocket — iOS connects here |
| `http://host:18763/health` | Health check — verify server is running |

## Port

Default port is `18763`. Override with:

```bash
PORT=9000 bun run dev
```
