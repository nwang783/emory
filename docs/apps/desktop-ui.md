# Desktop UI shell (Vercel / Tailscale–inspired)

This document describes the **renderer chrome** for `@emory/desktop`: layout, typography, and design tokens. Business logic stays in stores and modules; this is presentation only.

## Where things live

| Concern | Location |
|--------|-----------|
| Global tokens, fonts, background treatments | [`apps/desktop/src/renderer/index.css`](../../apps/desktop/src/renderer/index.css) |
| App shell (header, sidebar, main surface, status bar) | [`App.tsx`](../../apps/desktop/src/renderer/App.tsx), [`Header.tsx`](../../apps/desktop/src/renderer/shared/components/Header.tsx), [`Sidebar.tsx`](../../apps/desktop/src/renderer/shared/components/Sidebar.tsx), [`StatusBar.tsx`](../../apps/desktop/src/renderer/shared/components/StatusBar.tsx) |
| shadcn primitives | [`apps/desktop/src/renderer/components/ui/`](../../apps/desktop/src/renderer/components/ui/) |
| Module page layout (header, toolbar, scroll vs full-bleed, in-page rails) | [`PageLayout.tsx`](../../apps/desktop/src/renderer/shared/components/PageLayout.tsx) — `PageShell`, `PageHeader`, `PageToolbar`, `PageScroll`, `PageFill`, `PageWorkspace`, `MiniSidebarNav`, `MiniSidebarPanel` |
| Module pages | Compose the primitives above in each module’s root view (e.g. `ActivityFeed`, `MemoryBrowser`, `ConnectionsGraph`) |

### Page layout primitives

- **`PageShell`** — Full-height column (`flex h-full min-h-0 flex-col`). Wrap every main module view.
- **`PageHeader`** — Title, optional description, optional `actions` (filters, counts). Bottom border only; use `variant="compact"` for dense sub-views.
- **`PageToolbar`** — Second row: search, filters, bulk actions, legends. Muted band + border — keeps chrome predictable.
- **`PageScroll`** — Default for scrollable content; set `maxWidth` (`3xl`–`7xl`) so long-form lists stay readable. Use `innerClassName` for vertical rhythm inside the padded region.
- **`PageFill`** — Use when the body must not scroll as a page (e.g. graph canvas): `flex-1 min-h-0 overflow-hidden` around the interactive surface.
- **`PageWorkspace`** — `flex flex-1 min-h-0` row: optional **mini sidebar** + main column (`min-w-0 flex-1`). Use for in-page navigation, filters, or legends without changing the primary app sidebar.
- **`MiniSidebarNav`** — ~168px rail: vertical buttons with optional Lucide icon, label, and monospace count badge. `position="end"` + `order-last` places the rail on the **right** (e.g. Connections legend).
- **`MiniSidebarPanel`** — Same width and chrome as the nav rail, for **static** content (copy, stats, legend items) instead of selectable sections.

Top-level **Settings** may use `PageHeader` with `titleClassName="font-heading text-lg"` for the wordmark-style title only there.

### Mini-sidebar usage by module

| Module | Rail | Role |
|--------|------|------|
| Settings | Left `MiniSidebarNav` | Category picker; reset defaults in rail footer |
| Activity | Left `MiniSidebarNav` | Event-type filter with counts |
| Analytics | Left `MiniSidebarNav` | Overview vs people grids vs unknowns |
| Embeddings | Left `MiniSidebarNav` | Jump to person group / scroll to top |
| Memories | Left `MiniSidebarNav` | Filter by memory type |
| People (full width) | Left `MiniSidebarPanel` | Directory count + short guidance |
| Connections | Right `MiniSidebarPanel` | Relationship colour legend + interaction hints |

## Typography

- **UI / body:** [Inter Variable](https://github.com/rsms/inter) via `@fontsource-variable/inter` (`--font-sans`).
- **Headings & nav labels:** [Plus Jakarta Sans Variable](https://fonts.google.com/specimen/Plus+Jakarta+Sans) via `@fontsource-variable/plus-jakarta-sans` — utility class **`font-heading`**.
- **Metrics / status / mono:** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) via `@fontsource/jetbrains-mono` — utility class **`font-mono-ui`**.

## Visual language (restraint)

- **No decorative gradients** on the main canvas — flat `background` reads as a serious desktop tool, not a marketing page.
- **Near-neutral dark** surfaces (`oklch` ~264°, low chroma); **primary** is a muted blue accent for actions and focus rings only.
- **Primary sidebar:** ~196px, grouped labels in **sentence case** (no wide tracking / all-caps section headers). Active item = `accent` fill only — no extra rings, shadows, or tinted icon states.
- **In-page mini sidebars:** ~168px, `bg-card/35`, border against main; section labels in **sentence case** (e.g. “Categories”, “Filter”).
- **Header:** Flat `card` bar; app mark is **border + muted fill**, not a gradient tile. Status uses **sentence case** (“Models: Ready”).
- **Page headers:** Bottom border only — avoid tinted header bands that add noise.
- **Cards:** Single `border-border` — no stacked ring + shadow (reduces “designed-by-AI” chrome).
- **Status bar:** Muted strip; semantic emphasis uses **foreground** tokens, not arbitrary greens/blues.
- **Typography:** **Plus Jakarta Sans** only for the app wordmark + top-level Settings title; everything else **Inter**. **JetBrains Mono** for numeric / technical lines only.

## shadcn

Project uses the **new-york** style and Tailwind v4 with variables; see [`components.json`](../../apps/desktop/components.json). Prefer existing `Button`, `Card`, `Badge`, etc., rather than ad-hoc styles in feature code.
