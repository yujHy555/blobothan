import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * Mystery & intrigue layer: floating rune glyphs, drifting wisps, and hidden
 * constellations that only reveal themselves up close. Pure atmosphere.
 */
export class MysteryLayer {
  public root: BABYLON.TransformNode;
  private glyphs: { mesh: BABYLON.Mesh; base: number; phase: number; speed: number }[] = [];
  private wisps: BABYLON.Mesh[] = [];
  private t = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, centerX: number, accent: [number, number, number]) {
    this.root = new BABYLON.TransformNode('mystery', scene);
    this.root.position.x = centerX;

    // Floating rune rings half-hidden in the fog
    for (let i = 0; i < 8; i++) {
      const g = BABYLON.MeshBuilder.CreateTorus('glyph', { diameter: 1.6 + Math.random() * 2.4, thickness: 0.06, tessellation: 6 }, scene);
      g.position.set(centerX - 60 + Math.random() * 140, 8 + Math.random() * 22, -12 - Math.random() * 30);
      g.rotation.set(Math.random(), Math.random(), Math.random());
      g.material = mats.glow('glyphMat', accent, 0.22 + Math.random() * 0.18);
      g.isPickable = false;
      this.glyphs.push({ mesh: g, base: g.position.y, phase: Math.random() * 6.3, speed: 0.3 + Math.random() * 0.6 });
      g.parent = this.root;
    }

    // Drifting fog wisps (soft translucent spheres)
    for (let i = 0; i < 12; i++) {
      const w = BABYLON.MeshBuilder.CreateSphere('wisp', { diameter: 6 + Math.random() * 8, segments: 8 }, scene);
      w.position.set(centerX - 80 + Math.random() * 180, 3 + Math.random() * 14, -8 - Math.random() * 18);
      w.material = mats.glow('wispMat', [accent[0] * 0.5, accent[1] * 0.6, accent[2] * 0.8], 0.06);
      w.isPickable = false;
      (w as any).drift = Math.random() * 6.3;
      this.wisps.push(w);
      w.parent = this.root;
    }
  }

  public update(dt: number) {
    this.t += dt;
    for (const g of this.glyphs) {
      g.mesh.rotation.y += dt * g.speed;
      g.mesh.rotation.x += dt * g.speed * 0.5;
      g.mesh.position.y = g.base + Math.sin(this.t * 0.6 + g.phase) * 0.8;
      // pulse opacity via scaling for intrigue
      const s = 0.85 + Math.sin(this.t * 1.2 + g.phase) * 0.15;
      g.mesh.scaling.setAll(s);
    }
    for (const w of this.wisps) {
      (w as any).drift += dt * 0.2;
      w.position.x += Math.sin((w as any).drift) * dt * 0.6;
      w.position.y += Math.cos((w as any).drift * 0.7) * dt * 0.3;
    }
  }

  public dispose() { this.root.dispose(false, true); }
}
