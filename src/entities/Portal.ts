import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

export type PortalData = { x: number; y: number; z: number; targetRealm: number };

/** A slow-groove portal: a living vortex of swirling rings and orbiting motes. */
export class Portal {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public targetRealm: number;
  private rings: { mesh: BABYLON.Mesh; base: number; speed: number; phase: number }[] = [];
  private motes: BABYLON.Mesh[] = [];
  private core: BABYLON.Mesh;
  private coreMat: BABYLON.StandardMaterial;
  private light: BABYLON.PointLight;
  private cooldown = 0;
  private t = 0;
  private accent: [number, number, number];

  constructor(scene: BABYLON.Scene, mats: Materials, data: PortalData, accent: [number, number, number]) {
    this.pos = new BABYLON.Vector3(data.x, data.y, data.z);
    this.targetRealm = data.targetRealm;
    this.accent = accent;
    this.mesh = new BABYLON.TransformNode('portal', scene);
    this.mesh.position = this.pos;

    // NO rings — they used renderingGroupId=1 and drew in front of the player.
    // A single swirling disc reads as a portal and depth-tests normally.

    // Glowing core disc with a swirl gradient texture feel
    this.core = BABYLON.MeshBuilder.CreateDisc('portalCore', { radius: 0.8, tessellation: 48 }, scene);
    this.core.parent = this.mesh;
    this.coreMat = new BABYLON.StandardMaterial('portalCoreMat', scene);
    this.coreMat.diffuseColor = new BABYLON.Color3(accent[0], accent[1], accent[2]);
    this.coreMat.emissiveColor = new BABYLON.Color3(accent[0], accent[1], accent[2]).scale(0.9);
    this.coreMat.disableLighting = true;
    this.coreMat.alpha = 0.5;
    this.coreMat.backFaceCulling = false;
    this.core.material = this.coreMat;
    this.core.renderingGroupId = 0; // normal depth — never draws over the player

    // Inner bright eye
    const eye = BABYLON.MeshBuilder.CreateSphere('portalEye', { diameter: 0.7, segments: 16 }, scene);
    eye.parent = this.mesh;
    eye.position.z = -0.32; // in front of the core disc — no equator intersection
    eye.material = mats.glow('portalEyeMat', [1, 1, 1], 0.85);
    eye.renderingGroupId = 0;
    (eye as any).portalEye = true;

    // Orbiting energy motes
    for (let i = 0; i < 10; i++) {
      const m = BABYLON.MeshBuilder.CreateSphere('portalMote', { diameter: 0.12 + Math.random() * 0.14, segments: 8 }, scene);
      m.parent = this.mesh;
      m.material = mats.glow('portalMoteMat', accent, 0.9);
      m.renderingGroupId = 0;
      this.motes.push(m);
    }

    // Pulsing light
    this.light = new BABYLON.PointLight('portalLight', BABYLON.Vector3.Zero(), scene);
    this.light.parent = this.mesh;
    this.light.diffuse = new BABYLON.Color3(accent[0], accent[1], accent[2]);
    this.light.intensity = 1.0;
    this.light.range = 16;
  }

  public update(dt: number) {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Rings: counter-rotate, breathe radius independently, wobble tilt
    for (const r of this.rings) {
      const m = r.mesh;
      m.rotation.z += dt * r.speed;
      m.rotation.y += dt * r.speed * 0.4;
      m.rotation.x += Math.sin(this.t * 0.8 + r.phase) * dt * 0.15;
      const breathe = 1 + Math.sin(this.t * 1.6 + r.phase) * 0.05 + Math.sin(this.t * 0.5 + r.phase) * 0.02;
      m.scaling.set(breathe, breathe, 1);
    }

    // Core pulse + hue shift
    const cp = 1 + Math.sin(this.t * 2.4) * 0.12;
    this.core.scaling.set(cp, cp, 1);
    this.core.rotation.z += dt * 0.5;
    this.coreMat.alpha = 0.42 + Math.sin(this.t * 3) * 0.12;
    this.light.intensity = 0.9 + Math.sin(this.t * 2.4) * 0.35;

    // Motes orbit in 3D with independent radii/speeds
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const a = this.t * (0.8 + i * 0.12) + (i / this.motes.length) * Math.PI * 2;
      const rad = 1.4 + (i % 3) * 0.7 + Math.sin(this.t + i) * 0.2;
      m.position.set(
        Math.cos(a) * rad,
        Math.sin(a * 1.3) * 0.6,
        Math.sin(a) * rad * 0.5,
      );
      m.scaling.setAll(0.8 + Math.sin(this.t * 3 + i) * 0.3);
    }
  }

  public tryEnter(ballPos: BABYLON.Vector3): boolean {
    if (this.cooldown > 0) return false;
    if (BABYLON.Vector3.Distance(ballPos, this.pos) < 1.6) {
      this.cooldown = 2.5;
      return true;
    }
    return false;
  }

  public dispose() { this.mesh.dispose(false, true); }
}
