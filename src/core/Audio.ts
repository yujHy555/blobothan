/**
 * Tiny procedural audio engine — no asset files, pure Web Audio bleeps.
 * Lazily creates AudioContext on first user gesture (autoplay policy).
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private paused = false;
  // Skate level: rolling wheel rumble + groovy bassline loop
  private rollSrc: AudioBufferSourceNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private grooveTimer: number | null = null;
  private grooveStep = 0;

  private ensure() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  public unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended' && !this.paused) ctx.resume();
  }
  public get isPaused() { return this.paused; }
  public setPaused(p: boolean) {
    this.paused = p;
    const ctx = this.ensure();
    if (!ctx) return;
    if (p) ctx.suspend(); else ctx.resume();
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }
  public get isMuted() { return this.muted; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start();
  }

  public jump() { this.tone(420, 0.16, 'square', 0.18, 720); }
  public doubleJump() { this.tone(620, 0.18, 'square', 0.2, 1050); }
  public tripleFlip() { this.tone(780, 0.3, 'sawtooth', 0.22, 1500); this.tone(1170, 0.3, 'square', 0.1, 2000); }
  /** HEAVY landing boom — sub-bass drop + filter-swept whump + punchy body. */
  public land(impact = 5) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const k = Math.min(1, Math.max(0, (impact - 3) / 12)); // 0..1 heaviness
    const now = ctx.currentTime;

    // 1) Sub-bass "BOOM" — deep sine that drops like a cannon
    const boom = ctx.createOscillator();
    const bg = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(150 + k * 45, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    bg.gain.setValueAtTime(0.0001, now);
    bg.gain.exponentialRampToValueAtTime(0.5 + k * 0.32, now + 0.012);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    boom.connect(bg); bg.connect(this.master);
    boom.start(now); boom.stop(now + 0.46);

    // 2) Punchy low-mid body
    this.tone(96 + k * 34, 0.2, 'triangle', 0.26 + k * 0.16, 44);

    // 3) Filter-swept noise "whump" — the airy impact tail that falls away
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1900, now);
    filt.frequency.exponentialRampToValueAtTime(170, now + 0.3);
    const ng = ctx.createGain();
    ng.gain.value = 0.16 + k * 0.2;
    src.connect(filt); filt.connect(ng); ng.connect(this.master);
    src.start(now);

    // 4) Crisp contact transient on the really hard slams
    if (k > 0.35) this.tone(210, 0.05, 'square', 0.09 * k, 90);
  }
  public bumper() { this.tone(880, 0.12, 'square', 0.2, 1320); this.tone(1320, 0.1, 'triangle', 0.1); }
  public spinner() { this.tone(540, 0.08, 'triangle', 0.14, 720); }
  public spore() { this.tone(920, 0.1, 'sine', 0.18, 1380); this.tone(1380, 0.12, 'sine', 0.1, 1840); }
  /** Sonic-style coin ping — pitch climbs with each coin in a chain. */
  public coin(combo = 0) {
    const step = Math.min(combo, 12);
    const base = 880 * Math.pow(2, step / 12); // rise a semitone per coin
    this.tone(base, 0.09, 'square', 0.16, base * 1.5);
    this.tone(base * 2, 0.07, 'sine', 0.08, base * 2.5);
  }
  public wunder() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.16), i * 60)); }
  public jetpack() { this.noise(0.5, 0.15, 1800); this.tone(300, 0.4, 'sawtooth', 0.12, 600); }
  public ragdoll() { this.noise(0.3, 0.3, 1200); this.tone(180, 0.3, 'sawtooth', 0.2, 80); }
  public portal() { this.tone(300, 0.6, 'sine', 0.2, 1200); this.tone(450, 0.6, 'triangle', 0.1, 900); }
  public splat() { this.noise(0.35, 0.35, 700); this.tone(90, 0.4, 'sawtooth', 0.2, 40); }
  public goal() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.18), i * 110)); }
  public death() { this.tone(300, 0.5, 'sawtooth', 0.2, 60); }
  public slide() { this.noise(0.25, 0.12, 2400); }
  // ---------------- SKATE LEVEL — groovy sounds ----------------
  /** Continuous wheel rumble, volume + brightness driven by speed. */
  public skateRoll(speed: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (!this.rollSrc) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      this.rollSrc = src; this.rollGain = g; this.rollFilter = filt;
    }
    const sp = Math.min(1, Math.abs(speed) / 45);
    if (this.rollGain) this.rollGain.gain.value = this.muted ? 0 : sp * 0.14;
    if (this.rollFilter) this.rollFilter.frequency.value = 480 + sp * 1900;
  }

  /** Funky 120-BPM bass + drums loop for the skate level. */
  public startGroove() {
    if (this.grooveTimer != null) return;
    const bass = [55, 55, 82.41, 55, 73.42, 73.42, 55, 98, 55, 55, 82.41, 110, 73.42, 55, 98, 82.41];
    this.grooveStep = 0;
    this.grooveTimer = window.setInterval(() => {
      if (!this.ctx || this.muted) return;
      const i = this.grooveStep++ % bass.length;
      this.tone(bass[i], 0.17, 'sawtooth', 0.13, bass[i] * 0.98);
      this.noise(0.035, 0.045, 6500); // hi-hat
      if (i % 4 === 0) this.tone(72, 0.13, 'sine', 0.2, 44); // kick
      if (i === 4 || i === 12) this.noise(0.12, 0.09, 1900); // snare
    }, 125);
  }

  public stopGroove() {
    if (this.grooveTimer != null) { clearInterval(this.grooveTimer); this.grooveTimer = null; }
    if (this.rollGain) this.rollGain.gain.value = 0;
  }

  // ---- JETPACK LEVEL (retro sci-fi) ----
  private jetSrc: AudioBufferSourceNode | null = null;
  private jetGain: GainNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  /** Continuous retro jetpack rumble — volume/brightness follow thrust. */
  public jetHum(thrust: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (!this.jetSrc) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 500; filt.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      this.jetSrc = src; this.jetGain = g; this.jetFilter = filt;
    }
    const t = Math.min(1, Math.max(0, thrust));
    if (this.jetGain) this.jetGain.gain.value = this.muted ? 0 : t * 0.22;
    if (this.jetFilter) this.jetFilter.frequency.value = 350 + t * 1400;
  }
  public stopJetHum() { if (this.jetGain) this.jetGain.gain.value = 0; }
  /** Phaser/gun shot — classic sci-fi pew. */
  public phaser() {
    this.tone(1600, 0.14, 'sawtooth', 0.16, 220);
    this.tone(2400, 0.1, 'square', 0.08, 400);
    this.noise(0.06, 0.05, 6000);
  }
  public boosterPickup() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.12, f * 1.2), i * 45));
  }
  public droneZap() { this.tone(900, 0.18, 'sawtooth', 0.12, 180); this.noise(0.1, 0.08, 3000); }
  public droneDown() {
    [660, 440, 220, 110].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.12, f * 0.6), i * 70));
    this.noise(0.4, 0.2, 1500);
  }

  public ollie() { this.tone(260, 0.09, 'square', 0.16, 640); this.noise(0.05, 0.1, 3000); }
  /** Rising charge tone while the handplant is held. */
  public handPlantCharge() { this.tone(180, 0.12, 'triangle', 0.1, 520); }
  /** Crackling sizzle for the golden flare while the handplant is held. */
  public sizzle() { this.noise(0.09, 0.07, 7200); this.tone(1800 + Math.random() * 900, 0.05, 'sine', 0.04); }
  /** Big golden pop when the handplant is released. */
  public handPlantPop() {
    this.tone(90, 0.35, 'sine', 0.24, 42);
    this.tone(440, 0.3, 'triangle', 0.16, 1320);
    this.tone(880, 0.25, 'sine', 0.1, 1760);
    this.noise(0.28, 0.18, 2400);
  }
  public trick() { this.tone(520, 0.12, 'triangle', 0.12, 1450); this.noise(0.1, 0.06, 5200); }
  public skateLand(g = 1) {
    this.tone(120, 0.2, 'sine', 0.2, 58);
    this.noise(0.14, Math.min(0.2, 0.08 + g * 0.03), 820);
    if (g > 2) this.tone(300, 0.26, 'triangle', 0.1, 640);
  }
  public bail() { this.noise(0.42, 0.24, 1200); this.tone(220, 0.4, 'sawtooth', 0.18, 55); }
  public gold() { this.tone(1320, 0.08, 'square', 0.12, 1980); this.tone(1980, 0.12, 'sine', 0.07, 2640); }

  /** Footstep — a soft, pitch-varied scuff for the third-person town. */
  public footstep(variation = 0) {
    this.noise(0.06, 0.07, 600 + variation * 120);
    this.tone(90 + variation * 18, 0.05, 'sine', 0.06, 60);
  }
  public start() { [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.16), i * 80)); }

  // ---- 8-bit menu music (pong/atari-style arpeggios) ----
  private menuTimer: number | null = null;
  private menuStep = 0;

  /** Classic chip melody — a looping square-wave arpeggio with a bassline. */
  public startMenuMusic() {
    this.unlock();
    if (this.menuTimer !== null) return;
    // iconic 8-bit pattern (A minor-ish arpeggio)
    const lead = [440, 523, 659, 523, 392, 523, 659, 784, 440, 523, 659, 880, 784, 659, 523, 392];
    const bass = [110, 110, 130, 130, 98, 98, 110, 110];
    const beat = 115; // ms — upbeat retro tempo
    this.menuTimer = window.setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.menuStep;
      this.tone(lead[i % lead.length], 0.1, 'square', 0.07);
      if (i % 2 === 0) this.tone(bass[(i / 2) % bass.length], 0.16, 'triangle', 0.09);
      // occasional high blip for arcade flavor
      if (i % 8 === 4) this.tone(1568, 0.05, 'square', 0.04);
      this.menuStep = (i + 1) % lead.length;
    }, beat);
  }

  public stopMenuMusic() {
    if (this.menuTimer !== null) {
      clearInterval(this.menuTimer);
      this.menuTimer = null;
    }
  }
}
