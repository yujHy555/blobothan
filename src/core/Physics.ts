import * as BABYLON from 'babylonjs';
import HK from '@babylonjs/havok';
import { HavokPlugin } from 'babylonjs';

export interface PlatformRect {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  oneWay?: boolean;
}

export interface PhysicsResult {
  grounded: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  ceiling: boolean;
}

export class Physics {
  private scene: BABYLON.Scene;
  private plugin!: HavokPlugin;
  private hp: any = null;
  public initialized = false;

  // Tuning (used by Player for feel)
  public gravity = -34;
  public jumpForce = 12;          // impulse magnitude
  public maxSpeed = 14;
  public groundAccel = 70;
  public airAccel = 40;
  public groundFriction = 12;
  public airFriction = 2.5;
  public coyoteTime = 0.12;
  public jumpBuffer = 0.1;
  public variableJumpMult = 0.5;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private platforms: PlatformRect[] = [];

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  public async init() {
    // Load WASM from our public/ copy so MIME type is correct
    this.hp = await HK({
      locateFile: (path: string) => `/wasm/${path}`,
    });
    this.plugin = new BABYLON.HavokPlugin(true, this.hp);
    this.scene.enablePhysics(new BABYLON.Vector3(0, this.gravity, 0), this.plugin);
    this.initialized = true;
  }

  public setPlatforms(platforms: PlatformRect[]) {
    this.platforms = platforms;
  }

  public addPlatformBody(mesh: BABYLON.Mesh, width: number, height: number, depth: number): BABYLON.PhysicsBody {
    const body = new BABYLON.PhysicsBody(
      mesh,
      BABYLON.PhysicsMotionType.STATIC,
      false,
      this.scene,
    );
    body.shape = new BABYLON.PhysicsShapeBox(
      BABYLON.Vector3.Zero(),
      BABYLON.Quaternion.Identity(),
      new BABYLON.Vector3(width / 2, height / 2, depth / 2),
      this.scene,
    );
    return body;
  }

  public addPlayerBody(mesh: BABYLON.Mesh, radius: number): BABYLON.PhysicsBody {
    const body = new BABYLON.PhysicsBody(
      mesh,
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene,
    );
    body.shape = new BABYLON.PhysicsShapeSphere(BABYLON.Vector3.Zero(), radius, this.scene);
    body.setLinearDamping(0.1);
    body.setAngularDamping(10);
    // Prevent Havok from reading the visual mesh transform back into the body each
    // step (our squash/stretch & rotation are visual-only). We drive via velocity.
    body.disablePreStep = true;
    // Lock rotation: infinite inertia about all axes so the blob can't tumble
    const mp = body.computeMassProperties();
    mp.inertia = BABYLON.Vector3.Zero();
    body.setMassProperties(mp);
    return body;
  }

  public teleport(body: BABYLON.PhysicsBody, position: BABYLON.Vector3) {
    body.setTargetTransform(position, BABYLON.Quaternion.Identity());
  }

  public setLinearVelocity(body: BABYLON.PhysicsBody, x: number, y: number) {
    body.setLinearVelocity(new BABYLON.Vector3(x, y, 0));
  }

  public getLinearVelocity(body: BABYLON.PhysicsBody): BABYLON.Vector3 {
    const v = BABYLON.Vector3.Zero();
    body.getLinearVelocityToRef(v);
    return v;
  }

  public jump(body: BABYLON.PhysicsBody, canJump: boolean): boolean {
    if (!canJump) return false;
    const v = this.getLinearVelocity(body);
    v.y = this.jumpForce;
    body.setLinearVelocity(v);
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    return true;
  }

  public bounce(body: BABYLON.PhysicsBody, force: number) {
    const v = this.getLinearVelocity(body);
    v.y = force;
    body.setLinearVelocity(v);
  }

  public tickTimers(dt: number, grounded: boolean) {
    if (grounded) this.coyoteTimer = this.coyoteTime;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
  }

  public canJump(): boolean {
    return this.coyoteTimer > 0 || this.jumpBufferTimer > 0;
  }

  public setJumpBuffer() {
    this.jumpBufferTimer = this.jumpBuffer;
  }

  public getPlatformRects(): PlatformRect[] {
    return this.platforms;
  }

  public dispose() {}
}
