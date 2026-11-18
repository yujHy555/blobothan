import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** Collectible jetpack booster pack — increases thrust & top speed. */
export class BoosterPack {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public collected = false;
  private t = Math.random() * 6;
  private flames: BABYLON.Mesh[] = [];

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('boosterPack', scene);
    this.mesh.position = this.pos;
    const metal = mats.glow('boosterMetal', [1, 0.65, 0.15]);
    const can = BABYLON.MeshBuilder.CreateCylinder('boosterCan', { diameter: 0.55, height: 1.0, tessellation: 12 }, scene);
    can.parent = this.mesh; can.material = metal;
    const band = BABYLON.MeshBuilder.CreateTorus('boosterBand', { diameter: 0.6, thickness: 0.09, tessellation: 16 }, scene);
    band.parent = this.mesh; band.position.y = 0.2; band.material = mats.glow('boosterBandMat', [0.3, 1, 1]);
    for (const sx of [-1, 1]) {
      const flame = BABYLON.MeshBuilder.CreateCylinder('boosterFlame', { diameter: 0.18, height: 0.6, tessellation: 10 }, scene);
      flame.parent = this.mesh; flame.position.set(sx * 0.18, -0.75, 0);
      flame.material = mats.glow('boosterFlameMat', [1, 0.4, 0.1], 0.9);
      this.flames.push(flame);
    }
    const light = new BABYLON.PointLight('boosterLight', BABYLON.Vector3.Zero(), scene);
    light.parent = this.mesh; light.diffuse = new BABYLON.Color3(1, 0.6, 0.2); light.intensity = 0.7; light.range = 7;
  }
  public update(dt: number) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 1.5;
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 2) * 0.25;
    this.flames.forEach((f, i) => f.scaling.y = 0.8 + Math.sin(this.t * 12 + i) * 0.35);
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
  public dispose() { this.mesh.dispose(false, false); }
}
