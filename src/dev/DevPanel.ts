/**
 * DEV-ONLY panel — never shipped with the game (gated by import.meta.env.DEV
 * in main.ts). Right-side overlay for live object/parameter tweaking and
 * instant level navigation. Toggle with ` (backtick) or the DEV tab.
 */
export class DevPanel {
  private root: HTMLDivElement;
  private ctx: any;
  private refreshers: (() => void)[] = [];
  private readouts: (() => string)[] = [];
  private readoutEls: HTMLElement[] = [];
  private visible = true;
  private refreshTimer = 0;

  constructor(ctx: any) {
    this.ctx = ctx;
    this.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'dev-panel';
    this.root.innerHTML = `
      <div class="dev-head">
        <span class="dev-title">◈ DEV LAB</span>
        <span class="dev-hint">\` toggle</span>
        <button class="dev-collapse" title="Collapse">−</button>
      </div>
      <div class="dev-body"></div>`;
    document.body.appendChild(this.root);

    const body = this.root.querySelector('.dev-body') as HTMLDivElement;
    this.buildLevels(body);
    if (ctx.player) this.buildPlayer(body);
    this.buildSkate(body);
    this.buildCamera(body);
    this.buildWorld(body);
    this.buildAudio(body);
    this.buildLive(body);

    // toggle key
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F2') {
        e.preventDefault();
        this.toggle();
      }
    });
    (this.root.querySelector('.dev-collapse') as HTMLButtonElement).onclick = () => this.toggle();
    this.refresh();
  }

  private injectStyles() {
    if (document.getElementById('dev-styles')) return;
    const s = document.createElement('style');
    s.id = 'dev-styles';
    s.textContent = `
      .dev-panel{position:fixed;top:0;right:0;width:306px;height:100vh;z-index:99999;
        background:linear-gradient(180deg,rgba(8,10,22,.96),rgba(4,6,16,.97));
        border-left:1px solid #2de0b0;box-shadow:-8px 0 30px rgba(0,0,0,.6);
        color:#bfe9df;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(8px)}
      .dev-panel.collapsed{width:34px}
      .dev-panel.collapsed .dev-body,.dev-panel.collapsed .dev-title,.dev-panel.collapsed .dev-hint{display:none}
      .dev-head{display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #173b34;
        background:linear-gradient(90deg,rgba(45,224,176,.14),transparent)}
      .dev-title{font-weight:700;letter-spacing:2px;color:#2de0b0;text-shadow:0 0 10px #2de0b0}
      .dev-hint{margin-left:auto;opacity:.5;font-size:10px}
      .dev-collapse{margin-left:auto;background:#12342c;color:#2de0b0;border:1px solid #2de0b0;
        border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:13px;line-height:1}
      .dev-panel.collapsed .dev-collapse{margin:0}
      .dev-body{overflow-y:auto;padding:4px 10px 30px;flex:1}
      .dev-body::-webkit-scrollbar{width:6px}
      .dev-body::-webkit-scrollbar-thumb{background:#1d6b58;border-radius:3px}
      .dev-sec{margin:12px 0 6px;padding:5px 8px;border-left:2px solid #ff5fa2;
        background:rgba(255,95,162,.08);color:#ff9ec6;font-weight:700;letter-spacing:1.5px;font-size:10px}
      .dev-row{display:flex;align-items:center;gap:6px;margin:3px 0;min-height:22px}
      .dev-row label{flex:0 0 96px;color:#9fc9bd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dev-row input[type=range]{flex:1;min-width:0;height:14px;accent-color:#2de0b0;cursor:pointer}
      .dev-val{flex:0 0 44px;text-align:right;color:#ffe27a;font-variant-numeric:tabular-nums}
      .dev-btn{background:#123a30;color:#7affd0;border:1px solid #1d6b58;border-radius:4px;
        padding:5px 7px;cursor:pointer;font:inherit;font-size:10px;transition:.12s}
      .dev-btn:hover{background:#1d6b58;color:#fff;box-shadow:0 0 8px #2de0b0}
      .dev-btn.lvl{flex:1;background:#2a1338;border-color:#ff5fa2;color:#ff9ec6}
      .dev-btn.lvl:hover{background:#ff5fa2;color:#140018}
      .dev-btn.danger{border-color:#ff5f6f;color:#ff8f9a;background:#3a1218}
      .dev-btn.danger:hover{background:#ff5f6f;color:#fff}
      .dev-grid{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
      .dev-live{background:#0a1a18;border:1px solid #173b34;border-radius:4px;padding:6px 8px;margin-top:4px}
      .dev-live div{display:flex;justify-content:space-between;margin:1px 0}
      .dev-live b{color:#ffe27a;font-variant-numeric:tabular-nums}
      .dev-note{opacity:.5;font-size:9px;margin:6px 0 0;line-height:1.5}
    `;
    document.head.appendChild(s);
  }

  private section(parent: HTMLElement, title: string) {
    const d = document.createElement('div');
    d.className = 'dev-sec';
    d.textContent = title;
    parent.appendChild(d);
    return d;
  }

  private slider(parent: HTMLElement, label: string, get: () => number, set: (v: number) => void,
                  min: number, max: number, step = 0.1, digits = 2) {
    const row = document.createElement('div');
    row.className = 'dev-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(get());
    const val = document.createElement('span');
    val.className = 'dev-val';
    val.textContent = get().toFixed(digits);
    const sync = () => { if (document.activeElement !== input) input.value = String(get()); val.textContent = get().toFixed(digits); };
    input.oninput = () => { const v = parseFloat(input.value); set(v); val.textContent = v.toFixed(digits); };
    row.append(lab, input, val);
    parent.appendChild(row);
    this.refreshers.push(sync);
  }

  private button(parent: HTMLElement, label: string, fn: () => void, cls = 'dev-btn') {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label;
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  }

  private grid(parent: HTMLElement) {
    const g = document.createElement('div');
    g.className = 'dev-grid';
    parent.appendChild(g);
    return g;
  }

  // ---------------------------------------------------------------- sections
  private buildLevels(p: HTMLElement) {
    this.section(p, 'LEVEL SELECT');
    const g = this.grid(p);
    for (let i = 0; i < 4; i++) {
      const names = ['1 · Glowgrove', '2 · Solar Foundry', '3 · Neon Bowl', '4 · Ollie Ollie Ollie'];
      this.button(g, names[i], () => this.ctx.enterPortal(i), 'dev-btn lvl');
    }
    const g2 = this.grid(p);
    this.button(g2, '↻ Restart', () => {
      const w = document.getElementById('btn-restart') as HTMLElement;
      if (w) w.click();
    });
    this.button(g2, '☠ Kill', () => this.ctx.die?.());
    this.button(g2, '★ Win', () => this.ctx.win?.());
    this.button(g2, '⌂ Main Menu', () => this.ctx.goToMenu?.());
    const note = document.createElement('div');
    note.className = 'dev-note';
    note.textContent = 'Tweak any slider live — changes apply to the running game instantly.';
    p.appendChild(note);
  }

  private buildPlayer(p: HTMLElement) {
    this.section(p, 'PLAYER · BALL PHYSICS');
    const pl = this.ctx.player;
    const S = (l: string, k: string, a: number, b: number, s = 0.1, d = 2) =>
      this.slider(p, l, () => pl[k], (v) => { pl[k] = v; }, a, b, s, d);
    S('gravity', 'gravity', -80, -5, 1, 0);
    S('move accel', 'moveAccel', 5, 120, 1, 0);
    S('max speed', 'maxSpeed', 3, 50, 0.5, 1);
    S('jump speed', 'jumpSpeed', 5, 45, 0.5, 1);
    S('double jump', 'doubleJumpSpeed', 5, 45, 0.5, 1);
    S('triple jump', 'tripleJumpSpeed', 5, 60, 0.5, 1);
    S('air control', 'airControl', 0, 2, 0.05);
    S('dash speed', 'dashSpeed', 5, 90, 1, 0);
    S('dash cooldown', 'dashCooldown', 0.05, 1, 0.01);
    S('ground friction', 'groundFriction', 0, 25, 0.5, 1);
    S('coyote time', 'coyoteTime', 0, 0.4, 0.01);
    S('jump buffer', 'jumpBufferTime', 0, 0.4, 0.01);
    S('pop jump', 'popJumpSpeed', 10, 50, 1, 0);
    S('max fall', 'maxFall', 10, 100, 1, 0);
  }

  private buildSkate(p: HTMLElement) {
    this.section(p, 'SKATE · HALF-PIPE');
    this.slider(p, 'skate gravity', () => this.ctx.skate?.gravity ?? 34, (v) => { if (this.ctx.skate) this.ctx.skate.gravity = v; }, 10, 70, 1, 0);
    this.slider(p, 'max speed', () => this.ctx.skate?.maxSpeed ?? 38, (v) => { if (this.ctx.skate) this.ctx.skate.maxSpeed = v; }, 10, 90, 1, 0);
    this.slider(p, 'carve power', () => this.ctx.skate?.carvePower ?? 30, (v) => { if (this.ctx.skate) this.ctx.skate.carvePower = v; }, 0, 80, 1, 0);
    this.slider(p, 'pump power', () => this.ctx.skate?.pumpPower ?? 26, (v) => { if (this.ctx.skate) this.ctx.skate.pumpPower = v; }, 0, 80, 1, 0);
    this.slider(p, 'spin speed', () => this.ctx.skate?.spinSpeed ?? 560, (v) => { if (this.ctx.skate) this.ctx.skate.spinSpeed = v; }, 100, 1400, 10, 0);
    this.slider(p, 'air-jump boost', () => this.ctx.skate?.airJumpBoost ?? 12, (v) => { if (this.ctx.skate) this.ctx.skate.airJumpBoost = v; }, 2, 30, 0.5, 1);
    this.slider(p, 'lip boost', () => this.ctx.skate?.lipBoost ?? 6, (v) => { if (this.ctx.skate) this.ctx.skate.lipBoost = v; }, 0, 25, 0.5, 1);
    this.slider(p, 'air drag', () => this.ctx.skate?.airDrag ?? 0.22, (v) => { if (this.ctx.skate) this.ctx.skate.airDrag = v; }, 0, 1, 0.01);
    this.slider(p, 'air control', () => this.ctx.skate?.airControl ?? 26, (v) => { if (this.ctx.skate) this.ctx.skate.airControl = v; }, 0, 80, 1, 0);
    this.slider(p, 'arcade assist', () => this.ctx.skate?.assist ?? 1, (v) => { if (this.ctx.skate) this.ctx.skate.assist = v; }, 0, 2, 0.05);
    this.slider(p, 'dash power', () => this.ctx.skate?.dashPower ?? 24, (v) => { if (this.ctx.skate) this.ctx.skate.dashPower = v; }, 5, 60, 1, 0);
    this.slider(p, 'jump scale', () => this.ctx.skate?.jumpScale ?? 0.45, (v) => { if (this.ctx.skate) this.ctx.skate.jumpScale = v; }, 0.1, 1.5, 0.05);
    this.slider(p, 'endless gravity', () => this.ctx.skate?.endlessGravity ?? 52, (v) => { if (this.ctx.skate) this.ctx.skate.endlessGravity = v; }, 20, 100, 1, 0);
  }

  private buildCamera(p: HTMLElement) {
    this.section(p, 'CAMERA');
    const cam = this.ctx.camera;
    this.slider(p, 'distance', () => cam.getDistance?.() ?? 30, (v) => cam.setDistance?.(v), 10, 70, 1, 0);
    this.slider(p, 'FOV', () => cam.getFov?.() ?? 0.92, (v) => cam.setFov?.(v), 0.3, 1.6, 0.01);
    const g = this.grid(p);
    this.button(g, '⬌ Shake', () => cam.shake(0.3, 10));
    this.button(g, '⊕ Punch', () => cam.punch(14, 0.2));
  }

  private buildWorld(p: HTMLElement) {
    this.section(p, 'WORLD · ATMOSPHERE');
    const sc = this.ctx.scene;
    this.slider(p, 'fog density', () => sc.fogDensity, (v) => { sc.fogDensity = v; }, 0, 0.03, 0.0005, 4);
    this.slider(p, 'glow intensity', () => this.ctx.glowLayer?.intensity ?? 0.45, (v) => { if (this.ctx.glowLayer) this.ctx.glowLayer.intensity = v; }, 0, 2, 0.01);
    this.slider(p, 'hemi light', () => this.ctx.hemi?.intensity ?? 1, (v) => { if (this.ctx.hemi) this.ctx.hemi.intensity = v; }, 0, 3, 0.01);
    const g = this.grid(p);
    this.button(g, '☀ Day clear', () => this.setClear(0.74, 0.82, 0.98));
    this.button(g, '☾ Night clear', () => this.setClear(0.04, 0.08, 0.13));
    this.button(g, '◆ Gold clear', () => this.setClear(0.1, 0.07, 0.02));
    this.button(g, '▣ Reset palette', () => this.ctx.buildWorld?.(this.ctx.realm));
  }

  private setClear(r: number, g: number, b: number) {
    this.ctx.scene.clearColor.set(r, g, b, 1);
    this.ctx.scene.fogColor.set(r, g, b);
  }

  private buildAudio(p: HTMLElement) {
    this.section(p, 'AUDIO');
    const g = this.grid(p);
    this.button(g, '♪ Toggle mute', () => this.ctx.audio.setMuted(!this.ctx.audio.isMuted));
    this.button(g, '♫ Groove on', () => this.ctx.audio.startGroove());
    this.button(g, '■ Groove off', () => this.ctx.audio.stopGroove());
  }

  private buildLive(p: HTMLElement) {
    this.section(p, 'LIVE READOUT');
    const box = document.createElement('div');
    box.className = 'dev-live';
    p.appendChild(box);
    const add = (label: string, fn: () => string) => {
      const row = document.createElement('div');
      const l = document.createElement('span'); l.textContent = label;
      const v = document.createElement('b'); v.textContent = '—';
      row.append(l, v); box.appendChild(row);
      this.readouts.push(fn); this.readoutEls.push(v);
    };
    const ctx = this.ctx;
    add('FPS', () => ctx.engine?.getFps?.().toFixed(0) ?? '—');
    add('realm', () => String(ctx.realm));
    add('meshes', () => String(ctx.scene?.meshes?.length ?? 0));
    add('player x/y', () => ctx.player ? `${ctx.player.position.x.toFixed(1)} / ${ctx.player.position.y.toFixed(1)}` : '—');
    add('player state', () => ctx.player?.state ?? '—');
    add('skate speed', () => ctx.skate ? `${Math.abs(ctx.skate.speed * 3.6) | 0} km/h` : '—');
    add('G-force', () => ctx.skate ? `${ctx.skate.gForce.toFixed(1)} G` : '—');
    add('trick', () => ctx.skate?.trickName || '—');
    add('combo', () => String(ctx.skate?.combo ?? 0));
    add('score', () => String((ctx.score ?? 0) + (ctx.skate?.score ?? 0)));
    add('coins', () => String(ctx.skate?.coinsCollected ?? 0));
  }

  // ---------------------------------------------------------------- runtime
  public toggle() {
    this.visible = !this.visible;
    this.root.classList.toggle('collapsed', !this.visible);
  }

  public refresh() { for (const f of this.refreshers) f(); }

  public update(dt: number) {
    this.refreshTimer += dt;
    if (this.refreshTimer > 0.35) { this.refreshTimer = 0; this.refresh(); }
    for (let i = 0; i < this.readouts.length; i++) {
      const txt = this.readouts[i]();
      if (this.readoutEls[i].textContent !== txt) this.readoutEls[i].textContent = txt;
    }
  }

  public dispose() { this.root.remove(); }
}
