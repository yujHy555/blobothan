import * as BABYLON from 'babylonjs';

export class Engine {
  private engine: BABYLON.Engine;
  private scene: BABYLON.Scene;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.08, 0.10, 0.16, 1);

    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.012;
    this.scene.fogColor = new BABYLON.Color3(0.08, 0.10, 0.16);

    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0.3), this.scene);
    hemi.intensity = 0.9;

    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(0.5, -0.6, 0.8), this.scene);
    sun.intensity = 0.5;

    const glow = new BABYLON.GlowLayer('glow', this.scene);
    glow.intensity = 0.6;

    window.addEventListener('resize', () => this.engine.resize());
  }

  public getScene() { return this.scene; }
  public getEngine() { return this.engine; }

  public runRenderLoop(callback: () => void) {
    this.engine.runRenderLoop(callback);
  }

  public stopRenderLoop() {
    this.engine.stopRenderLoop();
  }

  public dispose() {
    this.scene.dispose();
    this.engine.dispose();
  }
}
