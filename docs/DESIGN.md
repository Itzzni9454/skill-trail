# Design system

The interface is **precision editorial**: the register of Linear, Vercel and
Stripe's dashboard — confident, quiet, exact. It should read as instrumentation,
not as a product page. The full brief lives in
[`../.impeccable.md`](../.impeccable.md); the redesign history lives in
[REDESIGN.md](./REDESIGN.md).

The canvas is the one deliberate contrast: a genuinely hand-drawn Balsamiq
roadmap sitting inside a calm, typographic shell. Don't try to make the canvas
look "designed" — lean into the contrast.

---

## Rules of the house

- **Typography carries the design.** Tight tracking on headings, generous leading
  on body, tabular figures on every number.
- **Restraint over decoration.** One accent colour, hairline borders, no
  gradients, glows or glassmorphism.
- **Density is a feature.** This is a tool for reading structured information.
- **Colour is reserved for state** — done / learning / skipped / due. If
  everything is coloured, nothing reads as a signal.
- **Fully offline.** No CDN fonts, no external requests at runtime.

Explicitly **not**: playful, gamified-chunky, corporate-generic, or
skeuomorphic. (The RPG skill-tree view is the one opt-in exception.)

---

## Typography

| Role | Family | Notes |
|---|---|---|
| UI / body | **Geist** | 400 / 500 / 600. Self-hosted in `app/public/fonts/ui/`. |
| Numerals, labels, code | **Geist Mono** | Tabular figures for all stats. |
| Roadmap canvas only | **Balsamiq Sans** | The fidelity contract — never used in the chrome. |

Regenerate the UI fonts with `python scripts/fetch-ui-fonts.py`.

---

## Colour: semantic tokens

Four themes each define ~26 tokens in **oklch** so lightness steps are
perceptually even across hues:

| Theme | Intent |
|---|---|
| `light` | Cool, crisp, default. Paper-white with a faint cool cast. |
| `paper` | Warm editorial. Ink on cream, for long reading sessions. |
| `dark` | Neutral deep grey. Not black — `#000` is banned. |
| `midnight` | Blue-black, higher contrast, for dark rooms. |

Tokens are **semantic, not literal** — `surface`, `raised`, `line`, `ink`,
`ink-muted`, `ink-faint`, `accent`, plus real state colours (`done`, `learning`,
`skipped`, `due`, `danger`, `note`). They are bridged into Tailwind through an
`@theme` block, so components write `bg-surface`, `text-ink-muted`,
`border-line` and follow the theme automatically.

**Never hard-code palette classes** (`bg-slate-800`) or raw hex in the chrome —
they resolve to the same grey in every theme. The only sanctioned colour
literals are:

- the official canvas colours (`#fdff00`, `#ffe599`, `#2b78e4`), which are the
  fidelity contract; and
- the RPG skill-tree palette, which is opt-in and loud on purpose.

Retired theme names (`cherry`, `ocean`, …) migrate to their closest survivor via
`normalizeTheme()` on both the client and the server, so saved preferences never
silently reset.

### Radius scale

Tailwind's radii are re-pointed at the design tokens. Five steps, no arbitrary
values: `rounded-xs` 3px · `rounded-md` 6px · `rounded-lg` 9px · `rounded-xl`
13px · `rounded-2xl` 18px.

---

## Component layer

`app/src/index.css` defines a real component layer — `.btn` (five variants, four
sizes), `.field`, `.card`, `.tile`, `.chip`, `.seg`, `.metric-strip`, `.page`,
`.bar`, `.on-accent`, `.kbd` — each owning its own hover / active / focus states.
Prefer these over ad-hoc utility soup.

State colours need to be legible **on their own soft fill**, not just on the page
background. `scripts/check_contrast.py` enforces this pairing; run it after any
token change.

---

## Accessibility

- Every control has an accessible name. Prefer a `<label htmlFor>`/`id` pair over
  `aria-label` so the label also becomes a click target.
- **One** focus ring in the app. The global `:focus-visible` rule is
  `!important` (safe — it only matches keyboard interaction), and local
  `focus:ring-*` duplicates were removed. `.no-focus-ring` is the single escape
  hatch, used by the programmatically-focused modal panel.
- Overlays are real dialogs: `role="dialog"` + `aria-modal`, with focus capture
  and restore.
- Loading regions render shape-matched skeletons (`components/Skeleton.tsx`) with
  an `sr-only` `role="status"` announcement, not eight decorative bars.
- Respect `prefers-reduced-motion`.

## Motion

Exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) at 120–260 ms, on state
transitions only (hover, focus, panel entry, number changes). Never animate layout
properties. No bounce, no spring overshoot, no infinite decorative loops.

---

## Theme-blind spots to avoid

The two recurring defects that reviews have caught:

1. **Raw hex in inline styles** slipping past the class-level lint. Grep for
   `#` literals outside the canvas/RPG exceptions.
2. **A visible `<label>` sibling with no `htmlFor`/`id`** — it looks correct but
   names nothing.
