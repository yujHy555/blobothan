import * as BABYLON from 'babylonjs';
import { pipeStrip, RGB } from '../art/CardboardArt';

/**
 * CARDBOARD PIPELINE — foreground parallax, IMAGE TEXTURES on flat planes.
 *
 * No modelled geometry: the photoreal hand-crafted industrial cardboard pipes
 * (corrugation, flanged joints, bolts, valve wheels, gauges, tape, brackets)
 * are painted into seamless PBR albedo + normal strips by CardboardArt. They
 * scroll faster than the camera and frame the top and bottom of the view.
 */
export class CardboardPipesForeground {
  private scene: BABYLON.Scene;
  private centerX: number;
  private layers: { tiles: BABYLON.Mesh[]; tileWidth: number; speed: number }[] = [];
  private images: { albedo: BABYLON.Texture; normal: BABYLON.Texture }[] = [];
  private disposables: BABYLON.Material[] = [];

  constructor(scene: BABYLON.Scene, centerX: number, accent: RGB) {
    this.scene = scene;
    this.centerX = centerX;

    const bottom = pipeStrip(scene, 131, false);
    const top = pipeStrip(scene, 211, true);
    this.images.push(bottom, top);

    // Camera at z=-44 looks toward +Z; these planes sit between camera and
    // skater (negative z). Y is tuned to frame the visible view bottom/top.
    this.addLayer('bottom', 148, 1.45, -13, bottom, -4, 7, 1.0, accent);
    this.addLayer('top', 132, 1.62, -11, top, 20, 6, 0.85, accent);
  }

  private addLayer(name: string, tileWidth: number, speed: number, z: number,
                   image: { albedo: BABYLON.Texture; normal: BABYLON.Texture },
                   y: number, height: number, tint: number, accent: RGB) {
    const mat = new BABYLON.PBRMaterial(`fgMat_${name}`, this.scene);
    mat.albedoTexture = image.albedo;
    mat.bumpTexture = image.normal;
    (mat.bumpTexture as BABYLON.Texture).level = 0.85;
    image.albedo.hasAlpha = true;
    mat.useAlphaFromAlbedoTexture = true;
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    mat.albedoColor = new BABYLON.Color3(tint, tint, tint);
    mat.emissiveTexture = image.albedo;
    mat.emissiveColor = new BABYLON.Color3(0.22, 0.22, 0.22);
    mat.metallic = 0;
    mat.roughness = 0.9;
    mat.environmentIntensity = 0.45;
    mat.backFaceCulling = false;
    this.disposables.push(mat);

    const count = 9;
    const tiles: BABYLON.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const plane = BABYLON.MeshBuilder.CreatePlane(`fg_${name}_${i}`, { width: tileWidth, height }, this.scene);
      plane.position.set(this.centerX + (i - Math.floor(count / 2)) * tileWidth, y, z);
      plane.material = mat;
      plane.isPickable = false;
      tiles.push(plane);
    }
    this.layers.push({ tiles, tileWidth, speed });
    void accent;
  }

  public update(_dt: number) { /* detail is baked into the texture — nothing to animate */ }

  /** Faster-than-camera scroll: the pipework streaks past in the foreground. */
  public scroll(camX: number) {
    for (const layer of this.layers) {
      const w = layer.tileWidth;
      const shift = camX * (1 - layer.speed);
      const wrapped = ((shift % w) + w) % w;
      const n = layer.tiles.length;
      const half = Math.floor(n / 2);
      for (let i = 0; i < n; i++) {
        layer.tiles[i].position.x = camX + (i - half) * w - wrapped;
      }
    }
  }

  public dispose() {
    for (const l of this.layers) for (const t of l.tiles) t.dispose(false, false);
    for (const img of this.images) { img.albedo.dispose(); img.normal.dispose(); }
    for (const m of this.disposables) m.dispose();
    this.layers = [];
  }
}
