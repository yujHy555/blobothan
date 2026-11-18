import * as BABYLON from 'babylonjs';

export type RealmPalette = {
  name: string;
  sub: string;
  clear: [number, number, number];
  fogDensity: number;
  hemi: [number, number, number];
  ground: [number, number, number];
  accent: [number, number, number];
};

/**
 * AAA "Aetherpool" system — consistent role-based palette:
 *  clear/hemi = light ethereal environment · ground = deep receding platform
 *  accent = mint edge glow · character = magenta/cyan · rewards = gold · portals = violet
 * Realms vary hue within the family; roles never change.
 */
/**
 * AAA "Aetherpool" system — dark atmospheric environments that make the
 * magenta/cyan hero and glowing accents pop. Roles stay consistent per realm.
 */
export const REALMS: RealmPalette[] = [
  { name: 'Glowgrove', sub: 'Level 1 · Verdant Drift', clear: [0.04, 0.08, 0.12], fogDensity: 0.008, hemi: [0.5, 0.8, 0.7], ground: [0.08, 0.26, 0.24], accent: [0.35, 1.0, 0.72] },
  { name: 'Solar Foundry', sub: 'Level 2 · Gilded Ascent', clear: [0.10, 0.07, 0.02], fogDensity: 0.006, hemi: [1.0, 0.85, 0.4], ground: [0.34, 0.22, 0.04], accent: [1.0, 0.78, 0.18] },
  { name: 'Neon Bowl', sub: 'Level 3 · Half-Pipe Hustle', clear: [0.05, 0.02, 0.10], fogDensity: 0.005, hemi: [0.7, 0.5, 1.0], ground: [0.14, 0.08, 0.26], accent: [1.0, 0.78, 0.2] },
  { name: 'Ollie Ollie Ollie', sub: 'Level 4 · Endless Mega-Park', clear: [0.03, 0.02, 0.09], fogDensity: 0.004, hemi: [0.6, 0.9, 1.0], ground: [0.10, 0.12, 0.30], accent: [0.35, 1.0, 0.95] },
];

export class Materials {
  private scene: BABYLON.Scene;
  private cache = new Map<string, BABYLON.Material>();

  constructor(scene: BABYLON.Scene) { this.scene = scene; }

  private c3(a: [number, number, number]) { return new BABYLON.Color3(a[0], a[1], a[2]); }

  /** Procedural canvas texture — soft mottled noise for organic surfaces. */
  private noiseTexture(key: string, base: [number, number, number], octaves = 3): BABYLON.Texture {
    const cached = this.cache.get(key);
    if (cached) return cached as unknown as BABYLON.Texture;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let n = 0, amp = 1, freq = 0.02, total = 0;
        for (let o = 0; o < octaves; o++) {
          n += Math.sin(x * freq + Math.cos(y * freq * 0.7) * 3) * amp + Math.cos(y * freq * 1.3) * amp * 0.5;
          total += amp * 1.5; amp *= 0.5; freq *= 2.1;
        }
        n = (n / total + 1) / 2; // 0..1
        const v = 0.75 + n * 0.35;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, base[0] * 255 * v);
        img.data[i + 1] = Math.min(255, base[1] * 255 * v);
        img.data[i + 2] = Math.min(255, base[2] * 255 * v);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new BABYLON.Texture(canvas.toDataURL(), this.scene, false, false);
    tex.uScale = 2; tex.vScale = 2;
    return tex;
  }

  glow(name: string, rgb: [number, number, number], alpha = 1) {
    const key = `${name}-${rgb.join('-')}-${alpha}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.StandardMaterial(name, this.scene);
    m.diffuseColor = this.c3(rgb);
    m.emissiveColor = this.c3(rgb).scale(0.65);
    m.disableLighting = true;
    m.alpha = alpha;
    m.backFaceCulling = false;
    // Anti z-fighting: pull decals/glow surfaces toward the camera (both negative)
    m.zOffset = -2;
    m.zOffsetUnits = -4;
    this.cache.set(key, m);
    return m;
  }

  jelly() {
    const m = new BABYLON.PBRMaterial('jelly', this.scene);
    // Solid electric magenta — opaque so he reads clearly in every realm.
    // Translucency was making him look see-through in the bright arena.
    m.albedoColor = new BABYLON.Color3(1.0, 0.16, 0.58);
    m.metallic = 0.0;
    m.roughness = 0.92;                    // matte — no glossy white specular marks
    m.emissiveColor = new BABYLON.Color3(0.42, 0.04, 0.2); // self-light for pop
    m.subSurface.isTranslucencyEnabled = false;
    // Kill environment reflections / white shine completely
    (m as any).environmentIntensity = 0;
    (m as any).specularIntensity = 0;
    m.clearCoat.isEnabled = false;
    // No bump texture — that was creating the "shiny white marks" highlight dots
    return m;
  }

  platform(accent: [number, number, number]) {
    const key = `platform-${accent.join('-')}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.PBRMaterial(key, this.scene);
    m.albedoColor = this.c3(accent).scale(0.28);
    m.emissiveColor = this.c3(accent).scale(0.05);
    m.metallic = 0.15;
    m.roughness = 0.6;
    // mossy mottled surface texture
    const tex = this.noiseTexture('platformNoise-' + accent.join('-'), [accent[0], accent[1], accent[2]], 4);
    m.albedoTexture = tex;
    m.bumpTexture = tex;
    return m;
  }

  eyeWhite() {
    const key = 'eyeWhite';
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.StandardMaterial(key, this.scene);
    m.diffuseColor = new BABYLON.Color3(1, 1, 1);
    m.emissiveColor = new BABYLON.Color3(1, 1, 1); // full white, survives ACES tone mapping
    m.disableLighting = true;
    this.cache.set(key, m);
    return m;
  }

  pupil() {
    const key = 'pupil';
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.StandardMaterial(key, this.scene);
    m.diffuseColor = new BABYLON.Color3(0, 0, 0); // pure black
    m.emissiveColor = new BABYLON.Color3(0, 0, 0);
    m.disableLighting = true;
    // Pupils are geometrically in front of the eyeball — no depth bias needed.
    // zOffset was screen-space and flipped the layering at some camera angles.
    this.cache.set(key, m);
    return m;
  }

  rabbitFur() {
    const key = 'rabbitFur';
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.PBRMaterial(key, this.scene);
    m.albedoColor = new BABYLON.Color3(0.86, 0.86, 0.92);
    m.roughness = 0.85;
    m.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.07);
    this.cache.set(key, m);
    return m;
  }

  hat() {
    const key = 'hat';
    if (this.cache.has(key)) return this.cache.get(key)!;
    const m = new BABYLON.PBRMaterial(key, this.scene);
    m.albedoColor = new BABYLON.Color3(0.06, 0.06, 0.09);
    m.roughness = 0.35;
    m.metallic = 0.1;
    this.cache.set(key, m);
    return m;
  }

  hatBand() {
    return this.glow('hatBand', [0.9, 0.15, 0.35]);
  }

  portal(accent: [number, number, number]) {
    const m = new BABYLON.StandardMaterial('portal', this.scene);
    m.diffuseColor = this.c3(accent);
    m.emissiveColor = this.c3(accent).scale(0.8);
    m.disableLighting = true;
    m.alpha = 0.85;
    m.backFaceCulling = false;
    return m;
  }
}
