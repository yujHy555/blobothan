import * as BABYLON from 'babylonjs';
import { InputState } from '../core/Input';
import { Materials } from '../art/Materials';
import { BlobothanRig, AnimState } from './BlobothanRig';
import { CharacterStyle } from './CharacterStyle';
import { JetpackBackpack } from './JetpackBackpack';
import { Cosmetics } from './Cosmetics';

export interface BoxCollider { x: number; y: number; z: number; w: number; h: number; d: number; }

/**
 * Blobothan — a fluid, deterministic sphere controller ("be like water").
 *
 * WHY CUSTOM: A purpose-built substepped sphere-vs-AABB solver gives tight,
 * predictable collisions with zero tunneling — no engine WASM, no leaking,
 * no black-box instability. One fixed timestep drives everything.
 *
 * Contract:
 *  - position/velocity are authoritative and owned here.
 *  - Movement is integrated in small substeps; each substep resolves overlaps
 *    against every box by pushing the sphere out along the minimum-penetration
 *    normal and cancelling inward velocity.
 *  - Visual squash/stretch/wobble lives on child meshes only.
 */
export class BallPlayer {
  public position: BABYLON.Vector3;
  public velocity: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
  public root: BABYLON.Mesh;
  public characterPivot: BABYLON.TransformNode; // rotates the hero to face travel direction
  public visual: BABYLON.Mesh;
  public rig: BlobothanRig;
  public thirdPerson = false;
  public camHeading = 0;  // camera Y rotation for camera-relative 3D movement
  public moveHeading = 0; // direction the character is currently facing/moving
  public style: CharacterStyle;
  public radius = 1.0;
  // Growth spurt (2s): bigger, heavier, smashes smashers
  public growTimer = 0;
  public growScale = 1;
  public get isGrown() { return this.growTimer > 0; }

  // Super long legs — stretchy "spider stride" ability
  public longLegs = false;
  public legStretch = 1;  // animated 1 → 3
  private longLegTimer = 0;

  private scene: BABYLON.Scene;
  private colliders: BoxCollider[] = [];

  // tuning
  public gravity = -34;
  // Third-person "AAA walk" — snappy start, quick stop, no sliding glide
  public tpAccel = 110;
  public tpFriction = 26;
  public tpMaxSpeed = 12;

  public moveAccel = 46;
  public maxSpeed = 15;
  public jumpSpeed = 15.5;
  public doubleJumpSpeed = 14;
  public tripleJumpSpeed = 23;   // big boost — the signature "oomph" jump
  public tripleForwardBoost = 8; // forward lunge on the triple
  public groundFriction = 10;
  public airFriction = 2.0;
  public coyoteTime = 0.13;
  public jumpBufferTime = 0.13;
  public airControl = 1.0;   // full mid-air steering (AAA feel)
  public maxFall = 55;

  // Jetpack
  public hasJetpack = false;   // only true after a pickup
  public jetFuel = 0;          // 0..1, granted by jetpack pickup
  public jetActive = false;
  public jetThrust = 46;
  public jetDrain = 0.45;      // fuel per second while thrusting
  public jetRegen = 0.12;      // slow refill when not thrusting
  private jetFlames: BABYLON.Mesh[] = [];
  public onJet?: (x: number, y: number) => void;

  // state
  private grounded = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpHeld = false;
  private jumpsUsed = 0;
  private facing = 1;
  private animState: AnimState = 'idle';
  private landTimer = 0;
  private prevVel = new BABYLON.Vector3();
  private accel = new BABYLON.Vector3();
  // Squash envelope: a signed value that ALWAYS decays to 0 (round by default).
  // Positive = stretched tall, negative = squashed flat. Scaling is derived from it.
  private squash = 0;
  private rollAngle = 0;
  private flipTimer = 0;      // triple-jump flip spin
  private flipping = false;
  public tripleBurst = 0;     // >0 right after a triple jump (for juice/audio)

  // Auto wall-climb: detected wall contact from the collider solver
  public wallContact = 0;        // -1 left wall, 1 right wall, 0 none
  public wallClimbing = false;
  public climbSpeed = 9;

  // Grapple rope constraint (drives a real pendulum swing)
  public grapplePoint: BABYLON.Vector3 | null = null;
  public grappleLen = 0;
  public grappleAttached = false;
  public grappleReel = 0;
  public onSling?: (speed: number) => void;

  public attachGrapple(point: BABYLON.Vector3, len: number) {
    this.grapplePoint = point.clone();
    this.grappleLen = len;
    this.grappleAttached = true;
  }
  public detachGrapple(boost = true) {
    this.grappleAttached = false;
    this.grapplePoint = null;
    this.grappleReel = 0;
    if (boost) {
      // preserve swing momentum + small hop
      this.velocity.y = Math.max(this.velocity.y, 7);
    }
  }

  // UNLIMITED dash (short cooldown, works on ground or in air) — arcade flair
  public dashSpeed = 62;      // faster burst
  public dashCooldown = 0.2;  // quicker re-dash
  public dashDuration = 0.24; // covers more distance
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private dashDir = 1;
  private dashCount = 0;
  public onDash?: (combo: number) => void;
  public onDashTrail?: (x: number, y: number, dir: number) => void;

  // Crouch + pop jump (hold slide on ground to charge, release with jump)
  public inputSlide = false;
  public crouching = false;
  public crouchCharge = 0;   // 0..1
  public popJumpSpeed = 26;
  public onPopJump?: () => void;

  public onLand?: (impact: number) => void;
  public onJump?: (level: number) => void; // 1 single, 2 double, 3 triple

  constructor(scene: BABYLON.Scene, mats: Materials, spawn: BABYLON.Vector3) {
    this.scene = scene;
    this.position = spawn.clone();

    this.root = BABYLON.MeshBuilder.CreateSphere('blobRoot', { diameter: 0.02, segments: 4 }, scene);
    this.root.isVisible = false;
    this.root.position = spawn.clone();

    // Pivot rotates the whole character (face + limbs) to face travel direction
    this.characterPivot = new BABYLON.TransformNode('characterPivot', scene);
    this.characterPivot.parent = this.root;

    this.visual = BABYLON.MeshBuilder.CreateIcoSphere('blobVisual', { radius: this.radius, subdivisions: 4 }, scene);
    this.visual.parent = this.characterPivot;
    this.visual.material = mats.jelly();
    this.visual.receiveShadows = true;

    const core = BABYLON.MeshBuilder.CreateSphere('blobCore', { diameter: this.radius * 1.4, segments: 16 }, scene);
    core.parent = this.visual;
    core.material = mats.glow('core', [0.4, 1.0, 1.0], 0.35); // cyan core pops inside magenta


    this.rig = new BlobothanRig(scene, mats, this.characterPivot, this.radius);
    this.style = new CharacterStyle(scene, mats, this.visual, [1, 0.4, 0.7]);

    // Jetpack flames (hidden until fuel is granted/used)
    for (const sx of [-1, 1]) {
      const flame = BABYLON.MeshBuilder.CreateCylinder('jetFlame', { diameter: 0.16, height: 0.6, tessellation: 10 }, scene);
      flame.parent = this.root;
      flame.position = new BABYLON.Vector3(sx * 0.3, -1.4, 0); // below body surface (y=-0.95) — no penetration
      flame.material = mats.glow('jetFlameMat', [1.0, 0.6, 0.18], 0.9);
      flame.setEnabled(false);
      this.jetFlames.push(flame);
    }
  }

  public setColliders(boxes: BoxCollider[]) {
    this.colliders = boxes;
    this.style.setColliders(boxes);
  }
  public applyCosmetics(c: Cosmetics) { this.rig.applyCosmetics(c); }
  public get isGrounded() { return this.grounded; }
  public get state() { return this.animState; }
  public get facingDir() { return this.facing; }

  public update(dt: number, input: InputState) {
    const v = this.velocity;
    this.prevVel.copyFrom(v);

    // Acceleration for eye lag / tilt
    this.accel.x = (v.x - this.prevVel.x) / Math.max(dt, 1e-4);
    this.accel.y = (v.y - this.prevVel.y) / Math.max(dt, 1e-4);

    // ---- Crouch / charge (hold slide on ground) ----
    this.inputSlide = input.slide;
    this.crouching = this.grounded && input.slide;
    if (this.crouching) {
      this.crouchCharge = Math.min(1, this.crouchCharge + dt * 1.4);
    } else if (this.grounded) {
      this.crouchCharge = Math.max(0, this.crouchCharge - dt * 2.5);
    }

    // ---- Horizontal control (fluid) ----
    const control = this.grounded ? 1 : this.airControl;
    if (this.thirdPerson) {
      // Camera-relative 3D movement: axisX = strafe, axisZ = forward/back.
      // Forward vector points from camera toward the play field (+Z when yaw=0).
      const c = Math.cos(this.camHeading), s = Math.sin(this.camHeading);
      // forward = (sin? ) — camera at -Z looking +Z => forward +Z; with yaw it rotates around Y
      const fwdX = s, fwdZ = c;
      const rightX = c, rightZ = -s;
      const moveX = rightX * input.axisX + fwdX * input.axisZ;
      const moveZ = rightZ * input.axisX + fwdZ * input.axisZ;
      const mag = Math.hypot(moveX, moveZ);
      if (mag > 0.01) {
        const nx = moveX / mag, nz = moveZ / mag;
        // Accelerate toward target velocity directly for a planted, walking feel
        const targetX = nx * this.tpMaxSpeed;
        const targetZ = nz * this.tpMaxSpeed;
        const a = this.tpAccel * control * dt;
        v.x += BABYLON.Scalar.Clamp(targetX - v.x, -a, a);
        v.z += BABYLON.Scalar.Clamp(targetZ - v.z, -a, a);
        this.moveHeading = Math.atan2(nx, nz); // face movement direction
      } else {
        // Strong friction → quick stop, no sliding
        const fr = this.grounded ? this.tpFriction : this.airFriction;
        const d = Math.pow(1 - fr * dt, 1 / dt);
        v.x *= d; v.z *= d;
        if (Math.abs(v.x) < 0.15) v.x = 0;
        if (Math.abs(v.z) < 0.15) v.z = 0;
      }
    } else {
      if (input.axisX !== 0) {
        v.x += input.axisX * this.moveAccel * control * dt;
        v.x = BABYLON.Scalar.Clamp(v.x, -this.maxSpeed, this.maxSpeed);
        this.facing = Math.sign(input.axisX);
      } else {
        const fr = this.grounded ? this.groundFriction : this.airFriction;
        v.x *= Math.pow(1 - fr * dt, 1 / dt);
        if (Math.abs(v.x) < 0.05) v.x = 0;
      }
    }

    // ---- Gravity + Jetpack thrust ----
    v.y += this.gravity * dt;
    if (v.y < -this.maxFall) v.y = -this.maxFall;

    // Hold jump in the air with fuel → thrust upward ("cruise to the stars")
    this.jetActive = false;
    if (this.hasJetpack && !this.grounded && input.jump && this.jetFuel > 0) {
      this.jetActive = true;
      this.jetFuel = Math.max(0, this.jetFuel - this.jetDrain * dt);
      v.y += this.jetThrust * dt;
      if (v.y > 22) v.y = 22; // cap ascent
      this.jumpsUsed = 2; // prevent extra jumps while flying
      if (Math.random() < 0.5) this.onJet?.(this.position.x, this.position.y - 1);
    } else if (this.hasJetpack && this.jetFuel < 1 && !input.jump) {
      this.jetFuel = Math.min(1, this.jetFuel + this.jetRegen * dt);
    }
    // Flame visuals
    for (const f of this.jetFlames) {
      f.setEnabled(this.jetActive);
      if (this.jetActive) f.scaling.y = 0.7 + Math.random() * 0.6;
    }

    // ---- Jump: coyote + buffer + double ----
    if (this.grounded) { this.coyote = this.coyoteTime; this.jumpsUsed = 0; }
    else this.coyote = Math.max(0, this.coyote - dt);
    if (input.jumpPressed) this.jumpBuffer = this.jumpBufferTime;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0) {
      if (this.crouchCharge > 0.15 && this.grounded) {
        // Crouch-pop jump: power scales with charge
        const power = this.jumpSpeed + (this.popJumpSpeed - this.jumpSpeed) * this.crouchCharge;
        this.doJump(power, false);
        this.crouchCharge = 0;
        this.squash = 0.8;
        this.onPopJump?.();
        this.jumpBuffer = 0; this.coyote = 0;
      }
      else if (this.coyote > 0 || this.jumpsUsed === 0) { this.doJump(this.jumpSpeed, false); this.jumpBuffer = 0; this.coyote = 0; }
      else if (this.jumpsUsed === 1) { this.doJump(this.doubleJumpSpeed, true); this.jumpBuffer = 0; }
      else { // jumpsUsed >= 2: infinite air jumps, each a fun flip
        this.doJump(this.tripleJumpSpeed, false, true);
        this.jumpBuffer = 0;
        this.jumpsUsed = 3; // stay in "air jump" mode forever until landing
      }
    }
    if (this.jumpHeld && !input.jump) {
      this.jumpHeld = false;
      if (v.y > 5) v.y *= 0.5;
    }

    // ---- UNLIMITED ARCADE DASH (anytime, short cooldown) ----
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
    if (input.dashPressed && this.dashCooldownTimer <= 0) {
      this.dashCooldownTimer = this.dashCooldown;
      this.dashDir = input.axisX !== 0 ? Math.sign(input.axisX) : this.facing;
      this.dashTimer = this.dashDuration;
      this.facing = this.dashDir;
      this.squash = 0.85;
      this.rollAngle += this.dashDir * 1.8; // bigger spin-flip
      this.dashCount = (this.dashCount + 1) % 100;
      this.onDash?.(this.dashCount);
    }
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const t = this.dashTimer / this.dashDuration;
      // Near-constant top speed so it covers real distance, with a quick snap
      v.x = this.dashDir * this.dashSpeed * (0.82 + 0.18 * t);
      v.y = Math.max(v.y, 1.5) + 7 * dt;
      this.jumpHeld = false;
      if (Math.random() < 0.85) this.onDashTrail?.(this.position.x, this.position.y, this.dashDir);
    }

    // ---- Grapple rope constraint (real pendulum sling) ----
    if (this.grappleAttached && this.grapplePoint) {
      const anchor = this.grapplePoint;
      const dx = this.position.x - anchor.x;
      const dy = this.position.y - anchor.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const nx = dx / dist, ny = dy / dist;

      // Tangent direction (perpendicular to rope)
      const tx = -ny, ty = nx;
      // Project velocity onto tangent (remove radial component) → swing
      const vDotT = v.x * tx + v.y * ty;
      const gravityTangent = -this.gravity * tx * 0; // (gravity already applied)
      // Pump the swing with horizontal input along tangent
      const pump = input.axisX * 18 * dt;
      // Preserve tangential speed, add pump, apply light damping
      let newT = vDotT * 0.999 + pump + (tx * -this.gravity * dt);
      newT *= 0.995;
      v.x = tx * newT;
      v.y = ty * newT;

      // Rope length correction: if beyond length, snap position back and kill outward velocity
      if (dist > this.grappleLen) {
        const correction = dist - this.grappleLen;
        this.position.x -= nx * correction;
        this.position.y -= ny * correction;
        const vDotN = v.x * nx + v.y * ny;
        if (vDotN > 0) { v.x -= nx * vDotN; v.y -= ny * vDotN; }
      }
      // Reel in with grapple button held (passed via a flag from input handled in main)
      if (this.grappleReel > 0) {
        this.grappleLen = Math.max(3, this.grappleLen - dt * 14);
      }
      if (Math.abs(newT) > 14) this.onSling?.(Math.abs(newT));
    }

    // ---- Integrate with substeps for tight collision ----
    this.grounded = false;
    const dist = v.length() * dt;
    const steps = Math.max(1, Math.min(12, Math.ceil(dist / (this.radius * 0.5))));
    const sdt = dt / steps;
    let landingImpact = 0;
    for (let i = 0; i < steps; i++) {
      this.position.x += v.x * sdt;
      this.position.y += v.y * sdt;
      this.position.z += v.z * sdt; // 3D arena: forward/back movement
      this.resolveColliders(v, (impact) => { if (impact > landingImpact) landingImpact = impact; });
    }
    // In third-person, Z is free (full 3D arena); in 2.5D it's locked to 0.
    if (!this.thirdPerson) this.position.z = 0;

    // Landing event
    if (this.grounded && landingImpact > 2.5) {
      this.kickSquash(Math.min(0.5, 0.14 + landingImpact * 0.02), Math.min(0.45, 0.12 + landingImpact * 0.018));
      this.landTimer = 0.16;
      this.onLand?.(landingImpact);
    }

    // ---- Animation state ----
    const horizSpeed = Math.hypot(v.x, v.z);
    if (this.jetActive) this.animState = 'fly';
    else if (this.dashTimer > 0) this.animState = 'dash';
    else if (this.crouching) this.animState = 'crouch';
    else if (this.grounded) this.animState = this.inputSlide && horizSpeed > 3 ? 'slide' : (horizSpeed > 2.2 ? 'run' : 'idle');
    else this.animState = this.jumpsUsed >= 3 ? 'tripleJump' : (this.jumpsUsed >= 2 ? 'doubleJump' : 'jump');
    if (this.landTimer > 0) { this.landTimer -= dt; this.animState = 'land'; }

    // Triple burst decays
    if (this.tripleBurst > 0) this.tripleBurst = Math.max(0, this.tripleBurst - dt);

    // ---- Growth spurt timer ----
    if (this.growTimer > 0) {
      this.growTimer -= dt;
      if (this.growTimer <= 0) this.growScale = 1;
    }

    // ---- Super long legs: animate the stretch toward target ----
    if (this.longLegs) {
      this.longLegTimer -= dt;
      if (this.longLegTimer <= 0) this.longLegs = false;
    }
    const legTarget = this.longLegs ? 3.0 : 1.0;
    this.legStretch += (legTarget - this.legStretch) * Math.min(1, dt * 4);

    // ---- Visual squash + rolling ----
    // Envelope decays exponentially to 0, so the ball is ALWAYS round at rest.
    this.squash *= Math.pow(0.02, dt); // fast decay to 0
    if (Math.abs(this.squash) < 0.001) this.squash = 0;
    const flatten = Math.min(0.06, Math.abs(v.x) * 0.0025);
    // squash<0 = flat (land), squash>0 = tall (jump); volume-ish preserving
    const sx = Math.max(0.55, 1 - this.squash * 0.6 - flatten);
    const sy = Math.max(0.55, 1 + this.squash * 0.7 - flatten * 0.4);
    // When grown: keep a PERFECT sphere (uniform scale) so the shape never
    // distorts — the growth form is a clean, oversized jelly orb.
    if (this.growTimer > 0) {
      this.visual.scaling.setAll(this.growScale);
    } else {
      this.visual.scaling.set(sx, sy, sx);
    }

    // Roll around Z while travelling in X
    this.rollAngle -= (v.x * dt) / this.radius;
    // Triple-jump flip: a full 360° spin around Z
    if (this.flipping) {
      this.flipTimer -= dt;
      this.rollAngle -= (Math.PI * 2 / 0.5) * dt; // one full rotation over 0.5s
      if (this.flipTimer <= 0) this.flipping = false;
    }
    this.visual.rotation.z = this.rollAngle;

    // Third-person: rotate the whole hero so the face points into the screen
    // (travel direction). In 2.5D the face points at the side-on camera.
    const targetPivotY = this.thirdPerson ? (this.moveHeading + Math.PI) : 0;
    let pd = targetPivotY - this.characterPivot.rotation.y;
    while (pd > Math.PI) pd -= Math.PI * 2;
    while (pd < -Math.PI) pd += Math.PI * 2;
    this.characterPivot.rotation.y += pd * Math.min(1, dt * 8);

    this.root.position.copyFrom(this.position);

    // ---- Rig + AAA style ----
    // Pass full horizontal speed so legs animate in 2.5D AND 3D (forward/back/strafe)
    this.rig.update(dt, {
      velX: v.x, velY: v.y, accelX: this.accel.x, accelY: this.accel.y,
      speed: horizSpeed,
      grounded: this.grounded, stateName: this.animState, facing: this.facing,
      crouchCharge: this.crouchCharge, legStretch: this.legStretch,
    });
    this.style.update(dt, this.position, v.x, v.z, v.y, this.growScale);
  }

  private resolveColliders(v: BABYLON.Vector3, onImpact: (i: number) => void) {
    const r = this.radius * this.growScale;
    for (const c of this.colliders) {
      const minX = c.x - c.w / 2, maxX = c.x + c.w / 2;
      const minY = c.y - c.h / 2, maxY = c.y + c.h / 2;
      const minZ = c.z - c.d / 2, maxZ = c.z + c.d / 2;
      // closest point on box to sphere center
      const qx = BABYLON.Scalar.Clamp(this.position.x, minX, maxX);
      const qy = BABYLON.Scalar.Clamp(this.position.y, minY, maxY);
      const qz = BABYLON.Scalar.Clamp(this.position.z, minZ, maxZ);
      let dx = this.position.x - qx, dy = this.position.y - qy, dz = this.position.z - qz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;

      let nx: number, ny: number, nz: number, pen: number;
      const d = Math.sqrt(d2);
      if (d > 1e-5) {
        nx = dx / d; ny = dy / d; nz = dz / d;
        pen = r - d;
      } else {
        // center inside box: push out along least-penetration axis
        const px = Math.min(this.position.x - minX, maxX - this.position.x);
        const py = Math.min(this.position.y - minY, maxY - this.position.y);
        const pz = Math.min(this.position.z - minZ, maxZ - this.position.z);
        if (px <= py && px <= pz) { nx = this.position.x - c.x < 0 ? -1 : 1; ny = 0; nz = 0; pen = px + r; }
        else if (py <= pz) { nx = 0; ny = this.position.y - c.y < 0 ? -1 : 1; nz = 0; pen = py + r; }
        else { nx = 0; ny = 0; nz = this.position.z - c.z < 0 ? -1 : 1; pen = pz + r; }
      }
      this.position.x += nx * pen;
      this.position.y += ny * pen;
      this.position.z += nz * pen;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn < 0) {
        const impact = -vn;
        v.x -= vn * nx; v.y -= vn * ny; v.z -= vn * nz;
        if (ny > 0.55) { this.grounded = true; onImpact(impact); }
      }
      if (ny > 0.55) this.grounded = true;
    }
  }

  private doJump(speed: number, double: boolean, triple = false) {
    // Organic variation: no two jumps are identical (stylized realism)
    const variance = 1 + (Math.random() - 0.5) * 0.08; // ±4% height
    this.velocity.y = speed * variance;
    if (this.thirdPerson) {
      this.velocity.x += (Math.random() - 0.5) * 1.2; // subtle lateral drift
      this.velocity.z += (Math.random() - 0.5) * 1.2;
    }
    this.jumpsUsed = triple ? 3 : (double ? 2 : 1);
    this.jumpHeld = true;
    this.grounded = false;
    this.coyote = 0;
    this.kickSquash(-0.3, 0.4);
    if (double && !triple) { this.squash = 0.5; this.rollAngle += this.facing * 0.6; }
    if (triple) {
      // SIGNATURE TRIPLE JUMP — max oomph: big boost, forward lunge, dramatic
      // full flip, stretched pose, and a burst flag the juice layer amplifies.
      this.velocity.y = speed;
      this.velocity.x += this.facing * this.tripleForwardBoost; // lunge forward
      this.flipping = true;
      this.flipTimer = 0.7;                 // longer, showier flip
      this.squash = 0.9;                     // big stretch
      this.tripleBurst = 0.4;               // triggers screen burst/flash
      this.style.flare(1.4);                // aura flare
    }
    this.onJump?.(triple ? 3 : (double ? 2 : 1));
  }

  private kickSquash(_sx: number, sy: number) { this.squash = -sy; }

  /** Add a velocity impulse (bumpers / wunder dust). */
  public impulse(x: number, y: number) { this.velocity.x = x; this.velocity.y = Math.max(this.velocity.y, 0) + y; }

  public teleport(pos: BABYLON.Vector3) {
    this.position.copyFrom(pos);
    this.velocity.set(0, 0, 0);
    this.root.position.copyFrom(pos);
    this.jumpsUsed = 0;
    this.squash = 0;
  }

  public grow(seconds = 2) {
    this.growTimer = seconds;
    this.growScale = 1.8;
    this.squash = 0.4;
  }

  /** Toggle super-long legs — a floaty, stretched spider-stride. */
  public toggleLongLegs() {
    this.longLegs = !this.longLegs;
    this.longLegTimer = this.longLegs ? 6 : 0; // auto-revert after 6s
    this.squash = 0.5;
  }

  public wobbleKick(a: number) { this.squash = -Math.min(0.8, a * 0.4); }
  public celebrate() { this.velocity.y = 17; this.squash = 0.6; }
  public dispose() { this.rig.dispose(); this.root.dispose(false, true); }
}
