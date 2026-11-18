import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * LEVEL 2 — "Floorplanz" — a flat pink, cyan line-art isometric world.
 *
 * Style: flat pale-cyan fills with fine cyan/teal edge outlines on everything,
 * a candy-pink sky, line-drawn clouds, cylindrical towers with fine banding,
 * floating platforms with railings, and a hovering hex-drone. Like a clean
 * architectural floor-plan illustration come to life.
 */
export class TownLevel {
  public root: BABYLON.TransformNode;
  private t = 0;
  private clouds: BABYLON.Mesh[] = [];
  private details: BABYLON.Mesh[] = [];
  private drone!: BABYLON.TransformNode;
  private startX = 0;

  // Cyan palette
  private CYAN: BABYLON.Color3;
  private TEAL: BABYLON.Color3;
  private FILL: BABYLON.Color3;

  constructor(scene: BABYLON.Scene, mats: Materials, startX: number) {
    this.root = new BABYLON.TransformNode('floorplanz', scene);
    this.startX = startX;
    const CX = startX + 55;

    this.CYAN = new BABYLON.Color3(0.06, 0.78, 0.78);   // strong saturated cyan lines
    this.TEAL = new BABYLON.Color3(0.02, 0.42, 0.46);   // deep teal lines
    this.FILL = new BABYLON.Color3(0.90, 0.99, 0.98);   // near-white cyan fill (bold contrast)

    // Flat fill material (no shading — pure pale cyan)
    const fill = new BABYLON.StandardMaterial('fpFill', scene);
    fill.diffuseColor = this.FILL;
    fill.emissiveColor = this.FILL.scale(0.7);
    fill.disableLighting = true;
    // Slightly different fill for variety
    const fill2 = new BABYLON.StandardMaterial('fpFill2', scene);
    fill2.diffuseColor = new BABYLON.Color3(0.66, 0.92, 0.92);
    fill2.emissiveColor = new BABYLON.Color3(0.5, 0.8, 0.8);
    fill2.disableLighting = true;

    // Helper: flat fill with bold cyan edge outlines (line-art look)
    const outlined = (mesh: BABYLON.Mesh, lineColor = this.CYAN, width = 0.09) => {
      mesh.material = fill;
      mesh.enableEdgesRendering();
      mesh.edgesWidth = width;
      mesh.edgesColor = new BABYLON.Color4(lineColor.r, lineColor.g, lineColor.b, 1);
      mesh.parent = this.root;
      return mesh;
    };

    // ---- Wide floor plane — extends past the camera view so no edge/sky split ----
    const floor = BABYLON.MeshBuilder.CreateBox('fpFloor', { width: 320, height: 1, depth: 320 }, scene);
    floor.position.set(CX, 0, 0);
    outlined(floor, this.TEAL, 0.05);

    // Bold grid lines drawn on the floor (readable teal stripes)
    for (let i = -16; i <= 16; i++) {
      const line = BABYLON.MeshBuilder.CreateBox('fpGrid', { width: 318, height: 0.02, depth: 0.16 }, scene);
      line.position.set(CX, 0.53, i * 10); // just above the floor top (y=0.5)
      line.material = mats.glow('fpLine', [0.06, 0.7, 0.72], 0.85);
      line.parent = this.root;
      this.details.push(line);
    }
    // Central coral lane stripe to guide the eye down the corridor
    const lane = BABYLON.MeshBuilder.CreateBox('fpLane', { width: 3, height: 0.02, depth: 158 }, scene);
    lane.position.set(CX, 0.54, 0);
    lane.material = mats.glow('fpLane', [1, 0.45, 0.6], 0.6);
    lane.parent = this.root;

    // ---- Cylindrical towers with fine horizontal banding (architectural) ----
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = CX + side * (26 + (i % 3) * 6);
      const z = -55 + i * 22;
      const h = 10 + (i % 3) * 6;
      const tower = BABYLON.MeshBuilder.CreateCylinder('fpTower', { diameter: 6 + (i % 2) * 2, height: h, tessellation: 20 }, scene);
      tower.position.set(x, h / 2, z);
      outlined(tower, this.CYAN, 0.03);
      // fine horizontal band rings
      for (let b = 1; b < 6; b++) {
        const ring = BABYLON.MeshBuilder.CreateTorus('fpBand', { diameter: 6.05 + (i % 2) * 2, thickness: 0.03, tessellation: 24 }, scene);
        ring.parent = tower;
        ring.position.y = -h / 2 + (h / 6) * b;
        ring.material = mats.glow('fpBandMat', [0.28, 0.88, 0.86], 0.8);
      }
      // domed top
      const dome = BABYLON.MeshBuilder.CreateSphere('fpDome', { diameter: 6 + (i % 2) * 2, segments: 16, slice: 0.5 }, scene);
      dome.parent = tower;
      dome.position.y = h / 2;
      outlined(dome, this.CYAN, 0.03);
    }

    // ---- Floating platform with railings (upper level silhouette) ----
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const px = CX + side * (18 + (i % 2) * 6);
      const pz = -40 + i * 28;
      const plat = BABYLON.MeshBuilder.CreateBox('fpPlatform', { width: 12, height: 0.5, depth: 9 }, scene);
      plat.position.set(px, 7 + (i % 2) * 2, pz);
      outlined(plat, this.TEAL, 0.04);
      // railing posts
      for (let p = -1; p <= 1; p++) {
        const post = BABYLON.MeshBuilder.CreateCylinder('fpPost', { diameter: 0.12, height: 2, tessellation: 6 }, scene);
        post.parent = plat;
        post.position.set(p * 4, 1.25, -4);
        post.material = mats.glow('fpPostMat', [0.28, 0.88, 0.86], 0.9);
      }
      const rail = BABYLON.MeshBuilder.CreateBox('fpRail', { width: 9, height: 0.1, depth: 0.1 }, scene);
      rail.parent = plat;
      rail.position.set(0, 2.25, -4);
      rail.material = mats.glow('fpRailMat', [0.28, 0.88, 0.86], 0.9);
    }

    // ---- Line-drawn clouds (overlapping spheres, edge outlines only, pale fill) ----
    for (let i = 0; i < 10; i++) {
      const cloud = new BABYLON.TransformNode('fpCloud', scene);
      cloud.position.set(CX - 70 + Math.random() * 140, 24 + Math.random() * 14, -30 - Math.random() * 40);
      cloud.parent = this.root;
      for (let k = 0; k < 4; k++) {
        const puff = BABYLON.MeshBuilder.CreateSphere('fpPuff', { diameter: 6 + Math.random() * 5, segments: 10 }, scene);
        puff.parent = cloud;
        puff.position.set((k - 1.5) * 4, Math.random() * 2, 0);
        puff.material = fill;
        puff.enableEdgesRendering();
        puff.edgesWidth = 0.03;
        puff.edgesColor = new BABYLON.Color4(this.TEAL.r, this.TEAL.g, this.TEAL.b, 1);
      }
      this.clouds.push(cloud as unknown as BABYLON.Mesh);
    }

    // ---- Hovering hex-drone (like the reference) ----
    this.drone = new BABYLON.TransformNode('fpDrone', scene);
    this.drone.position.set(CX + 20, 22, -20);
    this.drone.parent = this.root;
    const hex = BABYLON.MeshBuilder.CreateCylinder('fpDroneBody', { diameter: 5, height: 1.2, tessellation: 6 }, scene);
    outlined(hex, this.CYAN, 0.04);
    hex.parent = this.drone;
    // rotor arms
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const arm = BABYLON.MeshBuilder.CreateCylinder('fpArm', { diameter: 0.1, height: 6, tessellation: 6 }, scene);
      arm.parent = this.drone;
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = a;
      arm.material = mats.glow('fpArmMat', [0.28, 0.88, 0.86], 0.9);
      const rotor = BABYLON.MeshBuilder.CreateTorus('fpRotor', { diameter: 1.4, thickness: 0.06, tessellation: 16 }, scene);
      rotor.parent = arm;
      rotor.position.x = 3;
      rotor.material = mats.glow('fpRotorMat', [0.28, 0.88, 0.86], 0.9);
    }
    const gondola = BABYLON.MeshBuilder.CreateBox('fpGondola', { width: 2.4, height: 1.8, depth: 2.4 }, scene);
    gondola.parent = this.drone;
    gondola.position.y = -1.6;
    outlined(gondola, this.TEAL, 0.04);

    // ---- Tiny label pins (like "floorplanz" tags) ----
    for (let i = 0; i < 5; i++) {
      const tag = BABYLON.MeshBuilder.CreateBox('fpTag', { width: 1.2, height: 0.6, depth: 0.1 }, scene);
      tag.position.set(CX - 30 + i * 15, 3 + (i % 2), -18);
      tag.material = mats.glow('fpTagMat', [0.35, 0.7, 1.0], 0.9);
      tag.parent = this.root;
      this.details.push(tag);
    }
  }

  public update(dt: number) {
    this.t += dt;
    for (const c of this.clouds) c.position.x += dt * 0.4;
    if (this.drone) {
      this.drone.position.y = 22 + Math.sin(this.t * 0.8) * 0.8;
      this.drone.rotation.y += dt * 0.1;
    }
  }

  public dispose() { this.root.dispose(false, true); }
}
