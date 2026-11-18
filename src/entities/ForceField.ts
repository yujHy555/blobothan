import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** Spinning force-field sphere pickup. */
export class ForceFieldPickup {
  public pos: BABYLON.Vector3;
  public collected = false;
  private mesh: BABYLON.TransformNode;
  private t = Math.random() * 6;
  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('forceFieldPickup', scene);
    this.mesh.position = this.pos;
    const orb = BABYLON.MeshBuilder.CreateSphere('forceOrb', { diameter: 1.0, segments: 16 }, scene);
    orb.parent = this.mesh;
    const mat = new BABYLON.PBRMaterial('forceOrbMat', scene);
    mat.albedoColor = new BABYLON.Color3(0.1, 0.5, 1.0);
    mat.emissiveColor = new BABYLON.Color3(0.2, 0.8, 1.0);
    mat.alpha = 0.55; mat.metallic = 0.4; mat.roughness = 0.15;
    orb.material = mat;
    const ring = BABYLON.MeshBuilder.CreateTorus('forceRing', { diameter: 1.5, thickness: 0.08, tessellation: 24 }, scene);
    ring.parent = this.mesh; ring.rotation.x = Math.PI / 2;
    ring.material = mats.glow('forceRingMat', [0.3, 1, 1]);
    const light = new BABYLON.PointLight('forcePickupLight', BABYLON.Vector3.Zero(), scene);
    light.parent = this.mesh; light.diffuse = new BABYLON.Color3(0.3, 0.8, 1); light.intensity = 0.9; light.range = 8;
  }
  public update(dt: number) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 1.5;
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 2) * 0.3;
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
  public dispose() { this.mesh.dispose(false, false); }
}

/** Protective bubble that absorbs drone bolts for a limited time. */
export class ForceField {
  public active = false;
  public timeLeft = 0;
  private shield: BABYLON.Mesh;
  private rings: BABYLON.Mesh[] = [];
  private mat: BABYLON.PBRMaterial;
  private t = 0;
  private light: BABYLON.PointLight;
  public onAbsorb?: (x: number, y: number) => void;
  public onExpire?: () => void;

  constructor(scene: BABYLON.Scene, mats: Materials, parent: BABYLON.TransformNode) {
    this.mat = new BABYLON.PBRMaterial('forceShieldMat', scene);
    this.mat.albedoColor = new BABYLON.Color3(0.1, 0.5, 1.0);
    this.mat.emissiveColor = new BABYLON.Color3(0.15, 0.7, 1.0);
    this.mat.alpha = 0.28;
    this.mat.metallic = 0.5; this.mat.roughness = 0.1;
    this.mat.backFaceCulling = true;

    this.shield = BABYLON.MeshBuilder.CreateSphere('forceShield', { diameter: 3.6, segments: 20 }, scene);
    this.shield.parent = parent;
    this.shield.material = this.mat;
    this.shield.setEnabled(false);

    for (let i = 0; i < 3; i++) {
      const ring = BABYLON.MeshBuilder.CreateTorus('forceShieldRing', { diameter: 3.7, thickness: 0.05, tessellation: 30 }, scene);
      ring.parent = parent;
      ring.rotation.set(Math.PI / 2 * i / 3, i * 0.8, i * 0.5);
      ring.material = mats.glow('forceShieldRingMat', [0.3, 0.9, 1.0], 0.8);
      ring.setEnabled(false);
      this.rings.push(ring);
    }
    this.light = new BABYLON.PointLight('forceShieldLight', BABYLON.Vector3.Zero(), scene);
    this.light.parent = parent; this.light.diffuse = new BABYLON.Color3(0.2, 0.7, 1);
    this.light.intensity = 0; this.light.range = 10;
  }

  public activate(seconds = 12) { this.active = true; this.timeLeft = seconds; }
  public absorb(x: number, y: number) {
    if (!this.active) return false;
    this.timeLeft = Math.max(0, this.timeLeft - 2.5);
    this.onAbsorb?.(x, y);
    return true;
  }
  public update(dt: number) {
    this.t += dt;
    if (this.active) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.active = false;
        this.shield.setEnabled(false);
        for (const r of this.rings) r.setEnabled(false);
        this.light.intensity = 0;
        this.onExpire?.();
        return;
      }
      this.shield.setEnabled(true);
      for (const r of this.rings) { r.setEnabled(true); r.rotation.y += dt * (1 + Math.random()); }
      const pulse = 0.24 + Math.sin(this.t * 6) * 0.08 + (this.timeLeft < 3 ? Math.sin(this.t * 18) * 0.1 : 0);
      this.mat.alpha = Math.max(0.1, pulse);
      this.light.intensity = 0.8 + Math.sin(this.t * 6) * 0.3;
      this.shield.scaling.setAll(1 + Math.sin(this.t * 4) * 0.04);
    }
  }
  public reset() {
    this.active = false; this.timeLeft = 0;
    this.shield.setEnabled(false);
    for (const r of this.rings) r.setEnabled(false);
    this.light.intensity = 0;
  }
  public dispose() {
    this.shield.dispose();
    for (const r of this.rings) r.dispose();
    this.mat.dispose();
  }
}
