import * as BABYLON from 'babylonjs';
import { RealmPalette } from '../art/Materials';

/**
 * AAA lighting rig:
 *  - Procedural HDRI-style environment cube (generated from canvas gradients)
 *    used as an IBL source for all PBR materials (soft ambient + reflections).
 *  - SSAO2 for contact/crevice ambient occlusion (GI-ish grounding).
 *  - Default pipeline: ACES tone mapping, bloom, FXAA, vignette, chromatic edge.
 *  - Realm-aware tinting of key/fill lights & environment intensity.
 */
export class LightingRig {
  private scene: BABYLON.Scene;
  private env!: BABYLON.CubeTexture;
  private ssao: BABYLON.SSAO2RenderingPipeline | null = null;
  private pipeline!: BABYLON.DefaultRenderingPipeline;
  private key!: BABYLON.DirectionalLight;
  private fill!: BABYLON.HemisphericLight;
  private rim!: BABYLON.PointLight;

  constructor(scene: BABYLON.Scene) { this.scene = scene; }

  /** Generate a 6-face HDRI-like cube from canvases, no external assets needed. */
  private buildEnvCube(pal: RealmPalette): BABYLON.CubeTexture {
    const size = 128;
    const faces: string[] = [];
    const c = (v: [number, number, number]) => `rgb(${Math.min(255, v[0] * 255) | 0},${Math.min(255, v[1] * 255) | 0},${Math.min(255, v[2] * 255) | 0})`;
    const sky = pal.clear;
    // +X, -X, +Y, -Y, +Z, -Z  (Babylon order)
    for (let f = 0; f < 6; f++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 0, size);
      if (f === 2) { // top — bright sky with a warm sun bloom
        g.addColorStop(0, c([Math.min(1, sky[0] * 2), Math.min(1, sky[1] * 2), Math.min(1, sky[2] * 2)]));
        g.addColorStop(1, c([Math.min(1, sky[0] * 1.3), Math.min(1, sky[1] * 1.3), Math.min(1, sky[2] * 1.3)]));
      } else if (f === 3) { // bottom — dark ground bounce
        g.addColorStop(0, c(pal.ground)); g.addColorStop(1, c([pal.ground[0] * 0.4, pal.ground[1] * 0.4, pal.ground[2] * 0.4]));
      } else { // sides — horizon gradient
        g.addColorStop(0, c([Math.min(1, sky[0] * 1.5), Math.min(1, sky[1] * 1.5), Math.min(1, sky[2] * 1.5)]));
        g.addColorStop(0.5, c([Math.min(1, sky[0] * 2.2 + 0.2), Math.min(1, sky[1] * 2.0 + 0.1), Math.min(1, sky[2] * 1.6)]));
        g.addColorStop(1, c(pal.ground));
      }
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      // add a soft "sun" highlight on +X and +Z faces
      if (f === 0 || f === 4) {
        const rg = ctx.createRadialGradient(size * 0.7, size * 0.35, 2, size * 0.7, size * 0.35, size * 0.5);
        rg.addColorStop(0, 'rgba(255,250,220,0.95)');
        rg.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, size, size);
      }
      faces.push(cv.toDataURL());
    }
    return new BABYLON.CubeTexture('', this.scene, null, false, faces);
  }

  public init(camera: BABYLON.Camera, pal: RealmPalette) {
    // Environment / IBL
    this.env = this.buildEnvCube(pal);
    this.env.gammaSpace = true;
    this.scene.environmentTexture = this.env;
    this.scene.environmentIntensity = 0.85;

    // Key / fill / rim lights
    this.key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(-0.5, -1, 0.35), this.scene);
    this.key.intensity = 1.6;
    this.key.position = new BABYLON.Vector3(30, 60, -30);
    this.fill = new BABYLON.HemisphericLight('fill', new BABYLON.Vector3(0.2, 1, 0.1), this.scene);
    this.fill.intensity = 0.55;
    this.rim = new BABYLON.PointLight('rim', new BABYLON.Vector3(0, 20, 12), this.scene);
    this.rim.intensity = 0.35;
    this.rim.range = 90;

    // SSAO2 (ambient occlusion) — WebGL2
    try {
      const gl = this.scene.getEngine() as any;
      if (gl.webGLVersion === undefined || gl.webGLVersion >= 2) {
        this.ssao = new BABYLON.SSAO2RenderingPipeline('ssao', this.scene, 0.5, [camera]);
        this.ssao.samples = 8;
        this.ssao.radius = 2.2;
        this.ssao.totalStrength = 1.1;
        this.ssao.expensiveBlur = true;
      }
    } catch { this.ssao = null; }

    // Post pipeline: ACES tone map, bloom, FXAA, vignette, chromatic aberration
    this.pipeline = new BABYLON.DefaultRenderingPipeline('aaa', true, this.scene, [camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.72;
    this.pipeline.bloomWeight = 0.35;
    this.pipeline.bloomKernel = 48;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.toneMappingEnabled = true;
    this.pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.pipeline.imageProcessing.exposure = 1.15;
    this.pipeline.imageProcessing.contrast = 1.2;
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 2.2;
    this.pipeline.imageProcessing.vignetteStretch = 0.3;
    this.pipeline.chromaticAberrationEnabled = true;
    this.pipeline.chromaticAberration.aberrationAmount = 6;

    this.applyRealm(pal);
  }

  public applyRealm(pal: RealmPalette) {
    if (!this.key) return;
    const k = new BABYLON.Color3(...pal.hemi);
    this.key.diffuse = k;
    this.fill.diffuse = k;
    this.fill.groundColor = new BABYLON.Color3(...pal.clear);
    this.rim.diffuse = new BABYLON.Color3(...pal.accent);
    // Rebuild env for the new realm palette
    const old = this.scene.environmentTexture;
    this.env = this.buildEnvCube(pal);
    this.env.gammaSpace = true;
    this.scene.environmentTexture = this.env;
    if (old && old !== this.env) old.dispose();
  }

  public dispose() {
    this.ssao?.dispose();
    this.pipeline.dispose();
    this.env.dispose();
  }
}
