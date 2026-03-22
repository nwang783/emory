# `better-sqlite3`: NODE_MODULE_VERSION / `ERR_DLOPEN_FAILED`

## What it means

`better-sqlite3` ships a **native** `.node` binary. It must be compiled for the **exact** runtime that loads it:

| Symptom | Typical cause |
|--------|----------------|
| `NODE_MODULE_VERSION 130` vs `115` (example) | The addon was built for a **newer** Node (or Bun’s toolchain) than the **Node** binary you use to start the app. |
| After `apps/desktop` install | Root **`postinstall`** runs **`electron-rebuild`** from the **repo root** (`scripts/rebuild-electron-native.cjs`) so the hoisted `better-sqlite3` matches **Electron**. If that script is skipped or you run rebuild from the wrong cwd, the binary can target the wrong ABI. |

`@emory/db` depends on `better-sqlite3`; **bridge-server** and **desktop** both use `@emory/db` from the same hoisted `node_modules`.

## Fix (pick one)

### A. Rebuild for the Node you use to run bridge-server

From the **repo root** (where `node_modules/better-sqlite3` lives):

```bash
cd D:\emory
node -v          # note this version — rebuild must match how you start bridge-server
npm rebuild better-sqlite3
```

Then start bridge-server again with **that same** `node` (or `bun run dev` — see below).

### B. Align Node version with the binary

If you prefer not to rebuild, run bridge-server with a **Node version whose ABI matches** the built module (error message shows “compiled against” vs “requires”).

### C. Prefer Bun for bridge-server only

From `apps/bridge-server`, use:

```bash
bun run dev
```

Bun may use its own path for native modules. If you still see the same error, use **A** with the Node you actually use, or run `bun install` from the repo root so native deps match Bun’s engine.

## If desktop (Electron) breaks after rebuild

Electron uses a **different** ABI than system Node. After `npm rebuild better-sqlite3` for Node, the **desktop** app may need its addon rebuilt again:

```bash
cd D:\emory
bun run rebuild:electron-native
# or: node scripts/rebuild-electron-native.cjs
# (must use repo root cwd — not apps/desktop alone — so hoisted node_modules rebuilds correctly)
```

Order of operations:

1. Rebuild for **Node** when working on **bridge-server**.
2. Rebuild for **Electron** when working on **desktop**, or after step 1 if desktop sqlite fails.

## Quick reference: NODE_MODULE_VERSION (examples)

These drift over time; always trust `node -p "process.versions.modules"` on **your** machine.

- **115** — Node.js 20.x (common LTS)
- **130** — newer Node line (e.g. 22+); mismatch with Node 20 causes the error you saw

## Related scripts

- Root: `npm run rebuild:better-sqlite3` (if present in `package.json`) — same as `npm rebuild better-sqlite3` from root.
