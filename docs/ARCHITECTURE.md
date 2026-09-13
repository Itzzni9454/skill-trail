# Architecture

Skill Trail is a self-hosted clone of [roadmap.sh](https://roadmap.sh): a
single user, on their own machine, browses ~97 roadmaps, marks topics as
*learning / done / skipped*, and tracks study progress. There are no accounts,
no telemetry, and no runtime network calls required for core features.

The distinguishing design goal is **renderer fidelity**: instead of embedding
roadmap.sh, the app reimplements the official SVG renderer so the canvas matches
the live site. See [FIDELITY.md](./FIDELITY.md).

---

## Three layers

| Layer | Location | Stack | Role |
|---|---|---|---|
| Frontend | `app/` | React 18 · Vite 5 · TypeScript 5 · Tailwind 4 | SVG roadmap renderer, mindmap, dashboard, editor, dailys. |
| API | `server/` | Express 4 (`express` is the only dependency) | JSON-file persistence and ~85 endpoints. |
| Data | `data/`, `developer-roadmap/` | JSON + Markdown files | Official roadmap snapshots, user state, topic content. |

The frontend is a pure client: every piece of persisted state goes through the
API. There is no server-side rendering and no database.

```
┌────────────────────────────┐        ┌───────────────────────────────┐
│  Browser (React SPA)       │  HTTP  │  Express API (server/src)      │
│  HashRouter · TanStack-free│ ─────► │  /api/*                        │
│  app/src/**                │        │                                │
└────────────────────────────┘        └───────────┬───────────────────┘
                                                   │ fs read/write (atomic)
                                      ┌────────────▼────────────────────┐
                                      │ data/state.json   (user state)   │
                                      │ data/roadmaps/*.json (official)  │
                                      │ data/dailys.json  (dailys)       │
                                      │ data/connectors.json (secrets)   │
                                      │ developer-roadmap/roadmaps/**    │
                                      │   (topic markdown, read-only)    │
                                      └──────────────────────────────────┘
```

---

## Runtime topology

**Development** — two processes, Vite proxies `/api` to the server:

```bash
npm run server     # terminal 1 — Express on :4177
npm run app:dev    # terminal 2 — Vite on :5180 (proxies /api → :4177)
```

**Production (single process)** — build the SPA, then let Express serve it:

```bash
npm run app:build  # tsc -b && vite build → app/dist
npm start          # Express on :4177 serves API + app/dist
```

When `app/dist` exists, `server/src/server.js` mounts it as static files and adds
an SPA fallback route (`/^(?!api\/).*` → `dist/index.html`) so client-side routes
such as `/dashboard` survive a refresh.

---

## Directory map

```
app/                        React frontend (Vite + TS)
  src/views/                Route-level screens
    Home · RoadmapView · Dashboard · EditorView · Dailys · HabiticaView
  src/components/           UI pieces (RoadmapSVG, MindmapView, NavBar, modals…)
  src/lib/                  Non-UI logic (renderer, exports, parsers, api client)
  public/                   Fonts, manifest.json (served as-is)
  dist/                     Build output (gitignored)
server/                     Express API
  src/server.js             Route handlers — the public HTTP surface
  src/store.js              Data access + progress/review/quest persistence
  src/*.js                  Feature modules (see table below)
data/
  roadmaps/*.json           97 official roadmap snapshots (rendering source of truth)
  state.json                YOUR progress, notes, custom roadmaps, settings
  dailys.json               Daily task definitions/completions
  connectors.json           Third-party credentials (gitignored)
  update-report.json        Result of the last update check
  cache/, content/          Runtime caches
developer-roadmap/          Upstream content repo — topic markdown per node
fixtures/                   official_rendered_frontend.json (fidelity reference)
scripts/                    Bootstrap, updater, verification tools
tests/                      Minimal harness + suite (see DEVELOPMENT.md)
docs/                       This documentation
```

---

## Server modules

`server/src/server.js` owns routing; the feature logic lives in sibling modules.

| Module | Responsibility |
|---|---|
| `server.js` | All Express routes, static serving, background sync workers, startup. |
| `store.js` | Atomic JSON persistence, input guards (`isSafeSlug`/`isSafeNodeId`), progress, review schedule, quest/plan/Euler/Neetcode progress, content index. |
| `env.js` | Zero-dependency `.env` loader (real env vars win). |
| `connectors.js` | Third-party connector registry (Obsidian, Habitica, …) with a queue that never blocks learning. |
| `habitica.js` | Habitica API v3 client and two-way sync. |
| `gcalendar.js` | Google Calendar free-slot scheduling (service-account JWT, no deps). |
| `vault.js` | Obsidian / Markdown vault sync (filesystem). |
| `dailys.js` | Daily task definitions, completions, attempts, history. |
| `leetcode.js` | Cache-first LeetCode data layer (public reads degrade gracefully). |
| `studyplans.js` | LeetCode study-plan metadata + per-plan progress. |
| `neetcode.js` | NeetCode problem set + progress. |
| `euler.js` | Project Euler problems, cache, and on-demand content. |
| `badge.js` | Dynamic SVG badges for GitHub profile READMEs. |
| `anki.js` | Anki-compatible TSV deck export. |

### Frontend structure

| Area | Files | Notes |
|---|---|---|
| Routes | `app/src/views/*` | Registered in `app/src/main.tsx` with `HashRouter`. |
| Canvas | `RoadmapSVG.tsx`, `lib/renderer.ts` | The fidelity-critical rendering path. |
| Derived views | `MindmapView.tsx`, `UniverseView.tsx`, `lib/layout.ts` | Six mindmap layouts; force-directed universe graph. |
| API client | `lib/api.ts` | Thin `fetch` wrapper plus theme normalization and display fixes. |
| Theming | `lib/theme.tsx`, `app/src/index.css` | Semantic token layer bridged into Tailwind `@theme`. See DESIGN.md. |

---

## Data model

### Roadmap JSON (`data/roadmaps/<slug>.json`)

Mirrors the official roadmap.sh schema (`app/src/lib/types.ts`): a `title`
(`page`/`card`), `description`, `nodes[]` (each with an `id`, `type`,
`position`, and measured size) and `edges[]`. Node types include `topic`,
`subtopic`, `label`, `todo`, `checklist`, `button`, `resourceButton`,
`section`, and layout helpers.

### User state (`data/state.json`)

One JSON document holding everything the user creates. Notable keys:

| Key | Shape | Meaning |
|---|---|---|
| `nodeProgress` | `{ [slug]: { [nodeId]: 'learning' \| 'done' \| 'skipped' } }` | Per-topic status. |
| `roadmapStatus` | `{ [slug]: status }` | Optional whole-roadmap status. |
| `nodeNotes` | `{ [slug]: { [nodeId]: markdown } }` | Personal notes (≤10 KB per note). |
| `reviewSchedule` | `{ "slug|nodeId": { stage, dueAt, doneAt, lastReviewedAt? } }` | Spaced-repetition ladder. |
| `customRoadmaps` | `array` | Forked/created roadmaps (same schema as official). |
| `activity` | `array` | Recent action log (capped at 500). |
| `activityByDay` | `{ "YYYY-MM-DD": count }` | Streak/heatmap aggregates. |
| `timeTracked` | `{ [slug]: { [nodeId]: seconds } }` | Per-topic time. |
| `settings` | `{ theme, dailyGoal, countCoveredAsDone }` | Preferences. |

`state.json` is **private to your machine** and gitignored. Updates to
`data/roadmaps/` never touch it.

### Persistence

`store.js` writes atomically: serialise to `<file>.tmp`, then `rename` over the
target. `mutateState(fn)` does a synchronous read → mutate → write, which is
race-free under Node's single thread and is the intended concurrency model.

### Caching

- **Roadmap JSON** is cached for the process lifetime (`roadmapCache`). Every
  custom-roadmap mutation calls `invalidateRoadmapCache()`. If the updater
  writes new files while the server runs, restart to pick them up.
- **Topic content** (`developer-roadmap/roadmaps/<slug>/content/*.md`) is indexed
  once by `warmContentCache()` on the tick after `listen()`, turning full-text
  search from a per-node directory scan into a map lookup.

---

## Background jobs

On `listen()`, the server schedules:

- **Project Euler sync** — refreshes the cache if it is older than 24 h.
- **Habitica poll** — every 3 minutes, pulls completions made elsewhere.
- **Google Calendar poll** — every 15 minutes, reserves free slots for dailies.

All three are wrapped in `try/catch` and are skipped when the relevant
integration is not configured, so a missing credential is never fatal.

---

## Security posture

This is a single-user local tool, not a hosted service. Still:

- Slugs and node ids coming off the URL are validated (`isSafeSlug`,
  `isSafeNodeId`) before being joined onto filesystem paths — Express decodes
  `%2F` in route params, so an unvalidated slug would allow path traversal.
- Connector credentials live in `data/connectors.json`, separate from learning
  data, and are gitignored.
- There is **no authentication**, and `app.listen(PORT)` binds all interfaces.
  Only run it on a trusted network. Binding `127.0.0.1` is a reasonable
  hardening change for shared machines.
