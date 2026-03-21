# Emory Bridge Server

Receives video frames + audio from the iOS app over WebSocket, runs face recognition, and sends results back.

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
4. In the iOS app Settings, enter: `ws://100.x.y.z:8385`

That's it — Tailscale creates a direct tunnel that bypasses eduroam restrictions.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `ws://host:8385` | WebSocket — iOS connects here |
| `http://host:8385/health` | Health check — verify server is running |

## Port

Default port is `8385`. Override with:

```bash
PORT=9000 bun run dev
```
