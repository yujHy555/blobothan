import * as BABYLON from 'babylonjs';

export class CameraRig {
  private scene: BABYLON.Scene;
  private camera: BABYLON.FreeCamera;
  private canvas: HTMLCanvasElement;

  private target: BABYLON.AbstractMesh | null = null;
  private _position: BABYLON.Vector3;

  private smooth = 6.5;
  private shakeTime = 0;
  private shakeIntensity = 0;

  private readonly camHeight = 26;
  private readonly camZ = -42;

  constructor(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;
    this._position = new BABYLON.Vector3(0, this.camHeight, this.camZ);

    this.camera = new BABYLON.FreeCamera('cam', this._position.clone(), scene);
    this.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    this.camera.fov = 0.9; // slight perspective for 2.5D depth
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1000;
    this.camera.attachControl(canvas, true);
    this.camera.detachControl();
  }

  public setTarget(mesh: BABYLON.AbstractMesh) {
    this.target = mesh;
  }

  public snapToPlayer() {
    if (!this.target) return;
    this._position = new BABYLON.Vector3(
      this.target.position.x,
      this.camHeight,
      this.camZ,
    );
    this.camera.position = this._position.clone();
    this.camera.setTarget(new BABYLON.Vector3(this.target.position.x, 0, 0));
  }

  public shake(duration: number, intensity: number) {
    this.shakeTime = duration;
    this.shakeIntensity = intensity;
  }

  public get position(): BABYLON.Vector3 {
    return this._position;
  }

  public update(dt: number, playerPos: BABYLON.Vector3) {
    if (!this.target) return;

    const targetX = playerPos.x;
    const targetY = Math.max(this.camHeight, playerPos.y + 6);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const tx = lerp(this._position.x, targetX, this.smooth * dt);
    const ty = lerp(this._position.y, targetY, this.smooth * 0.6 * dt);

    this._position = new BABYLON.Vector3(tx, ty, this.camZ);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      this._position = this._position.add(new BABYLON.Vector3(sx, sy, 0));
    }

    this.camera.position = this._position;
    this.camera.setTarget(new BABYLON.Vector3(this.target.position.x, 0, 0));
  }
}
