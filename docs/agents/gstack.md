# gstack agent skills (Emory)

The **`.agents/`** directory is **gitignored** — gstack and other agent skills live only on each machine.

## New clone / teammate setup

1. **Install gstack into the repo** (from repo root; **Git Bash** on Windows):

   ```bash
   mkdir -p .agents/skills
   git clone --depth 1 https://github.com/garrytan/gstack.git .agents/skills/gstack
   rm -rf .agents/skills/gstack/.git
   ```

2. **Install tooling:** [Bun](https://bun.sh) 1+, **Git**; on **Windows** also **Node.js** (Playwright/Chromium; Bun alone is not enough for browse on Windows per upstream).

3. **Build + register:**

   ```bash
   cd .agents/skills/gstack && ./setup --host codex
   ```

   This runs `bun install`, builds the browse binary, installs Playwright Chromium, regenerates **`.agents/skills/gstack/.agents/skills/`**, and links skills under **`~/.codex/skills`**.

4. **Cursor discovery (optional):** materialize top-level stubs so Cursor sees **`gstack-*`** / **`gstack-workflow`** next to the clone (no symlink required if you copy files):

   ```bash
   cd .agents/skills/gstack && bun run gen:skill-docs --host codex
   ```

   ```powershell
   $src = '.agents/skills/gstack/.agents/skills'
   $dst = '.agents/skills'
   Get-ChildItem $src -Directory | Where-Object { $_.Name -like 'gstack-*' } | ForEach-Object {
     $outDir = Join-Path $dst $_.Name
     New-Item -ItemType Directory -Force -Path $outDir | Out-Null
     Copy-Item -Force (Join-Path $_.FullName 'SKILL.md') (Join-Path $outDir 'SKILL.md')
   }
   Copy-Item -Force (Join-Path $src 'gstack/SKILL.md') (Join-Path $dst 'gstack-workflow/SKILL.md')
   ```

5. **Agent instructions:** see root [`CLAUDE.md`](../../CLAUDE.md) for the gstack section and skill list.

## Layout (golden rule)

| Area | Location |
|------|-----------|
| Entire tree | **`.agents/`** (gitignored — local only) |
| gstack clone | `.agents/skills/gstack/` |
| Generated Codex/Cursor `SKILL.md` trees | `.agents/skills/gstack/.agents/skills/` (created by setup / `gen:skill-docs`) |
| Workspace-visible skill stubs (optional) | `.agents/skills/gstack-*`, `.agents/skills/gstack-workflow` |
| Project docs | `docs/` (this file) |

## Privacy

gstack telemetry is **opt-in**. See upstream README “Privacy & Telemetry”.

## Note on `setup` sidecar path

Running `./setup` from `.agents/skills/gstack` may create a redundant **`.agents/.agents/`** tree (upstream resolves “repo root” one level short). Safe to delete locally; the whole **`.agents/`** directory is gitignored anyway. Canonical runtime paths for skills are **`~/.codex/skills/gstack`** and **`.agents/skills/gstack/`** (see generated `SKILL.md` preambles).
