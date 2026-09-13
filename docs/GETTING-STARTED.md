# Getting Started with Skill Trail

This guide takes you from zero to your first completed topic in about ten minutes.
No prior experience with Node.js is assumed.

---

## What you'll need

| Requirement | Check with | Get it from |
|---|---|---|
| Node.js **18 or newer** | `node --version` | [nodejs.org](https://nodejs.org) (the LTS build) |
| Git | `git --version` | [git-scm.com](https://git-scm.com) |
| ~200 MB free disk space | — | — |
| Python 3 *(optional — only for the fidelity check)* | `python --version` | [python.org](https://python.org) |

> **Windows tip:** run all commands in **PowerShell** or **Git Bash**. The repo also
> includes `run-all.bat`, a menu-driven launcher that does everything without typing.

---

## Step 1 — Get the code

```bash
git clone https://github.com/Luv-Goel/skill-trail.git
cd skill-trail
```

## Step 2 — Download the roadmap content

```bash
npm run bootstrap
```

This is the only step that needs the internet, and it runs once. Skill Trail's
repository ships only application code — the 97 roadmap snapshots and the
per-topic guides are owned by roadmap.sh, so each user downloads them from the
official source to their own machine (their license permits personal use but
not redistribution). Expect it to take 1–3 minutes; it prints progress as it goes.

<details>
<summary>What exactly does it download, and where?</summary>

- `developer-roadmap/` — a shallow clone of
  [kamranahmedse/developer-roadmap](https://github.com/kamranahmedse/developer-roadmap),
  containing the official markdown guides behind every topic.
- `data/roadmaps/*.json` — the 97 roadmap structure snapshots, fetched from
  `roadmap.sh/<slug>.json`.

Both locations are gitignored — they will never end up in a commit.
</details>

## Step 3 — Install and build

```bash
npm run setup      # installs dependencies for server/ and app/
npm run app:build  # builds the frontend into app/dist
```

## Step 4 — Start it

```bash
npm start
```

Open **http://localhost:4177** in your browser. You should see the roadmap library
with all 97 roadmaps. 🎉

To stop the server, press `Ctrl+C` in that terminal. Start it again any time with
`npm start` — steps 1–3 never need repeating.

---

## Your first five minutes in the app

1. **Pick a roadmap** — e.g. *Frontend Developer*. Scroll or use the filter box on the home page.
2. **Click any topic** on the canvas — a panel opens with the official guide and curated resources.
3. **Mark your status** — `Learning`, `Done`, or `Skip`. The canvas recolors instantly, and your
   home page now shows "pick up where you left off".
4. **Done topics schedule themselves for review.** When the **Review** badge in the top bar
   shows a count, click it — you'll get an active-recall flashcard. Grade yourself honestly;
   the 1/3/7/14/30/90-day ladder does the rest.
5. **Search everything** with `Ctrl+K` — topics, official guides, and your own notes.

### Where your data lives

Everything personal — progress, notes, streaks, reviews, custom roadmaps — is in one
file: **`data/state.json`**.

- **Back up:** copy that file somewhere safe.
- **Move machines:** install Skill Trail on the new machine, then copy the file over.
- **Reset everything:** delete the file (the app recreates an empty one).

Roadmap *snapshots* live separately in `data/roadmaps/` — updating them never touches
your progress.

---

## Keeping content fresh

roadmap.sh revises their roadmaps regularly. Once a week (or whenever you like):

```bash
npm run update             # just check — prints a report, changes nothing
npm run update:download    # actually fetch updates + pull the content repo
```

<details>
<summary>Schedule it automatically (optional)</summary>

**Windows** — Task Scheduler, weekly:
```powershell
schtasks /create /tn "Skill Trail Update" /tr "cmd /c cd /d C:\path\to\repo && npm run update:download" /sc weekly /d sun /st 09:00
```

**Linux/macOS** — cron:
```
0 9 * * 0  cd /path/to/repo && npm run update:download
```
</details>

---

## Development setup (optional)

Want to hack on the UI or the server?

```bash
npm run server     # terminal 1 — API on http://localhost:4177
npm run app:dev    # terminal 2 — Vite with hot reload on http://localhost:5180
```

Open **http://localhost:5180** (the dev server proxies API calls to :4177).

Before submitting a PR, run the checks CI will run:

```bash
python scripts/verify_edges.py   # renderer fidelity guard
npm test                         # test suite
cd app && npx tsc -b             # typecheck
```

See [docs/DEVELOPMENT.md](DEVELOPMENT.md) for conventions and architecture deep-dives.

---

## Troubleshooting

**`npm run bootstrap` fails / stalls**
Check your connection, then re-run — it resumes and only downloads what's missing.
Behind a proxy? Make sure `git` and Node can reach `github.com` and `roadmap.sh`.

**Port 4177 already in use**
Something else grabbed the port. Either stop it, or start Skill Trail elsewhere:
```bash
cd server
PORT=5000 npm start        # then open http://localhost:5000
```
(PowerShell: `$env:PORT=5000; npm start`)

**Blank page after `npm start`**
You skipped `npm run app:build`, or it failed. Re-run it and read the output.

**Search shows no guides**
The content repo is missing — re-run `npm run bootstrap`.

**Fonts look different from roadmap.sh**
Hard-refresh the page (`Ctrl+Shift+R`) — the Balsamiq fonts are self-hosted and
your browser may be holding an old cached copy.

**`npm run setup` fails on Windows**
Ensure Node.js ≥ 18 (`node --version`), delete the `server/node_modules` and
`app/node_modules` folders, and run `npm run setup` again.

Still stuck? [Open an issue](https://github.com/Luv-Goel/skill-trail/issues) with the exact
command you ran and its output.
