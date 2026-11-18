import * as BABYLON from 'babylonjs';
import { HavokWorld } from '../core/HavokWorld';
import { Materials } from '../art/Materials';

/**
 * The Mad Hat Rabbit — an Alice-in-Wonderland style enemy built from a true
 * multi-body Havok ragdoll: head, torso, 4 limbs and 2 ears connected by
 * ball-and-socket constraints, topped with a bowler hat.
 *
 * While "alive" it hops toward the player using an impulse on the torso.
 * When hit, all bodies go fully limp → authentic flopping ragdoll physics.
 */
export class RabbitEnemy {
  public root: BABYLON.TransformNode;
  public bodies: BABYLON.PhysicsBody[] = [];
  public alive = true;
  public head: BABYLON.TransformNode;

  private scene: BABYLON.Scene;
  private world: HavokWorld;
  private spawn: BABYLON.Vector3;
  private hopTimer = 1 + Math.random();
  private limpTimer = 0;
  private target: BABYLON.Vector3 | null = null;

  constructor(scene: BABYLON.Scene, world: HavokWorld, mats: Materials, spawn: BABYLON.Vector3) {
    this.scene = scene;
    this.world = world;
    this.spawn = spawn.clone();
    this.root = new BABYLON.TransformNode('rabbitRoot', scene);
    this.root.position = spawn.clone();

    const fur = mats.rabbitFur();
    const pink = mats.glow('rabbitPink', [1.0, 0.55, 0.72]);
    const eyeMat = mats.pupil();

    // ---- Torso ----
    const torso = BABYLON.MeshBuilder.CreateCapsule('rabbitTorso', { radius: 0.55, height: 1.5, tessellation: 12 }, scene);
    torso.position = spawn.add(new BABYLON.Vector3(0, 0.2, 0));
    torso.material = fur;
    const torsoBody = world.dynamicBody(torso, world.capsuleShape(0.55, 1.5, scene), { mass: 2.2, linearDamping: 0.4, angularDamping: 0.7 });
    this.bodies.push(torsoBody);

    // ---- Head ----
    const headMesh = BABYLON.MeshBuilder.CreateSphere('rabbitHead', { diameter: 1.05, segments: 14 }, scene);
    headMesh.position = spawn.add(new BABYLON.Vector3(0, 1.35, 0));
    headMesh.material = fur;
    const headBody = world.dynamicBody(headMesh, world.sphereShape(0.52, scene), { mass: 1.1, linearDamping: 0.4, angularDamping: 0.6 });
    this.bodies.push(headBody);
    this.head = headMesh;

    // Eyes + nose on head
    for (const sx of [-1, 1]) {
      const e = BABYLON.MeshBuilder.CreateSphere('rabbitEye', { diameter: 0.2, segments: 10 }, scene);
      e.parent = headMesh;
      e.position = new BABYLON.Vector3(sx * 0.24, 0.16, 0.45);
      e.material = eyeMat;
    }
    const nose = BABYLON.MeshBuilder.CreateSphere('rabbitNose', { diameter: 0.14, segments: 8 }, scene);
    nose.parent = headMesh;
    nose.position = new BABYLON.Vector3(0, 0.0, 0.54);
    nose.material = pink;

    // Bowler hat (classic Alice silhouette): brim + dome + band
    const brim = BABYLON.MeshBuilder.CreateCylinder('hatBrim', { diameter: 1.2, height: 0.08, tessellation: 20 }, scene);
    brim.parent = headMesh;
    brim.position = new BABYLON.Vector3(0, 0.5, 0);
    brim.material = mats.hat();
    const dome = BABYLON.MeshBuilder.CreateSphere('hatDome', { diameter: 0.78, segments: 16, slice: 0.5 }, scene);
    dome.parent = headMesh;
    dome.position = new BABYLON.Vector3(0, 0.52, 0);
    dome.scaling.y = 1.15;
    dome.material = mats.hat();
    const band = BABYLON.MeshBuilder.CreateCylinder('hatBand', { diameter: 0.8, height: 0.12, tessellation: 20 }, scene);
    band.parent = headMesh;
    band.position = new BABYLON.Vector3(0, 0.53, 0);
    band.material = mats.hatBand();

    // ---- Ears (long, floppy) ----
    const earBodies: BABYLON.PhysicsBody[] = [];
    for (const sx of [-1, 1]) {
      const ear = BABYLON.MeshBuilder.CreateCapsule('rabbitEar', { radius: 0.16, height: 1.1, tessellation: 10 }, scene);
      ear.position = spawn.add(new BABYLON.Vector3(sx * 0.24, 2.3, 0));
      ear.material = fur;
      const eb = world.dynamicBody(ear, world.capsuleShape(0.16, 1.1, scene), { mass: 0.3, linearDamping: 0.5, angularDamping: 0.5 });
      this.bodies.push(eb);
      earBodies.push(eb);
      this.world.ballSocket(headBody, eb, new BABYLON.Vector3(sx * 0.24, 0.5, 0), new BABYLON.Vector3(0, 0.5, 0), scene);
    }

    // ---- Limbs ----
    const limbPositions = [
      new BABYLON.Vector3(-0.42, -0.55, 0),  // back-left
      new BABYLON.Vector3(0.42, -0.55, 0),   // back-right
      new BABYLON.Vector3(-0.42, 0.35, 0),   // front-left
      new BABYLON.Vector3(0.42, 0.35, 0),    // front-right
    ];
    for (const lp of limbPositions) {
      const limb = BABYLON.MeshBuilder.CreateCapsule('rabbitLimb', { radius: 0.16, height: 0.8, tessellation: 10 }, scene);
      limb.position = spawn.add(lp);
      limb.material = fur;
      const lb = world.dynamicBody(limb, world.capsuleShape(0.16, 0.8, scene), { mass: 0.35, linearDamping: 0.4, angularDamping: 0.5 });
      this.bodies.push(lb);
      const py = lp.y - spawn.y;
      this.world.ballSocket(torsoBody, lb, new BABYLON.Vector3(Math.sign(lp.x) * 0.4, py, 0), new BABYLON.Vector3(0, 0.35, 0), scene);
    }

    // Head ↔ torso
    this.world.ballSocket(torsoBody, headBody, new BABYLON.Vector3(0, 0.75, 0), new BABYLON.Vector3(0, -0.5, 0), scene);
  }

  public setTarget(p: BABYLON.Vector3) { this.target = p; }

  public update(dt: number) {
    if (!this.alive) {
      this.limpTimer += dt;
      return;
    }
    // Hop toward the player
    this.hopTimer -= dt;
    if (this.hopTimer <= 0) {
      this.hopTimer = 0.9 + Math.random() * 0.7;
      const torso = this.bodies[0];
      const pos = torso.transformNode.position;
      const v = this.world.getVelocity(torso);
      if (this.target) {
        const dir = this.target.subtract(pos);
        const horiz = new BABYLON.Vector3(dir.x, 0, dir.z);
        if (horiz.length() > 0.01) horiz.normalize();
        v.x += horiz.x * 4.5;
        v.z += horiz.z * 4.5;
      }
      v.y = 7 + Math.random() * 2;
      this.world.setVelocity(torso, v);
    }
  }

  /** Hit by player → full ragdoll collapse + outward impulse. */
  public flatten(hitFrom: BABYLON.Vector3) {
    if (!this.alive) return;
    this.alive = false;
    const torso = this.bodies[0];
    const pos = torso.transformNode.position;
    const away = pos.subtract(hitFrom);
    away.y = 0;
    if (away.length() > 0.01) away.normalize();
    for (const b of this.bodies) {
      const v = this.world.getVelocity(b);
      v.x += away.x * (5 + Math.random() * 4);
      v.y += 4 + Math.random() * 5;
      v.z += away.z * (5 + Math.random() * 4);
      this.world.setVelocity(b, v);
      b.setAngularVelocity(new BABYLON.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10));
    }
  }

  public reset() {
    this.alive = true;
    this.limpTimer = 0;
    // Teleport the whole ragdoll back to a loose cluster around spawn
    const offsets = [
      new BABYLON.Vector3(0, 0.2, 0), new BABYLON.Vector3(0, 1.35, 0),
      new BABYLON.Vector3(-0.24, 2.3, 0), new BABYLON.Vector3(0.24, 2.3, 0),
      new BABYLON.Vector3(-0.42, -0.55, 0), new BABYLON.Vector3(0.42, -0.55, 0),
      new BABYLON.Vector3(-0.42, 0.35, 0), new BABYLON.Vector3(0.42, 0.35, 0),
    ];
    this.bodies.forEach((b, i) => {
      this.world.teleport(b, this.spawn.add(offsets[i] ?? BABYLON.Vector3.Zero()));
    });
  }

  public get torsoPosition() { return this.bodies[0]?.transformNode.position ?? this.spawn; }
  public dispose() { this.root.dispose(false, true); }
}
