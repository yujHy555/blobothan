import * as BABYLON from 'babylonjs';
import { HavokWorld } from '../core/HavokWorld';
import { Materials } from '../art/Materials';

export interface UziPickupData { x: number; y: number; z: number; }

/** Spinning golden "SLIME UZI" pickup. */
export class UziPickup {
  public pos: BABYLON.Vector3;
  public collected = false;
  private mesh: BABYLON.TransformNode;
  private t = Math.random() * 6;

  constructor(scene: BABYLON.Scene, mats: Materials, data: UziPickupData) {
    this.pos = new BABYLON.Vector3(data.x, data.y, data.z);
    this.mesh = new BABYLON.TransformNode('uziPickup', scene);
    this.mesh.position = this.pos;

    const gunMetal = new BABYLON.PBRMaterial('uziMetal', scene);
    gunMetal.albedoColor = new BABYLON.Color3(0.12, 0.14, 0.18);
    gunMetal.metallic = 0.8;
    gunMetal.roughness = 0.3;
    const gold = mats.glow('uziGold', [1, 0.8, 0.25]);

    const body = BABYLON.MeshBuilder.CreateBox('uziBody', { width: 0.9, height: 0.28, depth: 0.22 }, scene);
    body.parent = this.mesh; body.material = gunMetal;
    const barrel = BABYLON.MeshBuilder.CreateCylinder('uziBarrel', { diameter: 0.1, height: 0.6, tessellation: 10 }, scene);
    barrel.parent = this.mesh; barrel.position.set(0.65, 0, 0); barrel.rotation.z = Math.PI / 2; barrel.material = gunMetal;
    const mag = BABYLON.MeshBuilder.CreateBox('uziMag', { width: 0.18, height: 0.5, depth: 0.16 }, scene);
    mag.parent = this.mesh; mag.position.set(-0.05, -0.35, 0); mag.rotation.z = 0.2; mag.material = gold;
    const slime = BABYLON.MeshBuilder.CreateSphere('uziSlime', { diameter: 0.3, segments: 10 }, scene);
    slime.parent = this.mesh; slime.position.set(-0.3, 0.15, 0); slime.material = mats.glow('uziSlimeMat', [1, 0.2, 0.6], 0.9);
  }

  public update(dt: number) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 1.8;
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 2) * 0.3;
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
  public dispose() { this.mesh.dispose(false, true); }
}

interface Bullet {
  mesh: BABYLON.Mesh;
  body: BABYLON.PhysicsBody;
  life: number;
  dir: BABYLON.Vector3;
}

interface Target {
  mesh: BABYLON.Mesh;
  body: BABYLON.PhysicsBody;
  alive: boolean;
}

/**
 * AAA Havok shooting: bullets and destructible crates are REAL Havok dynamic
 * bodies. Bullets get impulses; crates go tumbling with authentic physics.
 */
export class UziSystem {
  public hasUzi = false;
  public ammo = 0;
  public readonly maxAmmo = 24;
  private cooldown = 0;
  private bullets: Bullet[] = [];
  private targets: Target[] = [];
  private scene: BABYLON.Scene;
  private havok: HavokWorld;
  private mats: Materials;
  public onShoot?: () => void;
  public onHit?: (points: number, x: number, y: number) => void;
  public onEmpty?: () => void;

  constructor(scene: BABYLON.Scene, havok: HavokWorld, mats: Materials) {
    this.scene = scene; this.havok = havok; this.mats = mats;
  }

  public grant() { this.hasUzi = true; this.ammo = this.maxAmmo; }

  /** Spawn destructible physics crates. */
  public addTargets(spots: UziPickupData[]) {
    for (const s of spots) {
      const mesh = BABYLON.MeshBuilder.CreateBox('shootCrate', { size: 1.1 }, this.scene);
      mesh.position.set(s.x, s.y, s.z);
      mesh.material = this.mats.glow('crateMat', [0.95, 0.78, 0.25], 0.95);
      mesh.enableEdgesRendering(); mesh.edgesWidth = 0.08;
      mesh.edgesColor = new BABYLON.Color4(0.5, 0.28, 0.02, 1);
      mesh.receiveShadows = true;
      const body = this.havok.dynamicBody(mesh, this.havok.boxShape(1.1, 1.1, 1.1, this.scene), {
        mass: 2.5, linearDamping: 0.2, angularDamping: 0.2,
      });
      // spawn slightly above so it settles onto the platform
      this.targets.push({ mesh, body, alive: true });
    }
  }

  public fire(origin: BABYLON.Vector3, dir: BABYLON.Vector3) {
    if (!this.hasUzi || this.ammo <= 0 || this.cooldown > 0) {
      if (this.hasUzi && this.ammo <= 0) this.onEmpty?.();
      return false;
    }
    this.cooldown = 0.11;
    this.ammo--;
    const direction = dir.clone().normalize();
    const mesh = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.22, segments: 8 }, this.scene);
    mesh.position.copyFrom(origin.add(direction.scale(1.1)));
    mesh.material = this.mats.glow('bulletMat', [1, 0.9, 0.4]);
    mesh.renderingGroupId = 1;
    const body = this.havok.dynamicBody(mesh, this.havok.sphereShape(0.11, this.scene), { mass: 0.2 });
    // no gravity for bullets — straight arcade tracer
    (body as any).setGravityFactor?.(0);
    body.setLinearVelocity(direction.scale(46));
    (body as any).disablePreStep = false;
    this.bullets.push({ mesh, body, life: 1.4, dir: direction });
    this.onShoot?.();
    return true;
  }

  public update(dt: number) {
    if (this.cooldown > 0) this.cooldown -= dt;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0 || b.mesh.position.y < -30) {
        b.body.dispose(); b.mesh.dispose(); this.bullets.splice(i, 1); continue;
      }
      // hit test against crates
      for (const t of this.targets) {
        if (!t.alive) continue;
        if (BABYLON.Vector3.Distance(b.mesh.position, t.mesh.position) < 1.15) {
          // Real Havok impulse — crate tumbles, spins, and collides
          const hit = t.mesh.position.clone();
          this.havok.addImpulse(t.body, b.dir.scale(9), hit);
          t.mesh.scaling.setAll(0.85);
          setTimeout(() => { if (t.mesh && !t.mesh.isDisposed()) t.mesh.scaling.setAll(1); }, 120);
          this.onHit?.(100, t.mesh.position.x, t.mesh.position.y);
          b.body.dispose(); b.mesh.dispose(); this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  public reset() {
    for (const b of this.bullets) { b.body.dispose(); b.mesh.dispose(); }
    this.bullets = [];
    this.ammo = 0; this.hasUzi = false; this.cooldown = 0;
    for (const t of this.targets) { t.alive = true; t.mesh.setEnabled(true); t.mesh.scaling.setAll(1); }
  }

  public dispose() {
    for (const b of this.bullets) { b.body.dispose(); b.mesh.dispose(); }
    for (const t of this.targets) { t.body.dispose(); t.mesh.dispose(); }
    this.bullets = []; this.targets = [];
  }
}
