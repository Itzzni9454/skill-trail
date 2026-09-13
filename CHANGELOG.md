# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

Detailed, dated write-ups live in the docs:

- [docs/AUDIT.md](docs/AUDIT.md) — codebase audit: what was verified and fixed.
- [docs/REDESIGN.md](docs/REDESIGN.md) — the three-round UI redesign log.

## [Unreleased]

## [1.0.0] — 2026-09-13 — first public release

### Added

- **Content bootstrap** (`npm run bootstrap`) — first-run script that clones the
  official content repo and downloads all roadmap snapshots to the user's
  machine, so the repository itself ships application code only and stays fully
  compliant with the upstream content license. `--force` and `--only=<slugs>`
  modes; safe to re-run; CI uses `--only=frontend` for the fidelity guard.
- **Obsidian connector** — writes one markdown note per completed topic
  (frontmatter + heading) straight into a vault folder; fully offline.
- **Notion connector** — one database row per completed topic.
- **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)** — ten-minute walkthrough
  for new users, with troubleshooting.

### Fixed

- Test suite is green: **63 passed, 0 failed** (previously 55/8 — the connectors
  registry and LeetCode quest-builder failures are fixed). CI now runs the
  suite as a blocking job.
- Hard-coded personal fallbacks removed from the Google Calendar integration;
  the feature now cleanly reports "not configured" until the user sets it up.

### Changed

- Project renamed **Offline Roadmaps → Skill Trail** across the app, launchers
  and docs; Apache-2.0 copyright assigned to *The Skill Trail Contributors*.
- Roadmap content (`data/roadmaps/`, `developer-roadmap/`) is now gitignored
  and downloaded per-user; `.gitattributes` language stats updated to match.

## [1.0.0-rc] — 2026-09

### Added

- `docs/` — architecture, API, development, fidelity, content and design
  references, plus the relocated audit and redesign logs.
- Apache-2.0 `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub metadata: CI workflow, issue/PR templates, Dependabot config,
  `.gitattributes`.
- Expanded `.gitignore` covering personal state, temp files, build artifacts and
  local-only scratch directories.

## [1.0.0] — 2026-09

### Fixed

- Path traversal in `GET /api/roadmaps/:slug` (slug/node-id validation).
- `POST /api/reviews/:slug/:nodeId/answer` returning `500` instead of `404` when
  no review was scheduled.
- `/api/search/fulltext` performing a directory scan per node (~10 s → ~0.2 s).
- Latent handler hang and a dead field in `/api/stats`.
- Unreachable `/api/badge/overall.svg`.
- Four README claims that had drifted ahead of the code.

### Added

- `scripts/verify_edges.py` — browser-free edge-geometry regression guard, now
  enforced in CI.

### Changed

- UI rebuilt on a semantic token layer across four themes (`light`, `paper`,
  `dark`, `midnight`); Geist/Geist Mono for chrome, Balsamiq Sans kept
  canvas-only.
- Accessibility pass: accessible names on all controls, a single focus ring,
  shape-matched skeletons, and dialog semantics on overlays.

See [docs/REDESIGN.md](docs/REDESIGN.md) for verification results, and
[docs/AUDIT.md](docs/AUDIT.md) for the issues that remain open.
