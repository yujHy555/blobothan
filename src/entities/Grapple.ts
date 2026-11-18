import * as BABYLON from 'babylonjs';
import { BoxCollider } from './BallPlayer';
import { Materials } from '../art/Materials';

export interface GrappleState {
  active: boolean;
  attached: boolean;
  point: BABYLON.Vector3;
  length: number;
}

/**
 * Chameleon-tongue grapple.
 * - Fires a tongue (sprint key / right-gamepad shoulder) toward the aim direction.
 * - If it hits a wall/platform within range, it attaches.
 * - While attached, the ball swings on a pendulum (constraint-like solver) and
 *   can reel in/out. Jump releases with a boost.
 */
export class Grapple {
  public state: GrappleState = { active: false, attached: false, point: BABYLON.Vector3.Zero(), length: 0 };
  private tongue: BABYLON.Mesh;
  private tip: BABYLON.Mesh;
  private colliders: BoxCollider[] = [];
  private scene: BABYLON.Scene;
  private angle = 0;
  private angularVel = 0;
  public maxRange = 22;
  public onAttach?: () => void;
  public onShoot?: () => void;

  constructor(scene: BABYLON.Scene, mats: Materials) {
    this.scene = scene;
    // Tongue: a thin stretched cylinder updated each frame
    this.tongue = BABYLON.MeshBuilder.CreateCylinder('tongue', { diameter: 0.16, height: 1, tessellation: 10 }, scene);
    this.tongue.material = mats.glow('tongueMat', [1.0, 0.45, 0.6]);
    this.tongue.isPickable = false;
    this.tongue.setEnabled(false);
    this.tip = BABYLON.MeshBuilder.CreateSphere('tongueTip', { diameter: 0.45, segments: 10 }, scene);
    this.tip.material = mats.glow('tongueTipMat', [1.0, 0.6, 0.75]);
    this.tip.isPickable = false;
    this.tip.setEnabled(false);
  }

  public setColliders(c: BoxCollider[]) { this.colliders = c; }

  /** Try to fire toward a direction (normalized-ish). Returns true if attached. */
  public fire(from: BABYLON.Vector3, dir: BABYLON.Vector3): boolean {
    this.onShoot?.();
    // Raycast against platform meshes along dir
    const ray = new BABYLON.Ray(from, dir.normalize(), this.maxRange);
    const hit = this.scene.pickWithRay(ray, (m) => m.name === 'platform', false);
    if (hit && hit.hit && hit.pickedPoint) {
      this.state.attached = true;
      this.state.point = hit.pickedPoint.clone();
      this.state.length = BABYLON.Vector3.Distance(from, this.state.point);
      this.state.active = true;
      // Initial pendulum angle from current position relative to attach point
      this.angle = Math.atan2(from.x - this.state.point.x, -(from.y - this.state.point.y));
      this.angularVel = 0;
      this.tongue.setEnabled(true);
      this.tip.setEnabled(true);
      this.tip.position.copyFrom(this.state.point);
      this.onAttach?.();
      return true;
    }
    return false;
  }

  public release() {
    this.state.active = false;
    this.state.attached = false;
    this.tongue.setEnabled(false);
    this.tip.setEnabled(false);
  }

  /** Draw the tongue skin from the player to the anchor (physics handled by player). */
  public drawTongue(from: BABYLON.Vector3, anchor: BABYLON.Vector3, len: number) {
    this.tongue.setEnabled(true);
    this.tip.setEnabled(true);
    this.tip.position.copyFrom(anchor);
    const mid = from.add(anchor).scale(0.5);
    const d = BABYLON.Vector3.Distance(from, anchor);
    this.tongue.position.copyFrom(mid);
    this.tongue.scaling.y = d;
    this.tongue.rotation.z = -Math.atan2(anchor.x - from.x, anchor.y - from.y);
    // pulsing tip
    this.tip.scaling.setAll(1 + Math.sin(performance.now() * 0.01) * 0.15);
  }

  /** Apply pendulum motion to the player velocity. Call each physics step. */
  public update(dt: number, pos: BABYLON.Vector3, vel: BABYLON.Vector3, inputX: number, reel: number) {
    if (!this.state.attached) return;

    const anchor = this.state.point;
    // Reel in / out
    this.state.length = BABYLON.Scalar.Clamp(this.state.length - reel * dt * 12, 3, this.maxRange);

    // Pendulum: angle measured from straight-down. Gravity swings toward 0.
    const dx = pos.x - anchor.x;
    const dy = pos.y - anchor.y;
    this.angle = Math.atan2(dx, -dy);
    // Angular acceleration from gravity: -g/L * sin(theta), plus input pump
    const g = 34;
    const angAcc = -(g / this.state.length) * Math.sin(this.angle) + inputX * 1.4;
    this.angularVel += angAcc * dt;
    this.angularVel *= Math.pow(0.6, dt); // damping
    this.angle += this.angularVel * dt;

    // Desired position on the circle
    const targetX = anchor.x + Math.sin(this.angle) * this.state.length;
    const targetY = anchor.y - Math.cos(this.angle) * this.state.length;

    // Steer velocity toward the tangent (spring to circle)
    vel.x += (targetX - pos.x) * 18 * dt;
    vel.y += (targetY - pos.y) * 18 * dt;

    // Draw tongue
    const mid = pos.add(anchor).scale(0.5);
    this.tongue.position.copyFrom(mid);
    const d = BABYLON.Vector3.Distance(pos, anchor);
    this.tongue.scaling.y = d;
    this.tongue.rotation.z = -Math.atan2(anchor.x - pos.x, anchor.y - pos.y);
  }

  public dispose() { this.tongue.dispose(); this.tip.dispose(); }
}
