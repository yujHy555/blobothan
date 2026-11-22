import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * AAA character style layer — visual flair that follows Blobothan:
 *  - speed afterimages that fade and shrink
 * No contact shadow, halo or aura — the neon art style grounds the character
 * through lighting alone. A flat shadow disc rendered edge-on to the side
 * camera read as a stray long dark line, so it was removed entirely.
 */
export class CharacterStyle {
  private scene: BABYLON.Scene;
  private ghosts: BABYLON.Mesh[] = [];
  private ghostTimer = 0;
  private ghostIdx = 0;
  public trailsEnabled = true; // disabled in level 2 (clean look)

  constructor(scene: BABYLON.Scene, mats: Materials, _root: BABYLON.Mesh, _accent: [number, number, number]) {
    this.scene = scene;

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

  public flare(_amount = 1) { /* no halo — no-op */ }

  public update(dt: number, ballPos: BABYLON.Vector3, velX: number, velZ: number, _velY: number, _growScale = 1) {
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
    for (const g of this.ghosts) g.dispose();
  }
}
