// js/noise.js
// Lightweight 2D value-noise with smooth interpolation.
// Faster than classic Perlin, plenty pretty for a flow field.

const PERM_SIZE = 256;
const perm = new Uint8Array(PERM_SIZE * 2);
(function seed() {
  const p = new Uint8Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) p[i] = i;
  // deterministic shuffle so the flow field is reproducible per session
  let s = 0x1a2b3c4d;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < PERM_SIZE * 2; i++) perm[i] = p[i & (PERM_SIZE - 1)];
})();

// 5th-order smoothstep
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function hash(xi, yi) {
  return perm[(perm[xi & 255] + yi) & 511] / 255;
}

export function noise2D(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const xf = x - x0, yf = y - y0;
  const u = fade(xf), v = fade(yf);
  const aa = hash(x0,   y0);
  const ba = hash(x0+1, y0);
  const ab = hash(x0,   y0+1);
  const bb = hash(x0+1, y0+1);
  const x1 = lerp(aa, ba, u);
  const x2 = lerp(ab, bb, u);
  return lerp(x1, x2, v); // 0..1
}

// Flow vector at (x, y) at time t — used for drift forces
// Returns [fx, fy], magnitudes in [-1, 1]
export function flowField(x, y, t) {
  const n1 = noise2D(x * 0.0012 + t * 0.00007, y * 0.0012);
  const n2 = noise2D(x * 0.0014, y * 0.0014 + t * 0.00008);
  const a = n1 * Math.PI * 4;
  return [Math.cos(a) * (n2 - .5) * 2, Math.sin(a) * (n2 - .5) * 2];
}
