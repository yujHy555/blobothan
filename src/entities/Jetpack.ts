import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/** Jetpack pickup — grants the ball a burst of flight that refills over time. */
export class Jetpack {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public collected = false;
  private phase = Math.random() * 6;
  private flames: BABYLON.Mesh[] = [];

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('jetpack', scene);
    this.mesh.position = this.pos;

    // Canister
    const body = BABYLON.MeshBuilder.CreateCylinder('jetBody', { diameter: 0.5, height: 1.0, tessellation: 16 }, scene);
    body.material = mats.glow('jetBodyMat', [0.4, 0.8, 1.0]);
    body.parent = this.mesh;

    const band = BABYLON.MeshBuilder.CreateCylinder('jetBand', { diameter: 0.54, height: 0.18, tessellation: 16 }, scene);
    band.material = mats.glow('jetBandMat', [1.0, 0.7, 0.2]);
    band.parent = this.mesh;
    band.position.y = 0.15;

    // Nozzles + fake flames
    for (const sx of [-1, 1]) {
      const noz = BABYLON.MeshBuilder.CreateCylinder('jetNozzle', { diameter: 0.2, height: 0.25, tessellation: 10 }, scene);
      noz.material = mats.glow('jetNozMat', [0.7, 0.7, 0.8]);
      noz.parent = this.mesh;
      noz.position = new BABYLON.Vector3(sx * 0.18, -0.6, 0);
      const flame = BABYLON.MeshBuilder.CreateCylinder('jetFlame', { diameter: 0.14, height: 0.5, tessellation: 10 }, scene);
      flame.material = mats.glow('jetFlameMat', [1.0, 0.55, 0.15], 0.85);
      flame.parent = this.mesh;
      flame.position = new BABYLON.Vector3(sx * 0.18, -0.95, 0);
      this.flames.push(flame);
    }

    const light = new BABYLON.PointLight('jetLight', BABYLON.Vector3.Zero(), scene);
    light.parent = this.mesh;
    light.diffuse = new BABYLON.Color3(0.4, 0.8, 1.0);
    light.intensity = 0.6;
    light.range = 8;
  }

  public update(dt: number) {
    if (this.collected) return;
    this.phase += dt * 3;
    this.mesh.rotation.y += dt * 1.5;
    this.mesh.position.y = this.pos.y + Math.sin(this.phase) * 0.25;
    this.flames.forEach((f, i) => { f.scaling.y = 0.8 + Math.sin(this.phase * 3 + i) * 0.3; });
  }

  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
}
