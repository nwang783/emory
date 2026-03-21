# Emory

A dementia/memory loss assistant that uses real-time face recognition to help patients identify people around them. Built as a local-first Electron desktop app with SCRFD detection, ArcFace embeddings, and a SQLite-backed gallery with sessions, encounters, unknown tracking, analytics, and configurable retention.

**Documentation:** see [docs/README.md](./docs/README.md) for the full index, architecture pointers, and feature list.

## Monorepo

| Path | Role |
|------|------|
| `apps/desktop` | Electron main/preload/renderer (React 19, Tailwind v4, shadcn/ui) |
| `packages/core` | ONNX face pipeline, quality, liveness, appearance, graded identity |
| `packages/db` | StorageAdapter, SQLite, repositories, schema v4 (indexes) |

## Development

```bash
bun install
bun run dev
```

Run the desktop app from `apps/desktop` with `bun run dev` if you only need that workspace.

Uses **Bun** as the package manager and **Turborepo** for task orchestration (`turbo.json`).

## Testing

```bash
bun run test          # all packages
bun run test:core     # core recognition benchmarks
bun run test:db       # repository unit tests
```
