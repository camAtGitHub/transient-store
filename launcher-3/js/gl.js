// js/gl.js
// Raw WebGL2 backdrop renderer: particles + ripples + ambient blobs + streamlines.

const MAX_RIPPLES = 8;
const MAX_LINE_POINTS = 200;

export class GLRenderer {
  constructor(canvas, particleCount, dpr) {
    this.canvas = canvas;
    this.particleCount = Math.max(0, particleCount | 0);
    this.dpr = Math.max(1, dpr || 1);
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.pixelWidth = Math.max(1, Math.floor(this.width * this.dpr));
    this.pixelHeight = Math.max(1, Math.floor(this.height * this.dpr));
    this.variant = 'undertow';
    this.ready = false;

    this.hueA = 210;
    this.hueB = 285;

    this.trails = [];
    this.bursts = [];
    this.ripples = [];
    this.streamlines = [];
    this.blobs = [];
    this._lastLineRebuild = 0;

    this._initContext();
    if (!this.ready) return;

    this._initPrograms();
    this._initParticleBuffers();
    this._initBlobBuffers();
    this._initLineBuffers();
    this._seedTrails();
    this._seedAmbient();
    this.resize(this.width, this.height, this.dpr);
  }

  updateHues(hueA, hueB) {
    this.hueA = Number.isFinite(hueA) ? hueA : this.hueA;
    this.hueB = Number.isFinite(hueB) ? hueB : this.hueB;
  }

  setVariant(variant) {
    this.variant = variant || 'undertow';
  }

  tick(t, dt) {
    if (!this.ready) return;
    const gl = this.gl;
    const w = this.width;
    const h = this.height;

    this._updateParticles(t, dt, w, h);
    this._updateBursts(dt);
    this._updateRipples(dt);
    this._updateBlobs(t, dt, w, h);
    if (t - this._lastLineRebuild > 4000) {
      this._buildStreamlines(t, w, h);
      this._lastLineRebuild = t;
    }

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    this._drawBlobs(t);
    this._drawStreamlines(t);
    this._drawParticles();
    this._drawRipples();
  }

  addRipple(x, y) {
    if (!this.ready) return;
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    const target = 0.8 * Math.min(this.canvas.width, this.canvas.height) / this.dpr;
    this.ripples.push({ x, y, r: 0, target, life: 1600, maxLife: 1600 });
  }

  addBurst(x, y, count, kind) {
    if (!this.ready) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = kind === 'launch' ? 2 + Math.random() * 4 : 0.5 + Math.random() * 2;
      this.bursts.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 0.8 + Math.random() * 1.8,
        life: 600 + Math.random() * 400,
        maxLife: 1000,
        kind,
      });
    }
    if (this.bursts.length > 600) this.bursts.splice(0, this.bursts.length - 600);
  }

  resize(width, height, dpr) {
    if (!this.ready) return;
    this.width = Math.max(1, width | 0);
    this.height = Math.max(1, height | 0);
    this.dpr = Math.max(1, dpr || 1);
    this.pixelWidth = Math.max(1, Math.floor(this.width * this.dpr));
    this.pixelHeight = Math.max(1, Math.floor(this.height * this.dpr));

    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';

    this._seedAmbient();
    this._buildStreamlines(performance.now(), this.width, this.height);

    this.gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
  }

  destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this._particleTex) gl.deleteTexture(this._particleTex);
    if (this._particleIndexBuffer) gl.deleteBuffer(this._particleIndexBuffer);
    if (this._particleQuadBuffer) gl.deleteBuffer(this._particleQuadBuffer);
    if (this._rippleBuffer) gl.deleteBuffer(this._rippleBuffer);
    if (this._blobCenterBuffer) gl.deleteBuffer(this._blobCenterBuffer);
    if (this._blobOffsetBuffer) gl.deleteBuffer(this._blobOffsetBuffer);
    if (this._lineBuffer) gl.deleteBuffer(this._lineBuffer);
    this.ready = false;
    this.gl = null;
  }

  _initContext() {
    try {
      const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
      if (!gl) return;
      this.gl = gl;
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  _initPrograms() {
    const gl = this.gl;
    this._particleProgram = createProgram(gl, `#version 300 es
      precision highp float;
      in float a_index;
      uniform sampler2D u_posTex;
      uniform float u_texW;
      uniform vec2 u_res;
      uniform float u_dpr;
      out float v_mix;
      void main() {
        float i = a_index;
        float x = mod(i, u_texW);
        float y = floor(i / u_texW);
        vec2 uv = vec2((x + 0.5) / u_texW, (y + 0.5) / u_texW);
        vec4 p = texture(u_posTex, uv);
        vec2 clip = vec2((p.x / u_res.x) * 2.0 - 1.0, 1.0 - (p.y / u_res.y) * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
        gl_PointSize = 2.5 * u_dpr;
        v_mix = clamp(p.x / max(u_res.x, 1.0), 0.0, 1.0);
      }
    `, `#version 300 es
      precision highp float;
      in float v_mix;
      uniform vec3 u_rgbA;
      uniform vec3 u_rgbB;
      out vec4 outColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.1, 0.5, r)) * 0.10;
        vec3 col = mix(u_rgbA, u_rgbB, v_mix);
        outColor = vec4(col * alpha, alpha);
      }
    `);

    this._rippleProgram = createProgram(gl, `#version 300 es
      precision highp float;
      in vec2 a_pos;
      uniform vec2 u_res;
      void main() {
        vec2 clip = vec2((a_pos.x / u_res.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_res.y) * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
      }
    `, `#version 300 es
      precision highp float;
      uniform vec3 u_rgb;
      uniform float u_alpha;
      out vec4 outColor;
      void main() {
        outColor = vec4(u_rgb * u_alpha, u_alpha);
      }
    `);

    this._blobProgram = createProgram(gl, `#version 300 es
      precision highp float;
      in vec2 a_center;
      in vec2 a_offset;
      uniform vec2 u_res;
      uniform float u_radius;
      out vec2 v_uv;
      void main() {
        vec2 p = a_center + a_offset * u_radius;
        vec2 clip = vec2((p.x / u_res.x) * 2.0 - 1.0, 1.0 - (p.y / u_res.y) * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
        v_uv = a_offset;
      }
    `, `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform vec3 u_rgb;
      uniform float u_alpha;
      out vec4 outColor;
      void main() {
        float r = length(v_uv);
        if (r > 1.0) discard;
        float falloff = pow(1.0 - r, 1.8) * u_alpha;
        outColor = vec4(u_rgb * falloff, falloff);
      }
    `);

    this._lineProgram = this._rippleProgram;
  }

  _initParticleBuffers() {
    const gl = this.gl;
    const texW = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, this.particleCount))));
    this._texW = texW;
    this._posData = new Float32Array(texW * texW * 4);
    const indices = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      indices[i] = i;
      this.trails.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        life: 300 + Math.random() * 800,
      });
    }
    this._syncPosData();

    this._particleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._particleTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texW, texW, 0, gl.RGBA, gl.FLOAT, this._posData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._particleIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._particleIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this._particleVAO = gl.createVertexArray();
    gl.bindVertexArray(this._particleVAO);
    const idxLoc = gl.getAttribLocation(this._particleProgram, 'a_index');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._particleIndexBuffer);
    gl.enableVertexAttribArray(idxLoc);
    gl.vertexAttribPointer(idxLoc, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _initBlobBuffers() {
    const gl = this.gl;
    this._blobCenterBuffer = gl.createBuffer();
    this._blobOffsetBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._blobOffsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
  }

  _initLineBuffers() {
    const gl = this.gl;
    this._lineBuffer = gl.createBuffer();
    this._rippleBuffer = gl.createBuffer();
  }

  _seedTrails() {
    for (let i = 0; i < this.trails.length; i++) {
      this.trails[i].x = Math.random() * this.width;
      this.trails[i].y = Math.random() * this.height;
      this.trails[i].life = 300 + Math.random() * 800;
    }
    this._syncPosData();
  }

  _seedAmbient() {
    const rnd = mulberry32(0xdeadbeef);
    const blobCount = this.particleCount <= 15 ? 4 : 6;
    this.blobs = [];
    for (let i = 0; i < blobCount; i++) {
      this.blobs.push({
        x: rnd() * this.width,
        y: rnd() * this.height,
        homeX: rnd() * this.width,
        homeY: rnd() * this.height,
        radius: 80 + rnd() * 120,
        phase: rnd() * Math.PI * 2,
        alpha: 0.03 + rnd() * 0.04,
      });
    }
    this._buildStreamlines(performance.now(), this.width, this.height);
  }

  _buildStreamlines(t, w, h) {
    const lineCount = w < 400 ? 3 : (this.particleCount <= 15 ? 6 : 8);
    this.streamlines = [];
    const rnd = mulberry32(((t | 0) ^ 0xdeadbeef) >>> 0);

    for (let i = 0; i < lineCount; i++) {
      let x = rnd() * w;
      let y = rnd() * h;
      const points = [];
      for (let s = 0; s < MAX_LINE_POINTS; s++) {
        points.push(x, y);
        const [fx, fy] = flowFieldLite(x, y, t + i * 300);
        x += fx * 12;
        y += fy * 12;
        if (x < -50 || x > w + 50 || y < -50 || y > h + 50) break;
      }
      this.streamlines.push({ points: new Float32Array(points), alpha: 0.03 + rnd() * 0.05 });
    }
  }

  _updateParticles(t, dt, w, h) {
    for (let i = 0; i < this.trails.length; i++) {
      const p = this.trails[i];
      const [fx, fy] = flowFieldLite(p.x, p.y, t);
      p.x += fx * 1.2;
      p.y += fy * 1.2;
      p.life -= dt;
      if (p.life <= 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.life = 400 + Math.random() * 600;
      }
    }
    this._syncPosData();
  }

  _updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const p = this.bursts[i];
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) this.bursts.splice(i, 1);
    }
  }

  _updateRipples(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += (r.target - r.r) * 0.06;
      r.life -= dt;
      if (r.life <= 0) this.ripples.splice(i, 1);
    }
  }

  _updateBlobs(t, dt, w, h) {
    const f = dt / 16.6667;
    for (const b of this.blobs) {
      const [fx, fy] = flowFieldLite(b.x * 0.6, b.y * 0.6, t + b.phase * 200);
      b.x += fx * 0.25 * f;
      b.y += fy * 0.25 * f;
      b.x += (b.homeX - b.x) * 0.0007 * f;
      b.y += (b.homeY - b.y) * 0.0007 * f;
      if (b.x < -150) b.x = w + 150;
      if (b.x > w + 150) b.x = -150;
      if (b.y < -150) b.y = h + 150;
      if (b.y > h + 150) b.y = -150;
    }
  }

  _syncPosData() {
    for (let i = 0; i < this.trails.length; i++) {
      const o = i * 4;
      this._posData[o] = this.trails[i].x;
      this._posData[o + 1] = this.trails[i].y;
      this._posData[o + 2] = 0;
      this._posData[o + 3] = 1;
    }
  }

  _drawParticles() {
    const gl = this.gl;
    if (this.particleCount <= 0) return;

    gl.useProgram(this._particleProgram);
    gl.bindVertexArray(this._particleVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._particleTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this._texW, this._texW, gl.RGBA, gl.FLOAT, this._posData);

    gl.uniform1i(gl.getUniformLocation(this._particleProgram, 'u_posTex'), 0);
    gl.uniform1f(gl.getUniformLocation(this._particleProgram, 'u_texW'), this._texW);
    gl.uniform2f(gl.getUniformLocation(this._particleProgram, 'u_res'), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this._particleProgram, 'u_dpr'), this.dpr);

    const [ar, ag, ab] = hslToRgb(this.hueA, 45, 55);
    const [br, bg, bb] = hslToRgb(this.hueB, 70, 65);
    gl.uniform3f(gl.getUniformLocation(this._particleProgram, 'u_rgbA'), ar, ag, ab);
    gl.uniform3f(gl.getUniformLocation(this._particleProgram, 'u_rgbB'), br, bg, bb);

    gl.drawArrays(gl.POINTS, 0, this.particleCount);

    if (this.bursts.length > 0) {
      const burst = new Float32Array(this.bursts.length * 4);
      for (let i = 0; i < this.bursts.length; i++) {
        burst[i * 4] = this.bursts[i].x;
        burst[i * 4 + 1] = this.bursts[i].y;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Math.min(this._texW, this.bursts.length), 1, gl.RGBA, gl.FLOAT, burst);
      gl.drawArrays(gl.POINTS, 0, Math.min(this.bursts.length, this.particleCount));
      this._syncPosData();
    }

    gl.bindVertexArray(null);
  }

  _drawRipples() {
    const gl = this.gl;
    if (this.ripples.length === 0) return;

    gl.useProgram(this._rippleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._rippleBuffer);
    const posLoc = gl.getAttribLocation(this._rippleProgram, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(this._rippleProgram, 'u_res'), this.width, this.height);

    const [rr, rg, rb] = hslToRgb(this.hueA, 70, 65);
    gl.uniform3f(gl.getUniformLocation(this._rippleProgram, 'u_rgb'), rr, rg, rb);

    for (const r of this.ripples) {
      const segments = 72;
      const verts = new Float32Array(segments * 2);
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        verts[i * 2] = r.x + Math.cos(a) * r.r;
        verts[i * 2 + 1] = r.y + Math.sin(a) * r.r;
      }
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.uniform1f(gl.getUniformLocation(this._rippleProgram, 'u_alpha'), Math.max(0, r.life / r.maxLife) * 0.28);
      gl.drawArrays(gl.LINE_STRIP, 0, segments);
    }
  }

  _drawBlobs(t) {
    const gl = this.gl;
    if (this.blobs.length === 0) return;
    gl.useProgram(this._blobProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._blobOffsetBuffer);
    const offsetLoc = gl.getAttribLocation(this._blobProgram, 'a_offset');
    gl.enableVertexAttribArray(offsetLoc);
    gl.vertexAttribPointer(offsetLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._blobCenterBuffer);
    const centerLoc = gl.getAttribLocation(this._blobProgram, 'a_center');
    gl.enableVertexAttribArray(centerLoc);
    gl.vertexAttribPointer(centerLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(gl.getUniformLocation(this._blobProgram, 'u_res'), this.width, this.height);

    const [ra, ga, ba] = hslToRgb(this.hueA + 10, 50, 58);
    const [rb, gb, bb] = hslToRgb(this.hueB - 15, 55, 55);

    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([b.x, b.y, b.x, b.y, b.x, b.y, b.x, b.y, b.x, b.y, b.x, b.y]), gl.DYNAMIC_DRAW);
      const mix = 0.5 + 0.5 * Math.sin(t * 0.0002 + b.phase);
      gl.uniform3f(gl.getUniformLocation(this._blobProgram, 'u_rgb'), ra * (1 - mix) + rb * mix, ga * (1 - mix) + gb * mix, ba * (1 - mix) + bb * mix);
      gl.uniform1f(gl.getUniformLocation(this._blobProgram, 'u_radius'), b.radius);
      gl.uniform1f(gl.getUniformLocation(this._blobProgram, 'u_alpha'), b.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  _drawStreamlines(t) {
    const gl = this.gl;
    if (this.streamlines.length === 0) return;
    gl.useProgram(this._lineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._lineBuffer);
    const posLoc = gl.getAttribLocation(this._lineProgram, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(gl.getUniformLocation(this._lineProgram, 'u_res'), this.width, this.height);

    let tint = this.hueA;
    if (this.variant === 'dissolve') tint = this.hueB;
    if (this.variant === 'ripple') tint = (this.hueA + this.hueB) * 0.5;
    if (this.variant === 'vapor') tint = this.hueB - 20;
    const [r, g, b] = hslToRgb(tint, 52, 58);
    gl.uniform3f(gl.getUniformLocation(this._lineProgram, 'u_rgb'), r, g, b);

    for (let i = 0; i < this.streamlines.length; i++) {
      const line = this.streamlines[i];
      const breathe = 0.65 + 0.35 * Math.sin(t * 0.001 + i * 0.9);
      gl.uniform1f(gl.getUniformLocation(this._lineProgram, 'u_alpha'), line.alpha * breathe);
      gl.bufferData(gl.ARRAY_BUFFER, line.points, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINE_STRIP, 0, line.points.length / 2);
    }
  }
}

function createShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || 'shader compile failed');
  }
  return sh;
}

function createProgram(gl, vs, fs) {
  const p = gl.createProgram();
  const v = createShader(gl, gl.VERTEX_SHADER, vs);
  const f = createShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(log || 'program link failed');
  }
  return p;
}

function hslToRgb(h, s, l) {
  const hue = ((((h % 360) + 360) % 360) / 360);
  const sat = Math.max(0, Math.min(1, s / 100));
  const lig = Math.max(0, Math.min(1, l / 100));

  if (sat === 0) return [lig, lig, lig];

  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const r = hueToRgb(p, q, hue + 1 / 3);
  const g = hueToRgb(p, q, hue);
  const b = hueToRgb(p, q, hue - 1 / 3);
  return [r, g, b];
}

function hueToRgb(p, q, t) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function flowFieldLite(x, y, t) {
  const n1 = Math.sin(x * 0.0012 + t * 0.00007) * Math.cos(y * 0.0012) * 0.5 + 0.5;
  const n2 = Math.sin(x * 0.0014) * Math.cos(y * 0.0014 + t * 0.00008) * 0.5 + 0.5;
  const a = n1 * Math.PI * 4;
  return [Math.cos(a) * (n2 - 0.5) * 2, Math.sin(a) * (n2 - 0.5) * 2];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
