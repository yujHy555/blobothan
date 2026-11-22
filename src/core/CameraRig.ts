import * as BABYLON from 'babylonjs';

export class CameraRig {
  private camera: BABYLON.FreeCamera;
  private _position: BABYLON.Vector3;
  private _velocity = new BABYLON.Vector3();
  private shakeTime = 0;
  private shakeAmp = 0;
  private baseDist = 30;
  private zoomPunch = 0;
  private lookAhead = 0;
  private targetFov = 0.92;
  private baseFov = 0.92;
  private yaw = 0;
  private pitch = 0;
  private punchHold = 0;
  private lastFocusY = 0;
  public thirdPerson = false;   // level 2: follow behind the character
  public isometric = false;     // level 3: fixed 45°/35° isometric camera
  public skateMode = false;     // level 4: tight continuous follow + trick zoom
  public trickZoom = 0;         // 0..1, driven by trick state
  public setSkateMode(on: boolean) { this.skateMode = on; this.trickZoom = 0; }
  public resetYaw() { this.yaw = 0; this.tpYaw = 0; this.pitch = 0; this.camera.rotation.z = 0; }
  private tpYaw = 0;
  private t = 0;

  constructor(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
    this._position = new BABYLON.Vector3(0, 26, -this.baseDist);
    this.camera = new BABYLON.FreeCamera('cam', this._position.clone(), scene);
    this.camera.setTarget(BABYLON.Vector3.Zero());
    this.camera.fov = this.baseFov;
    this.camera.minZ = 0.5;   // tighter near/far = better depth precision
    this.camera.maxZ = 800;
  }

  public getPosition() { return this._position; }
  public getCamera() { return this.camera; }
  public getHeading() { return this.thirdPerson ? this.tpYaw : this.yaw; }
  // Dev-panel live tuning
  public getDistance() { return this.baseDist; }
  public setDistance(v: number) { this.baseDist = v; }
  public getFov() { return this.baseFov; }
  public setFov(v: number) { this.baseFov = v; this.camera.fov = v; }

  public snap(x: number, y: number) {
    this.lookAhead = 0;
    this._velocity.set(0, 0, 0);
    this.lastFocusY = y;
    const dist = this.baseDist + this.zoomPunch;
    this._position = new BABYLON.Vector3(x + Math.sin(this.yaw) * dist, y + Math.sin(this.pitch) * dist * 0.3, -Math.cos(this.yaw) * dist);
    this.camera.position = this._position.clone();
    this.camera.setTarget(new BABYLON.Vector3(x, y, 0));
  }

  public shake(duration = 0.25, amp = 6) {
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  public punch(amount = 12, hold = 0.18) {
    this.zoomPunch = Math.max(this.zoomPunch, amount);
    this.punchHold = Math.max(this.punchHold, hold);
  }

  public orbit(angleDelta: number, pitchDelta = 0) {
    this.yaw += angleDelta;
    this.pitch = BABYLON.Scalar.Clamp(this.pitch + pitchDelta, -0.5, 0.5);
  }

  /**
   * Next-gen follow: spring-damped positional tracking with velocity look-ahead,
   * vertical dead zone, speed/air FOV kick, roll lean, user orbit, punch-zoom,
   * and trauma-based shake. Everything is frame-rate independent.
   */
  public update(dt: number, px: number, py: number, velX = 0, velY = 0, grounded = true, rotInput = 0, dragX = 0, pz = 0) {
    // Never integrate a huge/stale dt (e.g. after an async GLB load hitch) —
    // an explicit Euler spring explodes past ~0.05 s, flying the camera off.
    dt = BABYLON.Scalar.Clamp(dt, 0, 0.05);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return; // bad physics tick
    if (this.isometric) {
      this.updateIsometric(dt, px, py, pz);
      return;
    }
    if (this.thirdPerson) {
      this.updateThirdPerson(dt, px, py, pz, rotInput, dragX);
      return;
    }
    // Scene rotation is disabled in all levels — Q/E are trick inputs only.
    this.yaw = 0;

    // Minimal, calm follow: focus directly on the player, no velocity-driven
    // drift. Smooth tracking keeps motion steady (no unnecessary camera movement).
    const focusX = px;
    // Skate mode: snappier vertical lock so the skater never drifts off-screen
    this.lastFocusY += (py - this.lastFocusY) * Math.min(1, dt * (this.skateMode ? 11 : 5));
    const focusY = this.lastFocusY;

    // Fixed distance — no automatic zoom. punch() only used on big moments.
    if (this.punchHold > 0) this.punchHold = Math.max(0, this.punchHold - dt);
    else this.zoomPunch = Math.max(0, this.zoomPunch - dt * 24);
    let dist = this.baseDist + this.zoomPunch;
    // Rare special-occasion zoom only — Level 4 is otherwise a wide vista
    if (this.skateMode) dist *= 1 - this.trickZoom * 0.3;

    // Camera sits back at the same height as the focus, looking straight at it
    // → player stays centered on screen vertically.
    const desired = new BABYLON.Vector3(
      focusX + Math.sin(this.yaw) * dist,
      focusY,
      -Math.cos(this.yaw) * dist,
    );

    // Critically-damped-ish spring follow (smooth, no jitter)
    const stiffness = 90, damping = 16;
    this._velocity.x += ((desired.x - this._position.x) * stiffness - this._velocity.x * damping) * dt;
    this._velocity.y += ((desired.y - this._position.y) * stiffness - this._velocity.y * damping) * dt;
    this._velocity.z += ((desired.z - this._position.z) * stiffness - this._velocity.z * damping) * dt;
    this._position.x += this._velocity.x * dt;
    this._position.y += this._velocity.y * dt;
    this._position.z += this._velocity.z * dt;

    // Fixed FOV, no roll — steady, predictable camera. No unnecessary motion.
    this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.rotation.z += (0 - this.camera.rotation.z) * Math.min(1, dt * 5);

    // Trauma shake (squared falloff)
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const f = this.shakeTime * this.shakeAmp * 0.12;
      this._position.x += (Math.random() - 0.5) * f;
      this._position.y += (Math.random() - 0.5) * f;
      if (this.shakeTime === 0) this.shakeAmp = 0;
    }

    // Subtle handheld/cinematic drift for the endless level-4 park — a tiny,
    // bounded sway that sells the parallax depth without motion sickness.
    if (this.skateMode) {
      this.t += dt;
      this._position.x += Math.sin(this.t * 0.7) * 0.12;
      this._position.y += Math.sin(this.t * 1.1 + 1.3) * 0.09;
      this.camera.rotation.z += Math.sin(this.t * 0.53) * 0.004;
    }

    this.camera.position = this._position;
    this.camera.setTarget(new BABYLON.Vector3(focusX, focusY, 0));
  }

  /** Third-person isometric follow. Player's back faces the camera; +Z is into screen. */
  private updateThirdPerson(dt: number, px: number, py: number, pz: number, rotInput: number, dragX: number) {
    if (rotInput !== 0) this.tpYaw += rotInput * dt * 1.2;
    if (dragX !== 0) this.tpYaw += dragX * 0.6;
    this.tpYaw = BABYLON.Scalar.Clamp(this.tpYaw, -1.0, 1.0);

    // Camera behind the player along -Z, elevated — closer for character presence
    const back = 11;
    const height = 7.5;
    const desired = new BABYLON.Vector3(
      px + Math.sin(this.tpYaw) * back,
      py + height,
      pz - Math.cos(this.tpYaw) * back,
    );
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    this._position.x = lerp(this._position.x, desired.x, Math.min(1, dt * 4));
    this._position.y = lerp(this._position.y, desired.y, Math.min(1, dt * 3.2));
    this._position.z = lerp(this._position.z, desired.z, Math.min(1, dt * 4));

    this.camera.fov += (0.9 - this.camera.fov) * Math.min(1, dt * 3);

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const f = this.shakeTime * this.shakeAmp * 0.1;
      this._position.x += (Math.random() - 0.5) * f;
      this._position.y += (Math.random() - 0.5) * f;
    }

    this.camera.position = this._position;
    // Look ahead of the player (+Z), matching movement forward
    this.camera.setTarget(new BABYLON.Vector3(px, py + 1, pz + 6));
  }

  public snapThirdPerson(px: number, py: number, pz = 0) {
    this.tpYaw = 0;
    this._position = new BABYLON.Vector3(px, py + 7.5, pz - 11);
    this.camera.position = this._position.clone();
    this.camera.setTarget(new BABYLON.Vector3(px, py + 1, pz + 6));
  }

  /** Classic isometric: fixed 45° yaw / ~35° pitch, low FOV, steady follow. */
  private updateIsometric(dt: number, px: number, py: number, pz: number) {
    const dist = 26;
    // 45° around Y, elevated — the classic iso angle
    const offX = Math.sin(Math.PI / 4) * dist;
    const offZ = -Math.cos(Math.PI / 4) * dist;
    const desired = new BABYLON.Vector3(px + offX, py + 21, pz + offZ);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    this._position.x = lerp(this._position.x, desired.x, Math.min(1, dt * 4));
    this._position.y = lerp(this._position.y, desired.y, Math.min(1, dt * 3.5));
    this._position.z = lerp(this._position.z, desired.z, Math.min(1, dt * 4));
    this.camera.fov += (0.72 - this.camera.fov) * Math.min(1, dt * 4); // near-ortho look
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const f = this.shakeTime * this.shakeAmp * 0.1;
      this._position.x += (Math.random() - 0.5) * f;
      this._position.y += (Math.random() - 0.5) * f;
    }
    this.camera.position = this._position;
    this.camera.setTarget(new BABYLON.Vector3(px, py, pz));
  }

  public snapIsometric(px: number, py: number, pz = 0) {
    const dist = 26;
    this._position = new BABYLON.Vector3(
      px + Math.sin(Math.PI / 4) * dist,
      py + 21,
      pz - Math.cos(Math.PI / 4) * dist,
    );
    this.camera.position = this._position.clone();
    this.camera.setTarget(new BABYLON.Vector3(px, py, pz));
  }

  public dispose() { this.camera.dispose(); }
}
