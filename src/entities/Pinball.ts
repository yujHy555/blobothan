import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

export type BumperData = { x: number; y: number; z: number; power?: number };

/** Glow bumper: knocks the ball away with a punchy impulse + score + juice. */
export class Bumper {
  public mesh: BABYLON.Mesh;
  public pos: BABYLON.Vector3;
  public power: number;
  private cooldown = 0;
  private ring: BABYLON.Mesh;
  private baseY = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, data: BumperData, accent: [number, number, number]) {
    this.pos = new BABYLON.Vector3(data.x, data.y, data.z);
    this.power = data.power ?? 15;
    this.mesh = BABYLON.MeshBuilder.CreateCylinder('bumper', { diameter: 1.9, height: 1.0, tessellation: 24 }, scene);
    this.mesh.position = this.pos.clone();
    this.mesh.name = 'bumper';
    this.mesh.material = mats.glow('bumperBase', accent);
    const cap = BABYLON.MeshBuilder.CreateCylinder('bumperCap', { diameter: 1.6, height: 0.45, tessellation: 24 }, scene);
    cap.parent = this.mesh;
    cap.position.y = -0.7;
    cap.material = mats.glow('bumperCapMat', [1, 1, 1]);
    this.ring = BABYLON.MeshBuilder.CreateTorus('bumperRing', { diameter: 2.4, thickness: 0.14, tessellation: 24 }, scene);
    this.ring.parent = this.mesh;
    this.ring.rotation.x = Math.PI / 2;
    this.ring.material = mats.glow('bumperRingMat', accent);
    this.ring.renderingGroupId = 1;
    this.baseY = this.pos.y;
  }

  public update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.ring.rotation.y += dt * 2;
    this.mesh.position.y = this.baseY + Math.sin(performance.now() * 0.002 + this.pos.x) * 0.08;
  }

  /** Mutates vel in place. Returns true on a fresh hit. */
  public tryHit(ballPos: BABYLON.Vector3, vel: BABYLON.Vector3): boolean {
    if (this.cooldown > 0) return false;
    if (BABYLON.Vector3.Distance(ballPos, this.mesh.position) > 2.1) return false;
    this.cooldown = 0.25;
    const away = ballPos.subtract(this.mesh.position);
    away.y += 0.35;
    if (away.length() > 0.01) away.normalize();
    vel.x = away.x * this.power;
    vel.y = Math.max(vel.y, 0) + this.power * 0.75;
    vel.z = 0;
    this.ring.scaling.setAll(1.3);
    setTimeout(() => this.ring.scaling.setAll(1), 120);
    return true;
  }
}

/** Pinball spinner: a rotating bar that imparts lateral kicks. */
export class Spinner {
  public mesh: BABYLON.Mesh;
  public pos: BABYLON.Vector3;
  private cooldown = 0;
  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number, accent: [number, number, number]) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = BABYLON.MeshBuilder.CreateBox('spinner', { width: 3.4, height: 0.35, depth: 0.5 }, scene);
    this.mesh.position = this.pos;
    this.mesh.material = mats.glow('spinnerMat', accent);
  }
  public update(dt: number) {
    this.mesh.rotation.y += dt * 3.2;
    this.cooldown = Math.max(0, this.cooldown - dt);
  }
  public tryHit(ballPos: BABYLON.Vector3, vel: BABYLON.Vector3): boolean {
    if (this.cooldown > 0) return false;
    if (BABYLON.Vector3.Distance(ballPos, this.pos) > 2.2) return false;
    this.cooldown = 0.4;
    vel.x += (Math.sin(this.mesh.rotation.y) >= 0 ? 1 : -1) * 11;
    vel.y = Math.max(vel.y, 5);
    return true;
  }
}
