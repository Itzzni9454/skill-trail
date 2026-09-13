# UI Redesign — Precision Editorial

**Date:** 2026-09-11
**Direction:** precision editorial (the Linear / Vercel register) — chosen with you before
any code was written, and recorded in [`../.impeccable.md`](../.impeccable.md) alongside the
audience and tone notes.

---

## The problem was not the palettes

Thirteen themes existed, but they all looked like the same interface with a different
background tint. The reason was not the colour values — it was that the components never
read them.

**855 hard-coded Tailwind palette classes** (`text-slate-400`, `bg-slate-800`,
`text-emerald-600`, `border-slate-700`…) were spread across 21 files. Those classes are
absolute: they resolve to the same grey whether `data-theme` is `light`, `paper`, or
`cherry`. The theme system was wired up correctly and then bypassed almost everywhere.

Second, `body` was set to **Balsamiq Sans** — the roadmap canvas typeface — so the entire
chrome rendered in a hand-drawn wireframe font. That is the single biggest reason the app
read as a prototype.

---

## What changed

### 1. A real type system

Geist and Geist Mono, self-hosted in `app/public/fonts/ui/` (332 KB, latin + latin-ext only)
so the app stays genuinely offline. Regenerate with `python scripts/fetch-ui-fonts.py`.

**Balsamiq Sans is now scoped strictly to the SVG canvases.** `RoadmapSVG`,
`MindmapView` and `UniverseView` already set it inline, so they are unaffected — the
fidelity contract holds. The chrome gets a proper grotesque with tabular figures for
every number.

### 2. A semantic token layer

Four themes — `light` (cool), `paper` (warm editorial), `dark` (neutral), `midnight`
(blue-black) — each defining ~26 tokens in **oklch** so lightness steps are perceptually
even across hues.

Tokens are semantic, not literal: `surface`, `raised`, `line`, `ink`, `ink-muted`,
`ink-faint`, `accent`, plus real state colours (`done`, `learning`, `skipped`, `due`,
`danger`, `note`). They are bridged into Tailwind through an `@theme` block, so components
write `bg-surface`, `text-ink-muted`, `border-line` and follow the theme automatically.

Retired theme names (`cherry`, `stitch`, `ocean`…) migrate to their closest survivor via
`normalizeTheme()` on both the client and the server, so nobody's saved preference silently
resets.

### 3. A codemod, not 855 hand edits

`scripts/codemod-theme-tokens.py` rewrites hard-coded palette classes to semantic tokens
and drops `dark:` colour variants that are now redundant — once a colour is semantic,
`text-ink-muted` is already correct in both light and dark, so the paired
`dark:text-slate-300` is noise. It removed 201 of them.

It is deliberately conservative: it only rewrites inside `className` attributes, and only
transforms text *inside* string literals so quotes stay balanced.

Run it dry first — it prints a full report and changes nothing without `--write`.

### 4. Rebuilt surfaces

| Surface | Before | After |
|---|---|---|
| **Shell** | Emoji theme picker, pill nav | Segmented nav, command-palette trigger with `ctrl K`, theme picker with live palette swatches, review-backlog badge |
| **Home** | 4-column card grid with random emoji and rotating gradients | Dense list — index, title, description, topic count, hairline progress bar, percentage. Sticky filter toolbar |
| **Dashboard** | Five floating "hero metric" cards, all numbers coloured | One hairline-divided instrument strip; numbers neutral, colour marks state via a dot |
| **Roadmap viewer** | Six rainbow-coloured pill buttons | One consistent control set, neutral icons, only the active state earns colour |
| **Universe** | 97 flat checkboxes, no search | Filter box, per-roadmap progress, Select all / In progress / Clear, legend in the empty state |
| **Canvas controls** | `+` / `-` text glyphs | Proper icons, standard − value + order, percentage doubles as reset |

---

## Bugs found while redesigning

Four real defects surfaced that were not part of the visual brief:

1. **`@currentYear@` rendered literally** in 84 of 97 roadmap descriptions — the official
   site substitutes it and nothing here did. Now resolved at the API boundary in
   `lib/api.ts`, so every consumer gets display-ready text.
2. **The dashboard forecast printed "25 Mar 2174"** — 7,698 remaining topics ÷ 1/week.
   Arithmetically correct, useless as an answer. It now reports a horizon ("20+ years")
   once a date stops being meaningful.
3. **CodePlayground console colours were hard-coded light-on-dark** while sitting on the
   theme-aware `bg-raised` surface — the output was unreadable in every light theme.
4. **The mindmap opened at 65% zoom**, so every graph rendered tiny on first paint.

---

## Verification

| Check | Result |
|---|---|
| `tsc -b` | exit 0, zero errors |
| `vite build` | ✓ 6.2s — CSS **99 KB → 71 KB** (−28%) |
| `scripts/verify_edges.py` | **69/69 edges exact** — fidelity contract intact |
| All four themes | Screenshotted and confirmed |
| `data/state.json` | **md5 unchanged** (`da850d53…`) — all work used a scratch `DATA_DIR` |

---

## Known follow-ups

- **The mindmap still under-fills its canvas.** The canvas floor is 1400×1400
  (`MindmapView.tsx:1204`) while a radial layout for `/frontend` is far smaller, so the
  graph sits small in the middle. A proper fit-to-content pass on mount would fix it
  properly; I raised the default zoom from 0.65 to 1 as a safe interim.
- **Career-gap and velocity heuristics** still use the pre-existing keyword matching and a
  linear pace estimate. They now *present* honestly but the underlying estimates are crude.
- **`StudyStreaks`, `ReviewQueue`, `FlashcardModal` and the remaining modals** were converted
  by the codemod and inherit the new tokens, but were not individually redesigned. They are
  consistent now, not yet considered.

---

## Round 2 — refined against NeetCode's roadmap

You asked for a second pass with [neetcode.io/roadmap](https://neetcode.io/roadmap) as the
reference. What's worth stealing from NeetCode is *structure*, not surface: it leads with
where you are, makes the mix of states legible, and treats progress as a first-class object
rather than a badge.

### Mindmap fit (fixed properly)

The earlier `zoom 0.65 → 1` was a stopgap. The real problem was a fixed **1400×1400 canvas
floor** (`MindmapView.tsx`) letterboxed into the container by `preserveAspectRatio`, so a
compact radial layout for `/frontend` occupied roughly a sixth of the screen.

Now an effect derives the zoom from the actual content bounds — fit whichever axis is
tighter, with a 10% margin — so any layout fills the viewport regardless of its natural
size. It's keyed on *layout*, not container size, so resizing the window doesn't throw away
a zoom you dialled in by hand.

### Segmented progress

`components/ProgressSegments.tsx` replaces single-number progress with a track where **each
state owns its segment**: done, covered, learning, skipped, sized as a share of total — so
the untouched remainder reads as remaining work rather than an absence.

The roadmap view now has a slim **progress band** under the toolbar with the legend on the
left, the track in the middle and the completion figure on the right. The little pill that
used to sit in the toolbar is gone — it competed with the controls and duplicated the same
numbers.

### "Pick up where you left off"

NeetCode surfaces your position instead of making you re-find it. Home now derives your
three most recently touched roadmaps from `/api/activity` and shows them as resume cards
with the last topic touched, a relative timestamp, and their progress bar. With 97 roadmaps
this matters more than it does on a 19-topic site.

### The last theme-blind spots

The codemod handled Tailwind *classes*, but raw hex literals in inline styles slipped
through. `StudyStreaks` (heatmap scale, streak ring, goal controls), `NodePopup` (status
chips), `ReviewQueue` (ladder indicator) and `ResourcesPanel` all had hard-coded
`#10b981` / `#dc2626` / `#fff` / etc. — invisible to the theme system. All four files are
now fully token-driven; the heatmap scale derives from `--theme-primary` via `color-mix`,
and filled status chips use `--theme-primary-ink`, which is the correct on-colour in both
light (near-white on deep state colours) and dark (dark on bright ones).

Deliberately **not** converted: the official canvas colours (`#fdff00`, `#ffe599`,
`#2b78e4`) which are the fidelity contract, and `SkillTreeView`'s RPG palette, which earns
its loudness by being opt-in.

---

## Verification (round 2)

| Check | Result |
|---|---|
| `tsc -b` | exit 0, zero errors |
| `vite build` | ✓ |
| `scripts/verify_edges.py` | **69/69 edges exact** |
| Chrome-hex leftovers in chrome files | 0 across all four |
| Mindmap render | no React errors (previously error #310) |

### One trap worth recording

Adding a `useEffect` to `MindmapView` next to the canvas-size maths put a hook **after** the
`if (!roadmap || !mind) return <Loading/>` early return. The loading render ran fewer hooks
than the loaded render → React error #310 and a completely blank page. Hooks must stay
above every early return; the effect and the canvas bounds now sit together with a comment
saying so.

---

## Round 3 — the primitives that were defined but never used

Round 1 built the token layer. Round 2 fixed the theme-blind spots. Round 3 started from an
audit of what the components *actually* rendered, and found that the previous passes had
built infrastructure nobody called.

### The four findings that mattered

**1. `.skeleton` and `.state-panel` had zero call sites.** Both were written in round 1 with
careful comments explaining the intent. Neither was referenced by a single component. Every
async region instead rendered the literal string `"Loading…"`, a bare spinner, or nothing at
all — and `Home` had no loading state whatsoever, so it flashed its *"no roadmaps in this
category"* empty state on every cold load before the data arrived.

Now: `components/Skeleton.tsx` and `components/EmptyState.tsx`, wired into all six views and
nine components. Every skeleton is shaped after the layout it replaces, so nothing collapses
on arrival, and every skeleton carries an `sr-only` `role="status"` announcer instead of eight
decorative bars for a screen reader to walk.

**2. The focus ring was being erased app-wide.** `index.css` set a `:focus-visible` outline
inside `:where(...)`, which has **zero specificity**. Tailwind's `focus-visible:outline-none`
compiles to a `(0,2,0)` selector and therefore beat it — on ~72 controls. Keyboard users had
no focus indicator anywhere in the app. The rule is now `!important` (safe: `:focus-visible`
only matches for keyboard interaction, so pointer users see nothing), with an explicit
`.no-focus-ring` escape hatch used by exactly one element — the modal panel, which is focused
programmatically.

**3. Four buttons rendered their own label in their own background colour.** `bg-done
text-done` is invisible. Found in `FlashcardModal` (all four grading buttons — the primary
interaction of the spaced-repetition flow), `TimeTracker` (both timer toggles), and
`AchievementsModal` / `ResourcesPanel` (status pills). `scripts/check_contrast.py` had never
caught them because it only tested state ink against `--theme-bg`/`--theme-surface`, never
against the `-soft` fill it is actually drawn on. The checker now covers that pairing, which
is what surfaced the next problem.

**4. State ink failed AA on its own soft fill.** With the new pairing in place, 13 checks
failed — 3.01:1 for `--theme-due` on `--theme-due-soft`, 3.28:1 for `--theme-skipped`, and so
on. Raising the fill lightness could not fix it (a pure-white fill still only reached 4.34:1),
because the inks were simply too light to be body text on a tint. So the inks were deepened,
0.02–0.10 in lightness, keeping hue and chroma. This is the same treatment round 1 had
already applied to `--theme-primary` for the identical reason.

### Two defects that were not in the brief

- **The Editor's empty-state button was invisible.** `bg-raised` resolves to the near-white
  `--theme-surface-2` in the light themes, and the label was `text-white`. `VaultSyncModal`
  had the same bug. Both now use the button layer.
- **Metric strips had dangling hairlines.** Both the Dashboard and Dailys drew per-cell
  borders (`borderRight` + `borderTop` on every cell). At 2 and 3 columns the last cell of
  each row kept a dangling right edge and the first row kept a top edge against the
  container's own border. Replaced with a 1px grid `gap` over the border colour, which is
  correct at any column count.

### What replaced the inline styles

~855 hard-coded palette classes went in round 1; this pass removed the rest of the *inline*
variety. `index.css` now carries a real component layer — `.btn` with five variants and four
sizes, `.field`, `.card`, `.tile`, `.chip`, `.seg`, `.metric-strip`, `.page`, `.bar`,
`.on-accent`, `.kbd` — each owning its own hover / active / focus states. Net effect across
the app: **0 hard-coded Tailwind palette classes, 0 raw hex or `rgba()` literals in the
chrome** (the official canvas colours and the RPG palette excepted, both deliberately), and
the arbitrary radius scale reduced from nine values to four.

Two duplications were removed rather than synchronised: the NavBar theme swatches now render
inside `data-theme={value}`, so they read the real tokens and cannot drift (they had already
drifted twice), and the five hand-copied modal scrims became one `--theme-scrim` token.

### Verification (round 3)

| Check | Result |
|---|---|
| `tsc -b` | exit 0, zero errors |
| `vite build` | CSS 81.11 kB (gzip 14.07) · JS 529.51 kB (gzip 140.66) |
| `scripts/verify_edges.py` | **69/69 edges exact** — fidelity contract intact |
| `scripts/check_contrast.py` | **all pass**, now covering 13 additional pairings |
| Console errors | 0 across all pages, dev and production |
| All four themes | Screenshotted; swatches verified token-driven |
| `data/state.json` | **md5 unchanged** (`e5ae3015…`) — verified before and after |

### Known follow-ups

- **`npm test` has 8 pre-existing failures**, all server-side and unrelated to the UI: the
  connectors registry shape (`connectors.js`), the Obsidian push path, and a
  use-before-declaration of `options` in the LeetCode quest builder (`leetcode.js:356` reads
  `options`, which `dailys.js:385` declares). The runner bundles `tests/suite.test.ts` against
  a scratch `DATA_DIR` and never imports `app/src`, so these are not regressions from this
  work — but they are real and worth fixing.
- **Tailwind's named radii (`rounded-lg`/`xl`/`2xl`, 144 uses) still sit on Tailwind's default
  scale**, one to six pixels off the design tokens. Remapping them means remapping every
  usage at once, which is a mechanical change worth doing deliberately rather than as a
  side-effect of a visual pass.
- **`StudyStreaks`, `ReviewQueue` and the remaining modals** were converted by the codemod and
  now inherit the new tokens and states, but their internal layouts were not reconsidered.

---

## Round 3b — accessibility completion and radius unification

Round 3 was reported before its accessibility and layout items were finished. This closes them.

### Accessibility, measured rather than assumed

A throwaway auditor replaced eyeballing. What it found was not what the earlier audit
predicted:

| Category | Before | After |
|---|---|---|
| Form controls with no accessible name | ~29 genuine | **0** |
| Icon-only buttons with no accessible name | 9 flagged | **0** — all 9 were false positives; each had a visible text label beside the icon and the heuristic had dropped the JSX expression holding it |
| Overlays missing `role="dialog"` + `aria-modal` | 1 | **0** |
| Controls suppressing focus with `focus-visible:outline-none` | ~72 | **0** |
| Components drawing a *second* focus ring | 14 | **0** |
| Hard-coded `bg-black/*` overlays and code chips | 10 | **0** |

The commonest real defect was **a visible `<label>` sibling with no `htmlFor`/`id`** — the
label looked correct on screen but named nothing. `BadgeModal` had three. These were fixed with
`htmlFor`/`id` pairs rather than `aria-label`, so the label also becomes a click target.

The second was subtler: once the global focus rule became `!important`, the 14 controls that
drew their own `focus:ring-*` rendered **two** rings stacked into a doubled halo. The local
rings were removed so there is exactly one focus treatment in the app.

`ResourcesPanel` was genuinely modal — full-screen backdrop, click-outside-to-close — but
declared only `role="dialog"`. It now has `aria-modal`, focus capture and restore, and the
scrim token instead of `bg-black/40`. The new `useRef`/`useEffect` had to be placed **above**
the `if (!node) return null` early return: the same hook-ordering trap recorded in round 2 that
produced React error #310. Verified afterwards by probe — dialog semantics present, Escape
closes it, zero console errors.

### Radius scale unified

Two parallel radius systems were in use: the design tokens (6/9/13/18px) and Tailwind's
defaults (4/6/8/12/16px), disagreeing by 1–6px on ~158 elements, plus nine distinct arbitrary
values on top. `@theme` now re-points Tailwind's scale at the tokens, and every arbitrary value
was collapsed onto a named class. Movement was capped at 2px so nothing re-flowed.

**Final inventory: five named steps — `rounded-xs` 3px, `rounded-md` 6px, `rounded-lg` 9px,
`rounded-xl` 13px, `rounded-2xl` 18px — and zero arbitrary values.**

### Verification (round 3b)

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `vite build` | CSS **79.64 kB** (from 81.11 — dropping the duplicate rings and radius values shrank it) · JS 529.90 kB (gzip 140.93) |
| `scripts/verify_edges.py` | **69/69 edges exact** |
| `scripts/check_contrast.py` | all pass |
| Console errors | 0, production build |
| Resources drawer | dialog semantics + Escape verified by probe |
| `data/state.json` | md5 `e5ae3015…` **unchanged** |

### A build trap worth recording

`vite build --outDir <dir> --emptyOutDir` — and a second build into the same scratch directory —
both trip the sandbox's bulk-delete guard, because Vite clears `<outDir>/fonts`. Build into a
**fresh** directory name each time and `cp` the result into `app/dist`, preserving
`dist/fonts` and `dist/manifest.json`.
