# Development

## Prerequisites

- **Node.js ≥ 18** (developed on Node 22). The server and app each install
  their own dependencies.
- **Python 3** for the fidelity and design-verification scripts. Only used for
  tooling — the app itself does not run Python.
- **Git** for the weekly content sync (`developer-roadmap/`).

## First run

```bash
npm run setup        # installs server/ and app/ dependencies
npm run app:build    # tsc -b && vite build → app/dist
npm start            # Express on http://localhost:4177
```

Open **http://localhost:4177**.

### Hot-reload development

Two processes; Vite proxies `/api` to the API server.

```bash
npm run server       # terminal 1 — API on :4177
npm run app:dev      # terminal 2 — Vite on :5180
```

### Windows launchers

- `run-all.bat` — a numbered menu (setup, build, start, dev, update, open, stop).
- `Roadmap.bat` — starts the app in the background via `scripts/open-app.vbs`.

---

## npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run setup` | `cd server && npm install && cd ../app && npm install` | Install both dependency sets. |
| `npm run server` | `cd server && npm start` | API only. |
| `npm run app:dev` | `cd app && npm run dev` | Vite dev server with HMR. |
| `npm run app:build` | `cd app && npm run build` | Typecheck (`tsc -b`) + production build. |
| `npm start` | `cd server && npm start` | Serve API + built SPA on :4177. |
| `npm run update` | `node scripts/update-roadmaps.mjs` | Check roadmap.sh for updates (report only). |
| `npm run update:download` | `node scripts/update-roadmaps.mjs --download` | Check **and** download, then sync the content repo. |
| `npm test` | `node scripts/run-tests.mjs` | Run the test suite (see below). |
| `npm run test:api` | `node scripts/test-api.mjs` | Exercise the live API. |
| `npm run test:fidelity` | `python scripts/verify_edges.py` | Browser-free edge-geometry guard. |
| `npm run test:all` | `npm test && npm run test:api && npm run test:fidelity` | Everything. |

---

## Testing

There is **no test framework**. `tests/harness.ts` is a tiny `describe`/`it`
harness; `scripts/run-tests.mjs` bundles `tests/suite.test.ts` with esbuild
(already present via Vite) and runs it in Node. `DATA_DIR` is pointed at a
scratch temp directory so the suite can never touch real state.

```bash
npm test
```

> **Baseline (September 2026): 63 passed, 0 failed.**
> The four connectors (Habitica, Microsoft To Do, Notion, Obsidian) are all
> registered, and the LeetCode quest builder bug is fixed. The suite runs as a
> blocking job in CI.

### Fidelity guard

`scripts/verify_edges.py` re-derives every edge path from the renderer rules and
diffs it against `fixtures/official_rendered_frontend.json`. It needs neither a
browser nor a running server, so it runs in CI:

```bash
python scripts/verify_edges.py      # → "edges: 69/69 exact", exit 0
```

See [FIDELITY.md](./FIDELITY.md) for the full verification story.

---

## Environment variables

A zero-dependency loader reads `<repo>/.env` at server startup (`server/src/env.js`).
Real environment variables always take precedence. `.env` is gitignored — copy
[`.env.example`](../.env.example) to start.

| Variable | Used by | Notes |
|---|---|---|
| `PORT` | server | API/static port (default `4177`). |
| `DATA_DIR` | `store.js` | Override the data directory (used by tests). |
| `LEETCODE_USERNAME` | `leetcode.js` | Public stats work without login. |
| `LEETCODE_SESSION` | `leetcode.js` | Optional cookie; improves reliability. |
| `LEETCODE_CSRF` | `leetcode.js` | Optional `csrftoken` cookie. |
| `HABITICA_USER_ID` | `habitica.js` | Habitica credentials. |
| `HABITICA_API_KEY` | `habitica.js` | Habitica credentials. |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | `gcalendar.js` | Path to a service-account JSON key. |
| `GOOGLE_CALENDAR_ID` | `gcalendar.js` | Target calendar id. |

Connector secrets can also be stored through the UI in `data/connectors.json`,
kept separate from learning data.

---

## Code conventions

- **No unnecessary dependencies.** The server's only runtime dependency is
  `express`; the app ships React, React Router and `lucide-react`. Adding a
  package needs a real justification.
- **Semantic CSS tokens, not palette classes.** Chrome styles use tokens such as
  `bg-surface` / `text-ink-muted`, never `bg-slate-800`. See [DESIGN.md](./DESIGN.md).
- **Keep Balsamiq Sans on the canvas.** It is the fidelity contract and must not
  leak into the app chrome.
- **Document *why*, not *what*.** Odd constants in `renderer.ts` and `store.js`
  cite the probe that derived them — keep that habit.
- **Hooks above early returns.** A `useEffect` placed after an
  `if (!data) return <Loading/>` runs fewer hooks on the loading render and
  crashes with React error #310.
- **Cross-platform paths.** Use `node:path` joins; the project is developed on
  Windows and must run on macOS/Linux.

### A build trap worth knowing

`vite build --outDir <dir> --emptyOutDir` (and a second build into the same
scratch directory) can trip bulk-delete guards because Vite clears
`<outDir>/fonts`. If you need an out-of-tree build, build into a **fresh**
directory each time and copy the result into `app/dist`, preserving `dist/fonts`
and `dist/manifest.json`.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md). Before opening a PR:

```bash
cd app && npx tsc -b            # typecheck
python scripts/verify_edges.py  # fidelity contract
npm test                        # suite (known failures above)
```
