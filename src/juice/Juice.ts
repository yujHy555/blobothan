import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

type Particle = {
  g: Graphics;
  vx: number; vy: number;
  life: number; maxLife: number;
  spin: number;
  gravity: number;
  fade: boolean;
  shrink: boolean;
};

/**
 * PixiJS 2D overlay for AAA "juice": wunder dust, impact rings, portal swirls,
 * floating score text, speed streaks, screen flashes. Babylon renders the 3D world;
 * Pixi renders effects on top, in sync via game.project()/game.pixi.update().
 */
export class Juice {
  private app = new Application();
  private world = new Container();
  private particles: Particle[] = [];
  private ready = false;
  private wunderDust: Graphics[] = [];
  private time = 0;
  private flash!: Graphics;
  private vignette!: Graphics;
  private scanlines!: Graphics;
  private comboLabel!: Text;
  private comboTimer = 0;
  private lastCalloutTime = -1;
  public ambientEnabled = true;
  /** Global text offset — used in the endless level to keep callouts off the skater. */
  public textOffset = { x: 0, y: 0 };

  public async init(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      backgroundAlpha: 0,
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.world);

    // Full-screen flash layer
    this.flash = new Graphics();
    this.flash.alpha = 0;
    this.app.stage.addChild(this.flash);

    // Soft vignette
    this.vignette = new Graphics();
    this.app.stage.addChild(this.vignette);
    this.resizeVignette();
    window.addEventListener('resize', () => this.resizeVignette());

    // Retro digital scanlines
    this.scanlines = new Graphics();
    this.app.stage.addChild(this.scanlines);
    this.drawScanlines();
    window.addEventListener('resize', () => this.drawScanlines());

    // Arcade combo counter (top-center, pops on each chain hit)
    this.comboLabel = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Fredoka, Comic Sans MS, cursive', fontSize: 46, fontWeight: '900',
        fill: 0xffd45b, stroke: { color: 0x3a1400, width: 8 },
        dropShadow: { color: 0xff5a00, angle: Math.PI / 2, blur: 8, distance: 0 },
        letterSpacing: 2,
      }),
    });
    this.comboLabel.anchor.set(0.5);
    this.comboLabel.alpha = 0;
    this.app.stage.addChild(this.comboLabel);

    this.ready = true;
  }

  private resizeVignette() {
    if (!this.vignette) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    this.vignette.clear();
    // corner darkening via stacked translucent rectangles
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a = 0.035 * (1 - t);
      this.vignette.rect(0, 0, w, h * 0.06 * (steps - i));
      this.vignette.fill({ color: 0x000208, alpha: a });
    }
  }

  private drawScanlines() {
    if (!this.scanlines) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    this.scanlines.clear();
    // Fine horizontal CRT scanlines
    for (let y = 0; y < h; y += 4) {
      this.scanlines.rect(0, y, w, 1);
      this.scanlines.fill({ color: 0x000000, alpha: 0.12 });
    }
  }

  private project(p: { x: number; y: number; z: number }): { x: number; y: number } {
    const w = this.app.screen.width, h = this.app.screen.height;
    // Simple orthographic-ish mapping tuned to the camera; game passes screen-space coords where possible.
    return { x: p.x, y: p.y };
  }

  /** Spawn a burst of wunder dust (magic motes) at a screen position. */
  public wunderBurst(sx: number, sy: number, count = 18, color = 0x9fffe0) {
    if (!this.ready) return;
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const r = 2 + Math.random() * 4;
      g.circle(0, 0, r);
      g.fill({ color, alpha: 0.9 });
      g.circle(0, 0, r * 0.45);
      g.fill({ color: 0xffffff, alpha: 0.9 });
      g.x = sx; g.y = sy;
      this.world.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 190;
      this.particles.push({
        g,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 60,
        life: 0.5 + Math.random() * 0.7,
        maxLife: 1.2,
        spin: (Math.random() - 0.5) * 8,
        gravity: 90,
        fade: true,
        shrink: true,
      });
    }
  }

  /** Golden-hour lens flare with rotating rays — for the perfect handplant. */
  public sunFlare(sx: number, sy: number, duration = 1.4) {
    if (!this.ready) return;
    const g = new Graphics();
    g.circle(0, 0, 26).fill({ color: 0xfff3c0, alpha: 0.95 });
    g.circle(0, 0, 46).fill({ color: 0xffcf55, alpha: 0.4 });
    g.circle(0, 0, 76).fill({ color: 0xff9a24, alpha: 0.16 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
      g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
      g.stroke({ color: 0xffd86b, width: 3, alpha: 0.6 });
    }
    g.x = sx; g.y = sy;
    this.world.addChild(g);
    this.particles.push({
      g, vx: 0, vy: 0, life: duration, maxLife: duration, spin: 0, gravity: 0,
      fade: true, shrink: false, flare: true,
    } as any);
  }

  /** Big arcade callout with a punchy scale-in pop ("SWEET!", "SMASH!", etc). */
  public callout(sx: number, sy: number, text: string, color = 0xffd45b, size = 40) {
    if (!this.ready) return;
    // Throttle small callouts so rapid trick chains don't stack a wall of text.
    // Big callouts (size >= 38, e.g. combos) always punch through.
    if (size < 38 && this.time - this.lastCalloutTime < 0.22) return;
    this.lastCalloutTime = this.time;
    const t = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Fredoka, Comic Sans MS, cursive', fontSize: size, fontWeight: '900',
        fill: color, stroke: { color: 0x2a0e3a, width: 8 },
        dropShadow: { color: 0x2a0e3a, angle: Math.PI / 2, blur: 0, distance: 5 },
      }),
    });
    t.anchor.set(0.5);
    t.x = sx + this.textOffset.x; t.y = sy + this.textOffset.y;
    t.scale.set(0.1);
    this.world.addChild(t);
    this.particles.push({
      g: t as any, vx: 0, vy: -55, life: 0.95, maxLife: 0.95, spin: 0, gravity: 26,
      fade: true, shrink: false, pop: true,
    } as any);
  }

  /** Persistent top-center arcade combo meter; pass 0 (or <2) to hide. */
  public setCombo(n: number) {
    if (!this.ready) return;
    if (n < 2) { this.comboTimer = 0; this.comboLabel.alpha = 0; return; }
    this.comboLabel.text = `x${n} COMBO`;
    this.comboLabel.x = this.app.screen.width / 2;
    this.comboLabel.y = 92;
    this.comboLabel.alpha = 1;
    this.comboLabel.scale.set(1.4);
    this.comboTimer = 1.35;
  }

  /** Sonic-style coin pop: a gold coin flips and arcs up, then fades. */
  public coinPop(sx: number, sy: number) {
    if (!this.ready) return;
    const g = new Graphics();
    g.circle(0, 0, 13); g.fill({ color: 0xffd83d });      // rim
    g.circle(0, 0, 10); g.fill({ color: 0xf5a623 });      // face
    g.circle(0, 0, 6); g.stroke({ color: 0xffe98a, width: 2 });
    g.circle(-3.5, -3.5, 2.6); g.fill({ color: 0xffffff, alpha: 0.9 }); // shine
    g.x = sx; g.y = sy;
    this.world.addChild(g);
    this.particles.push({
      g, vx: (Math.random() - 0.5) * 70, vy: -300 - Math.random() * 70,
      life: 0.78, maxLife: 0.78, spin: 0, gravity: 640, fade: true, shrink: false,
      coin: true, phase: Math.random() * Math.PI * 2,
    } as any);
  }

  /** Sparkle ring for portals / big impacts. */
  public ring(sx: number, sy: number, color = 0x7fffd4, maxR = 90) {
    if (!this.ready) return;
    const g = new Graphics();
    g.x = sx; g.y = sy;
    this.world.addChild(g);
    this.particles.push({
      g, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, spin: 0, gravity: 0, fade: true, shrink: false,
      ring: { r: 8, maxR, color },
    } as any);
  }

  /** Floating score / event text. */
  public floatText(sx: number, sy: number, text: string, color = 0x9fffe0, size = 26) {
    if (!this.ready) return;
    const t = new Text({ text, style: new TextStyle({ fontFamily: 'Fredoka, Comic Sans MS, cursive', fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0x2a0e3a, width: 6 }, dropShadow: { color: 0x2a0e3a, angle: Math.PI / 2, blur: 0, distance: 4 } }) });
    t.anchor.set(0.5);
    t.x = sx + this.textOffset.x; t.y = sy + this.textOffset.y;
    this.world.addChild(t);
    this.particles.push({
      g: t as any, vx: (Math.random() - 0.5) * 30, vy: -90 - Math.random() * 30,
      life: 1.1, maxLife: 1.1, spin: 0, gravity: 40, fade: true, shrink: false,
    });
  }

  /** Speed streaks when rolling fast. */
  public speedStreak(sx: number, sy: number, dir: number, color = 0x9fffe0) {
    if (!this.ready) return;
    const g = new Graphics();
    const len = 30 + Math.random() * 60;
    g.moveTo(0, 0); g.lineTo(-dir * len, (Math.random() - 0.5) * 8);
    g.stroke({ color, width: 2 + Math.random() * 3, alpha: 0.7 });
    g.x = sx; g.y = sy + (Math.random() - 0.5) * 40;
    this.world.addChild(g);
    this.particles.push({ g, vx: -dir * 260, vy: 0, life: 0.3, maxLife: 0.3, spin: 0, gravity: 0, fade: true, shrink: false });
  }

  /** Disco splat — a glittery mirrored burst for huge impacts & ragdolls. */
  public discoSplat(sx: number, sy: number, color = 0xff7fd0) {
    if (!this.ready) return;
    const palette = [0xff5fa2, 0x5fe0ff, 0xffd85f, 0xb45fff, 0x5fff9e, 0xffffff];
    this.ring(sx, sy, color, 200);
    this.ring(sx, sy, 0xffffff, 140);
    this.screenFlash(color, 0.3);
    for (let i = 0; i < 54; i++) {
      const g = new Graphics();
      const star = i % 3 === 0;
      if (star) {
        const s = 4 + Math.random() * 6;
        g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s);
        g.stroke({ color: palette[i % palette.length], width: 2.5 });
      } else {
        g.circle(0, 0, 2 + Math.random() * 5);
        g.fill({ color: palette[i % palette.length], alpha: 0.95 });
      }
      g.x = sx; g.y = sy;
      this.world.addChild(g);
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 340;
      this.particles.push({
        g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 80,
        life: 0.6 + Math.random() * 0.8, maxLife: 1.4,
        spin: (Math.random() - 0.5) * 16, gravity: 220, fade: true, shrink: true,
      });
    }
    this.floatText(sx, sy - 46, 'SPLAT!', color, 40);
  }

  /** Radial speed lines bursting outward — pure AAA impact juice. */
  public radialBurst(sx: number, sy: number, color = 0xffffff, count = 14) {
    if (!this.ready) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const g = new Graphics();
      const len = 40 + Math.random() * 70;
      g.moveTo(0, 0); g.lineTo(len, 0);
      g.stroke({ color, width: 2 + Math.random() * 2, alpha: 0.85 });
      g.x = sx; g.y = sy;
      g.rotation = a;
      this.world.addChild(g);
      this.particles.push({
        g, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
        life: 0.25 + Math.random() * 0.15, maxLife: 0.4, spin: 0, gravity: 0, fade: true, shrink: false,
      });
    }
  }

  /** MEGA BURST — screen-filling celebration for huge moments. */
  public megaBurst(sx: number, sy: number, color = 0xff6fb5) {
    if (!this.ready) return;
    const palette = [0xff5fa2, 0x5fe0ff, 0xffd85f, 0xb45fff, 0x5fff9e, 0xffffff];
    this.ring(sx, sy, color, 320);
    this.ring(sx, sy, 0xffffff, 220);
    this.radialBurst(sx, sy, 0xffffff, 28);
    this.screenFlash(color, 0.4);
    for (let i = 0; i < 90; i++) {
      const g = new Graphics();
      const star = i % 4 === 0;
      if (star) {
        const s = 6 + Math.random() * 10;
        g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s);
        g.stroke({ color: palette[i % palette.length], width: 3 });
      } else {
        g.circle(0, 0, 2 + Math.random() * 7);
        g.fill({ color: palette[i % palette.length], alpha: 0.95 });
      }
      g.x = sx; g.y = sy;
      this.world.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const spd = 180 + Math.random() * 480;
      this.particles.push({
        g, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 100,
        life: 0.7 + Math.random() * 1.0, maxLife: 1.7, spin: (Math.random() - 0.5) * 20,
        gravity: 280, fade: true, shrink: true,
      });
    }
  }

  /** Slide trail — a streak of slime motes behind a sliding ball. */
  public slideTrail(sx: number, sy: number, dir: number, color = 0x9fffe0) {
    if (!this.ready) return;
    // 1) Soft expanding smoke puffs (layered circles, grow as they drift)
    for (let i = 0; i < 5; i++) {
      const g = new Graphics();
      const r = 5 + Math.random() * 8;
      g.circle(0, 0, r);
      g.fill({ color: 0xffffff, alpha: 0.28 });
      g.circle(0, 0, r * 0.6);
      g.fill({ color, alpha: 0.35 });
      g.circle(0, 0, r * 0.3);
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.x = sx - dir * (8 + Math.random() * 34);
      g.y = sy + (Math.random() - 0.5) * 34;
      this.world.addChild(g);
      this.particles.push({
        g, vx: -dir * (60 + Math.random() * 110), vy: -20 + (Math.random() - 0.5) * 50,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9, spin: (Math.random() - 0.5) * 1.5,
        gravity: -25, fade: true, shrink: false, smoke: 1,
      } as any);
    }
    // 2) Bright energy sparks (fast, tiny, fading)
    for (let i = 0; i < 4; i++) {
      const g = new Graphics();
      g.circle(0, 0, 1.5 + Math.random() * 2.5);
      g.fill({ color: i % 2 ? 0xffffff : color, alpha: 0.95 });
      g.x = sx - dir * (6 + Math.random() * 20);
      g.y = sy + (Math.random() - 0.5) * 24;
      this.world.addChild(g);
      this.particles.push({
        g, vx: -dir * (160 + Math.random() * 180), vy: (Math.random() - 0.5) * 90,
        life: 0.22 + Math.random() * 0.2, maxLife: 0.42, spin: 0, gravity: 120, fade: true, shrink: true,
      });
    }
    // 3) Comet streak line
    const line = new Graphics();
    const len = 30 + Math.random() * 50;
    line.moveTo(0, 0); line.lineTo(-dir * len, 0);
    line.stroke({ color, width: 2 + Math.random() * 2, alpha: 0.6 });
    line.x = sx - dir * 10; line.y = sy + (Math.random() - 0.5) * 20;
    this.world.addChild(line);
    this.particles.push({
      g: line, vx: -dir * 180, vy: 0, life: 0.28, maxLife: 0.28, spin: 0, gravity: 0, fade: true, shrink: false,
    });
  }

  /** Screen flash. */
  public screenFlash(color = 0x9fffe0, strength = 0.35) {
    if (!this.ready) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    this.flash.clear();
    this.flash.rect(0, 0, w, h);
    this.flash.fill({ color });
    this.flash.alpha = strength;
  }

  public update(dt: number) {
    if (!this.ready) return;
    this.time += dt;

    // Ambient wunder dust drifting upward
    // Sparse ambient motes — keep the air clean, particles reserved for moments
    if (this.ambientEnabled && Math.random() < dt * 14) {
      const g = new Graphics();
      const r = 1 + Math.random() * 2.5;
      g.circle(0, 0, r);
      g.fill({ color: 0xbfffe8, alpha: 0.7 });
      g.x = Math.random() * this.app.screen.width;
      g.y = this.app.screen.height + 10;
      this.world.addChild(g);
      this.wunderDust.push(g);
      this.particles.push({
        g, vx: (Math.random() - 0.5) * 24, vy: -(22 + Math.random() * 40),
        life: 4 + Math.random() * 3, maxLife: 7, spin: 0, gravity: -2, fade: true, shrink: false,
      });
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.g.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / p.maxLife;
      const ring = (p as any).ring;
      if (ring) {
        ring.r += (ring.maxR - ring.r) * Math.min(1, dt * 8);
        p.g.clear();
        p.g.circle(0, 0, ring.r);
        p.g.stroke({ color: ring.color, width: 3, alpha: t });
        p.g.alpha = t;
        continue;
      }
      p.vy += p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      if ((p as any).coin) {
        // Fake 3D coin flip by squashing horizontally
        p.g.scale.x = Math.max(0.08, Math.abs(Math.cos(this.time * 18 + (p as any).phase)));
      }
      if ((p as any).flare) {
        p.g.rotation += dt * 0.55;
        // Sizzle: rapid flicker + tiny scale jitter like a hot sparkler
        const flicker = 0.82 + Math.random() * 0.3 + Math.sin(this.time * 26) * 0.1;
        p.g.scale.set(flicker);
        (p.g as Graphics).alpha = t * (0.8 + Math.random() * 0.2);
      }
      if ((p as any).pop) {
        // Overshoot scale-in: 0 → 1.3 → 1.0
        const age = 1 - t; // 0 at spawn, 1 at death
        const s = age < 0.22
          ? (age / 0.22) * 1.3
          : 1.3 - ((age - 0.22) / 0.78) * 0.3;
        p.g.scale.set(Math.max(0.1, s));
      }
      if (p.fade) p.g.alpha = Math.min(1, t * 1.6);
      if (p.shrink) p.g.scale.set(0.4 + t * 0.6);
    }

    if (this.flash.alpha > 0) {
      this.flash.alpha = Math.max(0, this.flash.alpha - dt * 1.4);
    }

    // Combo meter: elastic settle + fade out when the timer expires
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      const s = this.comboLabel.scale.x;
      this.comboLabel.scale.set(s + (1 - s) * Math.min(1, dt * 12));
      // subtle wobble pulse
      this.comboLabel.skew.x = Math.sin(this.time * 16) * 0.04 * Math.min(1, this.comboTimer * 2);
      if (this.comboTimer <= 0) { this.comboLabel.alpha = 0; this.comboLabel.skew.x = 0; }
    }
  }

  public resize() {
    // resizeTo handles canvas; vignette on window listener
  }

  public getScreen() { return this.app.screen; }
  public get readyState() { return this.ready; }
}
