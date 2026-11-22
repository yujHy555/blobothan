import * as BABYLON from 'babylonjs';

/**
 * CARDBOARD ART — photoreal hand-crafted cardboard diorama imagery.
 * Warm kraft construction: fluted corrugated cut edges, tiny cardboard bricks,
 * moss tufts, windmills, clock tower, layered cut-paper mountains and soft
 * golden light. The image carries ALL realism — scene geometry is flat planes.
 */
export type RGB = [number, number, number];

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const css = (c: RGB, a = 1) => `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${a})`;
const shade = (c: RGB, f: number): RGB => [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];

// Warm, light kraft palette from the reference diorama.
const KRAFT: RGB = [0.80, 0.68, 0.50];
const KRAFT_L: RGB = [0.92, 0.83, 0.66];
const KRAFT_D: RGB = [0.52, 0.40, 0.27];
const CREAM: RGB = [0.95, 0.88, 0.71];
const BRICK: RGB[] = [[0.72, 0.44, 0.32], [0.78, 0.52, 0.38], [0.66, 0.38, 0.28], [0.84, 0.60, 0.44]];
const MOSS: RGB = [0.44, 0.58, 0.30];
const GOLD: RGB = [1.0, 0.80, 0.40];
const INK: RGB = [0.26, 0.20, 0.15];

/** Signature fluted corrugated-cardboard cut edge. */
function corrugated(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical: boolean, rand: () => number) {
  ctx.save();
  ctx.fillStyle = css(KRAFT_L);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = css(KRAFT_D, 0.7);
  ctx.lineWidth = 1.3;
  const step = 6;
  if (!vertical) {
    for (let i = 0; i < w; i += step) {
      ctx.beginPath(); ctx.moveTo(x + i, y);
      ctx.quadraticCurveTo(x + i + step / 2, y + h + 2, x + i + step, y); ctx.stroke();
    }
    ctx.fillStyle = css(KRAFT_D, 0.5); ctx.fillRect(x, y, w, 2);
  } else {
    for (let i = 0; i < h; i += step) {
      ctx.beginPath(); ctx.moveTo(x, y + i);
      ctx.quadraticCurveTo(x + w + 2, y + i + step / 2, x, y + i + step); ctx.stroke();
    }
  }
  ctx.restore();
}

function moss(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number, s = 1) {
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = css(shade(MOSS, 0.65 + rand() * 0.6), 0.8);
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * 28 * s, y - rand() * 7 * s,
      (2 + rand() * 3) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bricks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number) {
  const bw = 20, bh = 10;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let row = 0; y + row * bh < y + h; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let bx = -off; x + bx < x + w; bx += bw) {
      const c = BRICK[Math.floor(rand() * BRICK.length)];
      ctx.fillStyle = css(shade(c, 0.85 + rand() * 0.25));
      ctx.fillRect(x + bx + 1, y + row * bh + 1, bw - 2, bh - 2);
      ctx.fillStyle = css(shade(c, 1.25), 0.28);
      ctx.fillRect(x + bx + 1, y + row * bh + 1, bw - 2, 2);
    }
  }
  ctx.restore();
}

/** Layered scalloped cardboard foliage tree. */
function cardboardTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, scale: number, rand: () => number) {
  const h = 70 * scale;
  ctx.fillStyle = css(KRAFT_D);
  ctx.fillRect(x - 4 * scale, groundY - h * 0.45, 8 * scale, h * 0.45);
  const layers = 6;
  for (let l = 0; l < layers; l++) {
    const ly = groundY - h + l * (h * 0.13);
    const rw = (46 - l * 4) * scale;
    ctx.fillStyle = css(shade(KRAFT, 0.78 + l * 0.05));
    for (let s = 0; s < 7; s++) {
      const a = (s / 6) * Math.PI;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rw * 0.6, ly + Math.sin(a) * 6 * scale,
        (11 - l * 0.5) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Windmill with rotating-looking cardboard sails. */
function windmill(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = css(shade(KRAFT_D, 1.1));
  ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 2);
    ctx.fillStyle = css(CREAM);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.16, -r); ctx.lineTo(-r * 0.16, -r); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(KRAFT_D, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore(); void rand;
}

/** Clock tower façade with a real clock face. */
function clockTower(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number, rand: () => number) {
  const top = baseY - h;
  bricks(ctx, x, top, w, h, rand);
  corrugated(ctx, x + w - 7, top, 7, h, true, rand);
  const rh = 28;
  ctx.fillStyle = css(shade(KRAFT_D, 1.2));
  ctx.beginPath(); ctx.moveTo(x - 6, top); ctx.lineTo(x + w / 2, top - rh); ctx.lineTo(x + w + 6, top); ctx.closePath(); ctx.fill();
  corrugated(ctx, x - 4, top - 3, w + 8, 8, false, rand);
  const cx = x + w / 2, cy = top + 42;
  ctx.fillStyle = css(CREAM); ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = css(KRAFT_D); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = css(INK); ctx.lineWidth = 2.5;
  for (let t = 0; t < 12; t++) { const a = t * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 10, cy - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 14); ctx.stroke();
}

/** Cottage: brick or kraft body, corrugated roof, warm windows, awning, moss. */
function cottage(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number, rand: () => number, detail: number, emit: CanvasRenderingContext2D | null) {
  const top = baseY - h;
  ctx.fillStyle = css(INK, 0.16); ctx.fillRect(x + 5, top + 5, w, h);
  if (rand() > 0.42) bricks(ctx, x, top, w, h, rand);
  else {
    const g = ctx.createLinearGradient(x, top, x + w, baseY);
    g.addColorStop(0, css(shade(KRAFT_L, 1.02))); g.addColorStop(1, css(shade(KRAFT, 0.82)));
    ctx.fillStyle = g; ctx.fillRect(x, top, w, h);
  }
  corrugated(ctx, x + w - 7, top, 7, h, true, rand);
  const rh = 18 + rand() * 16;
  ctx.fillStyle = css(shade(KRAFT_D, 1.18));
  ctx.beginPath(); ctx.moveTo(x - 7, top); ctx.lineTo(x + w / 2, top - rh); ctx.lineTo(x + w + 7, top); ctx.closePath(); ctx.fill();
  corrugated(ctx, x - 5, top - 2, w + 10, 8, false, rand);
  moss(ctx, x + w * 0.3, top + 3, rand, 1.1);
  // round attic window
  if (w > 100 && rand() > 0.4) {
    ctx.fillStyle = css(INK); ctx.beginPath(); ctx.arc(x + w / 2, top + 30, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css(GOLD, 0.85); ctx.beginPath(); ctx.arc(x + w / 2, top + 30, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css(INK); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, top + 30); ctx.lineTo(x + w / 2 + 9, top + 30); ctx.stroke();
  }
  const cols = Math.max(1, Math.floor(w / 42));
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
    if (rand() > 0.82) continue;
    const wx = x + 12 + c * ((w - 20) / cols), wy = top + 52 + r * 52;
    if (wy + 26 > baseY - 12) continue;
    ctx.fillStyle = css(INK); ctx.fillRect(wx - 4, wy - 4, 32, 36);
    const lit = rand() > 0.2;
    ctx.fillStyle = lit ? css(GOLD, 0.95) : css(shade(INK, 2.2));
    ctx.fillRect(wx, wy, 24, 28);
    ctx.fillStyle = css(INK, 0.8); ctx.fillRect(wx + 11, wy, 2, 28); ctx.fillRect(wx, wy + 13, 24, 2);
    if (lit) {
      const g = ctx.createRadialGradient(wx + 12, wy + 14, 2, wx + 12, wy + 14, 34);
      g.addColorStop(0, css(GOLD, 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(wx - 16, wy - 16, 56, 60);
      // Cozy emission: paint this random window into the emissive map so the
      // glow layer gives it a warm candlelit halo.
      if (emit) {
        const eg = emit.createRadialGradient(wx + 12, wy + 14, 1, wx + 12, wy + 14, 30);
        eg.addColorStop(0, css([1.0, 0.82, 0.5], 0.95));
        eg.addColorStop(0.4, css([1.0, 0.68, 0.3], 0.45));
        eg.addColorStop(1, 'rgba(0,0,0,0)');
        emit.fillStyle = eg;
        emit.fillRect(wx - 18, wy - 18, 60, 64);
      }
    }
  }
  if (detail > 0) {
    const awY = baseY - 52, sw = 13;
    for (let s = 0; s < Math.ceil(w / sw); s++) {
      ctx.fillStyle = s % 2 ? css(shade(KRAFT, 1.18)) : css(CREAM);
      ctx.fillRect(x + s * sw, awY, sw, 13);
    }
    corrugated(ctx, x, awY + 13, w, 6, false, rand);
    ctx.fillStyle = css(INK); ctx.fillRect(x + w * 0.52, baseY - 36, 22, 36);
    ctx.fillStyle = css(CREAM); ctx.fillRect(x + 6, awY - 19, w - 12, 15);
    ctx.fillStyle = css(INK, 0.55);
    for (let k = 0; k < (w - 20) / 9; k++) ctx.fillRect(x + 12 + k * 9, awY - 15, 5, 7);
  }
}

function mountains(ctx: CanvasRenderingContext2D, W: number, baseY: number, amp: number, color: RGB, rand: () => number) {
  ctx.save();
  ctx.fillStyle = css(color);
  ctx.beginPath(); ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, baseY - amp * (0.3 + 0.7 * Math.abs(Math.sin(x * 0.006 + rand() * 0.35))));
  ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
  // fluted cut edge along the ridge
  ctx.strokeStyle = css(shade(color, 1.45), 0.85); ctx.lineWidth = 7; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 20) { const y = baseY - amp * (0.3 + 0.7 * Math.abs(Math.sin(x * 0.006))); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.restore();
}

function paperFinish(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, s = 1) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] === 0) continue;
    const light = (1 - x / w) * 12 + (1 - y / h) * 14;
    const n = (rand() - 0.5) * 28 * s + Math.sin(y * 0.28) * 3 + light - 12;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function normalFrom(cv: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = cv.width, h = cv.height;
  const src = cv.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d')!; const nimg = octx.createImageData(w, h);
  const lum = (x: number, y: number) => {
    const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    return src[i + 3] === 0 ? 0.5 : (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
    const ny = (lum(x, y - 1) - lum(x, y + 1)) * strength;
    const inv = 1 / Math.hypot(nx, ny, 1); const i = (y * w + x) * 4;
    nimg.data[i] = (nx * inv * 0.5 + 0.5) * 255;
    nimg.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
    nimg.data[i + 2] = (inv * 0.5 + 0.5) * 255;
    nimg.data[i + 3] = 255;
  }
  octx.putImageData(nimg, 0, 0); return out;
}

function texFrom(cv: HTMLCanvasElement, scene: BABYLON.Scene) {
  // invertY=true → canvas top maps to plane top (no upside-down town).
  // Mipmaps + trilinear + high anisotropy stop the thin rail/lines from
  // shimmering (aliasing) as the parallax scrolls sub-pixel distances.
  const t = new BABYLON.Texture(cv.toDataURL(), scene, false, true,
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 8;
  return t;
}
export interface CardboardImage { albedo: BABYLON.Texture; normal: BABYLON.Texture; emissive?: BABYLON.Texture; }

/** Toon fake-glass: painted blue-teal panes with bold white cartoon highlights,
 *  a soft interior glow and a dark frame. Baked to a canvas texture — zero
 *  refraction cost, reads as hand-crafted glass at any distance. */
export function toonGlassTexture(scene: BABYLON.Scene, lit: boolean): BABYLON.Texture {
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  // Pane base
  const g = ctx.createLinearGradient(0, 0, S, S);
  if (lit) {
    g.addColorStop(0, '#ffe6a0'); g.addColorStop(0.5, '#f2a94e'); g.addColorStop(1, '#c9662e');
  } else {
    g.addColorStop(0, '#4a90b8'); g.addColorStop(0.5, '#2a5f86'); g.addColorStop(1, '#16384f');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // Bold toon diagonal shine strips
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(38, 0); ctx.lineTo(6, S); ctx.lineTo(0, S); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.moveTo(52, 0); ctx.lineTo(66, 0); ctx.lineTo(34, S); ctx.lineTo(20, S); ctx.closePath(); ctx.fill();
  // Warm interior paper glow in the lower corner
  if (lit) {
    const rg = ctx.createRadialGradient(S * 0.72, S * 0.7, 2, S * 0.72, S * 0.7, S * 0.6);
    rg.addColorStop(0, 'rgba(255,240,180,0.55)'); rg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
  }
  // Painted mullions + dark frame
  ctx.fillStyle = 'rgba(20,26,32,0.85)';
  ctx.fillRect(S / 2 - 3, 0, 6, S); ctx.fillRect(0, S / 2 - 3, S, 6);
  ctx.lineWidth = 8; ctx.strokeStyle = '#2a2018'; ctx.strokeRect(0, 0, S, S);
  // Corner rivets
  ctx.fillStyle = '#d8c8a8';
  for (const [x, y] of [[10, 10], [S - 10, 10], [10, S - 10], [S - 10, S - 10]]) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  return texFrom(cv, scene);
}

/** Standalone kraft cardboard albedo + normal pair, used by 3D reskinning. */
export function cardboardTextures(scene: BABYLON.Scene, key: string, base: RGB, seed: number) {
  const W = 512, H = 512;
  const ac = document.createElement('canvas'); ac.width = W; ac.height = H;
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const a = ac.getContext('2d')!, n = nc.getContext('2d')!;
  const rand = rng(seed);
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 0.5 + 0.1 * Math.sin(x * 0.05 + seed) + 0.07 * Math.cos(y * 0.09)
      + 0.12 * Math.sin(x * 0.3) + (rand() - 0.5) * 0.05;
    height[y * W + x] = h;
    const shadeF = 0.72 + h * 0.5;
    const i = (y * W + x) * 4;
    a.fillStyle = css(shade(base, shadeF));
    a.fillRect(x, y, 1, 1);
  }
  const img = a.getImageData(0, 0, W, H), nd = n.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = height[y * W + ((x - 1 + W) % W)], r = height[y * W + ((x + 1) % W)];
    const u = height[((y - 1 + H) % H) * W + x], d = height[((y + 1) % H) * W + x];
    const nx = (l - r) * 3, ny = (u - d) * 3, inv = 1 / Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4;
    nd.data[i] = (nx * inv * 0.5 + 0.5) * 255;
    nd.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
    nd.data[i + 2] = (inv * 0.5 + 0.5) * 255;
    nd.data[i + 3] = 255;
  }
  void img;
  n.putImageData(nd, 0, 0);
  const albedo = texFrom(ac, scene), normal = texFrom(nc, scene);
  void key;
  return { albedo, normal };
}

export function townStrip(scene: BABYLON.Scene, seed: number, detail: number, _palette?: RGB[]): CardboardImage {
  const W = 2048, H = 768;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!; const rand = rng(seed);
  ctx.clearRect(0, 0, W, H);
  // Separate transparent canvas holding only the cozy lit windows.
  const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
  const emit = ec.getContext('2d')!;
  emit.clearRect(0, 0, W, H);
  const baseY = H - 30;

  // No jagged mountains — a soft layered kraft-paper horizon instead, so the
  // cardboard town reads as a clean hand-built diorama.
  const horizon = ctx.createLinearGradient(0, baseY - 300, 0, baseY);
  horizon.addColorStop(0, 'rgba(214, 177, 131, 0)');
  horizon.addColorStop(1, 'rgba(200, 160, 110, 0.55)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, baseY - 300, W, 300);
  // A couple of gently rolling kraft hills (smooth quadratics, no spikes).
  ctx.fillStyle = css(shade(KRAFT, 0.9));
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, baseY - 60 - Math.sin(x * 0.004) * 30 - Math.sin(x * 0.011) * 12);
  ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
  // Windmills perched on the gentle hills.
  windmill(ctx, W * 0.16, baseY - 110, 34, rand);
  windmill(ctx, W * 0.76, baseY - 96, 28, rand);

  // Exact-fit cottages → seamless. One of them is a landmark clock tower.
  const widths: number[] = []; let total = 0;
  while (total < W) { const w = 120 + rand() * 95; widths.push(w); total += w + 4; }
  const scale = W / total; let x = 0; let idx = 0;
  for (const rw of widths) {
    const w = rw * scale - 4;
    if (w > 10) {
      if (idx % 5 === 2) clockTower(ctx, x + w * 0.1, baseY, w * 0.8, 230 + rand() * 90, rand);
      else cottage(ctx, x, baseY, w, 210 + rand() * 250, rand, detail, emit);
      if (detail > 0 && rand() > 0.6) cardboardTree(ctx, x + w * 0.85, baseY, 0.7 + rand() * 0.4, rand);
    }
    x += rw * scale; idx++;
  }
  // Bunting across the whole strip.
  ctx.strokeStyle = css(INK, 0.5); ctx.lineWidth = 2; ctx.beginPath();
  for (let bx = 0; bx <= W; bx += 8) { const by = 82 + Math.sin(bx * 0.01) * 12; bx ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by); } ctx.stroke();
  for (let k = 0; k < 46; k++) {
    const bx = k * (W / 46) + 10, by = 82 + Math.sin(bx * 0.01) * 12;
    ctx.fillStyle = [css([0.45, 0.7, 0.6]), css([0.82, 0.46, 0.36]), css(CREAM)][k % 3];
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 13, by); ctx.lineTo(bx + 6, by + 18); ctx.closePath(); ctx.fill();
  }
  // Corrugated ground shelf + moss.
  corrugated(ctx, 0, H - 30, W, 30, false, rand);
  for (let i = 0; i < 34; i++) moss(ctx, i * (W / 34), H - 32, rand, 1.3);
  paperFinish(ctx, W, H, rand, 0.85);
  return {
    albedo: texFrom(cv, scene),
    normal: texFrom(normalFrom(cv, 2.2), scene),
    emissive: texFrom(ec, scene),
  };
}

export function pipeStrip(scene: BABYLON.Scene, seed: number, top: boolean): CardboardImage {
  const W = 2048, H = 320;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!; const rand = rng(seed);
  ctx.clearRect(0, 0, W, H);
  const cy = H / 2, R = top ? 54 : 82;
  const body = top ? shade(KRAFT, 0.72) : KRAFT;
  const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
  g.addColorStop(0, css(shade(body, 1.4))); g.addColorStop(0.42, css(body)); g.addColorStop(1, css(shade(body, 0.44)));
  ctx.fillStyle = g; ctx.fillRect(0, cy - R, W, R * 2);
  for (let x = 0; x < W; x += 26) {
    ctx.fillStyle = css(shade(body, 0.56), 0.9); ctx.fillRect(x, cy - R, 7, R * 2);
    ctx.fillStyle = css(shade(body, 1.28), 0.65); ctx.fillRect(x + 7, cy - R, 4, R * 2);
  }
  for (let j = 0; j < 6; j++) {
    const jx = 110 + j * 340;
    ctx.fillStyle = css(shade(KRAFT_D, 1.1)); ctx.fillRect(jx - 10, cy - R * 1.28, 20, R * 2.56);
    corrugated(ctx, jx - 10, cy - R * 1.28, 20, R * 2.56, true, rand);
    for (let b = -2; b <= 2; b++) {
      ctx.fillStyle = css(INK); ctx.beginPath(); ctx.arc(jx, cy + b * R * 0.44, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = css(CREAM); ctx.beginPath(); ctx.arc(jx - 1, cy + b * R * 0.44 - 1, 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = css(CREAM, 0.4); ctx.fillRect(jx + 16, cy - R, 30, R * 2);
  }
  for (let v = 0; v < 4; v++) {
    const vx = 210 + v * 500, vy = cy + (top ? 1 : -1) * (R + 42);
    ctx.strokeStyle = css(KRAFT_L); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(vx, vy, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 5;
    for (let s = 0; s < 4; s++) { const a = s * Math.PI / 4; ctx.beginPath(); ctx.moveTo(vx - Math.cos(a) * 24, vy - Math.sin(a) * 24); ctx.lineTo(vx + Math.cos(a) * 24, vy + Math.sin(a) * 24); ctx.stroke(); }
    const gx = vx + 140, gy = cy - (top ? 1 : -1) * (R + 34);
    ctx.fillStyle = css(KRAFT_D); ctx.beginPath(); ctx.arc(gx, gy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css(CREAM); ctx.beginPath(); ctx.arc(gx, gy, 19, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css(INK, 0.7); ctx.lineWidth = 1.5;
    for (let t = 0; t < 12; t++) { const a = t * Math.PI / 6; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * 14, gy + Math.sin(a) * 14); ctx.lineTo(gx + Math.cos(a) * 17, gy + Math.sin(a) * 17); ctx.stroke(); }
    ctx.strokeStyle = css(INK); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 11, gy - 9); ctx.stroke();
  }
  for (let s = 0; s < 5; s++) {
    const sx = 50 + s * 410;
    ctx.fillStyle = css(CREAM); ctx.fillRect(sx, cy - R - 34, 14, 40);
    corrugated(ctx, sx, cy - R - 34, 14, 40, true, rand);
    ctx.fillStyle = css(KRAFT_D); ctx.fillRect(sx - 16, cy - R - 6, 46, 10);
    moss(ctx, sx + 6, cy - R - 34, rand, 0.9);
    // Tiny pennant flags strung along the top of the foreground pipe run.
    if (top) {
      ctx.strokeStyle = css(INK, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - 20, cy - R - 40); ctx.lineTo(sx + 170, cy - R - 40); ctx.stroke();
      const flagCols = [css([0.45, 0.72, 0.6]), css([0.82, 0.46, 0.36]), css(CREAM)];
      for (let f = 0; f < 9; f++) {
        const fx = sx - 16 + f * 20;
        const fy = cy - R - 40 + Math.sin(f * 0.5) * 3;
        ctx.fillStyle = flagCols[f % 3];
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 14, fy); ctx.lineTo(fx + 7, fy + 14); ctx.closePath(); ctx.fill();
      }
    }
  }
  paperFinish(ctx, W, H, rand, 1.0);
  return { albedo: texFrom(cv, scene), normal: texFrom(normalFrom(cv, 2.6), scene) };
}
