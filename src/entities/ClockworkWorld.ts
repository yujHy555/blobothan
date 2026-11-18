import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * LEVEL 3 — "Clockwork Warren" — an isometric steampunk arena.
 *
 * Homage to the great isometric games: the gear-topography of Marble Madness,
 * the impossible stacked architecture of Monument Valley, the moody brass
 * machinery of Diablo's catacombs, and the clean tactical readability of
 * Q*bert / Baldur's Gate. Everything is built to read at a fixed 45°/35° camera.
 */
export class ClockworkWorld {
  public root: BABYLON.TransformNode;
  private t = 0;
  private gears: BABYLON.Mesh[] = [];
  private pistons: BABYLON.Mesh[] = [];
  private cogs: BABYLON.Mesh[] = [];
  private startX = 0;

  constructor(scene: BABYLON.Scene, mats: Materials, startX: number) {
    this.root = new BABYLON.TransformNode('clockworkWorld', scene);
    this.startX = startX;
    const CX = startX;

    // ---- Brass palette ----
    const brass = new BABYLON.PBRMaterial('brass', scene);
    brass.albedoColor = new BABYLON.Color3(0.72, 0.5, 0.18);
    brass.metallic = 0.7;
    brass.roughness = 0.35;
    brass.emissiveColor = new BABYLON.Color3(0.08, 0.05, 0.01);

    const darkIron = new BABYLON.PBRMaterial('darkIron', scene);
    darkIron.albedoColor = new BABYLON.Color3(0.16, 0.14, 0.12);
    darkIron.metallic = 0.55;
    darkIron.roughness = 0.5;
    darkIron.emissiveColor = new BABYLON.Color3(0.02, 0.01, 0.0);

    const copper = new BABYLON.PBRMaterial('copper', scene);
    copper.albedoColor = new BABYLON.Color3(0.72, 0.34, 0.18);
    copper.metallic = 0.6;
    copper.roughness = 0.3;
    copper.emissiveColor = new BABYLON.Color3(0.10, 0.03, 0.0);

    const glowGold = mats.glow('cwGlow', [1, 0.7, 0.25], 0.8);

    // ---- Wide brass floor with a grid of riveted plates ----
    const floor = BABYLON.MeshBuilder.CreateBox('cwFloor', { width: 320, height: 1, depth: 320 }, scene);
    floor.position.set(CX, 0, 0);
    floor.material = darkIron;
    floor.receiveShadows = true;
    floor.parent = this.root;

    // Riveted plate pattern (isometric readability — checker of plates)
    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = -4; iz <= 4; iz++) {
        const plate = BABYLON.MeshBuilder.CreateBox('cwPlate', { width: 14, height: 0.06, depth: 14 }, scene);
        plate.position.set(CX + ix * 18, 0.54, iz * 18);
        plate.material = (ix + iz) % 2 === 0 ? brass : darkIron;
        plate.receiveShadows = true;
        plate.parent = this.root;
        // rivets
        if ((ix + iz) % 2 === 0) {
          for (const c of [[-6,-6],[6,-6],[-6,6],[6,6]]) {
            const rivet = BABYLON.MeshBuilder.CreateSphere('rivet', { diameter: 0.3, segments: 6 }, scene);
            rivet.parent = plate;
            rivet.position.set(c[0], 0.1, c[1]);
            rivet.material = glowGold;
          }
        }
      }
    }

    // ---- Giant rotating gears set into the floor (Marble Madness homage) ----
    for (let i = 0; i < 6; i++) {
      const gx = CX - 60 + (i % 3) * 60;
      const gz = -40 + Math.floor(i / 3) * 80;
      const gear = BABYLON.MeshBuilder.CreateCylinder('cwGear', { diameter: 20, height: 0.5, tessellation: 16 }, scene);
      gear.position.set(gx, 0.62, gz);
      gear.material = brass;
      gear.parent = this.root;
      // gear teeth
      for (let t = 0; t < 16; t++) {
        const a = (t / 16) * Math.PI * 2;
        const tooth = BABYLON.MeshBuilder.CreateBox('tooth', { width: 2.2, height: 0.5, depth: 2.2 }, scene);
        tooth.parent = gear;
        tooth.position.set(Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5);
        tooth.rotation.y = a;
        tooth.material = copper;
      }
      // inner hub
      const hub = BABYLON.MeshBuilder.CreateCylinder('hub', { diameter: 5, height: 0.6, tessellation: 16 }, scene);
      hub.parent = gear;
      hub.position.y = 0.2;
      hub.material = darkIron;
      this.gears.push(gear);
    }

    // ---- Pistons pumping vertically (timing obstacles, Diablo machinery) ----
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const px = CX + side * (24 + (i % 3) * 10);
      const pz = -56 + i * 16;
      const base = BABYLON.MeshBuilder.CreateCylinder('pistonBase', { diameter: 3, height: 1, tessellation: 12 }, scene);
      base.position.set(px, 0.6, pz);
      base.material = darkIron;
      base.parent = this.root;
      const rod = BABYLON.MeshBuilder.CreateCylinder('pistonRod', { diameter: 1.2, height: 4, tessellation: 12 }, scene);
      rod.position.set(px, 2.6, pz);
      rod.material = copper;
      rod.parent = this.root;
      const head = BABYLON.MeshBuilder.CreateCylinder('pistonHead', { diameter: 2.6, height: 0.8, tessellation: 12 }, scene);
      head.position.set(px, 4.8, pz);
      head.material = brass;
      head.parent = this.root;
      this.pistons.push(rod);
    }

    // ---- Stacked isometric towers (Monument Valley impossibility) ----
    for (let i = 0; i < 5; i++) {
      const side = i % 2 ? 1 : -1;
      const tx = CX + side * (48 + (i % 2) * 8);
      const tz = -48 + i * 24;
      for (let s = 0; s < 3; s++) {
        const block = BABYLON.MeshBuilder.CreateBox('cwStack', { width: 8 - s * 1.5, height: 4, depth: 8 - s * 1.5 }, scene);
        block.position.set(tx + (s % 2) * 1.5, 2 + s * 4, tz);
        block.rotation.y = s * 0.12;
        block.material = s % 2 ? brass : darkIron;
        block.receiveShadows = true;
        block.parent = this.root;
      }
      // glowing rune on top
      const rune = BABYLON.MeshBuilder.CreateTorus('cwRune', { diameter: 3, thickness: 0.2, tessellation: 16 }, scene);
      rune.position.set(tx, 14, tz);
      rune.material = glowGold;
      rune.renderingGroupId = 1;
      rune.parent = this.root;
      this.cogs.push(rune);
    }

    // ---- Pipes running along the arena edges ----
    for (const side of [-1, 1]) {
      const pipe = BABYLON.MeshBuilder.CreateCylinder('cwPipe', { diameter: 2, height: 300, tessellation: 12 }, scene);
      pipe.position.set(CX + side * 78, 1.2, 0);
      pipe.rotation.x = Math.PI / 2;
      pipe.material = copper;
      pipe.parent = this.root;
      for (let k = -4; k <= 4; k++) {
        const joint = BABYLON.MeshBuilder.CreateCylinder('joint', { diameter: 2.4, height: 1, tessellation: 12 }, scene);
        joint.position.set(CX + side * 78, 1.2, k * 32);
        joint.rotation.x = Math.PI / 2;
        joint.material = brass;
        joint.parent = this.root;
      }
    }
  }

  public update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.gears.length; i++) {
      this.gears[i].rotation.y += dt * (i % 2 ? 0.25 : -0.25);
    }
    for (let i = 0; i < this.pistons.length; i++) {
      this.pistons[i].position.y = 2.6 + Math.sin(this.t * 1.5 + i * 0.8) * 1.2;
    }
    for (const c of this.cogs) c.rotation.z += dt * 0.5;
  }

  public dispose() { this.root.dispose(false, true); }
}
