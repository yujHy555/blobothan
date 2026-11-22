import * as BABYLON from 'babylonjs';

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpPressed: boolean;
  slide: boolean;
  slidePressed: boolean;
  dash: boolean;
  dashPressed: boolean;
  grapple: boolean;
  grapplePressed: boolean;
  fire: boolean;
  firePressed: boolean;
  longLegsPressed: boolean;
  rotLeft: boolean;
  rotRight: boolean;
  dragX: number;      // mouse/touch drag delta for orbiting
  axisX: number;
  axisZ: number;      // strafe / forward-back in third-person
  boost: boolean;     // left stick pushed DOWN → speed boost
  anyInput: boolean;
}

export class Input {
  public state: InputState = { left: false, right: false, jump: false, jumpPressed: false, slide: false, slidePressed: false, dash: false, dashPressed: false, grapple: false, grapplePressed: false, fire: false, firePressed: false, longLegsPressed: false, rotLeft: false, rotRight: false, dragX: 0, axisX: 0, axisZ: 0, boost: false, anyInput: false };
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private callbacks = new Map<string, () => void>();
  private touch = { left: false, right: false, jump: false, jumpPressed: false };
  private dragAccum = 0;
  public isThirdPerson = false; // set by game per realm; changes W/S meaning
  // Gamepad edge detection (previous pressed state per button)
  private padPrev: Record<string, boolean> = {};
  private padAxisPrev = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const k = this.map(e.code);
      if (!k) return;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      if (k === ' ' || k === 'ArrowUp') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = this.map(e.code);
      if (k) this.keys.delete(k);
    });
    window.addEventListener('gamepadconnected', () => {});
    window.addEventListener('blur', () => this.keys.clear());

    // Pointer drag on the world canvas orbits the camera (more freedom)
    const canvas = document.getElementById('babylon');
    if (canvas) {
      let dragging = false, lastX = 0;
      canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
      window.addEventListener('pointerup', () => { dragging = false; });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        // Pointer drag no longer orbits the camera — scene rotation is disabled
        this.dragAccum = 0;
        lastX = e.clientX;
      });
    }

    // Touch controls
    const bindPad = (id: string, key: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touch[key as 'left' | 'right' | 'jump'] = true;
        if (key === 'jump') this.touch.jumpPressed = true;
      });
      const up = (e: Event) => { e.preventDefault(); this.touch[key as 'left' | 'right' | 'jump'] = false; };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bindPad('pad-left', 'left');
    bindPad('pad-right', 'right');
    bindPad('pad-jump', 'jump');
    if ('ontouchstart' in window) {
      const mc = document.getElementById('mobile-controls');
      if (mc) mc.style.display = 'block';
    }
  }

  private map(code: string): string | null {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'Space': return 'jump';
      case 'KeyW': case 'ArrowUp': return 'forward';
      case 'KeyS': case 'ArrowDown': return 'back';
      case 'KeyJ': case 'ShiftLeft': case 'ShiftRight': return 'dash';
      case 'KeyK': return 'grapple';
      case 'KeyI': case 'KeyG': return 'fire';
      case 'KeyL': return 'longlegs';
      case 'KeyQ': return 'rotLeft';
      case 'KeyE': return 'rotRight';
      default: return null;
    }
  }

  public onKeyDown(key: string, cb: () => void) { this.callbacks.set(key, cb); }

  public update(dt: number) {
    for (const k of this.justPressed) {
      const cb = this.callbacks.get(k);
      if (cb) cb();
    }
    const snapshot = new Set(this.justPressed);
    this.justPressed.clear();

    // Keyboard / touch axis
    let ax = 0;
    if (this.keys.has('left') || this.touch.left) ax -= 1;
    if (this.keys.has('right') || this.touch.right) ax += 1;
    let az = 0; // forward (+1) / back (-1) for third-person
    if (this.keys.has('forward')) az += 1;
    if (this.keys.has('back')) az -= 1;

    let jumpHeld = this.keys.has('jump') || this.touch.jump;
    // In 2.5D, W/Up also jumped; forward/back keys are pure movement in 3D.
    // We expose both — the game decides based on camera mode.
    let slideHeld = this.keys.has('slide');
    let dashHeld = this.keys.has('dash');
    let grappleHeld = this.keys.has('grapple');
    let grapplePressed = snapshot.has('grapple');
    let fireHeld = this.keys.has('fire');
    let firePressed = snapshot.has('fire');
    let longLegsPressed = snapshot.has('longlegs');
    let jumpPressed = snapshot.has('jump') || this.touch.jumpPressed;
    let slidePressed = snapshot.has('slide');
    // In 2.5D, W/Up = jump (and S/Down = slide). The game only reads axisZ in 3D,
    // so aliasing here keeps classic controls working without affecting 3D movement.
    if ((this.keys.has('forward')) && !this.isThirdPerson) { jumpHeld = true; if (snapshot.has('forward')) jumpPressed = true; }
    if ((this.keys.has('back')) && !this.isThirdPerson) slideHeld = true;
    let dashPressed = snapshot.has('dash');
    let rotLeft = this.keys.has('rotLeft');
    let rotRight = this.keys.has('rotRight');
    let padBoost = false;

    // Gamepad: poll fresh each frame with proper release + edge detection
    if (navigator.getGamepads) {
      const gps = navigator.getGamepads();
      const live = gps && gps.length ? Array.from(gps).find((g) => g && g.connected) : null;
      const gp = live as Gamepad | null;
      if (gp) {
        const lx = gp.axes[0] ?? 0;
        const dz = 0.18;
        if (Math.abs(lx) > dz) {
          // scale past deadzone for a responsive stick
          const scaled = (Math.abs(lx) - dz) / (1 - dz);
          ax = Math.sign(lx) * scaled;
        }
        const ly = gp.axes[1] ?? 0;
        // Push the left stick DOWN past the deadzone = speed boost.
        padBoost = ly > 0.62;
        if (Math.abs(ly) > dz) {
          const scaled = (Math.abs(ly) - dz) / (1 - dz);
          az = -Math.sign(ly) * scaled; // stick up = forward
        }
        const btn = (i: number) => !!(gp.buttons[i] && gp.buttons[i]!.pressed);
        const edge = (name: string, pressed: boolean) => {
          const was = this.padPrev[name] ?? false;
          this.padPrev[name] = pressed;
          return pressed && !was;
        };
        // A = jump + trick chain. Triggers (LT/RT) are ANALOG and jitter, so
        // they are NOT mapped here — that caused phantom jumps, camera punches
        // and false wipeouts/restarts in the skate levels.
        const jp = btn(0);
        if (jp) { jumpHeld = true; if (edge('jump', jp)) jumpPressed = true; }
        else this.padPrev['jump'] = false;

        // B = slide / grab
        const sp = btn(1);
        if (sp) { slideHeld = true; if (edge('slide', sp)) slidePressed = true; }
        else this.padPrev['slide'] = false;

        const dp = btn(2); // X
        if (dp) { dashHeld = true; if (edge('dash', dp)) dashPressed = true; }
        else this.padPrev['dash'] = false;

        const gp2 = btn(3); // Y
        if (gp2) { grappleHeld = true; if (edge('grapple', gp2)) grapplePressed = true; }
        else this.padPrev['grapple'] = false;

        // RT (button 7) = fire — use a HIGH analog threshold so trigger jitter
        // can't cause phantom shots. Only used by the phaser in the jet level.
        const rt = gp && gp.buttons[7] ? gp.buttons[7]!.value > 0.6 : false;
        if (rt) { fireHeld = true; if (edge('fire', rt)) firePressed = true; }
        else this.padPrev['fire'] = false;

        rotLeft = rotLeft || btn(4);
        rotRight = rotRight || btn(5);
      }
    }

    // Left stick pushed DOWN = speed boost (skate/jetpack).
    this.state.boost = padBoost || (this.keys.has('boost') || false);
    this.state.axisX = ax;
    this.state.axisZ = az;
    this.state.left = ax < -0.15;
    this.state.right = ax > 0.15;
    this.state.jump = jumpHeld;
    this.state.jumpPressed = jumpPressed;
    this.state.slide = slideHeld;
    this.state.slidePressed = slidePressed;
    this.state.dash = dashHeld;
    this.state.dashPressed = dashPressed;
    this.state.grapple = grappleHeld;
    this.state.grapplePressed = grapplePressed;
    this.state.fire = fireHeld;
    this.state.firePressed = firePressed;
    this.state.longLegsPressed = longLegsPressed;
    this.state.rotLeft = rotLeft;
    this.state.rotRight = rotRight;
    this.state.dragX = this.dragAccum;
    this.dragAccum = 0;
    this.state.anyInput = ax !== 0 || az !== 0 || jumpHeld || slideHeld;
    this.touch.jumpPressed = false;
  }

  public dispose() {}
}
