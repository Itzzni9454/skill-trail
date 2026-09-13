# Renderer fidelity

The whole point of this project is that the roadmap canvas is not a
reinterpretation of roadmap.sh — it is the **same geometry**. This document
explains the contract and how it is enforced.

Unlike a screenshot comparison, fidelity here is *byte-level*: node rectangles,
fills, text baselines and edge bezier paths are derived from the same rules the
official renderer uses, and every edge is checked against a captured fixture.

---

## What "exact" means

`app/src/lib/renderer.ts` encodes the rules reverse-engineered from the live
renderer:

- Node `rect` is inset by **half the stroke width**.
- Topic stroke width is **2.7px**.
- Text gets a **+2.15px** baseline offset.
- Text width is measured with a **per-character Balsamiq advance-width table**
  (1/100 em), not the browser's font metrics.
- Node size prefers `node.width` and falls back to `node.measured.width` — every
  node in the corpus ships measured dimensions.
- Fills are per node type: `topic` → `#fdff00` (or `#ffe599` when `colorType`
  is `c`), `subtopic` → `#ffe599`, edges → `#2b78e4`, and so on.
- The viewBox follows the official ~20px uniform padding rule.

The official `balsamiq.woff2` is bundled in `app/public/fonts/` and registered
under the same family name (`balsamiq`) the live site uses, so text metrics match
exactly.

---

## Verification

Two scripts, both reading `fixtures/official_rendered_frontend.json`:

| Script | Needs | What it does |
|---|---|---|
| `scripts/verify_edges.py` | Python only | Faithful port of the renderer geometry; re-derives every edge path and diffs it against the fixture. Exits non-zero on any mismatch. Runs in CI. |
| `scripts/verify_fidelity.py` | Playwright + a running server | Renders the live local SVG and compares it with the official fixture, node by node. |

```bash
# Browser-free — the CI guard
python scripts/verify_edges.py            # → edges: 69/69 exact

# Full visual check (needs Playwright)
npm start                                 # terminal 1
python scripts/verify_fidelity.py         # terminal 2
```

Related helper scripts:

- `scripts/extract_official_svg.py` — extracts the official SVG structure the
  rules were derived from.
- `scripts/verify_pixel_views.py`,
  `scripts/verify_visual_consistency.py` — visual spot checks.
- `scripts/probe_official_*.py` — one-off probes from the reverse-engineering
  phase, kept as provenance for the constants.

---

## Current results (September 2026, `/frontend`)

| Check | Result |
|---|---|
| Node rect x/y/w/h | **142 / 142 exact** (sub-0.01px) |
| Node fills | **142 / 142 exact** (two differ only as `white` vs `#ffffff`) |
| Edge bezier paths | **69 / 69 exact** — byte-identical `d` strings |
| Font | Bundled official `balsamiq.woff2`, same family name |
| ViewBox | Matches the official ~20px padding rule |

A full-page screenshot pair lives in `scripts/screenshots/`
(`compare-frontend-official.png` vs `compare-frontend-local.png`). The pixel
diff is ~90% at a strict tolerance; the remaining difference is sub-pixel text
antialiasing, invisible at normal zoom.

---

## Rules for changing the renderer

1. **Run `python scripts/verify_edges.py` before and after.** If it does not say
   `69/69 exact`, the change is wrong or the fixture needs a documented reason to
   change.
2. **Never move Balsamiq Sans off the canvas.** Chrome typography is Geist; the
   canvas keeps Balsamiq. See [DESIGN.md](./DESIGN.md).
3. **Keep the fixture.** `fixtures/official_rendered_frontend.json` is
   load-bearing — it is the reference the entire promise is measured against.
   Do not delete or "clean up" it.
4. **Say why.** If a constant looks arbitrary, cite the script that derived it.
