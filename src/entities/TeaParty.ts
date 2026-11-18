import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * A moonlit tea party in the Looking-Glass realm — floating table, teacups,
 * and a giant glowing moon. Purely decorative, but dripping in wonder.
 */
export class TeaParty {
  public root: BABYLON.TransformNode;
  private cups: BABYLON.Mesh[] = [];
  private moon: BABYLON.Mesh;
  private t = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, x: number, y: number, z: number) {
    this.root = new BABYLON.TransformNode('teaParty', scene);
    this.root.position = new BABYLON.Vector3(x, y, z);

    // Giant glowing moon above
    this.moon = BABYLON.MeshBuilder.CreateSphere('moon', { diameter: 16, segments: 24 }, scene);
    this.moon.parent = this.root;
    this.moon.position = new BABYLON.Vector3(0, 26, -30);
    this.moon.material = mats.glow('moonMat', [0.95, 0.94, 0.78], 0.92);
    this.moon.renderingGroupId = 1;
    const moonLight = new BABYLON.PointLight('moonLight', BABYLON.Vector3.Zero(), scene);
    moonLight.parent = this.moon;
    moonLight.diffuse = new BABYLON.Color3(0.95, 0.92, 0.7);
    moonLight.intensity = 1.6;
    moonLight.range = 90;

    // Floating table
    const table = BABYLON.MeshBuilder.CreateCylinder('teaTable', { diameter: 7, height: 0.5, tessellation: 24 }, scene);
    table.parent = this.root;
    table.position = new BABYLON.Vector3(0, 3, 0);
    table.material = mats.glow('tableMat', [0.4, 0.35, 0.55], 0.8);
    const tableTop = BABYLON.MeshBuilder.CreateCylinder('teaTop', { diameter: 7.4, height: 0.18, tessellation: 24 }, scene);
    tableTop.parent = this.root;
    tableTop.position = new BABYLON.Vector3(0, 3.34, 0);
    tableTop.material = mats.glow('tableTopMat', [0.6, 0.5, 0.75], 0.9);

    // Teapot + cups
    const pot = BABYLON.MeshBuilder.CreateSphere('teapot', { diameter: 1.4, segments: 14 }, scene);
    pot.parent = this.root;
    pot.position = new BABYLON.Vector3(0, 4.3, 0);
    pot.material = mats.glow('potMat', [0.9, 0.7, 0.85], 0.9);
    const spout = BABYLON.MeshBuilder.CreateCylinder('spout', { diameter: 0.25, height: 1.1, tessellation: 10 }, scene);
    spout.parent = this.root;
    spout.position = new BABYLON.Vector3(0.95, 4.4, 0);
    spout.rotation.z = -Math.PI / 2.6;
    spout.material = pot.material;

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const cup = BABYLON.MeshBuilder.CreateCylinder('teacup', { diameter: 0.6, height: 0.5, tessellation: 14 }, scene);
      cup.parent = this.root;
      cup.position = new BABYLON.Vector3(Math.cos(a) * 2.4, 3.75, Math.sin(a) * 2.4);
      cup.material = mats.glow('cupMat', [0.95, 0.95, 1.0], 0.9);
      this.cups.push(cup);
    }
  }

  public update(dt: number) {
    this.t += dt;
    this.root.rotation.y += dt * 0.12;
    this.moon.position.y = 26 + Math.sin(this.t * 0.5) * 1.2;
    for (let i = 0; i < this.cups.length; i++) {
      this.cups[i].position.y = 3.75 + Math.sin(this.t * 2 + i) * 0.12;
      this.cups[i].rotation.y += dt * 0.8;
    }
  }

  public dispose() { this.root.dispose(false, true); }
}
