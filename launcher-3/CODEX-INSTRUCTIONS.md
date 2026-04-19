# Codex Instructions — Current Launcher: WebGL Graphics & 500+ Item Performance

> Read this entire document before touching any file.
> Do not modify files that are not listed as targets in your assigned task.
> ALL INSTRUCTIONS ARE RELATED TO DIRECTORY <git repo root>/launcher-3/ 
> LEAVE ALL DIRECTORIES EXCEPT FOR <git repo root>/launcher-3/ UNMODIFIED!

---

## PROJECT BOOTSTRAP

**Current** is a temporally-aware bookmark launcher. It is a pure static
web app — no build step, no bundler, no npm, no framework. ES modules loaded
directly by the browser. Served by any static file server. Must keep working
via `python -m http.server`.

### File Map

```
index.html          — shell HTML, single <canvas id="backdrop">, #stage for DOM items
css/
  core.css          — layout, .item shape, states, drawer, modals
  theme.css         — 4 themes as CSS var blocks on body.theme-<id>
  animations.css    — CSS keyframe animations (bloom-breathe, halo-spin, etc.)
js/
  main.js           — boot orchestrator; constructs DOM, wires visibility events
  data.js           — DataStore class; base+overlay bookmark persistence
  intelligence.js   — Intelligence class; 10-signal scoring brain
  physics.js        — Physics class; spring+flow+spatial-hash simulation
  animations.js     — Animations class; backdrop canvas + flourish effects
  search.js         — Search class; debounced filter, keyboard nav
  ui.js             — UI class; drawer, modals, themes, clock
  noise.js          — noise2D(), flowField(x,y,t) — deterministic Perlin-ish
  fuzzy.js          — fuzzyScore(query, item) — weighted substring matcher
data.json           — base bookmark set, re-read every load
```

### Invariants — These Are Always True

1. **Items are DOM nodes.** Every bookmark is an `<a class="item">` absolutely
   positioned on `#stage`. Physics writes `transform: translate3d(x,y,0)` to
   each item every frame via `physics.flushDOM()`. This must stay as DOM — do
   not attempt to render bookmark items via WebGL.

2. **`app` is the shared object.** Every module holds a reference to `app` and
   reads `app.physics`, `app.animations`, `app.search`, etc. Never create
   module-level globals that bypass `app`.

3. **No build step.** No TypeScript, no JSX, no imports from `node_modules`.
   External code must be loaded via CDN `<script>` tags in `index.html`, then
   accessed via a global (e.g., `window.THREE`, not `import THREE`).

4. **Canvas `#backdrop` is full-viewport, position:fixed, z-index below items.**
   It is a single `<canvas>` element. Do not add more canvas elements. WebGL
   must take over this single canvas entirely.

5. **`document.visibilitychange` pauses all loops.** `physics.pause()` and
   `animations.pause()` are called when the tab is hidden. Any new animation
   loops you add MUST respect the same pause/resume lifecycle.

6. **Physics owns positions.** Only `physics.flushDOM()` writes to
   `node.el.style.transform`. Animations touch `opacity` and `filter` only.

---

## SYSTEM FRAME

**Problem:** At 500+ bookmark items the 2D canvas particle loop, per-frame DOM
writes, and unthrottled rAF cause sustained high CPU/GPU even when idle.
The canvas is also underutilized — ambient effects cluster around the center
rather than filling the viewport.

**Scope (in):**
- Replace 2D canvas backdrop with WebGL (single existing `<canvas id="backdrop">`)
- Implement perf-tier system gating effect quality to item count
- Expand canvas effects to fill the full viewport (not just center bloom)
- Reduce physics DOM write cost at high item counts

**Scope (out):**
- Physics simulation algorithm — do not touch spring/repel/sleep math
- Intelligence/scoring — do not touch
- Search/keyboard/launch — do not touch
- DataStore/persistence — do not touch
- CSS item shapes, themes, modals — do not touch

---

## MODULE MAP & DEPENDENCY GRAPH

```
main.js
  ├── data.js          (DataStore)
  ├── intelligence.js  (Intelligence)
  ├── animations.js    (Animations)   ← PRIMARY TARGET
  ├── physics.js       (Physics)      ← flushDOM TARGET
  ├── search.js        (Search)
  ├── noise.js         ← used by animations.js and physics.js
  └── ui.js            (UI)

NEW:
  js/perf.js           (PerfTier)     ← introduce here, app.perf slot
  js/gl.js             (GLRenderer)   ← WebGL backend, owned by Animations
```

**Shared mutable state risk:**
- `app.physics.nodes` — read by animations and main. Only physics writes position.
- `app.variant` — read by physics and animations. Set once at boot, never changes.

---

## TASK LIST

```
TASK-01   Build PerfTier module
TASK-02   WebGL renderer core (GLRenderer)
TASK-03   Wire GLRenderer into Animations (replace 2D backdrop)
TASK-04   Expand canvas usage — full-viewport effects
TASK-05   Physics flushDOM batching (high item count DOM write cost)
TASK-06   Tiered quality gates in Animations
```

Tasks 02 and 05 can run in parallel after TASK-01 is done.
TASK-03 depends on TASK-02. TASK-04 depends on TASK-03. TASK-06 depends on TASK-01 and TASK-03.

---

---
## TASK-01: PerfTier Module

**Objective:** Create `js/perf.js` that classifies the current session into a
performance tier based on item count (and optionally hardware concurrency),
and expose it on `app.perf` so every other module can gate effects.

**Bootstrap Context:**
Read `js/main.js` lines 1-45 to understand the `app` object shape.
Key facts:
- `app` is a plain object literal defined in main.js. Add `perf: null` to its slot list.
- `app.bookmarks.length` is the item count — available after `app.store.load()`.
- The `app` object is passed to every module constructor as `this.app`.
Stop reading after you understand the `app` object shape.

**Files to Create / Modify:**
- `js/perf.js` — CREATE — PerfTier class
- `js/main.js` — MODIFY — add `perf: null` to app object; instantiate PerfTier after DataStore load; pass to boot log

**Inputs:**
- `itemCount: number` — from `app.bookmarks.length` at boot time

**Outputs:**
- `app.perf` — PerfTier instance, available before any module constructor runs

**Interface Contract:**
```js
export class PerfTier {
  constructor(itemCount)

  // The tier string. One of: 'full' | 'reduced' | 'minimal'
  // full:    ≤ 150 items  — all effects enabled
  // reduced: 151-350      — particle counts halved, some effects disabled
  // minimal: 351+         — WebGL particles only, no dust, no CSS filter effects
  get tier(): 'full' | 'reduced' | 'minimal'

  // Raw item count
  get count(): number

  // True if WebGL should be attempted (always true unless WebGL unavailable)
  get useWebGL(): boolean

  // Particle count budget for the backdrop. Returns integer.
  // full: 60, reduced: 30, minimal: 15
  get particleBudget(): number

  // Whether ripple effects are enabled
  get ripplesEnabled(): boolean   // true for full/reduced, false for minimal

  // Whether CSS filter effects (blur, brightness) on items are enabled
  get itemFiltersEnabled(): boolean  // true for full only

  // Whether dust burst particles are enabled
  get dustEnabled(): boolean  // true for full, false for reduced/minimal
}
```

⚠️ CRITICAL CONSTRAINTS:
- `PerfTier` must be instantiated BEFORE `Animations` and `Physics` constructors run.
- `tier` must be a getter that returns a fixed string — do not recompute dynamically mid-session.
- If `WebGL2RenderingContext` is not available in the browser, set `useWebGL = false` and degrade gracefully — do not throw.

**Must NOT do:**
- Do not modify `animations.js`, `physics.js`, or any other module in this task.
- Do not add feature detection beyond WebGL availability check.

**Acceptance Criteria:**
- [ ] `app.perf` is non-null before `new Animations(app)` is called in `main.js`
- [ ] `app.perf.tier` returns `'full'` for 100 items, `'reduced'` for 200, `'minimal'` for 400
- [ ] `app.perf.useWebGL` returns `false` when run in an environment without WebGL2
- [ ] No other file is modified except `js/perf.js` and `js/main.js`

**Edge Cases:**
- 0 items → tier is `'full'` (empty launcher still gets full effects)
- WebGL2 available but context creation throws → `useWebGL = false`

**Known Risks:**
- Codex may try to detect GPU tier via benchmarks — do not. Item count is the only signal.
- Do not call `canvas.getContext('webgl2')` in perf.js — that is GLRenderer's job.

---

---
## TASK-02: GLRenderer — WebGL Core

**Objective:** Create `js/gl.js` implementing a WebGL2 particle renderer that
draws a configurable number of flow-field wisps as GPU-side points, replacing
the 2D canvas particle loop. Does not integrate with `Animations` yet — just
make it work standalone.

**Bootstrap Context:**
Read `js/noise.js` in full — you will replicate the `flowField` logic in GLSL.
Read `js/animations.js` lines 179-245 to understand what the 2D canvas currently draws.
Key facts:
- `flowField(x, y, t)` returns `[fx, fy]` — a 2D direction vector. The GLSL
  equivalent must produce the same qualitative behavior (doesn't need to be
  bit-identical — same feel is enough).
- Particles are tiny (radius ~1.2px), semi-transparent (`alpha 0.08`), colored
  by HSL using `--canvas-hue-a` and `--canvas-hue-b` CSS vars.
- The canvas uses `globalCompositeOperation = 'lighter'` for additive blending.
  In WebGL this is `gl.blendFunc(gl.ONE, gl.ONE)`.
- Canvas is single-element `<canvas id="backdrop">`, full viewport, position:fixed.
- DPR scaling: `canvas.width = window.innerWidth * dpr`. GLRenderer must handle DPR.
Stop reading after the _bgTick method (line ~245).

**Files to Create / Modify:**
- `js/gl.js` — CREATE — GLRenderer class

**Inputs:**
- `canvas: HTMLCanvasElement` — the `#backdrop` element
- `particleCount: number` — from `app.perf.particleBudget`
- `dpr: number` — device pixel ratio

**Outputs:**
- `GLRenderer` class exported from `js/gl.js`

**Interface Contract:**
```js
export class GLRenderer {
  constructor(canvas, particleCount, dpr)

  // Returns true if WebGL2 context was acquired successfully
  get ready(): boolean

  // Update hue values from current theme CSS vars.
  // Called by Animations when theme changes.
  updateHues(hueA: number, hueB: number): void

  // Advance simulation by dt milliseconds and draw one frame.
  // t is total elapsed time in ms (for flow field animation).
  tick(t: number, dt: number): void

  // Add a ripple at canvas coordinates (x, y).
  // Ripples expand outward and fade. Max 8 simultaneous ripples.
  addRipple(x: number, y: number): void

  // Add N burst particles at (x, y). Used for launch/dissolve effects.
  // kind: 'launch' | 'dissolve'
  addBurst(x: number, y: number, count: number, kind: string): void

  // Handle canvas resize. Call when window resizes.
  resize(width: number, height: number, dpr: number): void

  // Release WebGL resources. Called if switching back to 2D fallback.
  destroy(): void
}
```

**Shader Requirements:**

Particle vertex shader must:
- Store particle positions in a `Float32Array` texture (texture-based GPGPU —
  positions updated on CPU, uploaded each frame via `texSubImage2D`).
- Accept `a_index` attribute (particle index) to look up position in texture.
- Output `gl_PointSize` scaled by DPR (base size: 2.5px).

Particle fragment shader must:
- Discard fragments outside a circle (`length(gl_PointCoord - 0.5) > 0.5`).
- Output color as additive-blended HSLA. Pass hue as uniform.
- Alpha falls off toward the edge of the circle.

Ripple vertex/fragment shaders:
- Draw expanding rings as line loops or triangle strips.
- Fade alpha as ring expands. Max 8 rings in a uniform array.

⚠️ CRITICAL CONSTRAINTS:
- Use **WebGL2** (`getContext('webgl2')`), not WebGL1.
- Do NOT use any external WebGL library (Three.js, Babylon, etc.) — raw WebGL only.
- The canvas context must be acquired with `{ alpha: true, premultipliedAlpha: false }` 
  so it composites correctly over the CSS background.
- `gl.clear()` must clear to fully transparent (`gl.clearColor(0,0,0,0)`).
- Particle positions are updated CPU-side each frame (flow field runs in JS,
  same as the 2D version). Do not attempt full GPU-side simulation — 
  the particle count (15-60) is too low to justify the complexity.

**Must NOT do:**
- Do not import or use Three.js, regl, twgl, or any WebGL wrapper.
- Do not modify `index.html` to add `<script>` tags — GLRenderer is pure ES module.
- Do not touch `noise.js` — duplicate the flow field math inline if needed.

**Acceptance Criteria:**
- [ ] `new GLRenderer(canvas, 60, dpr)` acquires a WebGL2 context without throwing
- [ ] `gl.ready` is `true` after successful init
- [ ] Calling `tick(t, dt)` draws particles visible on screen (test in browser)
- [ ] `addRipple(cx, cy)` produces an expanding ring that fades over ~1600ms
- [ ] Canvas is transparent where no particles are drawn (CSS background shows through)
- [ ] `resize()` correctly updates viewport and projection

**Edge Cases:**
- `getContext('webgl2')` returns null → `this.ready = false`, all methods no-op
- `particleCount = 0` → no particle draw calls, ripples still work
- Window resize mid-animation → positions rescaled proportionally

**Known Risks:**
- Codex may try to use `OES_texture_float` extension instead of WebGL2 built-in
  float textures — use WebGL2's native `gl.RGBA32F` format instead.
- `gl.blendFunc(gl.ONE, gl.ONE)` for additive blend must be called every frame
  before particle draw — do not assume blend state persists.
- `gl_PointSize` is clamped by the driver on some hardware (max ~64px) — this
  is fine for 2.5px points.

---

---
## TASK-03: Wire GLRenderer into Animations

**Objective:** Modify `js/animations.js` so the backdrop uses `GLRenderer`
when `app.perf.useWebGL` is true, falling back to the existing 2D canvas path
when WebGL is unavailable.

**Bootstrap Context:**
Read `js/animations.js` in full.
Read `js/gl.js` (from TASK-02) — specifically the `GLRenderer` interface.
Read `js/perf.js` (from TASK-01) — specifically `useWebGL`, `particleBudget`.
Key facts:
- `Animations.constructor` acquires `this.ctx = canvas.getContext('2d')`. 
  If WebGL is active, skip acquiring the 2D context.
- `startBackdrop()` launches the rAF loop. The loop logic branches on whether
  `this.glr` (GLRenderer instance) exists.
- `pause()` / `resume()` control `this.bgPaused`. The rAF loop checks this flag.
  GLRenderer has no internal loop — Animations drives it.
- Hue values (`--canvas-hue-a`, `--canvas-hue-b`) are read from CSS vars each
  frame in the 2D path. In WebGL path, read them once per theme change and
  call `glr.updateHues()`.
- `spawnRipple()` → call `glr.addRipple(cx, cy)` in WebGL path.
- `_spawnDust(x, y, count, kind)` → call `glr.addBurst(x, y, count, kind)` in WebGL path.
Stop reading at the end of the class.

**Files to Modify:**
- `js/animations.js` — MODIFY — add WebGL branch; keep 2D path intact

**Inputs:**
- `app.perf.useWebGL` — boolean, checked in constructor
- `app.perf.particleBudget` — number of particles to create
- `GLRenderer` from `js/gl.js`

**Interface Contract:**
All existing public methods of `Animations` must retain their exact signatures:
```
constructor(app)
resizeCanvas()
pickVariant()
reveal()
onFilter(matched, unmatched)
onReform()
onEscape()
onLaunch(node)
startBackdrop()
pause()
resume()
spawnRipple(intensity)
```
Do not add new public methods. Internal implementation may change.

⚠️ CRITICAL CONSTRAINTS:
- The 2D canvas fallback path (`this.ctx`, `_bgTick`, etc.) must remain fully
  functional and unchanged. Only add a branch — do not delete the 2D path.
- `this.canvas` must remain pointing to `document.getElementById('backdrop')`.
  GLRenderer receives the same element.
- If `glr.ready` is false after construction, fall back to 2D silently —
  do not throw or show an error to the user.
- `pause()` and `resume()` must halt/restart the rAF loop regardless of which
  backend is active.

**Must NOT do:**
- Do not change the behavior of `reveal()`, `onFilter()`, `onEscape()`, `onLaunch()` —
  these apply CSS animations/opacity to DOM item elements and must not change.
- Do not modify `physics.js`, `main.js`, or any other file.

**Acceptance Criteria:**
- [ ] When WebGL2 is available, `this.glr` is a GLRenderer instance and `this.ctx` is null
- [ ] When WebGL2 is not available, `this.ctx` is a 2D context and `this.glr` is null
- [ ] Both paths produce visible ambient particles on screen
- [ ] `pause()` stops the rAF loop in both paths
- [ ] `spawnRipple()` works in both paths

**Edge Cases:**
- GLRenderer construction succeeds but first `tick()` throws → catch, set `this.glr = null`, re-init 2D path
- Theme change (via `ui.setTheme()`) → call `glr.updateHues()` on next `_bgTick` cycle
  (re-read CSS vars from `getComputedStyle` as before, pass to glr)

**Known Risks:**
- Codex may delete the 2D path entirely — do NOT. The fallback must survive.
- Codex may call `canvas.getContext('2d')` after `canvas.getContext('webgl2')` has
  been called — browsers will return null for the second context type. Acquire only one.

---

---
## TASK-04: Full-Viewport Canvas Effects

**Objective:** Expand the WebGL backdrop to use the full canvas viewport —
replace the center-clustered particle behavior with a viewport-filling flow
field, add large slow-moving ambient shapes (not just tiny wisps), and draw
decorative arcs/curves across the canvas that breathe with the music of the
simulation.

**Bootstrap Context:**
Read `js/gl.js` (TASK-02) in full — you will add new geometry passes to GLRenderer.
Read `js/noise.js` — `noise2D(x, y)` is the base function; `flowField` combines it
at multiple frequencies. You need the same behavior in GLSL or CPU-side.
Key facts:
- Current behavior: 60 tiny point particles (1.2px radius) clustered near center
  following a flow field, plus ripples from the search bar (top-center).
- Target behavior (keep existing points, ADD these):
  a) Large ambient blobs: 4–8 soft radial gradient circles, 80–200px radius,
     very slow drift (0.05x particle speed), very low alpha (0.03–0.07),
     distributed across full viewport at init.
  b) Flow-field curves: 6–10 long Bézier-like polylines tracing streamlines
     of the flow field across the full canvas, fading in/out over time. These
     replace the visual impression of "just a glow in the middle".
  c) Ripples should expand to full viewport scale (target radius: 80% of
     `min(width, height)` not current 900px fixed).
Stop reading once you understand the `addRipple` and particle systems.

**Files to Modify:**
- `js/gl.js` — MODIFY — add new geometry passes (blobs, streamlines); update ripple scale

**Inputs:**
- Canvas dimensions from `GLRenderer.resize()` — already available
- `app.variant` — accessible via `app.perf` is not the right path. Expose variant
  to GLRenderer via a new method: `setVariant(variant: string): void` called from
  `Animations` constructor after `pickVariant()`.

**Interface Contract additions to GLRenderer:**
```js
// Called once after construction. Affects streamline color tint.
setVariant(variant: 'undertow' | 'dissolve' | 'ripple' | 'vapor'): void
```

⚠️ CRITICAL CONSTRAINTS:
- New geometry passes must be additive-blended (same as particles). Do not use
  alpha blending that would produce a solid-looking rectangle.
- Blob positions must be initialized to cover the full viewport — not clustered
  at center. Distribute using a seeded PRNG (mulberry32 with seed 0xdeadbeef).
- Streamline polylines must use `gl.LINE_STRIP`. Maximum 200 points per line.
- Adding these passes must not increase frame time by more than 1ms on a 2020
  mid-range laptop at 1080p. Keep geometry counts conservative.
- Ripple `target` radius must be computed as `0.8 * Math.min(canvas.width, canvas.height) / dpr`.
  Do not hard-code 900.

**Must NOT do:**
- Do not change the particle system from TASK-02.
- Do not add new public methods except `setVariant()`.
- Do not modify `animations.js` beyond calling `glr.setVariant()`.

**Acceptance Criteria:**
- [ ] At least 4 soft ambient blobs visible across the viewport at page load
- [ ] At least 6 flowing polylines visible crossing the full canvas
- [ ] Ripples visually expand to near the canvas edge before fading
- [ ] Frame time (measured via `performance.now()` before/after `tick()`) stays ≤ 3ms at `particleBudget = 60`
- [ ] The canvas does not look like an empty dark rectangle in its corners

**Edge Cases:**
- Portrait viewport (mobile) — blobs and streamlines must still distribute across full height
- Resize — blob and streamline home positions must be recomputed in `resize()`
- Very small viewport (<400px wide) — reduce streamline count to 3

**Known Risks:**
- Codex may compute streamlines in the vertex shader — compute them CPU-side
  instead (follow the flow field for N steps from a seed point, upload as VBO).
  Recompute once per 4 seconds or on resize, not every frame.

---

---
## TASK-05: Physics flushDOM Batching

**Objective:** Reduce the per-frame DOM write cost in `physics.flushDOM()` at
high item counts by skipping writes for items that haven't moved meaningfully,
and by coarsening transform strings at high item counts.

**Bootstrap Context:**
Read `js/physics.js` lines 255-380 — `_loop()` and `flushDOM()`.
Key facts:
- `flushDOM()` writes `node.el.style.transform` for every node every frame.
  At 500 nodes this is 500 style mutations per frame.
- Each node has `node.x`, `node.y`, `node.vx`, `node.vy` — velocity is already tracked.
- `cssScaleFor(node)` recomputes scale every frame — result only changes when
  `node.rel` or `node.state` changes, which is rare.
- `node.state` is `'idle' | 'match' | 'unmatch'`.
- Deep sleep (`this.sleeping = true`) already stops the loop entirely when
  settled. The problem is the burst of writes while items settle.
Stop reading after `flushDOM()`.

**Files to Modify:**
- `js/physics.js` — MODIFY — `flushDOM()` and `_loop()` only

**Approach:**

1. **Skip threshold:** If `Math.abs(node.vx) + Math.abs(node.vy) < SKIP_THRESHOLD`
   (use 0.05) AND `node._lastX` and `node._lastY` are within 0.5px of current
   position, skip the style write. Store `node._lastX`, `node._lastY` after each write.

2. **String coarsening:** When `app.perf.tier === 'minimal'`, round to 1 decimal
   place (as now). When `tier === 'reduced'` or `'minimal'`, use `toFixed(0)` (integer
   pixels). Items are 80-160px elements — sub-pixel precision is not perceptible at
   this scale.

3. **Scale caching:** Cache `cssScaleFor` result on the node as `node._cachedScale`.
   Recompute only when `node.state` or `node.rel` changes (track with `node._lastState`,
   `node._lastRel`). 99% of frames for idle items this is a no-op.

**Interface Contract:**
`flushDOM()` signature unchanged. No new public methods.

⚠️ CRITICAL CONSTRAINTS:
- `node._lastX`, `node._lastY`, `node._cachedScale`, `node._lastState`, `node._lastRel`
  are new fields on physics nodes. Initialize them in `build()` when the node is created.
- Skip threshold must NOT apply to nodes in `state === 'match'` or `'unmatch'` —
  those must always write (they are moving to new positions).
- Do not change the spring/damping/repulsion math — only `flushDOM()` and the
  scale cache are in scope.

**Must NOT do:**
- Do not touch `build()`, `applySearch()`, `restore()`, `_wake()`, or the sleep logic.
- Do not modify `main.js` or `animations.js`.

**Acceptance Criteria:**
- [ ] At 50 fully-settled idle items: `flushDOM()` writes 0 style mutations per frame
- [ ] At 500 fully-settled idle items: same — 0 writes (deep sleep catches this,
      but skip threshold catches the transition before sleep)
- [ ] During active search (items moving): all `match` and `unmatch` nodes write every frame
- [ ] `cssScaleFor` is not called more than once per state/rel change per node

**Edge Cases:**
- Node `el` is null (item removed mid-frame) → skip with `if (!n.el) continue` (already present, keep it)
- `build()` called again (CRUD rebuild) → `_lastX/_lastY/_cachedScale` reset for all new nodes

**Known Risks:**
- Codex may add the skip threshold to sleeping nodes — redundant but harmless.
- Codex may use `toFixed(0)` for all tiers — only apply for `reduced`/`minimal`.
  `full` tier keeps `toFixed(1)` for smooth sub-pixel motion.

---

---
## TASK-06: Tiered Animation Quality Gates

**Objective:** Gate CSS filter effects, dust particles, and item hover
animations based on `app.perf.tier` so that at `'minimal'` tier the browser
compositor has almost no filter work to do.

**Bootstrap Context:**
Read `js/animations.js` — specifically `onFilter()`, `onLaunch()`, `_spawnDust()`.
Read `js/perf.js` (TASK-01) — `tier`, `dustEnabled`, `itemFiltersEnabled`, `ripplesEnabled`.
Read `css/animations.css` — `focus-shimmer`, `bloom-breathe` keyframes.
Key facts:
- `onFilter()` calls `node.el.animate([{filter:'brightness(1)'}, ...])` on the
  top-ranked match. CSS `filter: blur()` and `brightness()` trigger compositor
  layers on every item they touch.
- `_spawnDust()` adds particles to `this.particles[]` — at `'minimal'` tier these
  should not be spawned at all.
- `onLaunch()` runs a `brightness → blur` animation on the departing item.
- The `body[data-tier]` attribute doesn't exist yet — add it.
Stop reading after `_spawnDust`.

**Files to Modify:**
- `js/animations.js` — MODIFY — add tier checks to effect methods
- `js/main.js` — MODIFY — set `document.body.dataset.tier = app.perf.tier` after perf init
- `css/animations.css` — MODIFY — add `[data-tier="minimal"]` rules disabling shimmer/bloom

**Approach per tier:**

| Effect | full | reduced | minimal |
|---|---|---|---|
| `filter: brightness()` on match items | ✓ | ✓ | ✗ skip |
| `filter: blur()` on unmatch items | ✓ | ✗ skip | ✗ skip |
| Dust particles on dissolve | ✓ | ✗ skip | ✗ skip |
| Dust particles on launch | ✓ | ✓ (count/2) | ✗ skip |
| Ripples on search | ✓ | ✓ | ✗ skip |
| `focus-shimmer` CSS animation | ✓ | ✓ | ✗ disable via CSS |
| `bloom-breathe` CSS animation | ✓ | ✓ | ✗ disable via CSS |

**Interface Contract:**
No public method signatures change. `onFilter`, `onLaunch`, `_spawnDust` keep
their signatures. Add tier checks inside.

⚠️ CRITICAL CONSTRAINTS:
- Do not change what `onFilter` and `onLaunch` do for `full` tier — only skip/reduce
  for `reduced` and `minimal`. The `full` path must be byte-identical to the current behavior.
- `document.body.dataset.tier` must be set in `main.js` before `new Animations(app)`
  is called, so CSS rules are active from first frame.
- CSS disabling of animations must use `animation: none !important` inside
  `[data-tier="minimal"]` selectors. Do not remove animation classes from elements.

**Must NOT do:**
- Do not modify `search.js` — it calls `animations.onFilter()` and must not change.
- Do not modify `physics.js`.
- Do not modify any CSS file other than `animations.css`.

**Acceptance Criteria:**
- [ ] `document.body.dataset.tier` is set to `'full'`, `'reduced'`, or `'minimal'` at boot
- [ ] At `'minimal'` tier: no `filter:` CSS is written to item elements during search
- [ ] At `'minimal'` tier: no dust particles are created in `this.particles`
- [ ] At `'full'` tier: behavior is identical to pre-change behavior
- [ ] `focus-shimmer` keyframe animation is disabled via CSS at `minimal` tier

**Edge Cases:**
- User goes from 50 items to 500 via import mid-session → tier is fixed at boot,
  does not re-evaluate. Document this in a comment.
- `reduced` dust on launch: pass `Math.ceil(count / 2)` to `glr.addBurst()`.

**Known Risks:**
- Codex may add tier checks to the WebGL path (GLRenderer) instead of the JS
  Animations layer — tier gates belong in `animations.js`, not `gl.js`.
- Codex may re-evaluate tier dynamically — do not. It is computed once at boot.

---

## RISK REGISTER

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | WebGL context acquired after 2D context was already taken (or vice versa) | HIGH | `animations.js` must check `app.perf.useWebGL` BEFORE calling `getContext()`. Only one context type per canvas element. |
| R2 | `_bgTick` rAF loop runs in both GL and 2D paths simultaneously | HIGH | Ensure the constructor only starts ONE loop. Use `if (this.glr) { ... } else { ... }` branching. |
| R3 | `physics.flushDOM` skip threshold causes items to freeze visually during reveal | MEDIUM | Apply skip threshold ONLY after the node's first frame has written. Use `node._firstWriteDone` flag. |
| R4 | New streamline VBOs not released on `GLRenderer.destroy()` | MEDIUM | `destroy()` must call `gl.deleteBuffer()` for every VBO created. |
| R5 | Codex removes 2D canvas fallback | HIGH | Task-03 explicitly states "do not delete the 2D path". Review this first. |
| R6 | `particleBudget` of 15 (minimal tier) causes no visible effect | LOW | 15 points at 2.5px with additive blend are visible. Test at 1080p. |
| R7 | Theme cycle breaks hue values passed to WebGL | MEDIUM | In `animations.js`, re-read CSS vars and call `glr.updateHues()` whenever `_bgTick` detects a theme change. Cache last hue values and compare. |

---

## VALIDATION CHECKLIST

Run after all tasks are complete:

- [ ] `python -m http.server 8000` → no console errors on load
- [ ] Tab out and back → no rAF loops running while hidden (check DevTools Performance tab)
- [ ] Load with 4 items (seed data.json) → `app.perf.tier === 'full'`
- [ ] Load with 400 items → `app.perf.tier === 'minimal'`, no dust, no blur filters
- [ ] Search "docs" → items animate to serpentine curve without jank
- [ ] Click an item → launch animation plays, no console errors
- [ ] ◐ button → theme cycles through all 4 themes without WebGL artifact
- [ ] Resize window → canvas fills viewport, no visual tearing
- [ ] Full canvas corners visible with ambient blobs and streamlines (not just center glow)
- [ ] DevTools → Performance → no long tasks (>50ms) during idle at 500 items
