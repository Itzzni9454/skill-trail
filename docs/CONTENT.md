# Content & data

The app is a viewer over two data sources: **roadmap snapshots** (the graphs)
and the **content repository** (the topic markdown behind each node).

**Both are downloaded to your machine by `npm run bootstrap`** — the repository
ships application code only (see *Licensing* below).

---

## First-run bootstrap

```bash
npm run bootstrap   # or: node scripts/bootstrap-content.mjs
```

`scripts/bootstrap-content.mjs` does two things, both once:

1. **Clones the content repo** (shallow) into `developer-roadmap/`.
2. **Discovers every live roadmap** from roadmap.sh (homepage + `/roadmaps`
   listing) and fetches each `<slug>.json` into `data/roadmaps/` — 97 snapshots
   at the time of writing.

Re-running is safe: present snapshots are skipped, the clone is only pulled.
`--force` re-downloads everything; `--only=frontend,backend` fetches specific
slugs without cloning (used by CI, which needs just the fixture roadmap).

## Roadmap snapshots — `data/roadmaps/*.json`

Each file is a full snapshot of one official roadmap in the roadmap.sh JSON
schema (`title`, `description`, `nodes[]`, `edges[]`, `updatedAt`). There are
currently **97 snapshots**, and they are the source of truth for rendering —
treat them as read-only inputs.

User progress is stored separately in `data/state.json`, so downloading new
snapshots never touches your learning history.

## Topic content — `developer-roadmap/`

`server/src/store.js` reads topic markdown from

```
developer-roadmap/roadmaps/<slug>/content/<topic>@<id>.md
```

This directory is a clone of the upstream roadmap.sh content repository
(`kamranahmedse/developer-roadmap`). It is **required at runtime** for the
"read the official guide" panel and full-text search. The server indexes it once
at startup (`warmContentCache()` — ~10 500 topic files).

> **Never commit this content.** The upstream repository has its own restrictive
> license (see `developer-roadmap/license` after the bootstrap clone) that
> permits personal use but not redistribution — which is exactly why `bootstrap`
> downloads it per-user instead of the repo shipping it. Both `data/roadmaps/`
> and `developer-roadmap/` are gitignored. The project's own
> [Apache-2.0 license](../LICENSE) covers the application code only.

Five snapshots currently have no offline content, so their nodes render but
"read the guide" finds nothing:

```
api-security-best-practices        backend-performance-best-practices
aws-best-practices                 code-review-best-practices
frontend-performance-best-practices
```

This is recorded automatically in `data/update-report.json` → `missingContent`.

---

## The weekly updater

`scripts/update-roadmaps.mjs` keeps the snapshots and content current.

```bash
npm run update               # check only → data/update-report.json
npm run update:download      # download new/updated roadmaps, then git-pull content
```

What it does:

1. Scrapes the roadmap.sh homepage for roadmap slugs, validating each by
   fetching `<slug>.json`.
2. Compares `updatedAt` (and node counts) against the local snapshot.
3. Reports new / changed / removed roadmaps to the console and to
   `data/update-report.json`.
4. With `--download`: writes changed snapshots into `data/roadmaps/` and runs
   `git pull --ff-only` in `developer-roadmap/` (when present).
5. Records any local roadmap whose content is missing upstream.

It is polite by design — sequential requests with ~40–60 ms delays.

### Scheduling on Windows

Task Scheduler, weekly:

| Field | Value |
|---|---|
| Program | `node` |
| Arguments | `<repo>\scripts\update-roadmaps.mjs --download` |
| Start in | `<repo>` |

---

## Adding or refreshing content by hand

1. Drop/update a snapshot at `data/roadmaps/<slug>.json`.
2. For topic content, ensure `developer-roadmap/roadmaps/<slug>/content/`
   contains the markdown files.
3. **Restart the server.** `roadmapCache` is process-lifetime; already-running
   servers keep serving the cached roadmap list until restarted.

---

## Attribution & licensing

- **Application code, UI and tooling:** Apache-2.0 — see [`LICENSE`](../LICENSE).
- **Roadmap JSON snapshots and topic content:** from
  [roadmap.sh](https://roadmap.sh) / the `kamranahmedse/developer-roadmap`
  project, used under their own terms (personal use). This project is for
  personal, offline learning and is not affiliated with roadmap.sh.
- **Balsamiq Sans:** bundled under the SIL Open Font License.
- **Geist / Geist Mono** (UI typefaces): self-hosted under the SIL Open Font
  License.
