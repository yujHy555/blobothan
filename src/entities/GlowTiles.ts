import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * A run of glowing floor tiles that light up in sequence as the ball rolls over
 * them — a satisfying "piano keys" feedback trail built into the level.
 */
export class GlowTiles {
  public tiles: { mesh: BABYLON.Mesh; x: number; y: number; glow: number; mat: BABYLON.StandardMaterial }[] = [];
  private baseColor: [number, number, number];
  private hiColor: [number, number, number];

  constructor(scene: BABYLON.Scene, mats: Materials, xs: number[], y: number, z: number, base: [number, number, number], hi: [number, number, number]) {
    this.baseColor = base;
    this.hiColor = hi;
    const size = 1.6;
    for (const x of xs) {
      const m = BABYLON.MeshBuilder.CreateBox('glowTile', { width: size, height: 0.12, depth: size }, scene);
      m.position.set(x, y, z);
      m.isPickable = false;
      const mat = new BABYLON.StandardMaterial('glowTileMat', scene);
      mat.diffuseColor = new BABYLON.Color3(base[0], base[1], base[2]);
      mat.emissiveColor = new BABYLON.Color3(base[0], base[1], base[2]).scale(0.3);
      mat.disableLighting = true;
      mat.zOffset = -2;
      mat.zOffsetUnits = 1;
      m.material = mat;
      this.tiles.push({ mesh: m, x, y, glow: 0, mat });
    }
  }

  public update(dt: number, ballPos: BABYLON.Vector3) {
    for (const t of this.tiles) {
      const near = Math.abs(ballPos.x - t.x) < 1.4 && Math.abs(ballPos.y - t.y) < 2.2;
      if (near) t.glow = 1;
      else t.glow = Math.max(0, t.glow - dt * 1.6);
      const c = t.glow;
      const r = this.baseColor[0] + (this.hiColor[0] - this.baseColor[0]) * c;
      const g = this.baseColor[1] + (this.hiColor[1] - this.baseColor[1]) * c;
      const b = this.baseColor[2] + (this.hiColor[2] - this.baseColor[2]) * c;
      t.mat.emissiveColor.set(r, g, b);
      t.mat.diffuseColor.set(r, g, b);
      t.mesh.scaling.y = 1 + c * 1.2;
      t.mesh.position.y = t.y + c * 0.06;
    }
  }

  public dispose() { for (const t of this.tiles) { t.mesh.dispose(); t.mat.dispose(); } }
}
