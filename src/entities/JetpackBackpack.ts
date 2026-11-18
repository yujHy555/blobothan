import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** A procedurally generated soft particle texture (radial glow). */
function softParticleTexture(scene: BABYLON.Scene, key: string, core: string, edge: string): BABYLON.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, core);
  g.addColorStop(0.35, edge);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new BABYLON.Texture(cv.toDataURL(), scene, false, false);
  (tex as any)._name = key;
  return tex;
}

/**
 * NEXT-GEN JETPACK BACKPACK — a wearable mesh with a live dual-nozzle
 * ParticleSystem. Attaches to the hero, roars to life during flight, and
 * idles with gentle embers. Uses Babylon's GPU-friendly CPU ParticleSystem
 * with procedural textures, color gradients, and velocity over lifetime.
 */
export class JetpackBackpack {
  public root: BABYLON.TransformNode;
  private scene: BABYLON.Scene;
  private thrusters: BABYLON.ParticleSystem[] = [];
  private idle: BABYLON.ParticleSystem;
  private nozzles: BABYLON.Mesh[] = [];
  private glowLights: BABYLON.PointLight[] = [];
  private emberEmitter!: BABYLON.Vector3;
  private active = false;
  private t = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, parent: BABYLON.TransformNode) {
    this.scene = scene;
    this.root = new BABYLON.TransformNode('jetpackBackpack', scene);
    this.root.parent = parent;
    // Mount on the back (opposite the face). Face is -Z, so backpack sits +Z.
    this.root.position = new BABYLON.Vector3(0, 0.25, 0.95);

    // Pack body: sleek twin-canister design
    const bodyMat = new BABYLON.PBRMaterial('packBody', scene);
    bodyMat.albedoColor = new BABYLON.Color3(0.12, 0.14, 0.2);
    bodyMat.metallic = 0.75;
    bodyMat.roughness = 0.28;
    const accentMat = mats.glow('packAccent', [0.4, 1.0, 1.0]);

    const pack = BABYLON.MeshBuilder.CreateBox('packCore', { width: 0.7, height: 0.85, depth: 0.4 }, scene);
    pack.parent = this.root;
    pack.material = bodyMat;
    pack.receiveShadows = true;

    // Two glowing canisters
    for (const sx of [-1, 1]) {
      const can = BABYLON.MeshBuilder.CreateCylinder('canister', { diameter: 0.3, height: 0.9, tessellation: 16 }, scene);
      can.parent = this.root;
      can.position.set(sx * 0.27, 0, 0.06);
      can.material = bodyMat;
      const band = BABYLON.MeshBuilder.CreateTorus('canBand', { diameter: 0.32, thickness: 0.06, tessellation: 16 }, scene);
      band.parent = can;
      band.position.y = 0.28;
      band.material = accentMat;

      // Nozzle at the bottom
      const noz = BABYLON.MeshBuilder.CreateCylinder('nozzle', { diameterTop: 0.22, diameterBottom: 0.32, height: 0.28, tessellation: 16 }, scene);
      noz.parent = this.root;
      noz.position.set(sx * 0.27, -0.55, 0.06);
      noz.material = bodyMat;
      this.nozzles.push(noz);

      // Point light at each nozzle (soft glow)
      const gl = new BABYLON.PointLight('nozzleGlow', BABYLON.Vector3.Zero(), scene);
      gl.parent = noz;
      gl.diffuse = new BABYLON.Color3(0.4, 0.85, 1.0);
      gl.intensity = 0;
      gl.range = 6;
      this.glowLights.push(gl);

      // Thrust particle system
      const ps = new BABYLON.ParticleSystem('thrust' + sx, 300, scene);
      ps.particleTexture = softParticleTexture(scene, 'thrust' + sx, 'rgba(255,255,255,1)', 'rgba(120,200,255,0.8)');
      ps.emitter = noz;
      ps.minEmitBox = new BABYLON.Vector3(-0.06, -0.1, -0.06);
      ps.maxEmitBox = new BABYLON.Vector3(0.06, 0, 0.06);
      ps.color1 = new BABYLON.Color4(0.4, 0.85, 1.0, 1);
      ps.color2 = new BABYLON.Color4(1.0, 0.55, 0.9, 0.9);
      ps.colorDead = new BABYLON.Color4(0.2, 0.3, 0.6, 0);
      ps.minSize = 0.18; ps.maxSize = 0.5;
      ps.minLifeTime = 0.15; ps.maxLifeTime = 0.4;
      ps.emitRate = 0; // off until active
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
      ps.direction1 = new BABYLON.Vector3(-0.5, -4, -0.5);
      ps.direction2 = new BABYLON.Vector3(0.5, -7, 0.5);
      ps.minEmitPower = 4; ps.maxEmitPower = 9;
      ps.updateSpeed = 0.02;
      ps.gravity = new BABYLON.Vector3(0, -2, 0);
      ps.start();
      this.thrusters.push(ps);
    }

    // Idle ember system (always on, subtle)
    this.idle = new BABYLON.ParticleSystem('packEmbers', 60, scene);
    this.idle.particleTexture = softParticleTexture(scene, 'ember', 'rgba(255,255,255,1)', 'rgba(120,255,220,0.7)');
    this.emberEmitter = new BABYLON.Vector3();
    this.idle.emitter = this.emberEmitter;
    this.idle.minEmitBox = new BABYLON.Vector3(-0.4, 0.4, 0);
    this.idle.maxEmitBox = new BABYLON.Vector3(0.4, 0.8, 0.2);
    this.idle.color1 = new BABYLON.Color4(0.4, 1, 0.85, 0.6);
    this.idle.color2 = new BABYLON.Color4(1, 0.9, 0.5, 0.5);
    this.idle.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    this.idle.minSize = 0.04; this.idle.maxSize = 0.12;
    this.idle.minLifeTime = 0.6; this.idle.maxLifeTime = 1.4;
    this.idle.emitRate = 18;
    this.idle.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this.idle.direction1 = new BABYLON.Vector3(-0.2, 0.3, -0.2);
    this.idle.direction2 = new BABYLON.Vector3(0.2, 0.6, 0.2);
    this.idle.minEmitPower = 0.2; this.idle.maxEmitPower = 0.6;
    this.idle.updateSpeed = 0.015;
    this.idle.start();

    this.root.setEnabled(false); // hidden until picked up
  }

  public equip() { this.root.setEnabled(true); }
  public unequip() { this.root.setEnabled(false); this.setActive(false); }

  /** Toggle thruster roar. */
  public setActive(on: boolean) {
    this.active = on;
    for (const ps of this.thrusters) ps.emitRate = on ? 260 : 0;
    for (const gl of this.glowLights) gl.intensity = on ? 1.6 : 0;
  }

  public update(dt: number) {
    this.t += dt;
    this.root.computeWorldMatrix(true);
    const wp = this.root.getAbsolutePosition();
    this.emberEmitter.copyFrom(wp);
    this.emberEmitter.y += 0.6;
    if (this.active) {
      const pulse = 0.9 + Math.sin(this.t * 30) * 0.12;
      for (const ps of this.thrusters) ps.emitRate = 260 * pulse;
      this.root.scaling.setAll(1 + Math.sin(this.t * 20) * 0.02);
    } else {
      this.root.scaling.setAll(1);
    }
  }

  public dispose() {
    for (const ps of this.thrusters) ps.dispose();
    this.idle.dispose();
    this.root.dispose(false, true);
  }
}
