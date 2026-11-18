import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** Spring pad — launches the ball upward with a boing when stomped. */
export class Spring {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public power: number;
  private cooldown = 0;
  private pad: BABYLON.Mesh;
  private baseY = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number, power = 28) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.power = power;
    this.mesh = new BABYLON.TransformNode('spring', scene);
    this.mesh.position = this.pos.clone();
    const base = BABYLON.MeshBuilder.CreateCylinder('springBase', { diameter: 1.8, height: 0.3, tessellation: 20 }, scene);
    base.parent = this.mesh;
    base.material = mats.glow('springBase', [0.3, 0.8, 0.5]);
    this.pad = BABYLON.MeshBuilder.CreateCylinder('springPad', { diameter: 1.6, height: 0.22, tessellation: 20 }, scene);
    this.pad.parent = this.mesh;
    this.pad.position.y = 0.42; // raised so the coil sits fully in the gap
    this.pad.material = mats.glow('springPad', [0.6, 1.0, 0.4]);
    // coil — sits cleanly between base top (y=0.15) and pad bottom (y=0.31)
    const coil = BABYLON.MeshBuilder.CreateTorus('springCoil', { diameter: 1.1, thickness: 0.12, tessellation: 16 }, scene);
    coil.parent = this.mesh;
    coil.position.y = 0.21;
    coil.material = mats.glow('springCoil', [0.4, 0.9, 0.6]);
    this.baseY = this.pad.position.y;
  }

  public update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const target = this.cooldown > 0 ? 0.4 : this.baseY;
    this.pad.position.y += (target - this.pad.position.y) * Math.min(1, dt * 14);
  }

  public tryBounce(ballPos: BABYLON.Vector3, vel: BABYLON.Vector3, radius: number): boolean {
    if (this.cooldown > 0) return false;
    if (BABYLON.Vector3.Distance(ballPos, this.pos) > radius + 1.1) return false;
    if (ballPos.y < this.pos.y) return false;
    this.cooldown = 0.3;
    vel.y = this.power;
    return true;
  }
}

/** Timing smasher — a piston that slams down on a rhythm. Get through when it's up. */
export class Smasher {
  public mesh: BABYLON.Mesh;
  public pos: BABYLON.Vector3;
  private phase: number;
  private period: number;
  private travel: number;
  private width: number;
  private height: number;
  private depth: number;
  private topY: number;

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number, w: number, h: number, d: number, period = 2.2, phase = 0, travel = 5) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.period = period;
    this.phase = phase;
    this.travel = travel;
    this.width = w; this.height = h; this.depth = d;
    this.topY = y + travel / 2;
    this.mesh = BABYLON.MeshBuilder.CreateBox('smasher', { width: w, height: h, depth: d }, scene);
    this.mesh.position = this.pos.clone();
    this.mesh.material = mats.glow('smasherMat', [0.9, 0.3, 0.25]);
    const stripes = BABYLON.MeshBuilder.CreateBox('smasherStripe', { width: w * 1.04, height: 0.12, depth: d * 1.04 }, scene);
    stripes.parent = this.mesh;
    stripes.position.y = h / 2 + 0.09; // clearly above the top face — no z-fighting
    stripes.material = mats.glow('smasherStripeMat', [1.0, 0.8, 0.2]);
  }

  public update(dt: number, time: number) {
    // saw wave: slow rise, fast slam
    const t = ((time + this.phase) % this.period) / this.period;
    let k: number;
    if (t < 0.55) k = t / 0.55;            // rising
    else k = 1 - (t - 0.55) / 0.45;        // slamming down fast
    this.mesh.position.y = this.pos.y - this.travel / 2 + k * this.travel;
  }

  /** Returns true if the ball overlaps the smasher's current AABB. */
  public overlaps(ballPos: BABYLON.Vector3, radius: number): boolean {
    const bx = this.mesh.position.x, by = this.mesh.position.y, bz = this.mesh.position.z;
    const cx = BABYLON.Scalar.Clamp(ballPos.x, bx - this.width / 2, bx + this.width / 2);
    const cy = BABYLON.Scalar.Clamp(ballPos.y, by - this.height / 2, by + this.height / 2);
    const cz = BABYLON.Scalar.Clamp(ballPos.z, bz - this.depth / 2, bz + this.depth / 2);
    const dx = ballPos.x - cx, dy = ballPos.y - cy, dz = ballPos.z - cz;
    return dx * dx + dy * dy + dz * dz < radius * radius;
  }
}

/** Growth pickup — 2 second growth spurt: bigger, heavier, smashes smashers. */
export class GrowthPickup {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public collected = false;
  private rings: BABYLON.Mesh[] = [];
  private t = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('growth', scene);
    this.mesh.position = this.pos;
    const core = BABYLON.MeshBuilder.CreateSphere('growthCore', { diameter: 0.8, segments: 14 }, scene);
    core.parent = this.mesh;
    core.material = mats.glow('growthCore', [0.5, 1.0, 0.5]);
    core.renderingGroupId = 1;
    for (let i = 0; i < 3; i++) {
      const r = BABYLON.MeshBuilder.CreateTorus('growthRing', { diameter: 1 + i * 0.4, thickness: 0.07, tessellation: 20 }, scene);
      r.parent = this.mesh;
      r.rotation.x = Math.PI / 2;
      r.rotation.z = i * 0.6;
      r.material = mats.glow('growthRing', [0.7, 1.0, 0.4], 0.7);
      r.renderingGroupId = 1;
      this.rings.push(r);
    }
  }

  public update(dt: number) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 2;
    this.rings.forEach((r, i) => { r.rotation.z += dt * (1 + i); r.scaling.setAll(1 + Math.sin(this.t * 3 + i) * 0.1); });
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
}
