import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';
import { BoxCollider } from './BallPlayer';

/**
 * AAA character style layer — visual flair that follows Blobothan:
 *  - a contact shadow that projects onto the nearest platform below
 *  - speed afterimages that fade and shrink
 * No halo/aura (kept clean).
 */
export class CharacterStyle {
  private scene: BABYLON.Scene;
  public shadow: BABYLON.Mesh;
  private ghosts: BABYLON.Mesh[] = [];
  private t = 0;
  private ghostTimer = 0;
  private ghostIdx = 0;
  private colliders: BoxCollider[] = [];
  public trailsEnabled = true; // disabled in level 2 (clean look)

  constructor(scene: BABYLON.Scene, mats: Materials, _root: BABYLON.Mesh, _accent: [number, number, number]) {
    this.scene = scene;

    // Contact shadow — a soft dark disc projected onto the ground
    this.shadow = BABYLON.MeshBuilder.CreateDisc('heroShadow', { radius: 1.05, tessellation: 28 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.material = mats.glow('heroShadowMat', [0.02, 0.03, 0.05], 0.34);
    this.shadow.isPickable = false;
    // Render in group 0 (same as the player) with depth testing so it stays on
    // the ground and never draws over the character.
    this.shadow.renderingGroupId = 0;

    // Afterimage ghosts for speed trails
    for (let i = 0; i < 6; i++) {
      const g = BABYLON.MeshBuilder.CreateIcoSphere('ghost', { radius: 1, subdivisions: 1 }, scene);
      g.material = mats.glow('ghostMat', [1, 0.4, 0.7], 0.18);
      g.isPickable = false;
      g.renderingGroupId = 1;
      g.setEnabled(false);
      this.ghosts.push(g);
    }
  }

  public setColliders(c: BoxCollider[]) { this.colliders = c; }
  public flare(_amount = 1) { /* no halo — no-op */ }

  public update(dt: number, ballPos: BABYLON.Vector3, velX: number, velZ: number, velY: number, growScale = 1) {
    this.t += dt;

    // Find the nearest platform top below the ball
    let groundY = ballPos.y - 1.0;
    let best = -Infinity;
    for (const c of this.colliders) {
      const top = c.y + c.h / 2;
      if (top > ballPos.y + 0.2) continue;
      if (ballPos.x < c.x - c.w / 2 - 0.5 || ballPos.x > c.x + c.w / 2 + 0.5) continue;
      if (ballPos.z < c.z - c.d / 2 - 0.5 || ballPos.z > c.z + c.d / 2 + 0.5) continue;
      if (top > best) best = top;
    }
    if (best > -Infinity) groundY = best + 0.03;

    const heightAbove = Math.max(0, ballPos.y - groundY);
    this.shadow.position.set(ballPos.x, groundY, ballPos.z);
    const fade = BABYLON.Scalar.Clamp(1 - heightAbove * 0.06, 0.12, 1);
    const scale = BABYLON.Scalar.Clamp(growScale * (1 - heightAbove * 0.02), 0.4, 3);
    this.shadow.scaling.set(scale, scale, 1);
    (this.shadow.material as BABYLON.StandardMaterial).alpha = 0.34 * fade;

    // Afterimages at speed (2D or 3D) — disabled when trails are off
    const speed = Math.hypot(velX, velZ);
    if (this.trailsEnabled && speed > 9) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.05;
        const g = this.ghosts[this.ghostIdx % this.ghosts.length];
        this.ghostIdx++;
        g.position.copyFrom(ballPos);
        g.setEnabled(true);
        (g as any).life = 0.3;
      }
    }
    for (const g of this.ghosts) {
      if (!(g as any).life) continue;
      (g as any).life -= dt;
      g.scaling.setAll(0.6 + (g as any).life);
      if ((g as any).life <= 0) g.setEnabled(false);
    }
  }

  public dispose() {
    this.shadow.dispose();
    for (const g of this.ghosts) g.dispose();
  }
}
