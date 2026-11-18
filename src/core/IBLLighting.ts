import * as BABYLON from 'babylonjs';
import { RealmPalette } from '../art/Materials';

/**
 * Lightweight HDRI/IBL lighting — "super optimized":
 *  - a tiny 64px procedural cube map generated once from canvas gradients
 *  - used as scene.environmentTexture so ALL PBR materials get ambient + reflections
 *  - NO SSAO post-process (expensive) — the hero's contact shadow disc supplies GI grounding
 *  - realm-aware tinting via a one-time cube rebuild on level change
 */
export class IBLLighting {
  private scene: BABYLON.Scene;
  private env: BABYLON.CubeTexture | null = null;
  private key: BABYLON.DirectionalLight | null = null;

  constructor(scene: BABYLON.Scene) { this.scene = scene; }

  private buildCube(pal: RealmPalette): BABYLON.CubeTexture {
    const size = 64;
    const faces: string[] = [];
    const rgb = (a: [number, number, number], m: number) =>
      `rgb(${Math.min(255, a[0] * m * 255) | 0},${Math.min(255, a[1] * m * 255) | 0},${Math.min(255, a[2] * m * 255) | 0})`;

    // Face order for CubeTexture: +X, -X, +Y, -Y, +Z, -Z
    for (let f = 0; f < 6; f++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 0, size);
      if (f === 2) {
        // sky — bright, airy
        g.addColorStop(0, rgb(pal.hemi, 1.2));
        g.addColorStop(1, rgb(pal.clear, 1.6));
      } else if (f === 3) {
        // ground bounce — warm dim
        g.addColorStop(0, rgb(pal.ground, 1.1));
        g.addColorStop(1, rgb(pal.ground, 0.5));
      } else {
        g.addColorStop(0, rgb(pal.clear, 1.8));
        g.addColorStop(0.55, rgb(pal.hemi, 1.35));
        g.addColorStop(1, rgb(pal.ground, 0.9));
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // subtle sun bloom on +X face
      if (f === 0) {
        const rg = ctx.createRadialGradient(size * 0.7, size * 0.35, 1, size * 0.7, size * 0.35, size * 0.45);
        rg.addColorStop(0, 'rgba(255,250,235,0.95)');
        rg.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, size, size);
      }
      faces.push(cv.toDataURL());
    }
    return new BABYLON.CubeTexture('', this.scene, null, false, faces);
  }

  public apply(pal: RealmPalette, environmentIntensity = 0.9) {
    if (this.env) this.env.dispose();
    this.env = this.buildCube(pal);
    this.env.gammaSpace = true;
    this.scene.environmentTexture = this.env;
    this.scene.environmentIntensity = environmentIntensity;
  }

  public dispose() {
    if (this.env) { this.env.dispose(); this.env = null; }
    if (this.key) { this.key.dispose(); this.key = null; }
  }
}
