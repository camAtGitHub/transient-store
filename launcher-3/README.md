# Current · a temporal launcher

> A bookmark launcher that drifts, predicts, and surges.

Items aren't arranged in a grid. They drift as organic pebbles on a
bioluminescent tide, pulled toward the center by learned temporal relevance.
Type to filter — they surge forward, arrange themselves into a gentle
serpentine curve, and hand you the top match. Stop typing — they release and
return to their slow breath.

## Run it

No build step. Because `data.json` is fetched, you need a tiny static server:

```bash
cd launcher
python -m http.server 8000
# → open http://localhost:8000
```

Any static host works — drop the folder on Netlify, a bucket, a USB stick, a
LAN share. There's no server-side component. Everything lives in `localStorage`.

## What makes it different

**No grid. No tiles. No rows. No cards.** Items are placed on a golden-angle
phyllotaxis spiral (the same math that distributes sunflower seeds) so density
is uniform and no two launches look the same. Shape is per-item: each pebble
has 8 asymmetric `border-radius` values so no two are identical.

**A brain that actually reasons.** Scoring is a weighted combination of ten
signals:

| signal | what it measures |
|---|---|
| recency | exp-decay with a 3-day half-life |
| frequency | log-scaled total visits |
| hour-of-week | 168-bin affinity histogram with ±1hr window |
| day-of-week | dayOfWeek affinity histogram |
| session context | transition chains — what you click after what |
| query aliases | learned query→click mappings per unique string |
| burst detection | rewards streaks of recent repeated use |
| periodic resurface | surfaces stale-but-habitual items gently |
| exploration | a small boost for unclicked items so new ones get a chance |
| explainability | every score carries a `topReason` string ("common mornings", "after GitHub", "usually around now") |

Open **Insights** in the drawer or hit **⌘/Ctrl+E** to see the reasons surface
inline under each item.

**Four animation variants, rolled on page-load.** Each refresh picks one and
colors the filter/release behavior:

- **undertow** — non-matches sweep downward and disappear
- **dissolve** — they drift slightly and fade to dust
- **ripple** — they're pushed outward radially and spawn ripples
- **vapor** — they vaporize upward like steam

The variant is logged to the console and shown in the drawer footer.

**Physics, not transitions.** Positions are computed every frame by a spring +
flow-field + spatial-hash-repulsion simulation. The field is always alive —
items breathe against a Perlin flow field even at rest. On idle, the loop
throttles to save CPU. Target is 150–250 bookmarks without jank.

## Key bindings

| key | action |
|---|---|
| `↑ ↓ ← →` | navigate visible matches |
| `↵` | launch focused / only match |
| `1`–`9` | launch by hotkey (shown when ≤9 matches remain) |
| `⌫` | backspace — reform the field |
| `Esc` | release · restore tide |
| `⌘/Ctrl+E` | toggle explain mode (shows `why` under every item) |
| any printable char | snaps focus back to the search vessel |

## Architecture

```
index.html
css/
  core.css         reset, layout, organic pebble shapes, states
  theme.css        dark "Moonlit Bloom" + light "Dawn Tide" palettes
  animations.css   bloom-breathe, halo-spin, focus-shimmer, variant filters
js/
  main.js          orchestrator — wires everything + builds DOM
  data.js          loadBookmarks + persist to localStorage
  intelligence.js  10-signal scoring + brain import/export
  noise.js         deterministic 2D value noise + flowField(x,y,t)
  fuzzy.js         fuzzyScore(query, item) with field weights
  physics.js       spring + flow + spatial hash, phyllotaxis layout
  search.js        typing → scoring → physics layout + keyboard nav
  animations.js    backdrop canvas (wisps/dust/ripples) + variant flourish
  ui.js            drawer, theme toggle, modals, import/export, clock
data.json          first-run seed — once touched, localStorage takes over
```

**Zero external dependencies** for the core engine. Fonts come from Google
Fonts (Fraunces italic, Instrument Serif, JetBrains Mono). No Fuse.js, no D3,
no React — just modules.

## Data

`data.json` is **re-read every page load** and acts as the shipped base set.
Your customizations (adds / edits / deletes) are stored separately in
`localStorage` under `current.overlay.v1` and applied on top of the base
every time.

Why: if you update `data.json` on disk (e.g. you're managing a team-shared
bookmark set), everyone picks up the changes on next reload — except for any
items they specifically deleted or personally edited, which keep their
overrides.

Storage keys:
- `current.overlay.v1` — user's add/edit/delete diff vs `data.json`
- `current.brain.v1`   — learned temporal behavior (10-signal model)
- `current.theme`      — theme id

Both bookmarks and the learned brain can be exported/imported as JSON via
the drawer. Export is always the **full resolved set** — what you currently
see, not just your overlay.

### Bookmark schema

```json
{
  "id": "auto-generated-uuid",
  "name": "Company Portal",
  "url": "https://portal.example.com",
  "icon": "🏛",
  "group": "Internal Tools",
  "tags": "internal, hr, news",
  "description": "Main access point for company resources."
}
```

`icon` accepts an emoji, short text (first-letter fallback if empty), or a
URL to a favicon/image.

## Themes

Four themes ship: **Moonlit Bloom** (dark teal/cyan), **Dawn Tide**
(light peach/coral), **Abyssal Drift** (deep violet), **Bamboo Rain**
(warm paper/jade). Click the ◐ button in the drawer to cycle; your choice
persists.

**Adding a theme** is two edits:

1. Add a CSS block to `css/theme.css` — copy any existing `body.theme-<id>`
   block and tweak the variables. There's a full authoring guide at the top
   of that file.
2. Add one line to the `THEMES` getter in `js/ui.js`:
   ```js
   { id: 'yourtheme', label: 'Your Label', mode: 'dark' }
   ```
   `mode` (`dark` or `light`) just controls which legacy alias class is
   also applied, so rules like `.theme-light #backdrop { … }` still work.

That's it — the cycle button picks it up automatically.

## Privacy

Everything stays in your browser. No network calls except the Google Fonts
stylesheet and whatever URLs the bookmarks point at when you click. The brain
never leaves your machine unless you export it yourself.

## License

MIT.
