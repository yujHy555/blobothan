import * as BABYLON from 'babylonjs';
import { InputState } from '../core/Input';
import { Materials } from '../art/Materials';
import { BlobothanRig, AnimState } from './BlobothanRig';

export interface SkateCallbacks {
  onOllie?: () => void;
  onTrick?: (name: string, points: number, x: number, y: number) => void;
  onLand?: (gForce: number, x: number, y: number) => void;
  onBail?: (x: number, y: number) => void;
  onCombo?: (combo: number, points: number, x: number, y: number) => void;
  onCarve?: (x: number, y: number, dir: number) => void;
  onFlow?: (x: number, y: number, dir: number, speed: number) => void;
  onGForce?: (g: number, x: number, y: number) => void;
  onSpeedBoost?: (boost: number, x: number, y: number) => void;
  onHandPlant?: (charge: number, x: number, y: number) => void;
  onHandPlantStart?: (x: number, y: number) => void;
  onGrabStart?: (x: number, y: number) => void;
  onHandPlantCharge?: (charge: number, x: number, y: number) => void;
  onKickFlip?: (x: number, y: number) => void;
  onOlliePop?: (x: number, y: number, power: number) => void;
  onFall?: (x: number, y: number) => void;
  onSave?: (x: number, y: number) => void;
  onGapWarning?: (x: number, y: number) => void;
  onDash?: (x: number, y: number, dir: number) => void;
  onGold?: (x: number, y: number) => void;
}

interface GoldCoin { root: BABYLON.TransformNode; pos: BABYLON.Vector3; collected: boolean; phase: number; }

/**
 * SKATE SYSTEM — a momentum-driven half-pipe skating sandbox with arcade tricks.
 *
 * The rider is constrained to a parabolic half-pipe. Speed builds through
 * gravity + pumping (crouch on the descent, extend on the ascent). At the lips
 * the rider launches into the air, where spins / grabs / kickflips rack up a
 * trick score. Land cleanly to BANK the combo — bail and lose it. Centrifugal
 * force at the bottom is real: centripetal accel v²/R drives the G-force
 * squash, camera kick, wheel sparks and gold juice.
 */
export class SkateSystem {
  // ---- Bowl geometry (configurable per level) ----
  public halfW = 26;
  public bottom = 2;
  public height = 16;
  public depth = 11;
  public spawnX = -20;
  public k = 16 / (26 * 26);
  public get bound() { return this.halfW + 20; }

  public position = new BABYLON.Vector3(0, 3, 0); // rider center (camera target)
  public score = 0;
  public combo = 0;
  public speed = 0;          // signed tangential speed
  public gForce = 1;
  public trickName = '';
  public trickPoints = 0;
  public isAirborne = false;
  public coinsCollected = 0;
  public celebrating = false;
  public rig!: BlobothanRig;

  // ---- LIVE-TUNABLE (dev panel) ----
  public gravity = 34;
  public maxSpeed = 38;
  public carvePower = 30;
  public pumpPower = 26;
  public spinSpeed = 560;
  public airJumpBoost = 12;
  public lipBoost = 6;
  public airDrag = 0.22;
  public airControl = 26;   // mid-air horizontal steering strength
  public assist = 1;        // arcade assist strength (momentum + ramp re-entry)
  public dashPower = 24;    // third-action speed burst (key asset in level 4)
  public endlessJumpBoost = 3.4; // level 4: HUGE arcade airtime
  private jumpStretch = 0;  // leg-extension envelope on jumps
  private squash = 0;       // +stretch / -squash envelope, decays to 0
  public preserveMomentum = false; // level 4: jumps never bleed speed, flow stays endless
  public jumpScale = 0.5;          // level 3: low start, builds big with speed; level 4: full arcade air
  public endless = false;          // level 4: procedural endless run to the right
  public distance = 0;             // endless distance travelled
  public endlessGravity = 52;      // stronger, real-feeling gravity for the endless run

  private scene: BABYLON.Scene;
  private mats: Materials;
  private cb: SkateCallbacks;

  // physics state
  private x = 0;
  private y = this.bottom;        // board contact height
  private vx = 0;
  private vy = 0;
  private spin = 0;          // visual spin degrees
  private spinAwarded = 0;
  private flip = 0;
  private flipPending = 0;
  private grabTime = 0;
  private grabAwarded = 0;
  private airTime = 0;
  private lean = 0;
  private lipCooldown = 0;      // stops instant re-launch loops at the coping
  private airJumpCooldown = 0;  // lets you chain air-ollies without mashing
  private airJumpCount = 0;     // 1 = jump/ollie, 2 = trick, then dash
  private dashCooldown = 0;
  private lastGMilestone = 0;
  private dashCharge = 0;  // dash feeds the next jump's height
  private lockAirX = false; // lock horizontal only when launched at lip/bottom
  public handPlanting = false;
  public handPlantCharge = 0;
  private handPlantSide = 1;
  public airGrabbing = false;
  public airGrabTime = 0;
  private visualFlip = 0;   // animated board flip (catches up to target flip)
  private visualSpin = 0;   // animated board spin (catches up to target spin)
  private kickSpinRate = 0; // kickflip angular velocity for the snappy burst
  private grabSpinBurst = 0; // grab-entry board kick flourish
  public riderYaw = 0;       // LB/RB turn the SKATER (never the camera)
  private inputTurnLeft = false;
  private inputTurnRight = false;
  private turning = false;
  private saveCooldown = 0; // gap-save juice throttle
  public pushing = false;
  public pushLeg = 1;
  private pushTimer = 0;
  private gapWarned = -1;
  private kickFlipCd = 0;
  private handPlantHintTimer = 0;

  // visuals
  private board!: BABYLON.TransformNode;
  private boardDeck!: BABYLON.TransformNode; // deck+wheels only — spins during kickflips, rider stays upright
  private rider!: BABYLON.TransformNode;
  private body!: BABYLON.Mesh;
  private wheels: BABYLON.Mesh[] = [];
  private underglow!: BABYLON.Mesh;
  private plantHand!: BABYLON.Mesh;
  private plantLight!: BABYLON.PointLight;
  private grabHand!: BABYLON.Mesh;
  private coins: GoldCoin[] = [];
  private time = 0;

  // ---------- surface math ----------
  private surfaceY(x: number) {
    const ax = Math.abs(x);
    if (ax <= this.halfW) return this.bottom + this.k * x * x;
    // Gentle uphill past the lip — gravity naturally rolls the rider back into
    // the bowl instead of leaving them stranded on a flat lip spamming ollies.
    return this.bottom + this.height + 0.22 * (ax - this.halfW);
  }
  private slope(x: number) {
    if (x > this.halfW) return 0.22;
    if (x < -this.halfW) return -0.22;
    return 2 * this.k * x;
  }
  private angle(x: number) { return Math.atan(this.slope(x)); }
  /** Bouncy skatepark boundary walls — keep the rider inside the bowl. */
  private bounceWalls() {
    if (this.x > this.bound) { this.x = this.bound; if (this.vx > 0) this.vx *= -0.65; }
    else if (this.x < -this.bound) { this.x = -this.bound; if (this.vx < 0) this.vx *= -0.65; }
  }
  // ---------- ENDLESS COURSE ----------
  private trackMesh: BABYLON.Mesh | null = null;
  private trackBuiltAt = -1e9;
  private endlessCoins: GoldCoin[] = [];
  private boostPads: BABYLON.Mesh[] = [];
  private checkpointX = 0;

  // ---- GRAVITY LOOPS (sky-bar 360s, level 4) ----
  // A loop is a parametric circle in the XY plane. The rider is pinned to the
  // track while its normal force is positive; when centrifugal demand exceeds
  // gravity (or the rider slows), it releases tangentially into normal air.
  private loopPos = new BABYLON.Vector3(0, 0, 0);
  private loopR = 9;
  private loopAngle = 0;      // 0 = bottom, increases counter-clockwise
  private loopSpeed = 0;
  private inLoop = false;
  private loopCooldown = 0;
  private loopMeshes: BABYLON.Mesh[] = [];
  private static readonly LOOP_SPACING = 420;
  private static readonly LOOP_FIRST_X = 300;

  private courseSeg(x: number) {
    const P = 160;
    return ((x % P) + P) % P;
  }
  /** Procedural endless terrain: rolling waves, kicker ramps and gaps. */
  private endlessY(x: number) {
    if (x < 45) return 6; // simple flat runway at the start — no glitchy features
    const s = this.courseSeg(x);
    if (s >= 60 && s < 76) return -1000; // GAP — must jump it
    let y = 6 + 1.6 * Math.sin(x * 0.055); // gentler rolling waves
    if (s >= 44 && s < 60) { const t = (s - 44) / 16; y += t * t * 6; }        // lower launch ramp
    if (s >= 76 && s < 92) { const t = (s - 76) / 16; y += (1 - t) * 6; }      // lower landing ramp
    return y;
  }
  private endlessSlope(x: number) {
    return (this.endlessY(x + 0.25) - this.endlessY(x - 0.25)) / 0.5;
  }

  // Nearest loop centre ahead of/behind x, or null if none in this section.
  private loopCenterFor(x: number) {
    const S = SkateSystem.LOOP_SPACING, first = SkateSystem.LOOP_FIRST_X;
    if (x < first - 40) return null;
    const k = Math.max(0, Math.round((x - first) / S));
    const cx = first + k * S;
    return { x: cx, y: this.endlessY(cx) + this.loopR, r: this.loopR };
  }
  // Point + tangent on a loop at angle (0 = bottom, CCW).
  private loopPoint(c: { x: number; y: number; r: number }, a: number) {
    return { x: c.x + c.r * Math.sin(a), y: c.y - c.r * Math.cos(a) };
  }
  private isGap(x: number) { if (x < 160) return false; const s = this.courseSeg(x); return s >= 60 && s < 76; }
  /** Height of the nearest solid ground — never returns a gap's -1000 void. */
  private nearestSolidY(x: number) {
    for (let d = 0; d < 80; d += 2) {
      if (!this.isGap(x + d)) return this.endlessY(x + d);
      if (!this.isGap(x - d)) return this.endlessY(x - d);
    }
    return 6;
  }
  private isBoost(x: number) { const s = this.courseSeg(x); return (s > 18 && s < 24) || (s > 128 && s < 134); }

  /** Radius of curvature of the parabola at x. */
  private radius(x: number) {
    const k = this.k;
    const s = 2 * k * Math.max(-this.halfW, Math.min(this.halfW, x));
    return Math.pow(1 + s * s, 1.5) / (2 * k);
  }

  constructor(scene: BABYLON.Scene, mats: Materials, cb: SkateCallbacks = {},
               config?: { halfW?: number; bottom?: number; height?: number; depth?: number; spawnX?: number; preserveMomentum?: boolean; jumpScale?: number; endless?: boolean }) {
    this.scene = scene;
    this.mats = mats;
    this.cb = cb;
    if (config) {
      if (config.halfW !== undefined) this.halfW = config.halfW;
      if (config.bottom !== undefined) this.bottom = config.bottom;
      if (config.height !== undefined) this.height = config.height;
      if (config.depth !== undefined) this.depth = config.depth;
      if (config.spawnX !== undefined) this.spawnX = config.spawnX;
      if (config.preserveMomentum !== undefined) this.preserveMomentum = config.preserveMomentum;
      if (config.jumpScale !== undefined) this.jumpScale = config.jumpScale;
      if (config.endless !== undefined) this.endless = config.endless;
      this.k = this.height / (this.halfW * this.halfW);
    }
    this.position.set(0, this.bottom + 1, 0);
    if (this.endless) this.buildEndlessTrack(true); else this.buildPipe();
    this.buildBoardAndRider();
    if (!this.endless) this.buildCoins(); else this.buildEndlessCoins();
    this.reset();
  }

  // ------------------------------------------------------------------ geometry
  private buildPipe() {
    const s = this.scene;
    const N = 72;
    const xs: number[] = [];
    for (let i = 0; i <= N; i++) xs.push(-this.halfW - 22 + (2 * (this.halfW + 22)) * (i / N));

    // Riding surface ribbon
    const paths: BABYLON.Vector3[][] = [];
    for (const z of [-this.depth / 2, this.depth / 2]) {
      paths.push(xs.map((x) => new BABYLON.Vector3(x, this.surfaceY(x), z)));
    }
    const surf = BABYLON.MeshBuilder.CreateRibbon('halfpipe', {
      pathArray: paths, sideOrientation: BABYLON.Mesh.DOUBLESIDE,
    }, s);
    const surfMat = new BABYLON.PBRMaterial('pipeSurface', s);
    surfMat.albedoColor = new BABYLON.Color3(0.13, 0.09, 0.22);
    surfMat.metallic = 0.25;
    surfMat.roughness = 0.62;
    surfMat.emissiveColor = new BABYLON.Color3(0.04, 0.02, 0.08);
    surf.material = surfMat;
    surf.receiveShadows = true;

    // Neon grid stripes across the pipe (z-direction) + coping glow
    const gridLines: BABYLON.Vector3[][] = [];
    for (let x = -this.halfW - 20; x <= this.halfW + 20; x += 2.4) {
      gridLines.push([
        new BABYLON.Vector3(x, this.surfaceY(x) + 0.07, -this.depth / 2 + 0.05),
        new BABYLON.Vector3(x, this.surfaceY(x) + 0.07, this.depth / 2 - 0.05),
      ]);
    }
    for (const z of [-this.depth / 2 + 0.4, 0, this.depth / 2 - 0.4]) {
      const line: BABYLON.Vector3[] = [];
      for (const x of xs) line.push(new BABYLON.Vector3(x, this.surfaceY(x) + 0.09, z));
      gridLines.push(line);
    }
    const grid = BABYLON.MeshBuilder.CreateLineSystem('pipeGrid', { lines: gridLines }, s);
    grid.color = new BABYLON.Color3(0.55, 0.32, 0.95);
    grid.alpha = 0.55;

    // Coping tubes at both lips (gold, glowing)
    for (const sx of [-1, 1]) {
      const lipX = sx * this.halfW;
      const lipY = this.surfaceY(lipX);
      const coping = BABYLON.MeshBuilder.CreateCylinder('coping', {
        diameter: 0.5, height: this.depth + 1.4, tessellation: 16,
      }, s);
      coping.position.set(lipX, lipY + 0.12, 0);
      coping.rotation.x = Math.PI / 2;
      coping.material = this.mats.glow('copingGold', [1.0, 0.8, 0.22]);
    }

    // Vertical lip walls so the pipe reads as a real bowl from the side
    for (const sx of [-1, 1]) {
      const wall = BABYLON.MeshBuilder.CreateBox('lipWall', {
        width: 0.6, height: this.height + 3, depth: this.depth,
      }, s);
      wall.position.set(sx * (this.halfW + 0.3), this.bottom + this.height / 2, 0);
      const wm = new BABYLON.PBRMaterial('lipWallMat', s);
      wm.albedoColor = new BABYLON.Color3(0.1, 0.07, 0.18);
      wm.metallic = 0.3; wm.roughness = 0.5;
      wall.material = wm;
    }

    // Floodlight posts for skatepark vibe
    for (const x of [-this.halfW - 14, 0, this.halfW + 14]) {
      const pole = BABYLON.MeshBuilder.CreateCylinder('lampPole', { diameter: 0.4, height: 30, tessellation: 10 }, s);
      pole.position.set(x, this.bottom + this.height + 12, -this.depth / 2 - 2);
      pole.material = this.mats.glow('lampPoleMat', [0.25, 0.18, 0.4], 0.8);
      const lamp = BABYLON.MeshBuilder.CreateSphere('lamp', { diameter: 1.6, segments: 12 }, s);
      lamp.position.set(x, this.bottom + this.height + 27, -this.depth / 2 - 2);
      lamp.material = this.mats.glow('lampMat', [1.0, 0.85, 0.35]);
      const pl = new BABYLON.PointLight('pipeLamp', lamp.position.clone(), s);
      pl.diffuse = new BABYLON.Color3(1, 0.8, 0.4);
      pl.intensity = 0.7; pl.range = 60;
    }
  }

  /** Build the sky-bar gravity loops (360° tubes) around the rider. */
  private buildLoops(center: number) {
    for (const m of this.loopMeshes) m.dispose();
    this.loopMeshes = [];
    const S = SkateSystem.LOOP_SPACING, first = SkateSystem.LOOP_FIRST_X;
    const k0 = Math.max(0, Math.floor((center - 220 - first) / S));
    const k1 = Math.floor((center + 1400 - first) / S);
    for (let k = k0; k <= k1; k++) {
      const cx = first + k * S;
      const cy = this.endlessY(cx) + this.loopR;
      const ring = BABYLON.MeshBuilder.CreateTorus('skyLoop', {
        diameter: this.loopR * 2, thickness: 0.7, tessellation: 40,
      }, this.scene);
      ring.position.set(cx, cy, 0);
      const lm = new BABYLON.PBRMaterial('skyLoopMat', this.scene);
      lm.albedoColor = new BABYLON.Color3(0.28, 0.55, 0.62);
      lm.metallic = 0.6; lm.roughness = 0.35;
      lm.emissiveColor = new BABYLON.Color3(0.08, 0.3, 0.34);
      ring.material = lm;
      ring.isPickable = false;
      this.loopMeshes.push(ring);
      // Glowing guide strip around the inside of the loop.
      const glow = BABYLON.MeshBuilder.CreateTorus('skyLoopGlow', {
        diameter: this.loopR * 2 - 1.2, thickness: 0.18, tessellation: 40,
      }, this.scene);
      glow.position.set(cx, cy, 0);
      glow.material = this.mats.glow('skyLoopGlowMat', [0.35, 1.0, 0.95], 0.75);
      glow.isPickable = false;
      this.loopMeshes.push(glow);
    }
  }

  /** Build/rebuild the scrolling endless track around the rider. */
  private buildEndlessTrack(initial = false) {
    const s = this.scene;
    const center = initial ? 0 : this.x;
    this.trackBuiltAt = center;
    s.meshes.slice().forEach((m) => {
      if (m.name.startsWith('endlessTrack') || m.name.startsWith('endlessGrid') ||
          m.name.startsWith('endlessRail') || m.name.startsWith('gapGate') ||
          m.name.startsWith('boostPad') || m.name.startsWith('courseArch') ||
          m.name.startsWith('skyLoop') || m.name.startsWith('startLine')) m.dispose();
    });
    this.boostPads = [];
    this.buildLoops(center);
    // One long, densely-segmented track — no rebuild pops in view.
    const x0 = center - 220, x1 = center + 1400, N = 480;
    const paths: BABYLON.Vector3[][] = [];
    for (const z of [-this.depth / 2, this.depth / 2]) {
      const path: BABYLON.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * (i / N);
        path.push(new BABYLON.Vector3(x, this.isGap(x) ? -6 : this.endlessY(x), z));
      }
      paths.push(path);
    }
    const mesh = BABYLON.MeshBuilder.CreateRibbon('endlessTrack', { pathArray: paths, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s);
    const mat = new BABYLON.PBRMaterial('endlessTrackMat', s);
    mat.albedoColor = new BABYLON.Color3(0.08, 0.16, 0.3);
    mat.metallic = 0.25; mat.roughness = 0.6;
    mat.emissiveColor = new BABYLON.Color3(0.02, 0.06, 0.12);
    mesh.material = mat;
    this.trackMesh = mesh;

    // Neon grid — SKIP gaps so no stray lines float over the pits.
    const lines: BABYLON.Vector3[][] = [];
    for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) {
      if (this.isGap(x)) continue;
      const y = this.endlessY(x);
      lines.push([new BABYLON.Vector3(x, y + 0.06, -this.depth / 2 + 0.1), new BABYLON.Vector3(x, y + 0.06, this.depth / 2 - 0.1)]);
    }
    const grid = BABYLON.MeshBuilder.CreateLineSystem('endlessGrid', { lines }, s);
    grid.color = new BABYLON.Color3(0.3, 0.9, 1.0); grid.alpha = 0.38;

    // Continuous neon side rails frame the track and hide its edges.
    for (const sz of [-1, 1]) {
      const rail: BABYLON.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * (i / N);
        const y = this.isGap(x) ? -6 : this.endlessY(x);
        rail.push(new BABYLON.Vector3(x, y + 0.22, sz * (this.depth / 2 - 0.1)));
      }
      const r = BABYLON.MeshBuilder.CreateLines('endlessRail', { points: rail }, s);
      r.color = new BABYLON.Color3(0.25, 0.95, 1.0); r.alpha = 0.8;
    }

    // Gap gates — glowing pink portals that clearly mark the jump zones.
    for (let base = Math.floor(x0 / 160) * 160; base < x1; base += 160) {
      const gs = base + 60, ge = base + 76;
      if (gs < 160) continue;
      for (const gx of [gs, ge]) {
        for (const sz of [-1, 1]) {
          const post = BABYLON.MeshBuilder.CreateBox('gapGate', { width: 0.4, height: 8, depth: 0.4 }, s);
          post.position.set(gx, this.endlessY(gx - (gx === gs ? 4 : -4)) + 3.8, sz * (this.depth / 2 + 0.3));
          post.material = this.mats.glow('gapGateMat', [1.0, 0.25, 0.7], 0.9);
          post.isPickable = false;
        }
        const beam = BABYLON.MeshBuilder.CreateBox('gapGate', { width: 0.35, height: 0.35, depth: this.depth + 1.2 }, s);
        beam.position.set(gx, this.endlessY(gx - (gx === gs ? 4 : -4)) + 7.6, 0);
        beam.material = this.mats.glow('gapGateMat', [1.0, 0.25, 0.7], 0.9);
        beam.isPickable = false;
      }
    }

    // Arch gates every module for a classic endless-runner look.
    for (let base = Math.floor(x0 / 160) * 160; base < x1; base += 160) {
      const ax = base + 100;
      if (ax < 160) continue;
      for (const sz of [-1, 1]) {
        const post = BABYLON.MeshBuilder.CreateCylinder('courseArch', { diameter: 0.3, height: 11, tessellation: 8 }, s);
        post.position.set(ax, this.endlessY(ax) + 5.4, sz * (this.depth / 2 + 0.4));
        post.material = this.mats.glow('archMat', [0.3, 0.9, 1.0], 0.7);
      }
      const top = BABYLON.MeshBuilder.CreateBox('courseArch', { width: 0.3, height: 0.3, depth: this.depth + 1.4 }, s);
      top.position.set(ax, this.endlessY(ax) + 10.8, 0);
      top.material = this.mats.glow('archMat', [0.3, 0.9, 1.0], 0.7);
    }

    // Checkered start line.
    for (const sz of [-1, 1]) {
      const line = BABYLON.MeshBuilder.CreateBox('startLine', { width: 0.5, height: 0.05, depth: this.depth - 0.5 }, s);
      line.position.set(2, this.endlessY(2) + 0.08, 0);
      line.material = this.mats.glow('startLineMat', [1, 1, 1], 0.9);
    }

    // Boost pads at each course module.
    for (let base = Math.floor(x0 / 160) * 160; base < x1; base += 160) {
      for (const seg of [21, 131]) {
        const x = base + seg;
        if (x < 45) continue;
        const pad = BABYLON.MeshBuilder.CreateBox('boostPad', { width: 5, height: 0.14, depth: this.depth - 1 }, s);
        pad.position.set(x, this.endlessY(x) + 0.12, 0);
        pad.material = this.mats.glow('boostPadMat', [0.25, 1.0, 0.95], 0.85);
        pad.isPickable = false;
        this.boostPads.push(pad);
      }
    }
  }

  /** Recycled coin pool for the endless run. */
  private buildEndlessCoins() {
    for (let i = 0; i < 34; i++) {
      const root = new BABYLON.TransformNode('goldCoin', this.scene);
      const coin = BABYLON.MeshBuilder.CreateCylinder('goldCoinMesh', { diameter: 1.1, height: 0.14, tessellation: 20 }, this.scene);
      coin.parent = root; coin.rotation.x = Math.PI / 2;
      coin.material = this.mats.glow('goldCoinMat', [1.0, 0.82, 0.18]);
      const halo = BABYLON.MeshBuilder.CreateTorus('goldHalo', { diameter: 1.7, thickness: 0.06, tessellation: 18 }, this.scene);
      halo.parent = root; halo.material = this.mats.glow('goldHaloMat', [1.0, 0.9, 0.4], 0.5);
      this.endlessCoins.push({ root, pos: new BABYLON.Vector3(), collected: false, phase: Math.random() * 6 });
    }
    this.updateEndlessCoins();
  }

  private updateEndlessCoins() {
    const base = Math.max(45, Math.floor((this.x - 30) / 160) * 160);
    for (let i = 0; i < this.endlessCoins.length; i++) {
      const c = this.endlessCoins[i];
      if (c.collected) continue;
      const x = base + i * 5;
      c.pos.set(x, this.isGap(x) ? this.endlessY(x - 20) + 9 : this.endlessY(x) + 2.6, 0);
      c.root.position.copyFrom(c.pos);
      c.phase += 0.02;
      c.root.rotation.y += 0.03;
      c.root.position.y += Math.sin(c.phase) * 0.25;
      if (BABYLON.Vector3.Distance(this.position, c.root.position) < 1.9) {
        c.collected = true; c.root.setEnabled(false);
        this.coinsCollected++;
        this.cb.onGold?.(c.root.position.x, c.root.position.y);
      }
    }
  }

  private buildBoardAndRider() {
    const s = this.scene;
    this.board = new BABYLON.TransformNode('skateboard', s);
    this.boardDeck = new BABYLON.TransformNode('skateDeckSpin', s);
    this.boardDeck.parent = this.board;

    const deckMat = new BABYLON.PBRMaterial('deckMat', s);
    deckMat.albedoColor = new BABYLON.Color3(0.12, 0.1, 0.16);
    deckMat.metallic = 0.2; deckMat.roughness = 0.5;
    const deck = BABYLON.MeshBuilder.CreateBox('deck', { width: 2.5, height: 0.14, depth: 0.72 }, s);
    deck.parent = this.boardDeck;
    deck.position.y = 0.34;
    deck.material = deckMat;
    // neon grip tape
    const grip = BABYLON.MeshBuilder.CreateBox('grip', { width: 2.3, height: 0.03, depth: 0.6 }, s);
    grip.parent = this.boardDeck; grip.position.y = 0.43;
    grip.material = this.mats.glow('gripMat', [1.0, 0.25, 0.6]);

    // trucks + wheels
    const truckMat = this.mats.glow('truckMat', [0.6, 0.65, 0.8], 0.9);
    const wheelMat = this.mats.glow('wheelMat', [1.0, 0.85, 0.3]);
    for (const sx of [-1, 1]) {
      const truck = BABYLON.MeshBuilder.CreateBox('truck', { width: 0.5, height: 0.16, depth: 0.66 }, s);
      truck.parent = this.boardDeck; truck.position.set(sx * 0.85, 0.22, 0); truck.material = truckMat;
      for (const sz of [-1, 1]) {
        const wheel = BABYLON.MeshBuilder.CreateCylinder('wheel', { diameter: 0.42, height: 0.2, tessellation: 14 }, s);
        wheel.parent = this.boardDeck;
        wheel.position.set(sx * 0.85, 0.16, sz * 0.42);
        wheel.rotation.z = Math.PI / 2;
        wheel.material = wheelMat;
        this.wheels.push(wheel);
      }
    }
    // Neon underglow
    this.underglow = BABYLON.MeshBuilder.CreateBox('underglow', { width: 2.3, height: 0.05, depth: 0.6 }, s);
    this.underglow.parent = this.boardDeck; this.underglow.position.y = 0.06;
    this.underglow.material = this.mats.glow('underglowMat', [0.95, 0.3, 0.85], 0.85);

    // Rider: body sphere + core + the full Blobothan rig, mounted on the board
    this.rider = new BABYLON.TransformNode('skaterRider', s);
    this.rider.parent = this.board;
    this.rider.position.y = 1.45;

    this.body = BABYLON.MeshBuilder.CreateIcoSphere('skaterBody', { radius: 1.0, subdivisions: 4 }, s);
    this.body.parent = this.rider;
    this.body.material = this.mats.jelly();
    const core = BABYLON.MeshBuilder.CreateSphere('skaterCore', { diameter: 1.4, segments: 16 }, s);
    core.parent = this.body;
    core.material = this.mats.glow('skaterCoreMat', [0.4, 1.0, 1.0], 0.35);
    // Hand-plant glove — reaches toward the coping while the trick is held
    this.plantHand = BABYLON.MeshBuilder.CreateSphere('plantHand', { diameter: 0.5, segments: 12 }, s);
    this.plantHand.material = this.mats.eyeWhite(); // planted hand (white glove) on the bar
    this.plantHand.setEnabled(false);
    // Grab hand — reaches to the deck during an aerial grab
    this.grabHand = BABYLON.MeshBuilder.CreateSphere('grabHand', { diameter: 0.44, segments: 12 }, s);
    this.grabHand.material = this.mats.eyeWhite();
    this.grabHand.setEnabled(false);
    this.plantLight = new BABYLON.PointLight('plantLight', BABYLON.Vector3.Zero(), s);
    this.plantLight.diffuse = new BABYLON.Color3(1.0, 0.72, 0.25);
    this.plantLight.intensity = 0;
    this.plantLight.range = 16;

    this.rig = new BlobothanRig(s, this.mats, this.rider, 1.0);
    this.rig.addSkateStickers(this.mats); // knarly 8-bit stickers on the skating helmet
    this.addBoardStickers();
  }

  /** 8-bit pixel stickers on the underside of the deck — flash hard on kickflips. */
  private addBoardStickers() {
    const s = this.scene;
    type Pix = [number, number, [number, number, number]];
    const gold: [number, number, number] = [1, 0.85, 0.2];
    const pink: [number, number, number] = [1, 0.3, 0.72];
    const cyan: [number, number, number] = [0.25, 0.95, 1];
    const white: [number, number, number] = [1, 1, 1];

    const bolt: Pix[] = [
      [1, 2, gold], [2, 2, gold], [0, 1, gold], [1, 1, gold],
      [-1, 0, gold], [0, 0, gold], [1, 0, gold], [0, -1, gold], [1, -1, gold], [-1, -2, gold], [0, -2, gold],
    ];
    const smile: Pix[] = [
      [-2, 1, pink], [2, 1, pink],
      [-2, 0, pink], [-1, 0, white], [0, 0, pink], [1, 0, white], [2, 0, pink],
      [-1, -1, pink], [0, -1, pink], [1, -1, pink],
      [-2, -2, pink], [-1, -2, white], [0, -2, white], [1, -2, white], [2, -2, pink],
    ];
    const checker: Pix[] = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      if ((x + y) % 2 === 0) checker.push([x, y, (x === 0) ? white : cyan]);
    }

    const place = (x: number, z: number, pixels: Pix[]) => {
      const root = new BABYLON.TransformNode('boardSticker', s);
      root.parent = this.boardDeck;
      root.position.set(x, 0.255, z); // just under the deck (deck underside y=0.27)
      root.rotation.x = Math.PI / 2; // face downward
      for (const p of pixels) {
        const b = BABYLON.MeshBuilder.CreateBox('boardPixel', { size: 0.06 }, s);
        b.parent = root;
        b.position.set(p[0] * 0.065, p[1] * 0.065, 0);
        b.scaling.z = 0.3;
        b.material = this.mats.glow(`boardSticker${p[2].join('')}`, p[2]);
        b.isPickable = false;
      }
    };
    place(-0.8, 0, bolt);
    place(0, 0, smile);
    place(0.8, 0, checker);
  }

  private buildCoins() {
    const spots = [
      -20, -14, -8, -3, 3, 8, 14, 20,
      0, 0, 0, // extra airborne coins near center (raised below)
    ];
    spots.forEach((cx, i) => {
      const airborne = i >= 8;
      const cy = airborne ? this.bottom + this.height * 0.72 : this.surfaceY(cx) + 2.4;
      const root = new BABYLON.TransformNode('goldCoin', this.scene);
      root.position.set(airborne ? (i - 8) * 6 - 6 : cx, cy, 0);
      const coin = BABYLON.MeshBuilder.CreateCylinder('goldCoinMesh', { diameter: 1.1, height: 0.14, tessellation: 20 }, this.scene);
      coin.parent = root; coin.rotation.x = Math.PI / 2;
      coin.material = this.mats.glow('goldCoinMat', [1.0, 0.82, 0.18]);
      const halo = BABYLON.MeshBuilder.CreateTorus('goldHalo', { diameter: 1.7, thickness: 0.06, tessellation: 18 }, this.scene);
      halo.parent = root; halo.material = this.mats.glow('goldHaloMat', [1.0, 0.9, 0.4], 0.5);
      this.coins.push({ root, pos: root.position.clone(), collected: false, phase: Math.random() * 6 });
    });
  }

  public celebrate() { this.celebrating = true; }

  public reset() {
    this.celebrating = false;
    this.x = this.spawnX; // spawn on the left slope, inside the bowl
    this.y = this.endless ? this.endlessY(this.x) : this.surfaceY(this.x);
    this.speed = 0; this.vx = 0; this.vy = 0;
    this.onGround = true;
    this.isAirborne = false;
    this.spin = 0; this.spinAwarded = 0; this.flip = 0; this.flipPending = 0;
    this.visualSpin = 0; this.visualFlip = 0; this.kickSpinRate = 0; this.grabSpinBurst = 0;
    this.kickFlipCd = 0;
    this.riderYaw = 0;
    this.saveCooldown = 0;
    this.grabTime = 0; this.grabAwarded = 0; this.airGrabbing = false; this.airGrabTime = 0;
    this.trickName = ''; this.trickPoints = 0; this.combo = 0; this.score = 0;
    this.coinsCollected = 0;
    this.gForce = 1; this.airTime = 0; this.lean = 0; this.lastGMilestone = 0;
    for (const c of this.coins) { c.collected = false; c.root.setEnabled(true); }
    if (this.endless) {
      for (const c of this.endlessCoins) { c.collected = false; c.root.setEnabled(true); }
      this.checkpointX = this.x;
      this.distance = this.x;
      this.trackBuiltAt = -1e9;
      this.buildEndlessTrack(true);
      this.updateEndlessCoins();
    }
    this.syncPosition();
  }

  private onGround = true;
  private trickChain: string[] = [];

  /** LEVEL 3 double-kickflip: press J while AIRBORNE — flips the board twice
   *  about its own centre; the rider stays upright. Never on the ground. */
  private updateL3KickFlip(dt: number, input: InputState) {
    if (this.endless) return;
    if (this.kickFlipCd > 0) this.kickFlipCd -= dt;
    // AIR ONLY — no kickflips while rolling on the ramp
    if (input.dashPressed && this.isAirborne && this.kickFlipCd <= 0 && !this.handPlanting) {
      this.kickFlipCd = 0.6;
      this.flip += 720;                   // double flip for scoring
      this.kickSpinRate = Math.PI * 8;    // two fast board rotations about centre
      this.addTrick('AIR KICKFLIP!', 550);
      this.cb.onKickFlip?.(this.x, this.y);
    }
  }

  /** Hand plant: hold K near the yellow coping, release to launch a big trick. Level 3 ONLY. */
  private updateHandPlant(dt: number, input: InputState) {
    if (this.endless) return; // Level 4 uses K for kickflips instead
    if (this.handPlantHintTimer > 0) this.handPlantHintTimer -= dt;
    const nearBar = Math.abs(this.x) > this.halfW * 0.8;
    const held = input.grapple;
    // Only catch the bar while ASCENDING the ramp toward the lip
    const ascending = Math.sign(this.speed) === Math.sign(this.x) && Math.abs(this.speed) > 3;

    if (!this.handPlanting && held && nearBar && ascending && !this.isAirborne) {
      this.handPlanting = true;
      this.handPlantCharge = 0;
      this.handPlantSide = Math.sign(this.x) || 1;
      // Freeze on the bar — a real handplant holds still, it does not roll.
      this.speed = 0; this.vx = 0; this.vy = 0;
      // Hang the body INSIDE the bowl so the invert reads like the reference:
      // hand on the coping, body/head hanging down the ramp face.
      this.x = this.handPlantSide * (this.halfW - 1.7);
      this.y = this.surfaceY(this.x);
      this.cb.onHandPlantStart?.(this.x, this.y);
    }

    if (this.handPlanting) {
      if (held) {
        // Stay locked in the inverted pose; only hold time accrues for style.
        this.handPlantCharge = Math.min(1, this.handPlantCharge + dt * 0.8);
        this.speed = 0; this.vx = 0; this.vy = 0;
        const lipX = this.handPlantSide * this.halfW;
        this.cb.onHandPlantCharge?.(this.handPlantCharge, lipX, this.surfaceY(lipX) + 0.2);
      } else {
        const power = this.handPlantCharge;
        // Clean pop straight off the coping — NO spin, NO flip yet.
        this.onGround = false; this.isAirborne = true;
        const side = this.handPlantSide;
        this.vy = (this.endless ? 19 : 13) * this.jumpScale + 4;
        this.vx = -side * (7 + power * 3); // push back down into the bowl
        this.spin = 0; this.flip = 0;
        this.beginAir();
        this.addTrick('HAND PLANT!', Math.round(600 + power * 800));
        this.airJumpCount = 1;
        this.cb.onHandPlant?.(power, this.x, this.y);
        this.handPlanting = false;
        this.handPlantCharge = 0;
      }
    }

    this.plantHand.setEnabled(this.handPlanting);
    if (this.handPlanting) {
      // Hand grips the actual yellow coping bar at the lip
      const lipX = this.handPlantSide * this.halfW;
      this.plantHand.position.set(lipX, this.surfaceY(lipX) + 0.18, 0.5);
      this.plantHand.scaling.setAll(1 + this.handPlantCharge * 0.35);
      this.plantLight.position.copyFrom(this.plantHand.position);
      this.plantLight.intensity = 0.6 + this.handPlantCharge * 1.8; // golden-hour glow
    }
    if (nearBar && ascending && !this.handPlanting && !this.isAirborne && this.handPlantHintTimer <= 0) {
      this.handPlantHintTimer = 3.5;
      this.cb.onHandPlantStart?.(-999, -999); // signal: show the hint
    }
  }

  // ------------------------------------------------------------------ endless physics
  /**
   * Gravity-loop physics. Returns true while attached to a loop (the caller
   * then skips the normal ground/air integrator). Centrifugal release happens
   * when the normal force would go negative — the rider is flung tangentially.
   */
  private updateLoop(dt: number): boolean {
    if (this.loopCooldown > 0) this.loopCooldown -= dt;
    if (this.inLoop) {
      const c = this.loopCenterFor(this.x);
      if (!c) { this.inLoop = false; return false; }
      // Tangential gravity: climbing the right side slows, descending speeds.
      const sinA = Math.sin(this.loopAngle);
      this.loopSpeed += (-this.endlessGravity * sinA - this.loopSpeed * 0.06) * dt;
      this.loopAngle += (this.loopSpeed / this.loopR) * dt;
      // Normal force toward centre = v²/R + g·cos(angle-from-top-ish).
      // Release when it can no longer hold the rider against the track.
      const centripetal = this.loopSpeed * this.loopSpeed / this.loopR;
      const gravitySupport = this.endlessGravity * Math.cos(this.loopAngle);
      if (centripetal < -gravitySupport && this.loopAngle > 0.35) {
        // Centrifugal/inertia release — launch along the tangent.
        const px = c.x + c.r * Math.sin(this.loopAngle);
        const py = c.y - c.r * Math.cos(this.loopAngle);
        this.x = px; this.y = py;
        this.vx = this.loopSpeed * Math.cos(this.loopAngle);
        this.vy = this.loopSpeed * Math.sin(this.loopAngle);
        this.speed = Math.hypot(this.vx, this.vy);
        this.inLoop = false; this.onGround = false; this.isAirborne = true;
        this.loopCooldown = 0.7;
        this.beginAir();
        this.addTrick('LOOP RELEASE!', 900);
        this.cb.onTrick?.('LOOP RELEASE!', 900, this.x, this.y);
        return false;
      }
      if (this.loopAngle >= Math.PI * 2) {
        // Full 360° — exit at the bottom, back onto the track.
        this.x = c.x; this.y = this.endlessY(c.x) + 0.05;
        this.speed = this.loopSpeed;
        this.vx = this.speed; this.vy = 0;
        this.inLoop = false; this.onGround = true; this.isAirborne = false;
        this.loopCooldown = 0.6;
        this.addTrick('360 LOOP!', 1400);
        this.gForce = 1 + centripetal / this.endlessGravity;
        return false;
      }
      const p = this.loopPoint(c, this.loopAngle);
      this.x = p.x; this.y = p.y;
      this.vx = this.loopSpeed * Math.cos(this.loopAngle);
      this.vy = this.loopSpeed * Math.sin(this.loopAngle);
      this.gForce = 1 + centripetal / this.endlessGravity;
      this.speed = this.loopSpeed;
      this.syncPosition();
      return true;
    }
    // Entry: approaching a loop on the ground with enough speed.
    if (this.loopCooldown <= 0 && this.onGround) {
      const c = this.loopCenterFor(this.x);
      if (c) {
        const entryX = c.x - c.r * 0.25;
        if (this.x >= entryX - 1.5 && this.x <= entryX + 2.5 && Math.abs(this.speed) >= 16) {
          this.inLoop = true;
          this.loopSpeed = Math.abs(this.speed);
          this.loopAngle = 0;
          this.beginAir();
          this.addTrick('360 LOOP!', 700);
          return true;
        }
      }
    }
    return false;
  }

  private updateEndless(dt: number, input: InputState) {
    this.inputTurnLeft = input.rotLeft; this.inputTurnRight = input.rotRight;
    if (this.updateLoop(dt)) { this.updateVisuals(dt, this.speed, false); return; }
    this.updateHandPlant(dt, input);
    if (this.handPlanting) { this.updateVisuals(dt, 0, false); this.syncPosition(); return; }
    this.time += dt;
    if (this.jumpStretch > 0) this.jumpStretch = Math.max(0, this.jumpStretch - dt * 1.6);
    if (this.squash !== 0) this.squash = Math.abs(this.squash) < 0.01 ? 0 : this.squash * Math.pow(0.02, dt);
    const steer = input.axisX || 0;
    const CAP = this.maxSpeed * 1.5;
    if (this.airJumpCooldown > 0) this.airJumpCooldown -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.kickFlipCd > 0) this.kickFlipCd -= dt;
    if (this.saveCooldown > 0) this.saveCooldown -= dt;
    if (input.dashPressed) this.doDash(input);
    // DEDICATED KICKFLIP: press Y/K AIR ONLY — never on the ground (level 4)
    if (this.endless && input.grapplePressed && this.isAirborne && this.kickFlipCd <= 0) {
      this.kickFlipCd = 0.36;
      this.flip += 720;                 // trick score tracker
      this.kickSpinRate = Math.PI * 7;  // ~3.5 fast board flips over ~0.5s
      this.addTrick('KICKFLIP!', 420);
      this.cb.onKickFlip?.(this.x, this.y);
    }
    this.animateBoardRotation(dt);

    // Jump is ALWAYS available — on the ground or in the air — in Level 4.
    if (this.onGround && input.jumpPressed) {
      this.onGround = false; this.isAirborne = true;
      const power = this.airJumpBoost * (0.3 + Math.min(1, Math.abs(this.speed) / this.maxSpeed) ** 2)
        * this.jumpScale * this.endlessJumpBoost;
      this.vy = power + 3;
      this.jumpStretch = 1;
      this.squash = 0.7; // stretch tall on launch
      this.cb.onOlliePop?.(this.x, this.y, power);
      this.beginAir(); this.addTrick('OLLIE', 120); this.airJumpCount = 1;
    }

    if (this.onGround) {
      // PUSH: hold a direction to push with alternating legs. Works BOTH ways.
      const pushing = Math.abs(steer) > 0.3;
      const pushDir = pushing ? Math.sign(steer) : 0;
      this.pushing = pushing;
      if (pushing) {
        this.pushTimer += dt;
        if (this.pushTimer > 0.42) { this.pushTimer -= 0.42; this.pushLeg *= -1; }
      } else this.pushTimer = 0;
      const pushBeat = pushing ? Math.sin((this.pushTimer / 0.42) * Math.PI) : 0;

      const slope = this.endlessSlope(this.x);
      let acc = -this.endlessGravity * Math.sin(Math.atan(slope));
      acc += pushDir * pushBeat * 26;      // push drives in the held direction
      acc += steer * this.carvePower * 0.2;
      // Snappy reversal: pressing against travel kills momentum fast, then
      // pushes the other way almost immediately.
      if (Math.abs(steer) > 0.3 && Math.sign(steer) !== Math.sign(this.speed) && Math.abs(this.speed) > 1) {
        acc += steer * 90;
      }
      acc -= this.speed * 0.55;            // coast-down, no auto cruising
      // LEFT STICK DOWN = TURBO: a strong forward surge with a flow cue.
      if (input.boost) {
        const dir = Math.sign(steer || this.speed || 1);
        acc += dir * 62;
        this.cb.onFlow?.(this.x, this.y, dir, Math.abs(this.speed));
      }
      this.speed += acc * dt;
      if (this.isBoost(this.x)) {
        // Gentle boost pad — only enough to reward the line, no artificial launch
        this.speed = Math.max(-CAP, Math.min(CAP, this.speed + Math.sign(steer || this.speed || 1) * 12 * dt));
        this.cb.onFlow?.(this.x, this.y, Math.sign(this.speed), Math.abs(this.speed));
      }
      this.speed = Math.max(-CAP, Math.min(CAP, this.speed));
      this.vx = this.speed;
      this.vy = this.speed * Math.tan(Math.atan(slope));
      this.x += this.vx * dt;

      // NO auto-jump off kickers — the player must press jump themselves.
      // Gap warning in both travel directions.
      const seg = this.courseSeg(this.x);
      const nearGap = (seg > 44 && seg < 60) || (seg > 76 && seg < 92);
      const gapKey = Math.floor(this.x / 160);
      if (nearGap && this.gapWarned !== gapKey) {
        this.gapWarned = gapKey;
        this.cb.onGapWarning?.(this.x, this.y);
      }
      if (this.isGap(this.x)) {
        this.onGround = false; this.isAirborne = true; // rolled off — fall
      } else this.y = this.endlessY(this.x);
    } else {
      this.pushing = false;
      this.airTime += dt;
      // TIGHT substepped integration — never tunnel through a ramp
      const steps = Math.max(1, Math.min(8, Math.ceil((Math.abs(this.vy) + Math.abs(this.vx)) * dt / 0.4)));
      const sdt = dt / steps;
      let landed = false;
      for (let i = 0; i < steps; i++) {
        this.vy -= this.endlessGravity * sdt;
        if (Math.abs(steer) > 0.1) this.vx += steer * this.airControl * 0.65 * sdt;
        if (input.boost) this.vx += Math.sign(steer || this.vx || 1) * 34 * sdt; // air turbo
        this.vx = Math.max(-CAP, Math.min(CAP, this.vx));
        this.x += this.vx * sdt;
        this.y += this.vy * sdt;
        const gap = this.isGap(this.x);
        // Soft safety floor inside gaps — find the nearest SOLID ground so the
        // reference can never itself be inside a gap (which was -1000).
        const surf = gap ? this.nearestSolidY(this.x) - 3 : this.endlessY(this.x);
        if (this.y <= surf && this.vy < 0) {
          this.y = surf;
          if (gap) {
            // Arcade save: bounce back up onto the line, keep the flow going.
            // No wipeout, no respawn, no restart — ever.
            this.vy = 22;
            const dir = Math.sign(this.vx || this.speed || 1);
            this.vx = dir * Math.max(14, Math.abs(this.vx));
            if (this.saveCooldown <= 0) {
              this.saveCooldown = 1.2;
              this.cb.onSave?.(this.x, this.y);
            }
          } else {
            const drop = Math.min(1, Math.abs(this.vy) / 45);
            this.speed = Math.max(-CAP, Math.min(CAP, this.vx + Math.sign(this.vx || 1) * drop * drop * 14));
            this.onGround = true; this.isAirborne = false;
            this.checkpointX = this.x;
            this.endAir(0, Math.abs(this.vy));
            landed = true;
          }
          break;
        }
      }
      if (!landed) this.updateTricks(dt, input);
      // Absolute hard floor — the skater can NEVER fall into the -1000 void
      if (this.y < -12) {
        this.y = this.nearestSolidY(this.x) - 2;
        this.vy = 16;
        if (this.saveCooldown <= 0) {
          this.saveCooldown = 1.2;
          this.cb.onSave?.(this.x, this.y);
        }
      }
    }
    this.distance = this.x;
    // Rebuild the track when nearing either end so both directions stay valid
    if (this.x > this.trackBuiltAt + 1100 || this.x < this.trackBuiltAt - 120) this.buildEndlessTrack();
    this.updateEndlessCoins();
    this.updateVisuals(dt, steer, false);
    this.syncPosition();
  }

  // ------------------------------------------------------------------ update
  public update(dt: number, input: InputState) {
    this.inputTurnLeft = input.rotLeft; this.inputTurnRight = input.rotRight;
    if (this.endless) { this.updateEndless(dt, input); return; }
    this.updateL3KickFlip(dt, input);
    this.updateHandPlant(dt, input);
    if (this.handPlanting) { this.updateVisuals(dt, 0, false); this.syncPosition(); return; }
    this.time += dt;
    if (this.squash !== 0) this.squash = Math.abs(this.squash) < 0.01 ? 0 : this.squash * Math.pow(0.02, dt);
    const steer = input.axisX || 0;
    const crouch = input.slide;
    if (this.lipCooldown > 0) this.lipCooldown -= dt;
    if (this.airJumpCooldown > 0) this.airJumpCooldown -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.dashCharge > 0) this.dashCharge = Math.max(0, this.dashCharge - dt * 0.8);
    this.animateBoardRotation(dt);
    // THIRD ACTION: dash burst (works anywhere — key to level 4 flow)
    if (input.dashPressed) this.doDash(input);

    // ---- OLLIE from the ramp — every jump starts a trick session ----
    if (this.onGround && input.jumpPressed) {
      const a = this.angle(this.x), s = Math.sin(a), c = Math.cos(a);
      const sf = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
      // Tiny hop from a standstill — real height ONLY after momentum builds
      // Centrifugal compression: the harder you're carving, the bigger the pop
      const gPop = 1 + Math.min(0.6, Math.max(0, this.gForce - 1) * 0.16) + this.dashCharge * 0.4;
      const b = this.airJumpBoost * (0.3 + sf * sf * 1.3) * this.jumpScale * gPop;
      // Launch along the surface NORMAL (up + inward) so the hop stays on the
      // movement arc instead of throwing the rider away from the bowl.
      const inward = Math.sign(this.x) * Math.min(1, Math.abs(this.x) / this.halfW);
      this.onGround = false; this.isAirborne = true;
      this.vx = this.speed * c - s * b - inward * 2;
      // Level 3: ramp's tangential lift is damped so height comes mostly from
      // built-up speed, not from the slope angle — a realistic low ollie.
      this.vy = this.speed * s * (this.preserveMomentum ? 1 : 0.45) + c * b;
      this.beginAir();
      this.addTrick('OLLIE', 120);
      this.airJumpCount = 1;
      this.airJumpCooldown = 0.22;
    }

    if (this.onGround) {
      const ang = this.angle(this.x);
      const c = Math.cos(ang), sn = Math.sin(ang);

      // Gravity along the pipe tangent (always pulls toward the bottom)
      let acc = -this.gravity * sn;
      // Carving / pushing. Past the lip, outward steering is damped so holding
      // a direction can't strand the rider outside the bowl.
      const outerDamp = Math.abs(this.x) > this.halfW ? 0.25 : 1;
      acc += steer * this.carvePower * outerDamp;
      if (input.boost) acc += Math.sign(steer || this.speed || 1) * 48; // stick-down turbo
      // Responsive turn-in: extra snap when steering against current travel
      if (Math.abs(steer) > 0.1 && Math.sign(steer) !== Math.sign(this.speed) && Math.abs(this.speed) > 1) {
        acc += steer * 26;
      }
      // AUTO-FLOW PUMP: holding a direction pumps the bowl automatically —
      // momentum keeps building without needing to tap crouch on every slope.
      if ((crouch || Math.abs(steer) > 0.6) && Math.abs(this.speed) > 2) {
        acc += Math.sign(crouch ? this.speed : steer) * this.pumpPower * (crouch ? 1 : 0.75);
      }
      // Rolling friction
      acc -= this.speed * 0.42;
      // ARCADE ASSIST: beyond the lip, pull home regardless of held direction
      if (Math.abs(this.x) > this.halfW) acc -= Math.sign(this.x) * 22 * this.assist;

      this.speed += acc * dt;
      this.speed = Math.max(-this.maxSpeed * 1.5, Math.min(this.maxSpeed * 1.5, this.speed));
      // Never stall while a direction is held — momentum always carries
      if (Math.abs(steer) > 0.1 && Math.abs(this.speed) < 13 * this.assist) {
        this.speed = Math.sign(steer) * 13 * this.assist;
      }
      this.vx = this.speed * c;
      this.vy = this.speed * sn;
      this.x += this.vx * dt;

      // Centrifugal (centripetal) force at the bottom: a = v²/R
      const R = this.radius(this.x);
      const centriAccel = (this.speed * this.speed) / R;
      this.gForce = 1 + centriAccel / this.gravity;
      // Fire juice each time centrifugal force crosses a new G milestone
      const gm = Math.floor(this.gForce);
      if (gm > this.lastGMilestone && gm >= 2) {
        this.lastGMilestone = gm;
        this.cb.onGForce?.(this.gForce, this.x, this.y);
      }
      if (this.gForce < 1.6) this.lastGMilestone = 0;

      // Reached a lip -> launch, but ONLY when travelling outward with real
      // speed and after the landing cooldown. No more stuck-at-lip ollie spam.
      if (Math.abs(this.x) >= this.halfW &&
          this.lipCooldown <= 0 &&
          Math.abs(this.speed) > 5 &&
          Math.sign(this.speed) === Math.sign(this.x)) {
        if (Math.abs(this.x) > this.halfW) this.x = Math.sign(this.x) * this.halfW;
        this.onGround = false; this.isAirborne = true;
        // Pop mostly UP at the lip — damp the outward horizontal component so
        // he lands back at the same spot on the ramp instead of flying across.
        // Level 3: ZERO horizontal — perfectly vertical, lands exactly where
        // he launched at the top of the arc. Level 4 keeps forward momentum.
        this.vx = this.preserveMomentum ? this.speed * c * 0.55 - 1 : 0;
        // Jump height is SPEED-RELATIVE: a slow roll barely leaves the lip,
        // a full-speed run launches huge. No more same-sized arcade hops.
        const sf = Math.abs(this.speed) / this.maxSpeed;
        const gPop = 1 + Math.min(0.6, Math.max(0, this.gForce - 1) * 0.16) + this.dashCharge * 0.4;
        const jumpBoost = this.lipBoost * (0.45 + sf * sf * 1.9) * this.jumpScale * gPop;
        this.vy = this.speed * sn * (this.preserveMomentum ? 1 : 0.45) + jumpBoost;
        this.lipCooldown = 0.45;
        this.beginAir();
        this.addTrick('AIR OLLIE', 120);
        this.airJumpCount = 1;
      }
      this.y = this.surfaceY(this.x);
    } else {
      // ---- Airborne ----
      this.airTime += dt;
      this.vy -= this.gravity * dt;
      this.vx *= (1 - this.airDrag * dt); // air drag keeps launches inside the park

      // AUTO-FLOW AIR STEERING: holding a direction still nudges the landing
      // point, and on the descent past the lip we curve back onto the ramp so
      // the rider keeps his line and never gets stranded off the pipe.
      if (Math.abs(steer) > 0.1) {
        // Once past the lip, outward steering fades so the assist always wins
        // and a held direction can never strand the rider off the ramp.
        const pushingOut = Math.sign(steer) === Math.sign(this.x);
        const steerScale = (Math.abs(this.x) > this.halfW * 0.8 && pushingOut) ? 0.12 : 1;
        this.vx += steer * this.airControl * steerScale * dt;
        // Extra snap when reversing direction mid-air
        if (Math.sign(steer) !== Math.sign(this.vx)) this.vx += steer * this.airControl * 0.55 * dt;
        // Clamp so aggressive air steering can't launch him off the map
        this.vx = Math.max(-this.maxSpeed * 1.3, Math.min(this.maxSpeed * 1.3, this.vx));
      }
      // Strong outward damping outside the bowl — guarantees the return line
      if (Math.abs(this.x) > this.halfW && Math.sign(this.vx) === Math.sign(this.x)) {
        this.vx *= Math.max(0, 1 - 3 * dt * this.assist);
      }
      if (this.vy < 0 && Math.abs(this.x) > this.halfW * 0.85) {
        this.vx -= Math.sign(this.x) * 40 * dt * this.assist; // dominant over held steer — guarantees the ramp return
      }
      // LANDING MAGNET: just before touchdown near the lip, nudge back inside
      // so the exit jump always re-enters the ramp at the same place.
      if (this.vy < 0 && this.y - this.surfaceY(this.x) < 4 && Math.abs(this.x) > this.halfW * 0.9) {
        this.vx -= Math.sign(this.x) * 30 * dt * this.assist;
      }
      this.vx -= Math.sign(this.x) * 1.2 * dt;

      // Lock is decided at launch (lip/bottom) — mid-ramp jumps keep momentum
      if (this.lockAirX) this.vx = 0;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.gForce = 1;
      this.bounceWalls();

      this.updateTricks(dt, input);

      const surface = this.surfaceY(this.x);
      // Unconditional surface clamp — no tunneling through the ramp on fast
      // landings or when a jump lands at a steep section.
      if (this.y <= surface) {
        // Landing back on the pipe / outer flat
        const ang = this.angle(this.x);
        const c = Math.cos(ang), sn = Math.sin(ang);
        const tangential = this.vx * c + this.vy * sn;
        const normalImpact = Math.abs(-this.vx * sn + this.vy * c);
        const landingVy = Math.abs(this.vy); // higher jump = harder landing = more speed
        this.speed = tangential;
        this.y = surface;
        this.onGround = true; this.isAirborne = false;
        this.endAir(normalImpact, landingVy);
      }
    }

    this.updateVisuals(dt, steer, crouch);
    this.updateCoins(dt);
    this.syncPosition();
  }

  private beginAir() {
    // Lock horizontal drift ONLY if the jump started at the top (coping) or
    // bottom of the ramp. Mid-ramp jumps keep their directional momentum.
    this.lockAirX = !this.preserveMomentum &&
      (Math.abs(this.x) > this.halfW * 0.88 || Math.abs(this.x) < 3.5);
    this.airTime = 0;
    this.spin = 0; this.spinAwarded = 0;
    this.flip = 0; this.flipPending = 0;
    this.grabTime = 0; this.grabAwarded = 0; this.airGrabbing = false; this.airGrabTime = 0;
    this.trickPoints = 0; this.trickName = '';
    this.trickChain = [];
    this.airJumpCount = 0;
    if (this.cb.onOllie) this.cb.onOllie();
  }

  private addTrick(name: string, points: number) {
    this.trickPoints += points;
    this.trickName = name;
    if (this.trickChain[this.trickChain.length - 1] !== name) this.trickChain.push(name);
    if (this.cb.onTrick) this.cb.onTrick(name, points, this.position.x, this.position.y);
  }

  private updateTricks(dt: number, input: InputState) {
    // Level 4 = SUPER-REACTIVE 2 JUMPS: ground ollie (1) + one instant air
    // trick jump (2). No cooldown gating — jumpPressed is a raw key edge, so
    // the second jump fires the exact frame you press. Level 3 keeps 3 jumps.
    const maxJumps = this.endless ? 2 : 3;
    if (input.jumpPressed && this.airTime > 0.04 && this.airJumpCount >= 1 && this.airJumpCount < maxJumps) {
      this.airJumpCooldown = this.endless ? 0 : 0.3; // level 4: NO cooldown
      this.airJumpCount += 1;
      const isBonus = this.airJumpCount === 3;
      const a = this.angle(this.x), s = Math.sin(a), c = Math.cos(a);
      const sf = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
      const b = this.airJumpBoost * (0.2 + sf * sf * 1.4) * this.jumpScale * (isBonus ? 1.3 : 1);
      const inward = Math.sign(this.x) * Math.min(1, Math.abs(this.x) / this.halfW);
      this.vx += -s * b * 0.85 - inward * 3.5;
      const apex = 1 - Math.min(1, Math.abs(this.vy) / 12);
      // Level 4 keeps its horizontal momentum through the arc
      this.vx *= 1 - apex * (this.preserveMomentum ? 0.25 : (this.lockAirX ? 0.92 : 0.12));
      this.vy += c * b + (isBonus ? 5 : 3);
      if (isBonus) {
        const dir = this.speed >= 0 ? 1 : -1;
        this.spin += dir * 720;
        this.spinAwarded = 4;
        this.flip += this.endless ? 1440 : 1080; // endless: mega 900 flip
        this.addTrick(this.endless ? 'MEGAFLIP 900!' : 'BONUS TRICK', this.endless ? 1100 : 900);
        // Reward with a flow boost so the endless run never loses speed
        if (this.preserveMomentum) this.speed = dir * Math.min(this.maxSpeed * 1.4, Math.abs(this.speed) + 6);
      } else {
        this.spin += (this.speed >= 0 ? 1 : -1) * 360;
        this.spinAwarded = 2;
        this.flip += 720;
        this.addTrick(this.endless ? 'KICKFLIP 360!' : 'KNARLY TRICK', this.endless ? 640 : 520);
      }
      this.cb.onOllie?.();
    }

    const spd = Math.abs(this.speed);
    // Spins (Q/E) need momentum — 10+ speed. Slow rollers can't pull them.
    if (input.rotLeft || input.rotRight) {
      if (spd >= 10) {
        const dir = input.rotLeft ? -1 : 1;
        this.spin += dir * this.spinSpeed * dt;
        const steps = Math.floor(Math.abs(this.spin) / 180);
        if (steps > this.spinAwarded) {
          this.spinAwarded = steps;
          const label = steps >= 4 ? '720 SHOVE-IT' : steps >= 2 ? '360 SPIN' : '180 SPIN';
          this.addTrick(label, 180 * steps);
        }
      }
    }
    // AERIAL GRAB — hold B/LT in the air. Hand reaches the deck, legs tuck,
    // board tilts up (the reference pose). Needs real speed to pull off.
    if (input.slide && spd >= 6 && this.isAirborne) {
      if (!this.airGrabbing) {
        this.airGrabbing = true;
        this.grabSpinBurst = 1; // stylistic board kick-out on grab entry
        this.cb.onGrabStart?.(this.x, this.y);
      }
      this.airGrabTime += dt;
      const steps = Math.floor(this.airGrabTime / 0.3);
      if (steps > this.grabAwarded) {
        this.grabAwarded = steps;
        const label = steps >= 5 ? 'ROASTED METHOD' : steps >= 3 ? 'INDY GRAB' : 'AIR GRAB';
        this.addTrick(label, 120 * steps);
      }
    } else this.airGrabbing = false;
  }

  /** THIRD ACTION — DASH: a speed burst that works on ground or in the air. */
  private doDash(input: InputState) {
    if (this.dashCooldown > 0) return;
    this.dashCooldown = 0.55;
    this.dashCharge = 1; // next jump is boosted by the dash energy
    const dir = Math.abs(input.axisX) > 0.1 ? Math.sign(input.axisX) : (this.speed >= 0 ? 1 : -1);
    this.speed = dir * Math.min(this.maxSpeed * 1.4, Math.abs(this.speed) + this.dashPower);
    this.vx += dir * this.dashPower;
    if (!this.onGround) this.vy += this.endless ? 3 : 5;
    this.airJumpCount = 3; // dash ends the trick chain
    // Don't overwrite a just-fired kickflip name with "DASH"
    if (!this.onGround && this.kickSpinRate === 0) {
      if (this.endless) { this.flip += 360; this.addTrick('DASH FLIP!', 260); }
      else this.addTrick('DASH', 160);
    }
    this.cb.onDash?.(this.position.x, this.position.y, dir);
  }

  private endAir(normalImpact: number, landingVy = 0) {
    // Release the air grab on landing — no tilted board / tucked rider on ramp
    this.airGrabbing = false;
    this.grabSpinBurst = 0;
    // Squash flat on landing — harder drop = bigger squash
    this.squash = -Math.min(0.75, 0.2 + landingVy / 55);
    // Land cleanly if the board is reasonably aligned (flip completed or not started)
    const flipDone = Math.abs(this.flip % 360) < 70 || Math.abs(this.flip % 360) > 290;
    const clean = flipDone && normalImpact < 45 && this.airTime > 0.12;

    if (clean) {
      if (this.trickPoints > 0) {
        this.combo += 1;
        const banked = Math.round(this.trickPoints * (1 + (this.combo - 1) * 0.5));
        this.score += banked;
        if (this.cb.onCombo) this.cb.onCombo(this.combo, banked, this.position.x, this.position.y);
        this.trickName = this.trickChain.join(' + ');
        this.cb.onTrick?.(this.trickName, banked, this.position.x, this.position.y);
      }
      if (this.cb.onLand) this.cb.onLand(this.gForce, this.position.x, this.position.y);
      // HIGHER JUMP = MORE SPEED. The vertical impact energy converts into
      // forward momentum on landing — big air pays off with a big boost.
      const drop = Math.min(1, landingVy / 45);
      const boost = 1.5 + drop * drop * (this.preserveMomentum ? 18 : 13);
      const dir = Math.sign(this.speed) || 1;
      const before = Math.abs(this.speed);
      this.speed = dir * Math.min(this.maxSpeed * 1.5, Math.abs(this.speed) + boost);
      if (boost > 3) {
        this.cb.onFlow?.(this.position.x, this.position.y, dir, Math.abs(this.speed));
        this.cb.onSpeedBoost?.(boost, this.position.x, this.position.y);
      } else if (!this.preserveMomentum && before < 12) {
        this.speed *= 0.99; // barely-there hops don't earn anything
      }
    } else {
      // Bail: scrub speed and drop the combo (Level 4 keeps speed for endless flow)
      if (!this.preserveMomentum) this.speed *= 0.7;
      this.combo = 0;
      this.trickPoints = 0;
      if (this.cb.onBail) this.cb.onBail(this.position.x, this.position.y);
    }
    this.spin = 0; this.flip = 0;
    this.visualSpin = 0; this.visualFlip = 0; this.kickSpinRate = 0;
    this.lipCooldown = 0.4; // never re-launch on the exact frame you land near a lip
    this.airJumpCount = 0;
    // On landing, face the travel direction instantly (Level 4 only — Level 3
    // is locked side-view and must never Y-rotate or it clips the ramp)
    if (this.endless) {
      this.riderYaw = this.speed >= 0 ? 0 : Math.PI;
      this.rider.rotation.y = this.riderYaw;
    }
  }

  /** Animate the board's visual flip/spin toward the trick targets. Called in
   *  both levels so kickflips work the same everywhere. */
  private animateBoardRotation(dt: number) {
    if (this.kickSpinRate !== 0) {
      this.visualFlip += this.kickSpinRate * dt;
      const remainder = this.flip * Math.PI / 180 - this.visualFlip;
      if (Math.abs(remainder) < 0.02 && this.kickSpinRate > 0) {
        this.kickSpinRate = 0; this.visualFlip = this.flip * Math.PI / 180;
      }
    } else {
      this.visualFlip += (this.flip * Math.PI / 180 - this.visualFlip) * Math.min(1, dt * 10);
    }
    this.visualSpin += (this.spin * Math.PI / 180 - this.visualSpin) * Math.min(1, dt * 8);
    if (this.grabSpinBurst > 0) this.grabSpinBurst = Math.max(0, this.grabSpinBurst - dt * 2.5);
  }

  private updateVisuals(dt: number, steer: number, crouch: boolean) {
    const ang = this.angle(this.x);
    this.board.position.set(this.x, this.y, 0);
    // Board stays FLAT in the air — no arc-auto tilt. Only real-world forces
    // tilt it: pipe slope on the ground, a quick brake (deceleration), or a
    // deliberate grab. Everything else keeps the deck level.
    let targetTilt = 0;
    if (this.onGround && !this.endless) targetTilt = ang; // half-pipe slope
    else if (this.onGround && this.endless) {
      // Board ALWAYS matches the surface slope — capped so it never digs into
      // a steep kicker, with only a tiny real-world brake lean.
      const raw = Math.atan(this.endlessSlope(this.x));
      targetTilt = Math.max(-0.7, Math.min(0.7, raw)); // clamp steep kickers
      const braking = Math.abs(this.speed) < 6 && Math.abs(steer) > 0.3;
      if (braking) targetTilt += -Math.sign(this.speed || 1) * 0.06 * Math.sign(steer);
    } else if (this.airGrabbing) targetTilt = 0.2; // subtle grab tuck
    // When grounded, snap EXACTLY to the surface — zero lag, zero clipping.
    // In the air, ease smoothly back to level. The grab block below may add a
    // tilt, but only while airborne and only scaled by real air clearance.
    if (this.onGround) this.board.rotation.z = targetTilt;
    else this.board.rotation.z += (targetTilt - this.board.rotation.z) * Math.min(1, dt * 16);
    // Deck spins about its own centre — the rider is a sibling, NOT a child,
    // so he never flips/rotates with the board.
    this.boardDeck.rotation.y = this.visualSpin;
    this.boardDeck.rotation.x = this.visualFlip;

    // Centrifugal squash + lean into the curve, plus the launch/landing envelope
    const g = Math.max(0, this.gForce - 1);
    const gSquash = Math.min(0.3, g * 0.09);
    // squash>0 = stretch tall (launch), squash<0 = squash flat (landing)
    const sy = 1 - gSquash + this.squash;
    const sxz = 1 + g * 0.04 - this.squash * 0.5;
    this.body.scaling.set(sxz, Math.max(0.4, sy), sxz);
    this.lean += ((this.onGround ? -this.slope(this.x) * 0.18 + steer * 0.12 : steer * 0.2) - this.lean) * Math.min(1, dt * 8);
    this.rider.rotation.z = this.lean;
    // Level 3 is a strict 2.5D side-scroller: NO Y rotation at all. A yaw flip
    // would invert the board's slope tilt and cut it through the ramp.
    // Level 4: LB/RB spin the WHOLE rig (rider AND board) fast, then ease back
    // to the travel direction on landing.
    if (this.endless) {
      // Level 4: 360 turns are AIR-ONLY (same rule as Level 3). While airborne
      // LB/RB spin the whole rig fast; on the ground it snaps back to the
      // travel direction so the board stays aligned and doesn't clip ramps.
      if (!this.onGround && !this.handPlanting) {
        const turnInput = (this.inputTurnLeft ? 1 : 0) - (this.inputTurnRight ? 1 : 0);
        if (turnInput !== 0) {
          this.riderYaw += turnInput * dt * 8;
          while (this.riderYaw > Math.PI) this.riderYaw -= Math.PI * 2;
          while (this.riderYaw < -Math.PI) this.riderYaw += Math.PI * 2;
        }
        this.rider.rotation.y = this.riderYaw;
        if (this.kickSpinRate === 0 && !this.airGrabbing) this.board.rotation.y = this.riderYaw;
      } else {
        this.riderYaw = this.speed >= 0 ? 0 : Math.PI;
        this.rider.rotation.y = this.riderYaw;
        this.board.rotation.y = this.riderYaw;
      }
    } else {
      // Level 3: 360 spins are AIR-ONLY. While airborne LB/RB (Q/E) spin the
      // whole rig freely; the instant you touch the ramp it snaps back to a
      // forward-facing skating pose so the board slope always reads correctly
      // and can never cut through the half-pipe.
      if (!this.onGround && !this.handPlanting) {
        const turnInput = (this.inputTurnLeft ? 1 : 0) - (this.inputTurnRight ? 1 : 0);
        if (turnInput !== 0) this.riderYaw += turnInput * dt * 8; // fast air spin
        this.rider.rotation.y = this.riderYaw;
        this.board.rotation.y = this.riderYaw; // rider + board spin together
      } else {
        // Grounded → lock to zero (forward), no Y rotation on the ramp
        this.riderYaw = 0;
        this.rider.rotation.y = 0;
        this.board.rotation.y = 0;
      }
    }
    // Separate board from body on jumps: rider sits higher, legs stretch longer
    // Body separates from the board ONLY near the apex (|vy| small) — a brief
    // tuck at the top of the jump, snapping back together on the way down.
    const apex = !this.onGround && !this.handPlanting
      ? Math.max(0, 1 - Math.abs(this.vy) / 14) : 0;
    const airLift = apex * 0.7;
    // B button only affects the rider IN THE AIR (air grab tuck). On the ramp
    // it does nothing — no crouch/rotation, so it can't twist the character.
    const bTuck = (!this.onGround && (crouch || this.airGrabbing)) ? 0.35 : 0;
    this.rider.position.y = 1.45 + airLift - bTuck;

    if (this.handPlanting) {
      // HANDSTAND: one hand planted on the bar, FREE hand holds the board
      // overhead, body fully upside down. Board stays near-horizontal — the
      // invert comes from the RIDER rotation, not the board (rotating both
      // cancels out and left the skater upright).
      const c = Math.min(1, this.handPlantCharge * 6);
      const side = this.handPlantSide;
      const barY = this.surfaceY(side * this.halfW);
      this.board.position.set(this.x + side * 0.3 * c, barY + 4.0 * c, 0);
      this.board.rotation.z = 0.32 * c; // board near-horizontal above the head
      this.boardDeck.rotation.x = 0;
      this.boardDeck.rotation.y = 0;
      // Rider is a CHILD of the board: local Y offsets place him below it,
      // and a full Pi rotation makes him truly head-down.
      this.rider.position.y = 1.45 - 3.85 * c; // world ≈ barY + 1.6
      this.rider.position.x = -side * 0.4 * c;
      this.rider.rotation.z = Math.PI * c;      // full 180° — clearly upside down
      this.rider.rotation.x = 0;
      this.rider.rotation.y = 0;
      this.body.scaling.set(1, 1, 1);
    } else {
      this.rider.position.x = 0;
    }
    if (this.celebrating) {
      this.rider.rotation.y += dt * 9;
      this.body.scaling.y = 1 + Math.sin(this.time * 14) * 0.16;
    }

    // Aerial grab: white glove grips the deck edge, board kicked out sideways.
    // STRICTLY airborne — on landing it releases instantly so the tilted board
    // / lowered rider can never clip into the ramp.
    const grabbingNow = this.airGrabbing && !this.handPlanting && !this.onGround;
    this.grabHand.setEnabled(grabbingNow);
    if (grabbingNow) {
      const grabDir = this.speed >= 0 ? 1 : -1;
      this.grabHand.position.set(this.x + grabDir * 0.55, this.board.position.y - 0.1, -0.28);
      this.grabHand.scaling.setAll(1.15 + this.grabSpinBurst * 0.5);
      // Higher above the ground the rider is, the more we can tilt — near a
      // ramp the tilt is faded out so the deck stays flush with the surface.
      const airClearance = this.endless
        ? Math.max(0, this.y - this.endlessY(this.x))
        : Math.max(0, this.y - this.surfaceY(this.x));
      const tiltScale = Math.min(1, airClearance / 2.5);
      this.board.rotation.z += (0.55 * tiltScale - this.board.rotation.z) * Math.min(1, dt * 10);
      this.boardDeck.rotation.x = this.visualFlip + this.grabSpinBurst * 0.9;
      this.rider.rotation.z = -grabDir * 0.22 * tiltScale;
      this.rider.position.y -= 0.25 * tiltScale;
      if (Math.random() < 0.3) this.cb.onCarve?.(this.x, this.board.position.y, -grabDir);
    }

    // Wheels spin with speed
    for (const w of this.wheels) w.rotation.y += this.speed * dt * 2.2;
    (this.underglow.material as BABYLON.StandardMaterial).alpha = 0.55 + Math.min(0.4, Math.abs(this.speed) * 0.012);

    // Animate the Blobothan rig
    const state: AnimState = this.handPlanting ? 'handPlant'
      : (this.pushing ? 'push' : (this.onGround ? 'skate' : 'jump'));
    this.rig.pushSide = this.pushLeg;
    // Angry flow face when cruising fast on a clean line in the endless run
    this.rig.angryFlow = this.endless && Math.abs(this.speed) > 30 && this.combo >= 1 && this.onGround;
    this.rig.update(dt, {
      velX: this.vx, velY: this.vy, accelX: this.vx * 0.3, accelY: this.vy * 0.3,
      grounded: this.handPlanting ? false : this.onGround, stateName: state, facing: this.speed >= 0 ? 1 : -1,
      speed: Math.abs(this.speed),
      legStretch: 1 + this.jumpStretch * 0.9, // long legs as he launches
    });

    // Hard-carve sparks callback (gold juice)
    if (this.onGround && this.gForce > 1.5 && Math.random() < 0.3) {
      this.cb.onCarve?.(this.x, this.y + 0.3, this.x > 0 ? -1 : 1);
    }
    if (this.onGround && Math.abs(this.speed) > 24 && Math.random() < 0.16) {
      this.cb.onFlow?.(this.x, this.y + 0.4, Math.sign(this.speed), Math.abs(this.speed));
    }
  }

  private updateCoins(dt: number) {
    for (const c of this.coins) {
      if (c.collected) continue;
      c.phase += dt * 2.5;
      c.root.rotation.y += dt * 2.2;
      c.root.position.y = c.pos.y + Math.sin(c.phase) * 0.25;
      if (BABYLON.Vector3.Distance(this.position, c.root.position) < 1.8) {
        c.collected = true;
        c.root.setEnabled(false);
        this.coinsCollected++;
        this.cb.onGold?.(c.root.position.x, c.root.position.y);
      }
    }
  }

  private syncPosition() {
    // Final authority — never let the skater's world position enter the void
    if (this.endless && this.y < -12) {
      this.y = this.nearestSolidY(this.x) - 2;
      this.vy = Math.max(this.vy, 8);
    }
    this.position.set(this.x, this.y + 1.45, 0);
  }

  public dispose() {
    this.rig.dispose();
    this.board.dispose(false, false); // keep shared cached materials alive
    for (const c of this.coins) c.root.dispose(false, false);
    for (const c of this.endlessCoins) c.root.dispose(false, false);
    this.scene.meshes.slice().forEach((m) => {
      if (m.name === 'halfpipe' || m.name === 'pipeGrid' || m.name === 'coping' ||
          m.name === 'lipWall' || m.name === 'lampPole' || m.name === 'lamp' ||
          m.name === 'plantHand' || m.name === 'grabHand' ||
          m.name.startsWith('endlessTrack') || m.name.startsWith('endlessGrid') ||
          m.name.startsWith('endlessRail') || m.name.startsWith('gapGate') ||
          m.name.startsWith('boostPad') || m.name.startsWith('courseArch') ||
          m.name.startsWith('skyLoop') || m.name.startsWith('startLine')) m.dispose();
    });
    this.scene.lights.slice().forEach((l) => {
      if (l.name === 'pipeLamp' || l.name === 'plantLight') l.dispose();
    });
  }
}
