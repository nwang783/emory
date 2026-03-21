# Emory — agent context

Monorepo: Electron + React desktop (`apps/desktop`), shared packages (`packages/core`, `packages/db`), Swift iOS app (`emory/`). Domain docs live under [`docs/README.md`](docs/README.md).

## gstack

**`.agents/`** is gitignored. Install [gstack](https://github.com/garrytan/gstack) locally under **`.agents/skills/gstack/`** and run `./setup --host codex` (see [`docs/agents/gstack.md`](docs/agents/gstack.md)). Optionally materialize **`gstack-*`** / **`gstack-workflow`** stubs under **`.agents/skills/`** for Cursor discovery.

- Use **gstack’s browser workflow** (`/browse`, `/qa`, etc.) when following gstack skills — after install, see **`.agents/skills/gstack/BROWSER.md`**, or [BROWSER.md upstream](https://github.com/garrytan/gstack/blob/main/BROWSER.md). On Windows, Playwright uses **Node** (not Bun) per upstream notes.
- If skills or the browse binary seem stale after pulling: from Git Bash run  
  `cd .agents/skills/gstack && ./setup --host codex`
- Full setup notes: [`docs/agents/gstack.md`](docs/agents/gstack.md)

**Available gstack skills (slash-style prompts):**  
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`

The `/codex` skill targets OpenAI Codex CLI; other agents can skip or substitute a second-opinion pass as appropriate.
