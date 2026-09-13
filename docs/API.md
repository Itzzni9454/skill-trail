# HTTP API

The local Express server (`server/src/server.js`) exposes a JSON API under
`/api`. It binds `http://localhost:4177` by default (`PORT` overrides it). All
request and response bodies are JSON unless noted; errors use
`{ "error": "message" }` with a `4xx`/`5xx` status.

This is a single-user local API — there is no authentication layer.

---

## Roadmaps

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/roadmaps` | Summary list of every roadmap (official + custom): title, description, `nodeCount`, `doneCount`, `coveredCount`, `updatedAt`, `isCustom`. Sorted by title. |
| `GET` | `/api/roadmaps/:slug` | Full roadmap JSON. `custom:<slug>` serves a custom roadmap. `404` if missing. |
| `GET` | `/api/roadmaps/:slug/node/:nodeId/content` | Official topic markdown for a node; `{ content: null }` for custom roadmaps or missing content. |
| `GET` | `/api/cross-progress` | `{ doneLabelsBySlug }` — done topic labels per roadmap, used for "covered elsewhere" display. |

## Progress

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/progress` | `{ nodeProgress, roadmapStatus }` for the whole state. |
| `POST` | `/api/progress/node` | Set a node status. Body `{ slug, nodeId, status }` where status is `learning` \| `done` \| `skipped` \| `null` (clears). Marks done → schedules a review; un-done → cancels it. Returns `{ ok, goalReached, todayCount, dailyGoal, streakMilestone }`. |
| `POST` | `/api/progress/roadmap` | Set/clear a whole-roadmap status. Body `{ slug, status }`. |
| `POST` | `/api/progress/reset` | Reset all node progress and roadmap status (activity log is kept). |
| `GET` | `/api/stats` | Dashboard aggregate: totals, per-roadmap breakdown, time tracked, and the 20 most recent activity events. |
| `GET` | `/api/activity` | Recent activity events, newest first. `?limit=` (default 50, max 200). |
| `GET` | `/api/streaks` | Current/longest streak, active days, today's count, daily goal, next milestone, and the per-day heatmap map. |

## Spaced repetition (reviews)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reviews` | Due and upcoming reviews with labels. `?scope=all` folds upcoming items into `due` for early practice. Returns `{ due, nextUpcoming, upcomingCount, intervals }`. |
| `POST` | `/api/reviews/:slug/:nodeId/answer` | Answer a review. Body `{ grade }` ∈ `good` \| `again` \| `dismiss` \| `hard` \| `easy`. `404` when nothing is scheduled for the topic; `400` on a bad grade. |
| `POST` | `/api/reviews/snooze-all` | Snooze every due review. Body `{ days }` (1–30, default 1). |
| `GET` | `/api/calendar.ics` | RFC 5545 iCalendar feed of scheduled reviews (`text/calendar`). |

The ladder intervals are `[1, 3, 7, 14, 30, 90]` days (`REVIEW_INTERVAL_DAYS`).
Grades advance/retreat the stage; the topic's progress status is never changed by
answering a review.

## Notes & time tracking

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notes/:slug` | `{ notes: { [nodeId]: markdown } }` for a roadmap. |
| `POST` | `/api/notes/:slug` | Upsert/clear a note. Body `{ nodeId, note }`; `note` is a string (≤10 000 chars) or `null`/empty to delete. |
| `GET` | `/api/time` | `{ timeTracked }` — all per-topic seconds. |
| `POST` | `/api/time/:slug/:nodeId` | Add (default) or set tracked time. Body `{ seconds, mode }`; `mode: 'set'` replaces. |

## Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/search` | Title search across all roadmaps. `?q=` (min 2 chars). Up to 200 results, ranked exact → prefix → substring. |
| `GET` | `/api/search/fulltext` | Full-text search over titles, **user notes**, and official topic markdown. `?q=`, `?limit=` (default 50, max 100). Each result carries `matchType` (`title`/`note`/`content`) and an `excerpt`. |

## Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | `{ dailyGoal, countCoveredAsDone, theme }`. |
| `POST` | `/api/settings/theme` | Body `{ theme }` ∈ `light` \| `paper` \| `dark` \| `midnight`. |
| `POST` | `/api/settings/daily-goal` | Body `{ goal }` integer 1–1000. |
| `POST` | `/api/settings/count-covered` | Body `{ enabled }` boolean — whether topics done in another roadmap count as done here. |

## Custom roadmaps

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/custom-roadmaps/fork` | Fork an official roadmap into an editable copy. Body `{ slug }`. Progress carries over. |
| `POST` | `/api/custom-roadmaps` | Create an empty custom roadmap. Body `{ title, description?, slug? }`. |
| `PUT` | `/api/custom-roadmaps/:slug` | Update `nodes`, `edges`, `title`, and/or `description`. |
| `DELETE` | `/api/custom-roadmaps/:slug` | Delete a custom roadmap. |

## Backup & restore

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/backup` | Download everything user-created as one JSON file (`nodeProgress`, notes, custom roadmaps, reviews, settings, time, …). |
| `POST` | `/api/backup/restore` | Restore a backup. Body is the backup object plus `mode`: `merge` (default) or `replace`. |

## Exports & badges

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/badge/:slug.svg` | SVG badge for one roadmap. `?style=flat\|card`, `?theme=dark\|light`. |
| `GET` | `/api/badge/overall.svg` | SVG badge for overall progress. Same query options. |
| `GET` | `/api/anki/:slug/export` | Anki-importable TSV deck (`text/tab-separated-values`). |

Client-side exports (PNG, SVG, Markdown, OPML, FreeMind, standalone HTML) are
generated in the browser — see `app/src/lib/exports.ts` — and have no endpoints.

## Connectors

Third-party integrations (Obsidian, Habitica, …). All are failure-tolerant: a
failed push is queued, never fatal.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/connectors` | List connectors and their configuration state. |
| `PUT` | `/api/connectors/:id/config` | Save connector config (empty password keeps the stored value). |
| `POST` | `/api/connectors/:id/test` | Test the connection. `502` on failure. |
| `POST` | `/api/connectors/:id/flush` | Retry queued items. |
| `POST` | `/api/connectors/flush-all` | Retry every queue. |
| `POST` | `/api/connectors/:id/sync` | Push every completed topic to one connector now. |
| `DELETE` | `/api/connectors/:id/queue` | Drop a connector's queued items. |

## Dailys

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dailys/board` | Today's board: each enabled daily with its resolved problem and completion state. |
| `GET` | `/api/dailys/stats` | Streaks, completion rate by difficulty, trend. |
| `GET` | `/api/dailys/history` | Paginated attempt history. `?limit=` (≤500), `?offset=`, `?taskId=`, `?outcome=`. |
| `POST` | `/api/dailys/:taskId/attempt` | Record an attempt. Body `{ outcome, seconds?, problem? }`. |
| `POST` | `/api/dailys/:taskId/clear` | Clear today's completion for a task. |
| `POST` | `/api/dailys/:taskId/reroll` | Fetch a different problem for a daily without recording anything. |
| `GET` / `POST` | `/api/dailys/definitions` | List / create daily definitions. |
| `PUT` / `DELETE` | `/api/dailys/definitions/:id` | Update / remove a daily definition. |
| `GET` | `/api/dailys/cache` | LeetCode cache diagnostics (size and staleness). |

## LeetCode

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/leetcode/profile` | Live profile stats. `?username=` previews a handle without saving. Returns `{ configured: false }` when unset. |
| `GET` / `PUT` | `/api/leetcode/username` | Read / save the tracked LeetCode username. |
| `GET` | `/api/leetcode/quests` | Quest progress. |
| `POST` | `/api/leetcode/quests/progress` | Update quest progress. Body `{ slug, unitId, action?, levels?, maxLevels? }`. |
| `GET` | `/api/leetcode/quests/suggest` | Suggest the next quest. |
| `GET` / `POST` | `/api/leetcode/ratings` | Read / record a problem rating. |

## Study plans, NeetCode & Project Euler

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/studyplans` | All study plans with progress summaries. |
| `GET` | `/api/studyplans/:slug` | A single plan with groups/problems and progress. |
| `POST` | `/api/studyplans/:slug/problems/:problemSlug` | Mark/unmark a problem done. Body `{ done }`. |
| `GET` | `/api/studyplans/progress` | Lightweight completion counts for every plan. |
| `GET` | `/api/neetcode/problems` | NeetCode problems grouped by pattern with completion state. |
| `POST` | `/api/neetcode/problems/:code` | Mark/unmark a problem done. Body `{ done }`. |
| `GET` | `/api/neetcode/random` | Random problem. `?difficulty=`, `?pattern=`. |
| `GET` | `/api/euler/problems` | Project Euler problems with completion and difficulty stats. |
| `POST` | `/api/euler/problems/:id` | Mark/unmark a problem done. Body `{ done }`. |
| `GET` | `/api/euler/cache` | Cache status. |
| `POST` | `/api/euler/sync` | Refresh problems and solver counts from Project Euler. |
| `GET` | `/api/euler/problems/:id/content` | Problem description HTML on demand. |

## Habitica & Google Calendar

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/habitica/profile` | Habitica profile. |
| `GET` / `POST` | `/api/habitica/tasks` | List (`?type=`) / create tasks. |
| `POST` | `/api/habitica/tasks/:id/score` | Score a task up/down; mirrors the result to local daily state when `roadmapKey` is given. |
| `DELETE` | `/api/habitica/tasks/:id` | Delete a task. |
| `POST` | `/api/habitica/sync-dailies` | Ensure the default Habitica dailies exist. |
| `GET` | `/api/calendar/status` | Google Calendar integration status. |
| `POST` | `/api/calendar/sync-free-slots` | Reserve calendar slots for today's dailies and Habitica to-dos. |

## System

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | `{ status, uptime, timestamp, habiticaConfigured, calendarConfigured, memoryMb }`. |
| `GET` | `/api/app/info` | App name, version, port, mode, and background sync intervals. |
| `GET` | `/data/*` | Static access to the `data/` directory (e.g. the update report). |
| `GET` | `/*` (non-`/api`) | Serves the built SPA from `app/dist`, with a fallback to `index.html`. |

---

## Conventions

- **Status codes.** `400` for invalid input, `404` for a missing resource,
  `502` when an upstream integration fails, `500` for unexpected errors.
- **Validation.** Path params that later touch the filesystem are checked with
  `isSafeSlug` / `isSafeNodeId` before use.
- **Extending.** Add routes in `server/src/server.js`, push feature logic into a
  focused module under `server/src/`, and mirror the client call in
  `app/src/lib/api.ts`.
