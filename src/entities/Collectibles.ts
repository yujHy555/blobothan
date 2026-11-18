import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

export class Sporelight {
  public mesh: BABYLON.Mesh;
  public pos: BABYLON.Vector3;
  public collected = false;
  private phase = Math.random() * 6;
  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number, accent: [number, number, number]) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = BABYLON.MeshBuilder.CreateSphere('sporelight', { diameter: 0.62, segments: 14 }, scene);
    this.mesh.position = this.pos.clone();
    this.mesh.material = mats.glow('sporeMat', accent);
    this.mesh.renderingGroupId = 1;
    const halo = BABYLON.MeshBuilder.CreateTorus('sporeHalo', { diameter: 1.0, thickness: 0.05, tessellation: 20 }, scene);
    halo.parent = this.mesh;
    halo.rotation.x = Math.PI / 2;
    halo.material = mats.glow('sporeHaloMat', accent, 0.5);
  }
  public update(dt: number) {
    if (this.collected) return;
    this.phase += dt * 2.5;
    this.mesh.position.y = this.pos.y + Math.sin(this.phase) * 0.2;
    this.mesh.rotation.y += dt * 2;
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
}

/** Wunder Dust — a cluster of magical motes that grant a burst of speed + juice. */
export class WunderDust {
  public mesh: BABYLON.TransformNode;
  public pos: BABYLON.Vector3;
  public collected = false;
  private motes: BABYLON.Mesh[] = [];
  private phase = Math.random() * 6;
  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.pos = new BABYLON.Vector3(x, y, z);
    this.mesh = new BABYLON.TransformNode('wunderDust', scene);
    this.mesh.position = this.pos;
    const colors: [number, number, number][] = [[1, 0.85, 0.4], [0.6, 1, 0.9], [1, 0.6, 0.9], [0.8, 0.9, 1]];
    for (let i = 0; i < 7; i++) {
      const m = BABYLON.MeshBuilder.CreateSphere('wunderMote', { diameter: 0.16 + Math.random() * 0.16, segments: 8 }, scene);
      m.parent = this.mesh;
      m.material = mats.glow(`wunderMat${i}`, colors[i % colors.length]);
      m.renderingGroupId = 1;
      this.motes.push(m);
    }
    const light = new BABYLON.PointLight('wunderLight', BABYLON.Vector3.Zero(), scene);
    light.parent = this.mesh;
    light.diffuse = new BABYLON.Color3(1, 0.9, 0.6);
    light.intensity = 0.5;
    light.range = 8;
  }
  public update(dt: number) {
    if (this.collected) return;
    this.phase += dt * 2;
    this.motes.forEach((m, i) => {
      const a = this.phase + i * (Math.PI * 2 / this.motes.length);
      m.position.set(Math.cos(a) * 0.7, Math.sin(a * 1.7) * 0.5, Math.sin(a) * 0.5);
    });
    this.mesh.rotation.y += dt;
  }
  public collect() { this.collected = true; this.mesh.setEnabled(false); }
  public reset() { this.collected = false; this.mesh.setEnabled(true); }
}
