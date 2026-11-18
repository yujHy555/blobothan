import * as BABYLON from 'babylonjs';
import HK from '@babylonjs/havok';
import { HavokPlugin } from 'babylonjs';

/**
 * Thin wrapper around Babylon V2 Havok physics.
 * WASM is served from /wasm (copied into public/) so MIME type is correct.
 */
export class HavokWorld {
  public plugin!: HavokPlugin;
  public hp: any = null;
  public initialized = false;
  private scene: BABYLON.Scene;

  // Collision callback
  public onBodyCollision?: (a: BABYLON.PhysicsBody, b: BABYLON.PhysicsBody) => void;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  public async init(gravityY = -30) {
    this.hp = await HK({ locateFile: (path: string) => `/wasm/${path}` });
    this.plugin = new BABYLON.HavokPlugin(true, this.hp);
    this.scene.enablePhysics(new BABYLON.Vector3(0, gravityY, 0), this.plugin);
    this.initialized = true;

    // Global collision observable (collision started / continued)
    this.plugin.onCollisionObservable.add((ev: any) => {
      if (!this.onBodyCollision) return;
      const bodyA = ev.collider ?? ev.body;
      const bodyB = ev.collidedAgainst ?? ev.otherBody;
      if (bodyA && bodyB) this.onBodyCollision(bodyA, bodyB);
    });
  }

  public staticBody(mesh: BABYLON.Mesh, shape: BABYLON.PhysicsShape): BABYLON.PhysicsBody {
    const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.STATIC, false, mesh.getScene());
    body.shape = shape;
    return body;
  }

  public dynamicBody(
    mesh: BABYLON.Mesh,
    shape: BABYLON.PhysicsShape,
    opts: {
      mass?: number;
      linearDamping?: number;
      angularDamping?: number;
      disablePreStep?: boolean;
    } = {},
  ): BABYLON.PhysicsBody {
    const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, mesh.getScene());
    body.shape = shape;
    if (opts.linearDamping !== undefined) body.setLinearDamping(opts.linearDamping);
    if (opts.angularDamping !== undefined) body.setAngularDamping(opts.angularDamping);
    // PreStep stays ENABLED so the body reads the node's transform each step.
    // Visual deformation lives on child meshes, so there is no feedback conflict.
    if (opts.disablePreStep === true) body.disablePreStep = true;
    if (opts.mass !== undefined) {
      const mp = body.computeMassProperties();
      mp.mass = opts.mass;
      body.setMassProperties(mp);
    }
    return body;
  }

  public boxShape(w: number, h: number, d: number, scene: BABYLON.Scene) {
    return new BABYLON.PhysicsShapeBox(
      BABYLON.Vector3.Zero(),
      BABYLON.Quaternion.Identity(),
      new BABYLON.Vector3(w / 2, h / 2, d / 2),
      scene,
    );
  }

  public sphereShape(r: number, scene: BABYLON.Scene) {
    return new BABYLON.PhysicsShapeSphere(BABYLON.Vector3.Zero(), r, scene);
  }

  public capsuleShape(r: number, height: number, scene: BABYLON.Scene) {
    return new BABYLON.PhysicsShapeCapsule(
      new BABYLON.Vector3(0, height / 2, 0),
      new BABYLON.Vector3(0, -height / 2, 0),
      r,
      scene,
    );
  }

  public getVelocity(body: BABYLON.PhysicsBody): BABYLON.Vector3 {
    const v = BABYLON.Vector3.Zero();
    body.getLinearVelocityToRef(v);
    return v;
  }

  public setVelocity(body: BABYLON.PhysicsBody, v: BABYLON.Vector3) {
    body.setLinearVelocity(v);
  }

  public addImpulse(body: BABYLON.PhysicsBody, impulse: BABYLON.Vector3, at?: BABYLON.Vector3) {
    body.applyImpulse(impulse, at ?? body.transformNode.position);
  }

  public teleport(body: BABYLON.PhysicsBody, pos: BABYLON.Vector3, rot?: BABYLON.Quaternion) {
    // Body uses disablePreStep=true, so we MUST teleport via setTargetTransform.
    body.setTargetTransform(pos, rot ?? BABYLON.Quaternion.Identity());
    body.setLinearVelocity(BABYLON.Vector3.Zero());
    body.setAngularVelocity(BABYLON.Vector3.Zero());
  }

  public ballSocket(a: BABYLON.PhysicsBody, b: BABYLON.PhysicsBody, pivotA: BABYLON.Vector3, pivotB: BABYLON.Vector3, scene: BABYLON.Scene) {
    const c = new BABYLON.BallAndSocketConstraint(pivotA, pivotB, BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), scene);
    a.addConstraint(b, c);
    return c;
  }

  public distance(a: BABYLON.PhysicsBody, b: BABYLON.PhysicsBody, max: number, scene: BABYLON.Scene) {
    const c = new BABYLON.DistanceConstraint(max, scene);
    a.addConstraint(b, c);
    return c;
  }

  public dispose() {}
}
