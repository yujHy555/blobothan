import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * CLOUD 9 — a sky-high atmosphere showcase in Level 1 built around the
 * tongue-grapple. A chain of glowing cloud islands (with grapple anchors)
 * lets the player pendulum-swing between them. Releasing at the bottom of a
 * swing converts the angular momentum into a big forward sling.
 */
export class Cloud9 {
  public root: BABYLON.TransformNode;
  public anchors: BABYLON.Vector3[] = [];
  private clouds: BABYLON.Mesh[] = [];
  private rings: BABYLON.Mesh[] = [];
  private motes: BABYLON.Mesh[] = [];
  private t = 0;
  private scene: BABYLON.Scene;

  constructor(scene: BABYLON.Scene, mats: Materials, centerX: number, accent: [number, number, number]) {
    this.scene = scene;
    this.root = new BABYLON.TransformNode('cloud9', scene);

    // Floating cloud islands climbing up and to the right — a grapple course
    const spots = [
      { x: centerX + 0,  y: 24, r: 3.4 },
      { x: centerX + 12, y: 29, r: 3.0 },
      { x: centerX + 26, y: 27, r: 3.2 },
      { x: centerX + 40, y: 34, r: 2.8 },
    ];
    for (const s of spots) {
      // Puffy cloud = a few overlapping spheres
      for (let i = 0; i < 5; i++) {
        const puff = BABYLON.MeshBuilder.CreateSphere('cloud9Puff', { diameter: s.r, segments: 12 }, scene);
        puff.parent = this.root;
        puff.position.set(s.x + (i - 2) * s.r * 0.42, s.y + (i % 2) * 0.35, (i % 3 - 1) * 0.5);
        puff.scaling.y = 0.62;
        const cm = new BABYLON.PBRMaterial('cloud9PuffMat', scene);
        cm.albedoColor = new BABYLON.Color3(0.86, 0.93, 1.0);
        cm.emissiveColor = new BABYLON.Color3(accent[0] * 0.25, accent[1] * 0.3, accent[2] * 0.35);
        cm.metallic = 0.0; cm.roughness = 0.95;
        puff.material = cm;
        puff.isPickable = false;
        this.clouds.push(puff);
      }
      // Grapple anchor ring hanging below each cloud
      const ring = BABYLON.MeshBuilder.CreateTorus('cloud9Anchor', { diameter: 2.0, thickness: 0.22, tessellation: 24 }, scene);
      ring.parent = this.root;
      ring.position.set(s.x, s.y - s.r * 0.7 - 1.2, 0);
      ring.rotation.x = Math.PI / 2;
      ring.material = mats.glow('cloud9AnchorMat', [1.0, 0.5, 0.85]);
      ring.renderingGroupId = 1;
      this.rings.push(ring);
      this.anchors.push(ring.position.clone());
    }

    // Soft floating motes for atmosphere
    for (let i = 0; i < 18; i++) {
      const m = BABYLON.MeshBuilder.CreateSphere('cloud9Mote', { diameter: 0.15 + Math.random() * 0.2, segments: 8 }, scene);
      m.parent = this.root;
      m.position.set(centerX + (Math.random() - 0.5) * 60, 20 + Math.random() * 20, (Math.random() - 0.5) * 8);
      m.material = mats.glow('cloud9MoteMat', accent, 0.6);
      m.isPickable = false;
      this.motes.push(m);
    }
  }

  public update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].rotation.z += dt * (i % 2 ? -1 : 1);
      this.rings[i].scaling.setAll(1 + Math.sin(this.t * 2 + i) * 0.08);
    }
    for (let i = 0; i < this.motes.length; i++) {
      this.motes[i].position.y += Math.sin(this.t * 1.5 + i) * dt * 0.4;
    }
    for (let i = 0; i < this.clouds.length; i++) {
      this.clouds[i].position.y += Math.sin(this.t * 0.8 + i * 0.5) * dt * 0.15;
    }
  }

  /** Find the nearest anchor within range of a position (for grapple assist). */
  public nearestAnchor(pos: BABYLON.Vector3, maxDist = 22): BABYLON.Vector3 | null {
    let best: BABYLON.Vector3 | null = null;
    let bd = maxDist;
    for (const a of this.anchors) {
      const d = BABYLON.Vector3.Distance(a, pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  public dispose() {
    this.root.dispose(false, true);
  }
}
