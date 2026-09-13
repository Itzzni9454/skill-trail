# Codebase Audit — Skill Trail

**Date:** 2026-09-11 (updated after fixes)
**Scope:** full repo — `app/` (40 TS/TSX files, ~13.6k LOC), `server/` (5 files, ~2.3k LOC), `scripts/`, `data/`
**Method:** README claim-by-claim verification. Typechecked the frontend, booted the API,
probed every endpoint with curl, and re-derived the renderer's geometry numerically against
the archived official fixture. Findings marked **[reproduced]** were observed live.

---

## 1. What it does

A self-hosted, offline clone of roadmap.sh. Three layers:

| Layer | Location | Role |
|---|---|---|
| Frontend | `app/` — React 18 + Vite + TS, Tailwind 4 | SVG roadmap renderer, mindmap, dashboard, editor |
| API | `server/` — Express 4, **express is the only dependency** | JSON-file persistence, ~45 endpoints |
| Data | `data/roadmaps/*.json` (97), `data/state.json` | official snapshots vs. user state |

The distinguishing idea is **renderer fidelity**: rather than embed roadmap.sh, it
reimplements the official SVG geometry so output matches the live site. `renderer.ts`
encodes rules reverse-engineered from the live renderer — node rect inset by half the
stroke width, 2.7px topic stroke, a +2.15px text baseline offset, and a per-character
Balsamiq advance-width table for text measurement.

Persistence is deliberately simple: one `state.json`, atomic writes via tmp+rename,
read-modify-write. Because `mutateState()` is fully synchronous, it is genuinely
race-free under Node's single thread — a correct choice, not an accident.

---

## 2. Verification status

**The build is clean.** `tsc -b` exits 0 with zero errors across all 40 files.

**No fake code.** Zero hits for `TODO`, `FIXME`, `HACK`, `mock`, `fake`, `stub`, or
`throw new Error('not implemented')` in `app/src`. Every `Math.random()` call is
legitimate (uid generation, confetti, force-layout jitter, audio noise). No hardcoded
array masquerading as computed data.

**The fidelity claims hold.** Re-derived the renderer geometry independently in Python and
compared against `fixtures/official_rendered_frontend.json`:

| Check | Result |
|---|---|
| Node rect x/y/w/h | **142 / 142 exact** (sub-0.01px) |
| Node fills | **142 / 142 exact** (2 differ only as `white` vs `#ffffff`) |
| Edge bezier paths | **69 / 69 exact** — now enforced by `scripts/verify_edges.py` |

**The feature surface is genuine.** Spot-audited each advertised feature for real
implementation vs. theatre:

- `MindmapView.tsx` (1907 lines) implements 6 distinct layout algorithms with separate
  geometry code, plus working drag-reparenting with a cycle guard, F-key Zen focus, and
  blind mode.
- Export suite: OPML 2.0, FreeMind `.mm`, and the standalone offline HTML bundle are all
  real generators in `exports.ts`; PNG (2× canvas raster), SVG and Markdown are real but
  live inline in the view.
- `soundGenerator.ts` is real Web Audio DSP — Paul Kellet pink noise, LFO-modulated waves,
  true stereo binaural via `ChannelMerger`.
- `CodePlayground.tsx` really spins up a Blob Web Worker with a 3s `terminate()` timeout.
- `UniverseView.tsx` is a real Fruchterman–Reingold force layout with spatial-hash repulsion.
- `mermaidParser.ts` is a hand-written parser (mindmap indentation stack + flowchart edge
  regex + BFS depth layout), not a regex hack.
- Vault sync, Anki, iCal, badges are backed by real server modules (`vault.js` 549 lines,
  `anki.js`, `badge.js`).

**The comments are honest.** `renderer.ts` and `store.js` explain *why* odd constants
exist and cite the probe scripts used to derive them. Several comments document
official-renderer quirks rather than papering over them.

### A correction to the first version of this report

An earlier draft of this audit claimed a "systematic `label`-node edge bug" and reported
edge fidelity as 65/69. **That was wrong.** The claim came from a verification script that
read `node.width` only, ignoring `node.measured.width` — but every node in the corpus
carries `measured` dimensions (all 14,446 of them), and `nodeSize()` in `renderer.ts`
correctly reads `node.width ?? node.measured?.width`. The renderer was right and the audit
script was wrong. Verified result: **69/69 edges exact**, matching the README.

The README never claimed `lib/layout.ts` was the layout engine either; that was an
inference from the file listing, not a documented claim.

---

## 3. Fixed

### 3.1 Path traversal in `GET /api/roadmaps/:slug` — **fixed**

`store.js` joined an unsanitised slug straight onto a path, and Express decodes `%2F`
inside route params:

```
GET /api/roadmaps/..%2F..%2Fpackage       → 200, returned the project's package.json
GET /api/roadmaps/..%2F..%2Fdata%2Fstate  → 200, returned the user's private state.json
```

The second leaked the user's entire learning history — progress, personal notes, review
schedule, time tracking. With `app.listen(PORT)` binding all interfaces and no
authentication anywhere, this was LAN-reachable, not just localhost.

**Fix:** added `isSafeSlug()` / `isSafeNodeId()` guards in `store.js` (`SLUG_RE =
/^[a-z0-9][a-z0-9-]*$/`, `NODE_ID_RE = /^[A-Za-z0-9_-]+$/`). `loadRoadmap()` and
`findNodeContent()` reject unsafe input before touching the filesystem.

**Verified:** both traversal probes now return `404 {"error":"Roadmap not found"}`.

### 3.2 `POST /api/reviews/:slug/:nodeId/answer` returned 500 instead of 404 — **fixed**

`server.js:405` dereferenced null when no schedule existed, and the `404` guard below it
was unreachable. Any stale or double-submitted review crashed.

**Fix:** the entry is validated *before* mutating, so a rejected request never writes state
either. The defensive check inside the callback remains.

**Verified:** `404 {"error":"No review scheduled for this topic"}`; bad grade still `400`.

### 3.3 `/api/search/fulltext` took 10.1 seconds — **fixed**

`findNodeContent()` ran `readdirSync` on **every** lookup, so a full-text query performed
one directory scan per node across all 97 roadmaps, blocking the event loop throughout.

**Fix:** `store.js` now builds a `slug|nodeId → path` index once by walking the 93 content
directories, plus a lazily-read body cache. `warmContentCache()` is invoked on the tick
after `listen()` so the one-off walk happens at startup, not on the first query.

**Verified:**

| Query | Before | After |
|---|---|---|
| `?q=kubernetes` | 10.13 s | **0.21 s** (~49× faster) |
| `?q=zzzznomatch` (full scan) | ~10 s | **0.04 s** |

Startup log now reports `content cache warm (10565 topic files)`.

### 3.4 `/api/stats` had a latent handler hang and a dead field — **fixed**

```js
for (const [nodeId, rec] of Object.entries(progress)) {
  if (rec && typeof rec === 'object') return;   // exits the HANDLER, not the loop
}
```

Any object-shaped progress value would have left the request hanging with no response.
Separately, `stats.recent` was declared and always returned `[]`.

**Fix:** removed the bogus guard and populated `recent` from the activity log (same source
as `/api/activity`, last 20 entries, newest first).

**Verified:** `HTTP 200`, `recent: 20`.

### 3.5 `/api/badge/overall.svg` was unreachable — **fixed**

`app.get('/api/badge/:slug.svg')` was registered before `app.get('/api/badge/overall.svg')`,
so Express matched `overall` as a *roadmap slug*, failed the lookup, and returned 404. The
overall-progress badge — an advertised feature — could never render.

**Fix:** the `:slug.svg` handler now defers with `next()` when `slug === 'overall'`.

**Verified:** `overall.svg` → `200 image/svg+xml` (1163 bytes flat, 2166 bytes card);
`frontend.svg` still 200; unknown slug still 404.

### 3.6 Smaller fixes

- **Duplicated date helper.** `localDateKey()` in `server.js` was byte-identical to
  `reviewDateKey()` in `store.js`, which was imported but unused. Removed the duplicate;
  all six call sites now use the imported function.
- **O(n²) covered-count rebuild.** `/api/roadmaps` rebuilt the "labels done in other
  roadmaps" union inside the per-roadmap loop. Replaced with a precomputed label→count map,
  making it O(labels) per roadmap.
  *This refactor was initially wrong* — subtracting the roadmap's own label set drops
  labels done **both** locally and elsewhere, which the original algorithm kept. Caught by
  a synthetic-data comparison and corrected to a count-subtraction form, then proven
  equivalent: 97 roadmaps compared, 3 expected covered vs 3 actual, 0 mismatches.
- **`findNodeContent` redundant predicate** — `endsWith('.md') && endsWith('@id.md')`;
  the first clause was implied. Resolved by the index rewrite.

### 3.7 README accuracy — **fixed**

Four claims did not match the code. The features are real; the labels were not.

| Claimed | Actually | Now reads |
|---|---|---|
| "1-4 SM-2 grades" | A fixed interval ladder `[1,3,7,14,30,90]` days, no ease factor | "four grades … driving a Leitner-style interval ladder" |
| "Print-Ready **Vector PDF**" | `window.print()` — no PDF library | "Print-to-PDF (via the browser's print dialog)" |
| "isolated offline Web Worker" | Real Blob worker, but not a security sandbox | notes it isolates execution but is not a sandbox |
| "**LaTeX** math" in notes | `$…$` wrapped in `<em>` | "inline `$…$` emphasis" |

The fidelity claims (140/140 nodes, 69/69 edges) were **verified correct** and left as-is.

### 3.8 New regression guard

Added `scripts/verify_edges.py` — a browser-free, faithful port of the renderer geometry
that diffs every edge against the official fixture and exits non-zero on mismatch. Unlike
`verify_fidelity.py` it needs neither Playwright nor a running server, so it can run in CI.
This was the single biggest structural gap: the project's whole value is bit-exact
fidelity, and nothing enforced it.

**Verified:** `edges: 69/69 exact` → `exit 0`.

---

## 4. Still open

These were identified but not changed — they need a decision rather than a patch.

1. **No test suite.** `verify_edges.py` now covers the edge geometry, but there are still no
   tests for the API, the review scheduler, the export generators, or the mindmap layouts.
2. **The fixture is misfiled.** `fixtures/official_rendered_frontend.json` is load-bearing —
   both verification scripts depend on it — but it lives in a folder named `archive/`, where
   it is easy to delete. Move it to `fixtures/`.
3. **`ensureNodeSized()`'s inference branches are dead code.** All 14,446 nodes across the
   corpus ship `width`/`measured.width`, so the label/paragraph/todo fallbacks never run.
   That means they are also **untested** — a future roadmap shipping a node without
   dimensions would silently produce wrong geometry. Either cover them with tests or assert
   on the invariant.
4. **No authentication, and the server binds all interfaces.** `app.listen(PORT)` with no
   host argument. Fine for a single-user local tool, but combined with the (now fixed)
   traversal it was a real exposure. Consider binding `127.0.0.1` by default.
5. **`roadmapCache` is process-lifetime** and only invalidated on custom-roadmap mutations.
   If the updater writes new roadmap files while the server runs, the cached list is stale
   until restart. `roadmapCache.at` is stored but never read.
6. **5 of 97 roadmaps have no offline content** — `api-security-best-practices`,
   `aws-best-practices`, `backend-performance-best-practices`,
   `code-review-best-practices`, `frontend-performance-best-practices`. Their nodes render,
   but "read the official guide" finds nothing. Already recorded in
   `data/update-report.json` → `missingContent`.
7. **Housekeeping:** `data/content/` is empty; `scripts/` holds 11 one-off
   `probe_official_*` artefacts from the reverse-engineering phase; `temp_code.json`,
   `temp_proj.json`, `tree_tmp.json` sit in the repo root.
8. **`express.json({ limit: '10mb' })`** — forking a large roadmap or importing a big
   Mermaid diagram could exceed it, with only a generic 413.
9. **`window.prompt` / `alert()` used as UI** in `TimeTracker.tsx:199,202`,
   `EditorView.tsx:109`, `RoadmapView.tsx:58`.
10. **Silent empty `catch` blocks** swallow errors in `UniverseView.tsx:131,132,143,153`,
    `CareerGapModal.tsx:173`, `NotesEditor.tsx:19`, `SkillTreeView.tsx:97`.
11. **Drag-reparenting persists only for custom roadmaps.** On official roadmaps the change
    is in-memory and lost on reload — arguably correct, but the UI gives no indication.
12. **Career-gap analysis is a keyword heuristic** (`String.includes` against a hardcoded
    role→skills map). It computes a real number, but "readiness %" implies more rigour than
    substring matching provides.

---

## 5. Verdict

This is not a toy. The renderer reverse-engineering is real work, done carefully and
documented honestly, and it verifies under independent re-derivation — 142/142 rects,
142/142 fills, 69/69 edges. The feature list is overwhelmingly genuine: no stubs, no fake
data, no TODO markers, a clean typecheck, and a server whose only dependency is Express.

The bugs were the bugs of a project built by one person focused on the hard rendering
problem: the API surface was never threat-modelled, a search endpoint had an accidentally
quadratic filesystem cost, and two error paths returned the wrong status. All of those are
now fixed and verified. The README drifted ahead of the code in four places; it no longer
does.

The remaining work is structural rather than corrective — chiefly a real test suite, and
moving the fidelity fixture out of `archive/` before someone deletes the thing the whole
project is measured against.
