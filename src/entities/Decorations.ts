import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** Scattered magical flora — glowing mushrooms & crystals that dot the platforms. */
export class Decorations {
  public root: BABYLON.TransformNode;
  private anim: { mesh: BABYLON.TransformNode; phase: number; baseY: number }[] = [];
  private t = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, spots: { x: number; y: number; z: number }[], accent: [number, number, number]) {
    this.root = new BABYLON.TransformNode('decorations', scene);
    const shroom = mats.glow('shroomCap', [accent[0] * 0.8 + 0.2, accent[1], accent[2] * 0.9 + 0.1]);
    const stem = mats.glow('shroomStem', [0.9, 0.88, 0.8], 0.9);
    const crystal = mats.glow('crystal', [accent[0], accent[1], Math.min(1, accent[2] + 0.3)]);

    spots.forEach((s, i) => {
      const g = new BABYLON.TransformNode('deco', scene);
      g.parent = this.root;
      g.position.set(s.x, s.y, s.z);
      if (i % 2 === 0) {
        // Mushroom
        const st = BABYLON.MeshBuilder.CreateCylinder('stem', { diameter: 0.16, height: 0.5, tessellation: 8 }, scene);
        st.parent = g; st.position.y = 0.245; st.material = stem; // slight overlap under cap, no coplanar seam
        const cap = BABYLON.MeshBuilder.CreateSphere('cap', { diameter: 0.6, segments: 10, slice: 0.5 }, scene);
        cap.parent = g; cap.position.y = 0.5; cap.material = shroom;
        cap.scaling.y = 0.7;
        this.anim.push({ mesh: g, phase: i, baseY: s.y });
      } else {
        // Crystal cluster
        for (let k = 0; k < 3; k++) {
          const c = BABYLON.MeshBuilder.CreateCylinder('crystalShard', { diameter: 0.14, height: 0.5 + Math.random() * 0.5, tessellation: 5 }, scene);
          c.parent = g;
          c.position.set((k - 1) * 0.34, 0.25 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2); // wide spacing — tilted shards never intersect
          c.rotation.z = (Math.random() - 0.5) * 0.4;
          c.material = crystal;
        }
      }
    });
  }

  public update(dt: number) {
    this.t += dt;
    for (const a of this.anim) {
      a.mesh.position.y = a.baseY + Math.sin(this.t * 1.5 + a.phase) * 0.05;
    }
  }

  public dispose() { this.root.dispose(false, true); }
}
