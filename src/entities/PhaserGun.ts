import * as BABYLON from 'babylonjs';
import { HavokWorld } from '../core/HavokWorld';
import { Materials } from '../art/Materials';

interface Shot { mesh: BABYLON.Mesh; body: BABYLON.PhysicsBody; life: number; dir: BABYLON.Vector3; }

/** Spinning retro phaser pickup. */
export class PhaserPickup {
  public pos: BABYLON.Vector3;
  public collected = false;
  private mesh: BABYLON.TransformNode;
  private t = Math.random() * 6;
  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('phaserPickup', scene);
    this.mesh.position = this.pos;
    const metal = mats.glow('phaserMetal', [0.2, 0.9, 1.0]);
    const body = BABYLON.MeshBuilder.CreateBox('phaserBody', { width: 1.0, height: 0.28, depth: 0.26 }, scene);
    body.parent = this.mesh; body.material = metal;
    const barrel = BABYLON.MeshBuilder.CreateCylinder('phaserBarrel', { diameter: 0.12, height: 0.55, tessellation: 10 }, scene);
    barrel.parent = this.mesh; barrel.position.x = 0.7; barrel.rotation.z = Math.PI / 2; barrel.material = metal;
    const cell = BABYLON.MeshBuilder.CreateSphere('phaserCell', { diameter: 0.3, segments: 10 }, scene);
    cell.parent = this.mesh; cell.position.set(-0.2, 0.2, 0); cell.material = mats.glow('phaserCellMat', [1, 0.3, 0.85]);
    const light = new BABYLON.PointLight('phaserLight', BABYLON.Vector3.Zero(), scene);
    light.parent = this.mesh; light.diffuse = new BABYLON.Color3(0.2, 0.9, 1); light.intensity = 0.7; light.range = 7;
  }
  public update(dt: number) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 2;
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 2) * 0.3;
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
  public dispose() { this.mesh.dispose(false, false); }
}

/** Retro phaser with AAA beam+muzzle flash animation and Havok bolts. */
export class PhaserGun {
  public hasGun = false;
  public ammo = 0;
  public readonly maxAmmo = 30;
  private cooldown = 0;
  private shots: Shot[] = [];
  private scene: BABYLON.Scene;
  private world: HavokWorld;
  private mats: Materials;
  private muzzle: BABYLON.Mesh;
  private muzzleLight: BABYLON.PointLight;
  private gunMesh: BABYLON.TransformNode;
  private recoil = 0;
  private flashTimer = 0;
  private t = 0;
  public onShoot?: (x: number, y: number, dir: BABYLON.Vector3) => void;
  public onHit?: (points: number, x: number, y: number) => void;
  public onEmpty?: () => void;

  constructor(scene: BABYLON.Scene, world: HavokWorld, mats: Materials, parent: BABYLON.TransformNode) {
    this.scene = scene; this.world = world; this.mats = mats;
    // Muzzle flash mounted on the player, facing the way he's going
    this.muzzle = BABYLON.MeshBuilder.CreateSphere('phaserMuzzle', { diameter: 0.6, segments: 10 }, scene);
    this.muzzle.parent = parent;
    this.muzzle.position.set(1.0, -0.1, -0.5);
    this.muzzle.material = mats.glow('muzzleMat', [0.6, 1, 1]);
    this.muzzle.setEnabled(false);
    this.muzzleLight = new BABYLON.PointLight('muzzleLight', BABYLON.Vector3.Zero(), scene);
    this.muzzleLight.parent = this.muzzle;
    this.muzzleLight.diffuse = new BABYLON.Color3(0.3, 1, 1);
    this.muzzleLight.range = 10;
    this.muzzleLight.intensity = 0;

    // Visible retro phaser held in the hero's actual right-hand glove
    this.gunMesh = new BABYLON.TransformNode('heldPhaser', scene);
    this.gunMesh.parent = parent;
    this.gunMesh.position.set(0.1, -0.05, -0.1); // nestled in the glove
    const gunMat = mats.glow('heldPhaserMat', [0.25, 0.95, 1]);
    const darkMat = mats.glow('heldPhaserDark', [0.1, 0.2, 0.3]);
    // Compact gun scaled for a small glove hand
    this.gunMesh.scaling.setAll(0.55);
    const body = BABYLON.MeshBuilder.CreateBox('heldPhaserBody', { width: 0.55, height: 0.18, depth: 0.18 }, scene);
    body.parent = this.gunMesh; body.material = darkMat;
    const barrel = BABYLON.MeshBuilder.CreateCylinder('heldPhaserBarrel', { diameter: 0.1, height: 0.45, tessellation: 10 }, scene);
    barrel.parent = this.gunMesh; barrel.position.set(0.42, 0, 0); barrel.rotation.z = Math.PI / 2; barrel.material = gunMat;
    const grip = BABYLON.MeshBuilder.CreateBox('heldPhaserGrip', { width: 0.12, height: 0.22, depth: 0.12 }, scene);
    grip.parent = this.gunMesh; grip.position.set(0.05, -0.16, 0); grip.material = gunMat;
    const cell = BABYLON.MeshBuilder.CreateSphere('heldPhaserCell', { diameter: 0.14, segments: 10 }, scene);
    cell.parent = this.gunMesh; cell.position.set(0.18, 0.04, 0); cell.material = mats.glow('heldPhaserCell', [1, 0.3, 0.8]);
    this.gunMesh.setEnabled(false);
  }

  public grant() { this.hasGun = true; this.ammo = this.maxAmmo; this.gunMesh.setEnabled(true); }

  /** The gun is parented to the hand — just keep it pointed with facing and
   *  toggle its glow when out of ammo. The arm animation does the rest. */
  public aim(facing: number, hasAmmo: boolean) {
    if (!this.hasGun) return;
    this.gunMesh.setEnabled(true);
    const dir = facing >= 0 ? 1 : -1;
    this.aimDir = dir;
    // Gun is parented to the RIGHT HAND always — never swaps. Just mirror the
    // barrel to point the way he faces. Position stays nestled in the glove.
    this.gunMesh.position.set(0.1, -0.05, -0.1);
    this.gunMesh.scaling.set(0.55 * dir, 0.55, 0.55);
    this.gunMesh.rotation.set(0, 0, 0);
    // Glow dims when out of ammo but the gun is still visibly held
    this.gunMesh.getChildMeshes().forEach(m => {
      const mat = m.material as BABYLON.StandardMaterial;
      if (mat && mat.emissiveColor) mat.alpha = hasAmmo ? 1 : 0.4;
    });
  }

  /** Fire a Havok-driven phaser bolt. Returns true if a shot was fired. */
  public fire(origin: BABYLON.Vector3, dir: BABYLON.Vector3) {
    if (!this.hasGun || this.ammo <= 0 || this.cooldown > 0) {
      if (this.hasGun && this.ammo <= 0) this.onEmpty?.();
      return false;
    }
    this.cooldown = 0.16;
    this.ammo--;
    const d = dir.clone().normalize();

    // Muzzle flash + beam animation
    // Big muzzle flare + light
    const muzzleWorld = this.gunMesh.getAbsolutePosition();
    this.muzzle.position.copyFrom(muzzleWorld.add(d.scale(0.7)));
    this.muzzle.parent = null; // free-floating flare at world position
    this.muzzle.setEnabled(true);
    this.muzzleLight.parent = this.muzzle;
    this.muzzleLight.intensity = 4;
    this.flashTimer = 0.18;
    this.recoil = 1;
    this.muzzle.scaling.setAll(2.2);
    // Thick bright beam from the gun
    const beam = BABYLON.MeshBuilder.CreateCylinder('phaserBeam', { diameter: 0.42, height: 3.2, tessellation: 8 }, this.scene);
    beam.position = origin.add(d.scale(1.6));
    beam.rotation.z = -Math.atan2(d.x, d.y);
    beam.material = this.mats.glow('phaserBeamMat', [0.6, 1, 1], 0.9);
    (beam as any)._beamLife = 0.18;
    this.beams.push(beam);

    // Havok bolt — gravity off, straight arcade tracer
    const mesh = BABYLON.MeshBuilder.CreateSphere('phaserBolt', { diameter: 0.35, segments: 8 }, this.scene);
    mesh.position.copyFrom(origin.add(d.scale(1.3)));
    mesh.material = this.mats.glow('phaserBoltMat', [0.4, 1.0, 1.0]);
    const body = this.world.dynamicBody(mesh, this.world.sphereShape(0.17, this.scene), { mass: 0.2 });
    (body as any).setGravityFactor?.(0);
    body.setLinearVelocity(d.scale(52));
    this.shots.push({ mesh, body, life: 1.2, dir: d });

    this.onShoot?.(origin.x, origin.y, d);
    return true;
  }
  private beams: BABYLON.Mesh[] = [];
  private aimDir = 1;
  private colliders: any[] = [];
  public setColliders(c: any[]) { this.colliders = c; }

  /** Test shots against a callback providing hit targets (drones/crates). */
  public update(dt: number, targets: { pos: BABYLON.Vector3; radius: number; hit: (from: BABYLON.Vector3) => void }[]) {
    this.t += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.muzzle.scaling.setAll(0.6 + this.flashTimer * 8);
      this.muzzleLight.intensity = this.flashTimer * 20;
      if (this.flashTimer <= 0) this.muzzle.setEnabled(false);
    }
    // Recoil applied RELATIVE to the glove-local base pose (keeps facing right)
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 7);
    this.gunMesh.position.x = 0.1 - this.recoil * 0.12;
    this.gunMesh.rotation.z = -this.aimDir * this.recoil * 0.2;
    this.gunMesh.scaling.set(0.55 * this.aimDir * (1 + this.recoil * 0.12), 0.55, 0.55);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      (b as any)._beamLife -= dt;
      (b.material as BABYLON.StandardMaterial).alpha = Math.max(0, (b as any)._beamLife / 0.12) * 0.85;
      b.scaling.x = b.scaling.z = Math.max(0.1, (b as any)._beamLife / 0.12);
      if ((b as any)._beamLife <= 0) { b.dispose(); this.beams.splice(i, 1); }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      // Shots die when they hit a level wall/platform — no shooting through
      const p = s.mesh.position;
      let spent = s.life <= 0 || p.y < -30;
      if (!spent) {
        for (const c of this.colliders) {
          if (p.x > c.x - c.w / 2 && p.x < c.x + c.w / 2 &&
              p.y > c.y - c.h / 2 && p.y < c.y + c.h / 2 &&
              p.z > c.z - c.d / 2 && p.z < c.z + c.d / 2) {
            spent = true; break;
          }
        }
      }
      if (!spent) {
        for (const t of targets) {
          if (BABYLON.Vector3.Distance(s.mesh.position, t.pos) < t.radius) {
            t.hit(s.mesh.position.clone());
            this.onHit?.(100, t.pos.x, t.pos.y);
            spent = true; break;
          }
        }
      }
      if (spent) { s.body.dispose(); s.mesh.dispose(); this.shots.splice(i, 1); }
    }
  }

  public reset() {
    for (const s of this.shots) { s.body.dispose(); s.mesh.dispose(); }
    this.shots = [];
    for (const b of this.beams) b.dispose();
    this.beams = [];
    this.hasGun = false; this.ammo = 0; this.cooldown = 0;
    this.muzzle.setEnabled(false);
    this.gunMesh.setEnabled(false);
  }
  public dispose() {
    for (const s of this.shots) { s.body.dispose(); s.mesh.dispose(); }
    for (const b of this.beams) b.dispose();
    this.muzzle.dispose();
    this.gunMesh.dispose(false, false);
  }
}
