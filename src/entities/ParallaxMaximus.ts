import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

/**
 * MAXIMUS PARALLAX — a rich, multi-layered scrolling backdrop system.
 * Each layer scrolls at a different rate for deep perspective. Includes:
 *  - gradient sky bands
 *  - jagged mountain silhouettes with snow caps & glowing runes
 *  - floating islands with hanging vines and waterfalls
 *  - drifting clouds, motes, and a celestial body (moon/sun)
 */
export class ParallaxMaximus {
  public layers: any[] = [];
  private t = 0;
  private clouds: BABYLON.Mesh[] = [];
  private runes: BABYLON.Mesh[] = [];
  private celestial!: BABYLON.Mesh;

  constructor(
    scene: BABYLON.Scene,
    mats: Materials,
    centerX: number,
    clear: [number, number, number],
    ground: [number, number, number],
    accent: [number, number, number],
  ) {
    const c = (a: [number, number, number], m = 1) => [Math.min(1, a[0] * m), Math.min(1, a[1] * m), Math.min(1, a[2] * m)] as [number, number, number];

    // Layer 0: deep sky gradient band (farthest, slowest)
    this.skyBand(scene, mats, centerX, -200, c(clear, 1.4), 0.05);

    // Layer 1: distant jagged mountains with glowing snow caps
    this.mountainRange(scene, mats, centerX, -150, 5, c(clear, 0.7), c(accent, 0.6), 0.12, true);

    // Layer 2: mid floating islands (rock chunks + hanging vines + waterfalls)
    this.floatingIslands(scene, mats, centerX, -110, c(ground, 0.9), accent, 0.22);

    // Layer 3: near mountains, darker and more detailed
    this.mountainRange(scene, mats, centerX, -80, 7, c(ground, 0.6), c(accent, 0.4), 0.34, false);

    // Layer 4: foreground floating runes & drifting clouds
    this.foreground(scene, mats, centerX, -45, accent, 0.5);

    // Celestial body (moon/sun) high in the sky, very slow parallax
    this.celestial = BABYLON.MeshBuilder.CreateSphere('celestial', { diameter: 26, segments: 24 }, scene);
    this.celestial.position.set(centerX + 130, 72, -180);
    this.celestial.material = mats.glow('celestialMat', [1, 0.96, 0.82], 0.9);
    this.celestial.isPickable = false;
    (this.celestial as any).parallaxSpeed = 0.04;
    this.layers.push(this.celestial);
    // Halo around celestial
    const halo = BABYLON.MeshBuilder.CreateTorus('celestialHalo', { diameter: 34, thickness: 1.2, tessellation: 40 }, scene);
    halo.parent = this.celestial;
    halo.material = mats.glow('celestialHaloMat', [1, 0.9, 0.6], 0.3);
    halo.renderingGroupId = 1;
  }

  private skyBand(scene: BABYLON.Scene, mats: Materials, cx: number, z: number, color: [number, number, number], speed: number) {
    for (let i = 0; i < 4; i++) {
      const band = BABYLON.MeshBuilder.CreatePlane('skyBand', { size: 1200 }, scene);
      band.position.set(cx, 80 + i * 18, z - i * 5);
      band.material = mats.glow(`skyBandMat${i}`, color, 0.18);
      band.isPickable = false;
      (band as any).parallaxSpeed = speed;
      this.layers.push(band);
    }
  }

  private mountainRange(scene: BABYLON.Scene, mats: Materials, cx: number, z: number, count: number, color: [number, number, number], capColor: [number, number, number], speed: number, snow: boolean) {
    for (let i = 0; i < count; i++) {
      const h = 16 + Math.abs(Math.sin(i * 1.9)) * 30;
      const w = 40 + (i % 3) * 14;
      const m = BABYLON.MeshBuilder.CreateCylinder('mountain', { diameterTop: 0, diameterBottom: w, height: h, tessellation: 4 }, scene);
      m.position.set(cx - 400 + i * (760 / count), -10 + h / 2, z - (i % 2) * 8);
      m.rotation.y = Math.PI / 4;
      m.material = mats.glow(`mountainMat${speed}`, color, 0.9);
      m.isPickable = false;
      (m as any).parallaxSpeed = speed + (i % 3) * 0.02;
      this.layers.push(m);

      if (snow && i % 2 === 0) {
        // Parallel slope with a small constant offset — no convergence at the apex
        const cap = BABYLON.MeshBuilder.CreateCylinder('snowCap', { diameterTop: 0, diameterBottom: w * 0.42, height: h * 0.42, tessellation: 4 }, scene);
        cap.parent = m;
        cap.position.y = h * 0.31;
        cap.rotation.y = Math.PI / 4;
        cap.material = mats.glow('snowCapMat', capColor, 0.75);
      }
      // glowing rune dot on near mountains
      if (!snow && i % 3 === 0) {
        const rune = BABYLON.MeshBuilder.CreateTorus('mountainRune', { diameter: 2.4, thickness: 0.18, tessellation: 16 }, scene);
        rune.parent = m;
        rune.position.set(0, h * 0.15, w * 0.42);
        rune.material = mats.glow('mountainRuneMat', capColor, 0.7);
        rune.renderingGroupId = 1;
        this.runes.push(rune);
      }
    }
  }

  private floatingIslands(scene: BABYLON.Scene, mats: Materials, cx: number, z: number, rockColor: [number, number, number], accent: [number, number, number], speed: number) {
    for (let i = 0; i < 6; i++) {
      const root = new BABYLON.TransformNode('island', scene);
      root.position.set(cx - 280 + i * 110, 18 + (i % 3) * 9, z - (i % 2) * 12);
      // rock chunk (inverted cone-ish)
      const rock = BABYLON.MeshBuilder.CreateCylinder('islandRock', { diameterTop: 16, diameterBottom: 4, height: 12, tessellation: 7 }, scene);
      rock.parent = root;
      rock.material = mats.glow(`islandRockMat${i}`, rockColor, 0.85);
      rock.isPickable = false;
      (root as any).parallaxSpeed = speed;
      this.layers.push(root);
      // grassy top
      const top = BABYLON.MeshBuilder.CreateCylinder('islandTop', { diameter: 17, height: 1.2, tessellation: 7 }, scene);
      top.parent = root;
      top.position.y = 6.7; // clear of the rock top (y=6) — no overlap
      top.material = mats.glow('islandTopMat', accent, 0.6);
      // hanging vines
      for (let v = 0; v < 3; v++) {
        const vine = BABYLON.MeshBuilder.CreateCylinder('vine', { diameter: 0.16, height: 5 + Math.random() * 4, tessellation: 6 }, scene);
        vine.parent = root;
        vine.position.set((v - 1) * 4, -7 - Math.random() * 2, 2);
        vine.material = mats.glow('vineMat', accent, 0.5);
      }
      // waterfall glow
      const fall = BABYLON.MeshBuilder.CreateBox('waterfall', { width: 1.6, height: 10, depth: 0.6 }, scene);
      fall.parent = root;
      fall.position.set(5, -3, 3);
      fall.material = mats.glow('waterfallMat', [0.6, 0.9, 1], 0.45);
    }
  }

  private foreground(scene: BABYLON.Scene, mats: Materials, cx: number, z: number, accent: [number, number, number], speed: number) {
    // Drifting clouds
    for (let i = 0; i < 10; i++) {
      const cloud = BABYLON.MeshBuilder.CreateSphere('cloud', { diameter: 8 + Math.random() * 8, segments: 8 }, scene);
      cloud.position.set(cx - 300 + Math.random() * 600, 30 + Math.random() * 25, z - Math.random() * 20);
      cloud.scaling.set(1.7, 0.5, 1);
      cloud.material = mats.glow('cloudMat', [0.95, 0.96, 1], 0.28);
      cloud.isPickable = false;
      (cloud as any).parallaxSpeed = speed * (0.8 + Math.random() * 0.4);
      (cloud as any).drift = Math.random() * 6;
      this.clouds.push(cloud);
      this.layers.push(cloud);
    }
    // Floating rune rings in the near field
    for (let i = 0; i < 6; i++) {
      const r = BABYLON.MeshBuilder.CreateTorus('nearRune', { diameter: 2 + Math.random() * 3, thickness: 0.12, tessellation: 6 }, scene);
      r.position.set(cx - 200 + Math.random() * 400, 12 + Math.random() * 30, z + 6);
      r.material = mats.glow('nearRuneMat', accent, 0.4);
      r.isPickable = false;
      (r as any).parallaxSpeed = speed * 1.1;
      this.runes.push(r);
      this.layers.push(r);
    }
  }

  public update(dt: number) {
    this.t += dt;
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if ((c as any).drift !== undefined) (c as any).drift += dt;
    }
    for (const r of this.runes) r.rotation.z += dt * 0.4;
    this.celestial.rotation.y += dt * 0.05;
  }

  public scroll(camX: number, centerX: number) {
    for (const layer of this.layers) {
      const speed = (layer as any).parallaxSpeed ?? 0.3;
      layer.position.x = camX * speed + centerX * (1 - speed);
    }
  }

  public dispose() {
    for (const l of this.layers) l.dispose(false, true);
  }
}
