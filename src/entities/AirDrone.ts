import * as BABYLON from 'babylonjs';
import { HavokWorld } from '../core/HavokWorld';
import { Materials } from '../art/Materials';
import { BoxCollider } from './BallPlayer';

interface DroneBolt { mesh: BABYLON.Mesh; body: BABYLON.PhysicsBody; life: number; dir: BABYLON.Vector3; }

/**
 * AAA air drone enemy — a hovering Havok-driven hex drone that tracks the
 * player and fires bolts. Shooting it with the phaser triggers a Havok ragdoll
 * explosion of its parts and a big score/juice payoff.
 */
export class AirDrone {
  public root: BABYLON.TransformNode;
  public body: BABYLON.PhysicsBody;
  public alive = true;
  public pos: BABYLON.Vector3;
  private scene: BABYLON.Scene;
  private world: HavokWorld;
  private mats: Materials;
  private rotors: BABYLON.Mesh[] = [];
  private eye!: BABYLON.Mesh;
  private cpuLights: BABYLON.Mesh[] = [];
  private eyeLight!: BABYLON.PointLight;
  private spinLight!: BABYLON.PointLight;
  private debris: { mesh: BABYLON.Mesh; body: BABYLON.PhysicsBody }[] = [];
  private bolts: DroneBolt[] = [];
  private fireTimer: number;
  private t = Math.random() * 6;
  private spawn: BABYLON.Vector3;
  private colliders: BoxCollider[] = [];
  public onPlayerHit?: (x: number, y: number) => void;
  public onDestroyed?: (points: number, x: number, y: number) => void;
  public onZap?: () => void;

  constructor(scene: BABYLON.Scene, world: HavokWorld, mats: Materials, spawn: BABYLON.Vector3) {
    this.scene = scene; this.world = world; this.mats = mats;
    this.spawn = spawn.clone();
    this.pos = spawn.clone();
    this.fireTimer = 1.2 + Math.random();
    const metal = new BABYLON.PBRMaterial('droneMetal', scene);
    metal.albedoColor = new BABYLON.Color3(0.18, 0.2, 0.28);
    metal.metallic = 0.8; metal.roughness = 0.3;
    const red = mats.glow('droneEyeMat', [1.0, 0.2, 0.25]);

    // The HULL IS THE ROOT — Havok drives it directly so its position is world
    // space and the whole visual rig (children) follows it perfectly.
    const hull = BABYLON.MeshBuilder.CreateCylinder('droneHull', { diameter: 1.6, height: 0.45, tessellation: 6 }, scene);
    hull.position = spawn.clone();
    hull.material = metal;
    this.root = hull;
    // Glowing red eye
    this.eye = BABYLON.MeshBuilder.CreateSphere('droneEye', { diameter: 0.45, segments: 12 }, scene);
    this.eye.parent = this.root; this.eye.position.z = -0.7; this.eye.material = red;
    // Rotor arms + spinning rotors
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = BABYLON.MeshBuilder.CreateBox('droneArm', { width: 0.9, height: 0.12, depth: 0.18 }, scene);
      arm.parent = this.root;
      arm.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85);
      arm.rotation.y = -a;
      arm.material = metal;
      const rotor = BABYLON.MeshBuilder.CreateTorus('droneRotor', { diameter: 0.75, thickness: 0.07, tessellation: 18 }, scene);
      rotor.parent = this.root;
      rotor.position.set(Math.cos(a) * 1.25, 0.16, Math.sin(a) * 1.25);
      rotor.material = mats.glow('droneRotorMat', [0.4, 0.9, 1.0], 0.7);
      this.rotors.push(rotor);
    }
    // Glowing CPU panel with flashing indicator lights (the "brain")
    const panel = BABYLON.MeshBuilder.CreateBox('droneCPU', { width: 0.9, height: 0.06, depth: 0.6 }, scene);
    panel.parent = this.root; panel.position.y = 0.26;
    const panelMat = new BABYLON.PBRMaterial('dronePanelMat', scene);
    panelMat.albedoColor = new BABYLON.Color3(0.05, 0.08, 0.12);
    panelMat.metallic = 0.6; panelMat.roughness = 0.2;
    panel.material = panelMat;
    const panelColors: [number, number, number][] = [
      [0.2, 1, 0.5], [1, 0.85, 0.2], [1, 0.2, 0.35], [0.3, 0.6, 1],
      [1, 0.4, 0.9], [0.2, 1, 1],
    ];
    for (let i = 0; i < 6; i++) {
      const led = BABYLON.MeshBuilder.CreateBox('cpuLED', { width: 0.1, height: 0.03, depth: 0.1 }, scene);
      led.parent = panel;
      led.position.set(-0.3 + (i % 3) * 0.3, 0.06, -0.15 + Math.floor(i / 3) * 0.3);
      led.material = mats.glow(`cpuLEDMat${i}`, panelColors[i]);
      this.cpuLights.push(led);
    }
    // Pulsing eye light + spinning danger light
    this.eyeLight = new BABYLON.PointLight('droneLight', new BABYLON.Vector3(0, 0, -0.7), scene);
    this.eyeLight.parent = this.root; this.eyeLight.diffuse = new BABYLON.Color3(1, 0.2, 0.25);
    this.eyeLight.intensity = 1.2; this.eyeLight.range = 10;
    this.spinLight = new BABYLON.PointLight('droneSpinLight', new BABYLON.Vector3(0, 0.5, 0), scene);
    this.spinLight.parent = this.root; this.spinLight.diffuse = new BABYLON.Color3(0.3, 0.9, 1);
    this.spinLight.intensity = 0.8; this.spinLight.range = 6;

    // No-gravity dynamic body so Havok drives its hover + knockback
    this.body = world.dynamicBody(hull as BABYLON.Mesh, world.sphereShape(0.8, scene), { mass: 3, linearDamping: 0.5, angularDamping: 0.5 });
    (this.body as any).setGravityFactor?.(0);
    (this.body as any).disablePreStep = false;
  }

  public setColliders(c: BoxCollider[]) { this.colliders = c; }

  /** Is the straight line a→b blocked by a level box (wall/platform)? */
  private lineBlocked(a: BABYLON.Vector3, b: BABYLON.Vector3): boolean {
    const steps = Math.ceil(BABYLON.Vector3.Distance(a, b) / 0.6);
    for (const c of this.colliders) {
      const minX = c.x - c.w / 2, maxX = c.x + c.w / 2;
      const minY = c.y - c.h / 2, maxY = c.y + c.h / 2;
      const minZ = c.z - c.d / 2, maxZ = c.z + c.d / 2;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
        if (x > minX && x < maxX && y > minY && y < maxY && z > minZ && z < maxZ) return true;
      }
    }
    return false;
  }

  /** Push the drone's desired position out of any solid box (AABB). */
  private avoidWalls(pos: BABYLON.Vector3, radius = 1.0) {
    for (const c of this.colliders) {
      const minX = c.x - c.w / 2, maxX = c.x + c.w / 2;
      const minY = c.y - c.h / 2, maxY = c.y + c.h / 2;
      const minZ = c.z - c.d / 2, maxZ = c.z + c.d / 2;
      if (pos.x > minX - radius && pos.x < maxX + radius &&
          pos.y > minY - radius && pos.y < maxY + radius &&
          pos.z > minZ - radius && pos.z < maxZ + radius) {
        // Push out along the shallowest axis
        const px = Math.min(Math.abs(pos.x - (minX - radius)), Math.abs(pos.x - (maxX + radius)));
        const py = Math.min(Math.abs(pos.y - (minY - radius)), Math.abs(pos.y - (maxY + radius)));
        const pz = Math.min(Math.abs(pos.z - (minZ - radius)), Math.abs(pos.z - (maxZ + radius)));
        if (px <= py && px <= pz) pos.x = pos.x < c.x ? minX - radius : maxX + radius;
        else if (py <= pz) pos.y = pos.y < c.y ? minY - radius : maxY + radius;
        else pos.z = pos.z < c.z ? minZ - radius : maxZ + radius;
      }
    }
  }

  public update(dt: number, playerPos: BABYLON.Vector3) {
    this.t += dt;
    // Flashing CPU lights + pulsing eye + sweeping danger light — AAA next-gen
    for (let i = 0; i < this.cpuLights.length; i++) {
      const blink = (Math.sin(this.t * (9 + i * 1.7) + i * 2.1) + 1) * 0.5;
      this.cpuLights[i].scaling.setAll(0.5 + blink * 0.9);
    }
    this.eyeLight.intensity = 1.0 + Math.sin(this.t * 7) * 0.6;
    this.spinLight.intensity = 0.6 + Math.sin(this.t * 4) * 0.4;
    for (const r of this.rotors) r.rotation.y += dt * 26;
    if (!this.alive) { this.updateBolts(dt, playerPos); return; }

    this.pos = this.body.transformNode.position as BABYLON.Vector3;
    const dist = BABYLON.Vector3.Distance(this.pos, playerPos);
    const seesPlayer = dist < 22 && !this.lineBlocked(this.pos, playerPos);

    let target: BABYLON.Vector3;
    if (seesPlayer) {
      // PATROL→ATTACK: hover at the SIDE of the player, at his height, not
      // rushing straight at him. Side offset keeps it off the head.
      const side = this.pos.x > playerPos.x ? 1 : -1;
      target = playerPos.add(new BABYLON.Vector3(
        side * 9, 0.5 + Math.sin(this.t * 1.1), 0));
    } else {
      // PATROL: lazy figure-eight around the spawn point until the player is
      // actually visible (never beelines up to the player).
      target = this.spawn.add(new BABYLON.Vector3(
        Math.sin(this.t * 0.5) * 7, Math.sin(this.t * 0.35) * 1.5, 0));
    }
    const desiredVel = target.subtract(this.pos).scale(seesPlayer ? 1.1 : 0.7); // slow patrol/chase
    const next = this.pos.add(desiredVel.scale(dt));
    this.avoidWalls(next);
    const safeVel = next.subtract(this.pos).scale(1 / Math.max(dt, 1e-4));
    const v = this.world.getVelocity(this.body);
    this.world.setVelocity(this.body, v.scale(0.92).add(safeVel.scale(0.3)));
    this.avoidWalls(this.pos);
    this.body.transformNode.position.copyFrom(this.pos);
    this.body.transformNode.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);

    // Fire ONLY when the player is actually visible (never through walls)
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && seesPlayer) {
      this.fireTimer = 3.2 + Math.random() * 1.2; // slower, fairer attacks
      this.fireBolt(playerPos);
      this.onZap?.();
    }
    this.updateBolts(dt, playerPos);
  }

  private fireBolt(target: BABYLON.Vector3) {
    const origin = this.pos.clone();
    const dir = target.subtract(origin).normalize();
    const mesh = BABYLON.MeshBuilder.CreateSphere('droneBolt', { diameter: 0.4, segments: 8 }, this.scene);
    mesh.position = origin.clone();
    mesh.material = this.mats.glow('droneBoltMat', [1, 0.3, 0.2]);
    const body = this.world.dynamicBody(mesh, this.world.sphereShape(0.2, this.scene), { mass: 0.2 });
    (body as any).setGravityFactor?.(0);
    body.setLinearVelocity(dir.scale(24));
    this.bolts.push({ mesh, body, life: 2, dir });
  }

  private updateBolts(dt: number, playerPos: BABYLON.Vector3) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const done = b.life <= 0 || BABYLON.Vector3.Distance(b.mesh.position, playerPos) < 1.5;
      if (done) {
        if (b.life > 0) this.onPlayerHit?.(b.mesh.position.x, b.mesh.position.y);
        b.body.dispose(); b.mesh.dispose(); this.bolts.splice(i, 1);
      }
    }
  }

  /** Hit by a phaser bolt — the drone bursts into Havok debris. */
  public hit(from: BABYLON.Vector3) {
    if (!this.alive) return;
    this.alive = false;
    const dir = this.pos.subtract(from).normalize();
    // Blow the hull + eye + rotors apart with REAL Havok impulses
    const parts: BABYLON.Mesh[] = [this.body.transformNode as BABYLON.Mesh, this.eye, ...this.rotors];
    for (const p of parts) {
      if (!p || p.isDisposed()) continue;
      const db = this.world.dynamicBody(p, this.world.boxShape(0.5, 0.5, 0.5, this.scene), { mass: 0.6, linearDamping: 0.1 });
      (db as any).setGravityFactor?.(1);
      this.world.addImpulse(db, dir.scale(4 + Math.random() * 4).add(new BABYLON.Vector3(0, 3 + Math.random() * 3, 0)));
      this.debris.push({ mesh: p, body: db });
    }
    for (const b of this.bolts) { b.body.dispose(); b.mesh.dispose(); }
    this.bolts = [];
    this.onDestroyed?.(500, this.pos.x, this.pos.y);
  }

  public reset() {
    this.alive = true;
    this.world.teleport(this.body, this.spawn);
    this.pos = this.spawn.clone();
    this.fireTimer = 1.2 + Math.random();
    for (const d of this.debris) { d.body.dispose(); }
    this.debris = [];
  }

  public dispose() {
    for (const b of this.bolts) { b.body.dispose(); b.mesh.dispose(); }
    for (const d of this.debris) d.body.dispose();
    this.body.dispose();
    this.root.dispose(false, false);
  }
}
