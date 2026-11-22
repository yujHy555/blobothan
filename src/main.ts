import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import { HavokWorld } from './core/HavokWorld';
import { Input } from './core/Input';
import { CameraRig } from './core/CameraRig';
import { Materials, REALMS } from './art/Materials';
import { Juice } from './juice/Juice';
import { BallPlayer } from './entities/BallPlayer';
import { RabbitEnemy } from './entities/RabbitEnemy';
import { Bumper, Spinner } from './entities/Pinball';
import { Portal } from './entities/Portal';
import { Sporelight, WunderDust } from './entities/Collectibles';
import { Jetpack } from './entities/Jetpack';
import { Audio } from './core/Audio';
import { Grapple } from './entities/Grapple';
import { Spring, Smasher, GrowthPickup } from './entities/LevelHazards';
import { GlowTiles } from './entities/GlowTiles';
import { Decorations } from './entities/Decorations';
import { MysteryLayer } from './entities/MysteryLayer';
import { ParallaxMaximus } from './entities/ParallaxMaximus';
import { CustomizationUI } from './core/CustomizationUI';
import { IBLLighting } from './core/IBLLighting';
import { WORLD } from './levels/world';
import { SkateSystem } from './entities/SkateSystem';
import { DevPanel } from './dev/DevPanel';
import { Cloud9 } from './entities/Cloud9';
import { MeteorField } from './entities/MeteorField';
import { FpsMonitor } from './core/FpsMonitor';
import { JetpackBackpack } from './entities/JetpackBackpack';
import { AirDrone } from './entities/AirDrone';
import { PhaserGun, PhaserPickup } from './entities/PhaserGun';
import { BoosterPack } from './entities/BoosterPack';
import { ForceField, ForceFieldPickup } from './entities/ForceField';

export class Game {
  private babylonCanvas: HTMLCanvasElement;
  private pixiCanvas: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private havok!: HavokWorld;
  private input!: Input;
  private camera!: CameraRig;
  private mats!: Materials;
  private juice!: Juice;
  private audio = new Audio();
  private customization!: CustomizationUI;
  private ibl!: IBLLighting;

  // Entities
  private player!: BallPlayer;
  private bumpers: Bumper[] = [];
  private spinners: Spinner[] = [];
  private portals: Portal[] = [];
  private goalMesh: BABYLON.Mesh | null = null;
  private goalPos: BABYLON.Vector3 | null = null;
  private spores: Sporelight[] = [];
  private dust: WunderDust[] = [];
  private jetpacks: Jetpack[] = [];
  private grapple!: Grapple;
  private grapplePrev = false;
  private grappleHintShown = false;

  // Epic level entities
  private springs: Spring[] = [];
  private smashers: Smasher[] = [];
  private growths: GrowthPickup[] = [];
  private glowTiles: GlowTiles[] = [];
  private decorations: Decorations | null = null;
  private mystery: MysteryLayer | null = null;
  private worldTime = 0;
  private rabbits: RabbitEnemy[] = [];

  // World state
  private fps!: FpsMonitor;
  private jetBackpack: JetpackBackpack | null = null;
  private drones: AirDrone[] = [];
  private phaser: PhaserGun | null = null;
  private phaserPickups: PhaserPickup[] = [];
  private boosters: BoosterPack[] = [];
  private jetLevel = false;
  private jetBoostLevel = 0;
  private forceField: ForceField | null = null;
  private forcePickups: ForceFieldPickup[] = [];
  private dev: DevPanel | null = null;
  private skate: SkateSystem | null = null;
  private cloud9: Cloud9 | null = null;
  private meteorField: MeteorField | null = null;
  private realm = 0;
  private score = 0;
  private coinCombo = 0;
  private coinComboTimer = 0;
  private flowCalloutTimer = 0;
  private specialZoomTimer = 0;
  private handPlantJuiceTimer = 0;
  private goldenSky = 0;
  private bumps = 0;
  private rabbitsFlat = 0;
  private deaths = 0;
  private gameOver = false;
  private won = false;
  private started = false;
  private lastTime = 0;
  private freezeTimer = 0;
  private footstepTimer = 0;
  private accumulator = 0;
  private fixedStep = 1 / 60;
  private portalCooldown = 0;

  // Lighting / ambience
  private hemi!: BABYLON.HemisphericLight;
  private glowLayer!: BABYLON.GlowLayer;
  private parallax: BABYLON.Mesh[] = [];
  private parallaxMax!: ParallaxMaximus;

  constructor(babylon: HTMLCanvasElement, pixi: HTMLCanvasElement) {
    this.babylonCanvas = babylon;
    this.pixiCanvas = pixi;
    this.init().catch((e) => this.showError(e));
  }

  private showError(e: any) {
    const overlay = document.getElementById('error');
    const msg = document.getElementById('error-msg');
    if (overlay) overlay.style.display = 'flex';
    if (msg) msg.textContent = e?.message || String(e);
    console.error('[Blobothan]', e);
  }

  /** Toggle true fullscreen on the F key (works anywhere, even on the menu). */
  private toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      (root.requestFullscreen?.({ navigationUI: 'hide' }) as any)?.catch?.(() => {});
    } else {
      (document.exitFullscreen?.() as any)?.catch?.(() => {});
    }
  }

  private bindFullscreenKey() {
    window.addEventListener('keydown', (e) => {
      // Ignore when typing in a field
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    });
  }

  private async init() {
    this.bindFullscreenKey();
    setLoading(10, 'Weaving the Glowgrove…');

    // --- Engine & scene ---
    this.engine = new BABYLON.Engine(this.babylonCanvas, true, {
      stencil: true, preserveDrawingBuffer: false, antialias: true,
    });
    // Logarithmic depth buffer — eliminates z-fighting across the whole scene
    this.scene = new BABYLON.Scene(this.engine, { useGeometryUniqueIdsMap: true });
    (this.scene as any).enableLogarithmicDepthBuffer?.(true);
    this.scene.clearColor = new BABYLON.Color4(0.04, 0.08, 0.13, 1);
    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.009;
    this.scene.fogColor = new BABYLON.Color3(0.04, 0.08, 0.13);

    this.hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.3, 1, 0.2), this.scene);
    this.hemi.intensity = 1.05;
    const glow = new BABYLON.GlowLayer('glow', this.scene);
    glow.intensity = 0.45;
    this.glowLayer = glow;

    setLoading(25, 'Awakening Havok physics…');
    this.havok = new HavokWorld(this.scene);
    await this.havok.init(-30);

    setLoading(45, 'Sprinkling wunder dust…');
    this.juice = new Juice();
    await this.juice.init(this.pixiCanvas);

    this.input = new Input();
    this.camera = new CameraRig(this.scene, this.babylonCanvas);
    this.mats = new Materials(this.scene);

    this.ibl = new IBLLighting(this.scene);
    this.grapple = new Grapple(this.scene, this.mats);
    this.grapple.onShoot = () => this.audio.spinner();
    this.grapple.onAttach = () => {
      const p = this.grapple.state.point;
      const s = this.toScreen(p);
      this.juice.ring(s.x, s.y, 0xff7fa8, 80);
      this.juice.wunderBurst(s.x, s.y, 8, 0xff9fd0);
      this.juice.floatText(s.x, s.y - 60, 'TONGUE LOCKED!', 0xff9fd0, 22);
      this.audio.bumper();
    };

    setLoading(70, 'Building enchanted lands…');
    this.buildWorld(0);

    this.wireUI();
    // DEV LAB — dev builds only, never shipped with the game. ` to toggle.
    const isDev = (import.meta as any).env?.DEV === true; // dev builds only — never in the shipped game
    if (isDev) this.dev = new DevPanel(this);
    this.lastTime = performance.now();

    setLoading(100, 'Ready');
    await delay(180);
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

    // Single unified loop: fixed-step physics + render
    this.fps = new FpsMonitor();
    this.engine.runRenderLoop(() => {
      try {
        const now = performance.now();
        let dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        this.fps.update(dt);
        if (!this.started || this.gameOver || this.won) {
          this.scene.render();
          this.juice.update(dt);
          this.dev?.update(dt);
          return;
        }
        // Hit-stop: brief freeze on big impacts for punchy AAA feel
        if (this.freezeTimer > 0) {
          this.freezeTimer -= dt;
        } else {
          this.accumulator += dt;
          let steps = 0;
          while (this.accumulator >= this.fixedStep && steps < 5) {
            this.step(this.fixedStep);
            this.accumulator -= this.fixedStep;
            steps++;
          }
        }
        this.scene.render();
        this.juice.update(dt);
        this.dev?.update(dt);
      } catch (e) {
        this.showError(e);
        this.engine.stopRenderLoop();
      }
    });
    window.addEventListener('resize', () => this.engine.resize());
  }

  // ---------------------------------------------------------------- world building
  private buildWorld(realm: number) {
    // Clear previous realm entities
    if (this.skate) { this.skate.dispose(); this.skate = null; }
    if (this.cloud9) { this.cloud9.dispose(); this.cloud9 = null; }
    if (this.meteorField) { this.meteorField.dispose(); this.meteorField = null; }
    this.audio.stopJetHum();
    if (this.jetBackpack) { this.jetBackpack.dispose(); this.jetBackpack = null; }
    for (const d of this.drones) d.dispose();
    this.drones = [];
    if (this.phaser) { this.phaser.dispose(); this.phaser = null; }
    for (const p of this.phaserPickups) p.dispose();
    this.phaserPickups = [];
    for (const b of this.boosters) b.dispose();
    this.boosters = [];
    if (this.forceField) { this.forceField.dispose(); this.forceField = null; }
    for (const f of this.forcePickups) f.dispose();
    this.forcePickups = [];
    this.jetLevel = false;
    this.jetBoostLevel = 0;
    if (this.player) {
      this.player.root.setEnabled(true);
      this.player.rig.gunAim = false;
    }
    this.audio.stopGroove();
    for (const b of this.bumpers) b.mesh.dispose();
    for (const s of this.spinners) s.mesh.dispose();
    for (const p of this.portals) p.mesh.dispose(false, true);
    for (const s of this.spores) s.mesh.dispose();
    for (const d of this.dust) d.mesh.dispose(false, true);
    for (const j of this.jetpacks) j.mesh.dispose(false, true);
    for (const r of this.rabbits) r.dispose();
    if (this.goalMesh) { this.goalMesh.dispose(false, true); this.goalMesh = null; }
    if (this.mystery) { this.mystery.dispose(); this.mystery = null; }
    if (this.decorations) { this.decorations.dispose(); this.decorations = null; }
    for (const s of this.springs) s.mesh.dispose(false, true);
    for (const sm of this.smashers) sm.mesh.dispose();
    for (const g of this.growths) g.mesh.dispose(false, true);
    for (const t of this.glowTiles) t.dispose();
    this.springs = []; this.smashers = []; this.growths = []; this.glowTiles = [];
    this.goalPos = null;
    // Copy the array first — disposing during forEach skips meshes, which left
    // old platforms intersecting later levels (e.g. through the skate ramp).
    this.scene.meshes.slice().forEach((m) => {
      if (m.name === 'platform' || m.name === 'parallax' || m.name === 'ridge' || m.name === 'starMote') {
        m.dispose(false, true);
      }
    });
    for (const m of this.parallax) { if (m && !m.isDisposed()) m.dispose(false, true); }
    this.parallax = [];
    this.bumpers = []; this.spinners = []; this.portals = [];
    this.spores = []; this.dust = []; this.rabbits = []; this.jetpacks = [];

    const def = WORLD[realm];
    const pal = REALMS[realm];

    // Apply palette
    this.scene.clearColor = new BABYLON.Color4(pal.clear[0], pal.clear[1], pal.clear[2], 1);
    this.scene.fogColor = new BABYLON.Color3(pal.clear[0], pal.clear[1], pal.clear[2]);
    this.scene.fogDensity = pal.fogDensity;
    if (this.glowLayer) this.glowLayer.intensity = realm === 1 ? 0.22 : 0.45;
    // HDRI/IBL look for the brutalist arena (lightweight IBL, no SSAO)
    if (this.ibl) this.ibl.apply(pal, realm === 1 ? 1.15 : 0.6);
    this.hemi.diffuse = new BABYLON.Color3(pal.hemi[0], pal.hemi[1], pal.hemi[2]);
    this.hemi.groundColor = new BABYLON.Color3(pal.clear[0], pal.clear[1], pal.clear[2]);
    const worldName = document.getElementById('world-name');
    const realmSub = document.getElementById('realm-sub');
    if (worldName) worldName.textContent = pal.name;
    if (realmSub) realmSub.textContent = pal.sub;

    // PARALLAX MAXIMUS — layered mountains, floating islands, celestial body.
    if (this.parallaxMax) { this.parallaxMax.dispose(); this.parallaxMax = null as any; }
    this.parallaxMax = new ParallaxMaximus(this.scene, this.mats, def.spawn.x, pal.clear, pal.ground, pal.accent);
    // Level 2: AAA meteor/comet shower streaking far behind the level
    if (realm === 1) this.meteorField = new MeteorField(this.scene, this.mats, def.spawn.x + 100, pal.accent);

    // Platforms — custom colliders (tight, deterministic; no Havok needed for the ball)
    const colliders = def.platforms.map((pd) => ({ x: pd.x, y: pd.y, z: pd.z, w: pd.w, h: pd.h, d: pd.d }));
    for (const pd of def.platforms) {
      const m = BABYLON.MeshBuilder.CreateBox('platform', { width: pd.w, height: pd.h, depth: pd.d }, this.scene);
      m.position.set(pd.x, pd.y, pd.z);
      m.name = 'platform';
      m.material = this.mats.platform(pal.ground);
      // Thin glowing top-edge border strips. Front/back strips are shortened
      // and side strips sit slightly higher so corners never overlap/z-fight.
      for (const sz of [-1, 1]) {
        const strip = BABYLON.MeshBuilder.CreateBox('platformRim', { width: Math.max(0.2, pd.w - 0.4), height: 0.08, depth: 0.16 }, this.scene);
        strip.parent = m;
        strip.position.set(0, pd.h / 2 + 0.06, sz * (pd.d / 2 - 0.1));
        strip.material = this.mats.glow('rim', pal.accent);
        strip.isPickable = false;
      }
      for (const sx of [-1, 1]) {
        const strip = BABYLON.MeshBuilder.CreateBox('platformRim', { width: 0.16, height: 0.08, depth: Math.max(0.2, pd.d - 0.4) }, this.scene);
        strip.parent = m;
        strip.position.set(sx * (pd.w / 2 - 0.1), pd.h / 2 + 0.075, 0);
        strip.material = this.mats.glow('rim', pal.accent);
        strip.isPickable = false;
      }
    }

    // Walls — tall obstacles that grapple / dash / crouch-pop must overcome
    for (const w of def.walls ?? []) {
      const m = BABYLON.MeshBuilder.CreateBox('platform', { width: w.w, height: w.h, depth: w.d }, this.scene);
      m.position.set(w.x, w.y, w.z);
      m.name = 'platform';
      m.material = this.mats.platform(pal.ground);
      colliders.push({ x: w.x, y: w.y, z: w.z, w: w.w, h: w.h, d: w.d });
      // glowing edge strips
      for (const sx of [-1, 1]) {
        const edge = BABYLON.MeshBuilder.CreateBox('wallEdge', { width: 0.14, height: w.h, depth: w.d }, this.scene);
        edge.parent = m;
        edge.position.x = sx * (w.w / 2 + 0.09); // clear of the wall surface
        edge.material = this.mats.glow('wallEdgeMat', pal.accent, 0.7);
        edge.isPickable = false;
      }
    }

    // Springs, timing smashers, growth pickups
    // Glowing responsive floor tiles (piano-key trail) on the start bank & growth plaza.
    // SKIP in the skate bowl — those green blocks would sit right in the ramp.
    if (realm !== 2) {
      const startTiles: number[] = [];
      for (let x = -9; x <= 9; x += 2) startTiles.push(x);
      this.glowTiles.push(new GlowTiles(this.scene, this.mats, startTiles, 2.70, 0, [0.1, 0.35, 0.28], [0.5, 1.0, 0.65]));
    }
    if (realm === 0) {
      const plazaTiles: number[] = [];
      for (let x = 92; x <= 104; x += 2) plazaTiles.push(x);
      this.glowTiles.push(new GlowTiles(this.scene, this.mats, plazaTiles, 7.70, 0, [0.15, 0.3, 0.18], [0.7, 1.0, 0.4]));
    }

    for (const s of def.springs ?? []) this.springs.push(new Spring(this.scene, this.mats, s.x, s.y, s.z, s.power));
    for (const sm of def.smashers ?? []) this.smashers.push(new Smasher(this.scene, this.mats, sm.x, sm.y, sm.z, sm.w, sm.h, sm.d, sm.period, sm.phase, sm.travel));
    for (const g of def.growths ?? []) this.growths.push(new GrowthPickup(this.scene, this.mats, g.x, g.y, g.z));

    // Bumpers
    for (const bd of def.bumpers) this.bumpers.push(new Bumper(this.scene, this.mats, bd, pal.accent));
    for (const sd of def.spinners) this.spinners.push(new Spinner(this.scene, this.mats, sd.x, sd.y, sd.z, pal.accent));

    // Portals
    for (const pd of def.portals) this.portals.push(new Portal(this.scene, this.mats, { x: pd.x, y: pd.y, z: pd.z, targetRealm: pd.target }, pal.accent));

    // Goal (final realm) — a radiant crown portal
    if (def.goal) {
      const g = def.goal;
      this.goalPos = new BABYLON.Vector3(g.x, g.y, g.z);
      this.goalMesh = BABYLON.MeshBuilder.CreateTorus('goal', { diameter: 3.4, thickness: 0.35, tessellation: 36 }, this.scene);
      this.goalMesh.position = this.goalPos.clone();
      this.goalMesh.rotation.x = Math.PI / 2; // face the side-scroll camera
      this.goalMesh.material = this.mats.glow('goalMat', [1.0, 0.85, 0.4]);
      this.goalMesh.renderingGroupId = 1;
      // Smaller disc fits inside the ring's hole (r 1.525) — no intersection
      const inner = BABYLON.MeshBuilder.CreateDisc('goalCore', { radius: 1.4, tessellation: 36 }, this.scene);
      inner.parent = this.goalMesh;
      inner.material = this.mats.glow('goalCoreMat', [1.0, 0.95, 0.7], 0.5);
      inner.renderingGroupId = 1;
      const light = new BABYLON.PointLight('goalLight', BABYLON.Vector3.Zero(), this.scene);
      light.parent = this.goalMesh;
      light.diffuse = new BABYLON.Color3(1, 0.9, 0.5);
      light.intensity = 1.2;
      light.range = 18;
    }

    // Collectibles
    for (const s of def.sporelights) this.spores.push(new Sporelight(this.scene, this.mats, s.x, s.y, s.z, pal.accent));
    for (const d of def.wunderDust) this.dust.push(new WunderDust(this.scene, this.mats, d.x, d.y, d.z));
    for (const j of def.jetpacks ?? []) this.jetpacks.push(new Jetpack(this.scene, this.mats, j.x, j.y, j.z));

    // GRAPPLE SHOWCASE marker — a glowing target ring on the anchor pillar + hint text
    if (realm === 0) {
      const marker = BABYLON.MeshBuilder.CreateTorus('showcaseMarker', { diameter: 2.6, thickness: 0.2, tessellation: 24 }, this.scene);
      marker.rotation.x = Math.PI / 2; // face camera instead of lying flat in the pillar
      marker.position.set(44, 17, -3.6); // clear of the pillar front face (z=-3)
      marker.material = this.mats.glow('showcaseMarkerMat', [1.0, 0.45, 0.7]);
      marker.renderingGroupId = 1;
      (marker as any).showcase = true;
      this.parallax.push(marker);
    }

    // Both platforming levels are classic 2.5D side-scrollers
    this.camera.setSkateMode(false);
    this.camera.setDistance(30);
    this.specialZoomTimer = 0;
    this.camera.thirdPerson = false;
    this.camera.isometric = false;
    this.input.isThirdPerson = false;
    if (this.player) this.player.thirdPerson = false;

    // Atmosphere: mystery runes + flora in every level
    const decoSpots = def.platforms.slice(0, 10).map((p) => ({ x: p.x + (p.w / 2 - 0.6), y: p.y + p.h / 2, z: p.z - 1.5 }));
    this.decorations = new Decorations(this.scene, this.mats, decoSpots, pal.accent);
    this.mystery = new MysteryLayer(this.scene, this.mats, def.spawn.x + 40, pal.accent);
    this.juice.ambientEnabled = true;

    // Rabbit ragdolls
    for (const r of def.rabbits) this.rabbits.push(new RabbitEnemy(this.scene, this.havok, this.mats, new BABYLON.Vector3(r.x, r.y + 2, r.z)));

    // Player
    if (!this.player) {
      this.player = new BallPlayer(this.scene, this.mats, new BABYLON.Vector3(def.spawn.x, def.spawn.y, def.spawn.z));
      if (this.customization) this.customization.setPlayer(this.player);
      this.player.onLand = (impact) => {
        if (impact > 3) {
          const s = this.toScreen(this.player.position);
          this.camera.shake(0.12, Math.min(4, impact * 0.2));
          this.juice.ring(s.x, s.y, 0x9fffe0, 40 + impact * 3);
          this.juice.wunderBurst(s.x, s.y, Math.min(16, 4 + impact | 0));
          this.audio.land(impact);
          if (impact > 9) { this.juice.discoSplat(s.x, s.y, 0xff7fd0); this.audio.splat(); this.hitStop(0.05); }
        }
      };
      this.player.onJump = (level: number) => {
        const s = this.toScreen(this.player.position);
        if (level === 3) {
          // Special moment — keep a burst, but lighter than before
          this.juice.radialBurst(s.x, s.y, 0xffd86b, 16);
          this.juice.floatText(s.x, s.y - 130, 'TRIPLE FLIP!', 0xffd86b, 34);
          this.camera.shake(0.2, 8);
          this.camera.punch(14, 0.24);
          this.audio.tripleFlip();
        } else if (level === 2) {
          this.juice.floatText(s.x, s.y - 110, 'DOUBLE JUMP!', 0xff9fd0, 26);
          this.audio.doubleJump();
        } else {
          this.audio.jump(); // minimal — no particle spam on a normal jump
        }
      };
      this.player.onJet = (x, y) => {
        const s = this.toScreen(new BABYLON.Vector3(x, y, 0));
        this.juice.wunderBurst(s.x, s.y, 3, 0xffaa55);
      };
      this.player.onSling = (speed) => {
        // Fire speed-line juice during a fast sling (throttled by caller)
        const s = this.toScreen(this.player.position);
        this.juice.speedStreak(s.x, s.y, Math.sign(this.player.velocity.x), 0xff9fd0);
      };
      this.player.onPopJump = () => {
        const s = this.toScreen(this.player.position);
        this.juice.radialBurst(s.x, s.y, 0xffd86b, 12);
        this.juice.floatText(s.x, s.y - 120, 'POP JUMP!', 0xffd86b, 30);
        this.audio.tripleFlip();
        this.camera.punch(12, 0.2);
      };
    } else {
      this.player.teleport(new BABYLON.Vector3(def.spawn.x, def.spawn.y, def.spawn.z));
    }
    this.player.setColliders(colliders);
    this.player.thirdPerson = false;
    if (this.grapple) this.grapple.setColliders(colliders);

    // ---- LEVEL 2: RETRO JETPACK LEVEL ----
    if (realm === 1) {
      this.jetLevel = true;
      this.player.hasJetpack = true;
      this.player.jetFuel = 1;
      this.player.jetThrust = 46;
      // Retro wearable jetpack with live particle thrusters
      this.jetBackpack = new JetpackBackpack(this.scene, this.mats, this.player.characterPivot);
      this.jetBackpack.equip();
      // Phaser gun system (fire with G / I / RT) — mounted on the hand glove
      this.phaser = new PhaserGun(this.scene, this.havok, this.mats,
        this.player.rig.rightHand ?? this.player.characterPivot);
      this.phaser.onShoot = (px, py, dir) => {
        this.audio.phaser();
        const s = this.toScreen(new BABYLON.Vector3(px, py, 0));
        this.juice.radialBurst(s.x, s.y, 0x7fffe0, 8);
        this.camera.punch(3, 0.05);
      };
      this.phaser.onHit = (pts, hx, hy) => {
        this.score += pts;
        const s = this.toScreen(new BABYLON.Vector3(hx, hy, 0));
        this.juice.floatText(s.x, s.y, `+${pts}`, 0x7fffe0);
        this.updateHUD();
      };
      this.phaser.onEmpty = () => this.juice.floatText(
        this.juice.getScreen().width / 2, 120, 'OUT OF AMMO!', 0xff9fd0, 22);
      this.phaser.setColliders(colliders);
      // Booster packs scattered through the level
      const boostSpots = [{ x: 28, y: 12, z: 0 }, { x: 62, y: 12, z: 0 },
        { x: 108, y: 12, z: 0 }, { x: 146, y: 13, z: 0 }, { x: 184, y: 24, z: 0 }];
      for (const b of boostSpots) this.boosters.push(new BoosterPack(this.scene, this.mats, b.x, b.y, b.z));
      // Force-field pickups (protect from drone bolts)
      this.forceField = new ForceField(this.scene, this.mats, this.player.characterPivot);
      this.forceField.onAbsorb = (hx, hy) => {
        this.audio.boosterPickup();
        const s = this.toScreen(new BABYLON.Vector3(hx, hy, 0));
        this.juice.ring(s.x, s.y, 0x7fffe0, 90);
        this.juice.floatText(s.x, s.y, 'BLOCKED!', 0x7fffe0, 22);
      };
      this.forceField.onExpire = () => {
        this.juice.floatText(this.juice.getScreen().width / 2, 160, 'SHIELD DOWN!', 0xff9fd0, 22);
      };
      this.forcePickups.push(new ForceFieldPickup(this.scene, this.mats, 62, 13, 0));
      this.forcePickups.push(new ForceFieldPickup(this.scene, this.mats, 168, 18, 0));
      // Phaser pickups
      this.phaserPickups.push(new PhaserPickup(this.scene, this.mats, 40, 14, 0));
      this.phaserPickups.push(new PhaserPickup(this.scene, this.mats, 126, 12, 0));
      // Air drone spawns LATER — only after the player has collected a phaser
      // (see stepJetLevel). No drone until you're armed.
      this.juice.floatText(this.juice.getScreen().width / 2, 170,
        'JETPACK ONLINE — SPACE to fly · G to fire · grab BOOSTER PACKS!', 0x7fffe0, 22);
    }

    this.camera.snap(def.spawn.x, def.spawn.y);

    // SKATING LEVELS — hide the rolling ball; the skater has its own rig.
    if (realm >= 2) {
      this.player.root.setEnabled(false);
      this.camera.setSkateMode(realm === 3); // level 4 = continuous tracking + trick zoom
      this.camera.resetYaw(); // lock a clean side-view — no leftover orbit from platform levels
      this.skate = new SkateSystem(this.scene, this.mats, {
        onOllie: () => {
          this.audio.ollie();
          const s = this.toScreen(this.skate!.position);
          this.juice.ring(s.x, s.y, 0xffd45b, 80);
          this.juice.callout(s.x, s.y - 130, 'OLLIE!', 0xffd45b, 34);
        },
        onTrick: (name, points, wx, wy) => {
          this.audio.trick();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.callout(s.x, s.y - 60, `${name} +${points}`, 0xff8fd0, 30);
          this.juice.wunderBurst(s.x, s.y, 12, 0xffd45b);
          this.camera.punch(5, 0.08);
        },
        onCombo: (combo, points, wx, wy) => {
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.setCombo(combo);
          this.juice.callout(s.x, s.y - 110, `${combo}x COMBO! +${points}`, 0xffd45b, 40);
          this.juice.megaBurst(s.x, s.y, 0xffd45b);
          this.audio.skateLand(combo);
          this.camera.shake(0.2, 7);
          this.hitStop(0.03);
        },
        onLand: (g, wx, wy) => {
          this.audio.skateLand(g);
          const s = this.toScreen(new BABYLON.Vector3(wx, wy - 1, 0));
          this.juice.ring(s.x, s.y, 0xffd45b, 50 + g * 12);
          this.juice.radialBurst(s.x, s.y, 0xffe27a, Math.min(20, 6 + g * 3));
          if (g > 2) {
            this.juice.callout(s.x, s.y - 60, `G-FORCE ${g.toFixed(1)}`, 0xff6fb5, 28);
            this.camera.punch(g * 2, 0.12);
            this.hitStop(0.02);
          }
        },
        onBail: (wx, wy) => {
          this.audio.bail();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.callout(s.x, s.y - 60, 'BAIL!', 0xff5f6f, 36);
          this.juice.discoSplat(s.x, s.y, 0xff5f6f);
          this.camera.shake(0.3, 10);
        },
        onCarve: (wx, wy, dir) => {
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.speedStreak(s.x, s.y, dir, 0xffd45b);
          this.juice.wunderBurst(s.x, s.y, 2, 0xffd45b);
        },
        onFlow: (wx, wy, dir, speed) => {
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          const f = this.fxPos(wx, wy, -40);
          this.juice.speedStreak(f.x, f.y, dir, 0xffe27a);
          if (speed > 28 && this.flowCalloutTimer <= 0) {
            this.flowCalloutTimer = 1.6;
            this.juice.callout(s.x, s.y - 130, 'FLOW!', 0xffe27a, 30);
          }
        },
        onGold: (wx, wy) => {
          this.audio.gold();
          this.score += 150;
          this.skate!.score += 150;
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.floatText(s.x, s.y - 30, '+150', 0xffd45b);
          this.updateHUD();
        },
        onHandPlantCharge: (charge, wx, wy) => {
          if (this.handPlantJuiceTimer > 0) return;
          this.handPlantJuiceTimer = 0.14;
          const f = this.fxPos(wx, wy, -110);
          this.juice.wunderBurst(f.x, f.y, 2 + Math.floor(charge * 2), 0xffd45b);
          this.audio.handPlantCharge();
          this.audio.sizzle();
        },
        onOlliePop: (wx, wy, power) => {
          this.audio.ollie();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          const f = this.fxPos(wx, wy, -70);
          this.juice.ring(f.x, f.y, 0xffd45b, 50 + power);
          if (power > 22) this.juice.callout(s.x, s.y - 110, 'POP!', 0xffd45b, 32);
        },
        onKickFlip: (wx, wy) => {
          this.audio.trick();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          const f = this.fxPos(wx, wy, -110);
          this.juice.callout(s.x, s.y - 130, 'KICKFLIP!', 0x9fffe0, 38);
          this.juice.radialBurst(f.x, f.y, 0x9fffe0, 8);
        },
        // No wipeouts / no respawns / no restarts — gaps use an arcade save
        // bounce instead so the run NEVER ends abruptly.
        onSave: (wx, wy) => {
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.callout(s.x, s.y - 90, 'SAVE!', 0x9fffe0, 30);
          this.audio.spinner();
        },
        onGapWarning: (wx, wy) => {
          const s = this.skateTextPos(this.toScreen(new BABYLON.Vector3(wx, wy, 0)));
          this.juice.callout(s.x, s.y - 55, 'GAP! JUMP!', 0xff8fd0, 30);
          this.audio.spinner();
        },
        onGrabStart: (wx, wy) => {
          this.audio.trick();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.callout(s.x, s.y - 110, 'AIR GRAB!', 0x9fffe0, 32);
        },
        onHandPlantStart: (wx, wy) => {
          if (wx < -900) {
            const s = this.skateTextPos(this.toScreen(this.skate!.position));
            this.juice.floatText(s.x, s.y - 30, 'RIDING UP — HOLD K TO PLANT!', 0xff8fd0, 24);
          } else {
            this.audio.trick();
            const f = this.fxPos(wx, wy, -120);
            this.juice.sunFlare(f.x, f.y, 1.6);       // golden-hour sun flare, away from skater
            this.juice.ring(f.x, f.y, 0xffd45b, 90);
          }
        },
        onHandPlant: (power, wx, wy) => {
          this.audio.handPlantPop();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          const f = this.fxPos(wx, wy, -130);
          this.juice.callout(s.x, s.y - 160, 'HAND PLANT!!', 0xffd45b, 52);
          this.juice.radialBurst(f.x, f.y, 0xffd45b, 12);
          this.juice.floatText(s.x, s.y - 210, `+${Math.round(600 + power * 800)}`, 0xffd45b, 30);
        },
        onSpeedBoost: (boost, wx, wy) => {
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          if (this.flowCalloutTimer <= 0) {
            this.flowCalloutTimer = 1.2;
            this.juice.callout(s.x, s.y - 120, `SPEED +${Math.round(boost)}`, 0x9fffe0, 28);
          }
        },
        onGForce: (g, wx, wy) => {
          if (g < 3) return; // only BIG G moments get juice
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          this.juice.callout(s.x, s.y - 130, `${g.toFixed(1)} G!`, 0xff6fb5, 28);
          this.audio.skateLand(g);
        },
        onDash: (wx, wy, dir) => {
          this.audio.jetpack();
          const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
          const f = this.fxPos(wx, wy, -60);
          this.juice.callout(s.x, s.y - 120, 'DASH!', 0x9fffe0, 32);
          this.juice.speedStreak(f.x, f.y, dir, 0x9fffe0);
        },
      }, realm === 3
        ? { halfW: 70, bottom: 2, height: 22, depth: 12, spawnX: 0, preserveMomentum: true, jumpScale: 0.8, endless: true }
        : undefined);
      this.audio.startGroove();
      const sc = this.juice.getScreen();
      this.juice.floatText(sc.width / 2, sc.height / 2 + 160,
        'SPACE jump · SPACE TRICK · SPACE BONUS · J dash · Q/E spin · S grab', 0x9fffe0, 20);
      this.juice.floatText(sc.width / 2, sc.height / 2 + 200,
        '★ YELLOW BAR COMBO: ride UP the ramp, hold K to grab the bar, RELEASE to pop off', 0xff8fd0, 20);
      this.juice.floatText(sc.width / 2, sc.height / 2 + 240,
        'GAMEPAD: A jump/trick · X dash · Y hand plant · B grab · LB/RB spin', 0x9fffe0, 18);
    }
  }

  // ---------------------------------------------------------------- simulation step
  private step(dt: number) {
    this.input.update(dt);
    if (this.transitioning) return;
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    this.worldTime += dt;
    if (this.skate) { this.stepSkate(dt); return; }
    if (this.mystery) this.mystery.update(dt);
    if (this.decorations) this.decorations.update(dt);

    // Glowing floor tiles light up as the ball rolls over
    for (const t of this.glowTiles) t.update(dt, this.player.position);

    // Springs / smashers / growths
    for (const s of this.springs) {
      s.update(dt);
      if (s.tryBounce(this.player.position, this.player.velocity, this.player.radius * this.player.growScale)) {
        this.audio.bumper();
        this.camera.punch(8, 0.12);
        this.hitStop(0.02);
        const sc = this.toScreen(s.pos);
        this.juice.ring(sc.x, sc.y, 0x9fffe0, 110);
        this.juice.radialBurst(sc.x, sc.y, 0xbfffe8, 14);
        this.juice.callout(sc.x, sc.y - 105, 'BOING!', 0x9fffe0, 32);
      }
    }
    for (const sm of this.smashers) {
      sm.update(dt, this.worldTime);
      if (sm.overlaps(this.player.position, this.player.radius * this.player.growScale)) {
        if (this.player.isGrown) {
          // Grown ball smashes through the smasher — send it flying, score it
          sm.mesh.position.y += 100; // knock aside visually
          this.score += 150;
          this.audio.splat();
          this.camera.shake(0.35, 12);
          this.hitStop(0.05);
          const sc = this.toScreen(sm.pos);
          this.juice.discoSplat(sc.x, sc.y, 0xff9fd0);
          this.juice.radialBurst(sc.x, sc.y, 0xff9fd0, 22);
          this.juice.screenFlash(0xff9fd0, 0.2);
          this.juice.callout(sc.x, sc.y - 110, 'SMASH! +150', 0xff9fd0, 34);
          this.updateHUD();
        } else {
          this.die();
        }
      }
    }
    for (const g of this.growths) {
      g.update(dt);
      if (!g.collected && BABYLON.Vector3.Distance(g.pos, this.player.position) < 2.0) {
        g.collect();
        this.player.grow(2);
        this.score += 150;
        this.audio.wunder();
        this.camera.punch(12, 0.22);
        this.hitStop(0.03);
        const sc = this.toScreen(g.pos);
        this.juice.ring(sc.x, sc.y, 0x9fffe0, 160);
        this.juice.radialBurst(sc.x, sc.y, 0x9fffe0, 20);
        this.juice.screenFlash(0x9fffe0, 0.16);
        this.juice.callout(sc.x, sc.y - 110, 'GROW! +150', 0x9fffe0, 36);
        this.updateHUD();
      }
    }

    const pos = this.player.position;
    const vel = this.player.velocity;
    this.player.camHeading = this.camera.getHeading();

    // Grapple showcase hint — teach the mechanic when entering the chasm
    if (!this.grappleHintShown && this.realm === 0 && pos.x > 33 && pos.x < 40 && pos.y > 6) {
      this.grappleHintShown = true;
      const s = this.toScreen(new BABYLON.Vector3(44, 17, 0));
      this.juice.floatText(s.x, s.y, 'PRESS K TO TONGUE-SLING!', 0xff9fd0, 30);
      this.audio.spore();
    }

    // Grapple: K / gamepad Y fires/reels the chameleon tongue toward aim
    const grappleHeld = this.input.state.grapple;
    if (grappleHeld && !this.grapplePrev) {
      if (this.player.grappleAttached) {
        // Release with a sling boost
        this.player.detachGrapple(true);
        this.grapple.release();
        this.audio.bumper();
        const s = this.toScreen(this.player.position);
        this.juice.floatText(s.x, s.y - 110, 'SLING!', 0xff9fd0, 28);
      } else {
        const aim = new BABYLON.Vector3(this.input.state.axisX || this.player.facingDir, 0.55, 0).normalize();
        if (this.grapple.fire(pos, aim)) {
          this.player.attachGrapple(this.grapple.state.point, this.grapple.state.length);
        }
      }
    }
    this.grapplePrev = grappleHeld;
    this.player.grappleReel = grappleHeld ? 1 : 0;

    // Super long legs toggle
    if (this.input.state.longLegsPressed) {
      this.player.toggleLongLegs();
      const s = this.toScreen(this.player.position);
      this.juice.floatText(s.x, s.y - 100, this.player.longLegs ? 'LONG LEGS!' : 'NORMAL!', 0x9fffe0, 26);
      this.audio.wunder();
    }

    this.player.update(dt, this.input.state);

    // Keep the visual tongue drawn to the anchor
    if (this.player.grappleAttached && this.grapple.state.attached) {
      this.grapple.drawTongue(this.player.position, this.grapple.state.point, this.player.grappleLen);
    }

    // Footsteps synced to movement speed
    if (this.player.isGrounded) {
      const speed = Math.hypot(vel.x, vel.z);
      if (speed > 1.5) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          this.footstepTimer = 0.26 - Math.min(0.1, speed * 0.008);
          this.audio.footstep(Math.floor(Math.random() * 3));
        }
      } else {
        this.footstepTimer = 0;
      }
    }

    // Slide trail + dash juice
    if (this.input.state.slide && this.player.isGrounded && Math.abs(vel.x) > 4) {
      const s = this.toScreen(pos);
      this.juice.slideTrail(s.x, s.y, Math.sign(vel.x));
    }
    if (!this.player.onDash) {
      this.player.onDash = () => {
        const s = this.toScreen(this.player.position);
        this.juice.ring(s.x, s.y, 0x66ccff, 140);
        this.juice.radialBurst(s.x, s.y, 0xffffff, 18);
        this.juice.wunderBurst(s.x, s.y, 18, 0x9fffe0);
        this.juice.floatText(s.x, s.y - 120, 'DASH!', 0x9fffe0, 28);
        this.audio.jetpack();
        this.camera.punch(10, 0.16);
        this.hitStop(0.04);
      };
      this.player.onDashTrail = (x, y, dir) => {
        // Lightweight streak every frame — save the sparkle bursts for the pop
        if (Math.random() < 0.35) {
          const s = this.toScreen(new BABYLON.Vector3(x, y, 0));
          this.juice.speedStreak(s.x, s.y, dir, 0x9fffe0);
        }
      };
    }

    // Rabbits
    for (const r of this.rabbits) {
      r.setTarget(pos);
      r.update(dt);
    }

    // Pinball elements
    for (const b of this.bumpers) {
      b.update(dt);
      if (b.tryHit(this.player.position, vel)) {
        this.bumps++;
        this.score += 50;
        this.camera.shake(0.14, 5);
        this.audio.bumper();
        const s = this.toScreen(b.pos);
        this.juice.ring(s.x, s.y, 0x9fffe0, 120);
        this.juice.wunderBurst(s.x, s.y, 22, 0xffffff);
        this.juice.floatText(s.x, s.y - 100, '+50', 0x9fffe0);
        this.player.wobbleKick(1.2);
        this.updateHUD();
      }
    }
    for (const s of this.spinners) {
      s.update(dt);
      if (s.tryHit(this.player.position, vel)) {
        this.bumps++;
        this.score += 35;
        this.audio.spinner();
        const sc = this.toScreen(s.pos);
        this.juice.floatText(sc.x, sc.y - 100, '+35', 0xbfe0ff);
        this.updateHUD();
      }
    }

    // Collectibles — SONIC-STYLE COIN CHAIN
    if (this.coinComboTimer > 0) this.coinComboTimer -= dt;
    else if (this.coinCombo !== 0) { this.coinCombo = 0; this.juice.setCombo(0); }
    for (const sp of this.spores) {
      sp.update(dt);
      if (!sp.collected && BABYLON.Vector3.Distance(sp.mesh.position, pos) < 1.6) {
        sp.collect();
        this.score += 100;
        // Rising ping chain: pitch climbs the faster you hoover them up
        this.coinCombo = this.coinComboTimer > 0 ? this.coinCombo + 1 : 1;
        this.coinComboTimer = 1.35;
        this.audio.coin(this.coinCombo - 1);
        const s = this.toScreen(sp.pos);
        this.juice.coinPop(s.x, s.y);              // flipping gold coin (always)
        this.juice.setCombo(this.coinCombo);
        if (this.coinCombo >= 3) {
          // Big particle bursts SAVED for special chain moments only
          this.juice.ring(s.x, s.y, 0xffd45b, 52);
          this.juice.wunderBurst(s.x, s.y, 12, 0xffd45b);
          // Escalating arcade callouts the longer the chain runs
          const words = ['', '', '', 'NICE!', 'SWEET!', 'AWESOME!', 'GODLIKE!', 'UNREAL!!'];
          const word = words[Math.min(this.coinCombo, words.length - 1)];
          this.juice.callout(s.x, s.y - 52, word, this.coinCombo >= 6 ? 0xff6fb5 : 0xffd45b, 30);
          this.juice.radialBurst(s.x, s.y, 0xffe27a, 10 + this.coinCombo * 2);
          if (this.coinCombo % 5 === 0) this.juice.screenFlash(0xffd45b, 0.18);
          this.camera.punch(2 + this.coinCombo * 0.4, 0.06);
          this.hitStop(0.018);
        } else {
          this.juice.floatText(s.x, s.y, '+100', 0xffd45b);
          this.camera.punch(1.6, 0.06);
        }
        this.updateHUD();
      }
    }
    for (const d of this.dust) {
      d.update(dt);
      if (!d.collected && BABYLON.Vector3.Distance(d.pos, pos) < 1.9) {
        d.collect();
        this.score += 250;
        // Wunder Dust: speed boost + big wobble + golden burst
        const v = this.player.velocity;
        v.x *= 1.8;
        v.y = Math.max(v.y, 10);
        this.player.wobbleKick(2.4);
        this.camera.shake(0.3, 7);
        this.audio.wunder();
        this.juice.screenFlash(0xffe6a0, 0.3);
        const s = this.toScreen(d.pos);
        this.juice.ring(s.x, s.y, 0xffd86b, 160);
        this.juice.wunderBurst(s.x, s.y, 40, 0xffd86b);
        this.juice.floatText(s.x, s.y, 'WUNDER! +250', 0xffd86b, 32);
        this.updateHUD();
      }
    }

    // Jetpack pickup — grants flight fuel
    for (const j of this.jetpacks) {
      j.update(dt);
      if (!j.collected && BABYLON.Vector3.Distance(j.pos, pos) < 2.0) {
        j.collect();
        this.player.hasJetpack = true;
        this.player.jetFuel = 1;
        this.score += 200;
        this.camera.shake(0.2, 6);
        this.audio.jetpack();
        this.juice.screenFlash(0x66ccff, 0.3);
        const s = this.toScreen(j.pos);
        this.juice.ring(s.x, s.y, 0x66ccff, 150);
        this.juice.wunderBurst(s.x, s.y, 30, 0x66ccff);
        this.juice.floatText(s.x, s.y - 90, 'JETPACK! +200', 0x66ccff, 32);
        this.updateHUD();
      }
    }

    // ---- JETPACK LEVEL UPDATE ----
    if (this.jetLevel) this.stepJetLevel(dt);

    // Rabbit flatten (stomp into ragdoll)
    for (const r of this.rabbits) {
      if (!r.alive) continue;
      if (BABYLON.Vector3.Distance(r.torsoPosition, pos) < 2.0) {
        r.flatten(pos);
        this.rabbitsFlat++;
        this.score += 300;
        this.camera.shake(0.35, 9);
        this.camera.punch(16, 0.28);
        this.audio.ragdoll();
        this.hitStop(0.09);
        this.juice.screenFlash(0xff9fd0, 0.25);
        const s = this.toScreen(r.torsoPosition);
        this.juice.discoSplat(s.x, s.y, 0xff7fd0);
        this.juice.floatText(s.x, s.y, 'RAGDOLL! +300', 0xff9fd0, 30);
        this.player.wobbleKick(1.8);
        this.updateHUD();
      }
    }

    // Portals
    for (const p of this.portals) {
      p.update(dt);
      if (this.portalCooldown <= 0 && p.tryEnter(pos)) {
        this.enterPortal(p.targetRealm);
        break;
      }
    }

    // Goal detection (final realm)
    if (this.goalMesh && this.goalPos && BABYLON.Vector3.Distance(pos, this.goalPos) < 2.2) {
      this.win();
    }
    if (this.goalMesh) {
      this.goalMesh.rotation.z += dt * 1.2;
      this.goalMesh.rotation.y += dt * 0.6;
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.08;
      this.goalMesh.scaling.set(pulse, pulse, 1);
    }

    // Speed streaks
    if (Math.abs(vel.x) > 12 && Math.random() < 0.5) {
      const s = this.toScreen(pos);
      this.juice.speedStreak(s.x, s.y, Math.sign(vel.x));
    }

    // Death by falling
    if (pos.y < -25) this.die();

    // Camera — fixed side-scroll follow; scene rotation is disabled everywhere
    this.camera.update(dt, pos.x, pos.y, vel.x, vel.y, this.player.isGrounded, 0, 0, pos.z);
    const camX = this.camera.getPosition().x;
    const spawnX = WORLD[this.realm].spawn.x;
    if (this.parallaxMax) {
      this.parallaxMax.update(dt);
      this.parallaxMax.scroll(camX, spawnX);
    }
    if (this.meteorField) this.meteorField.update(dt);
  }

  /** In Level 4, push particle bursts up/away from the skater so the screen
   *  around him stays clean. Returns a screen point offset from the player. */
  private fxPos(wx: number, wy: number, dy = -90): { x: number; y: number } {
    const s = this.toScreen(new BABYLON.Vector3(wx, wy, 0));
    if (!this.skate?.endless) return s;
    return { x: s.x, y: s.y + dy };
  }

  /** In the endless level, route text into a side lane so it never covers the skater. */
  private skateTextPos(s: { x: number; y: number }) {
    if (!this.skate?.endless) return s;
    const sc = this.juice.getScreen();
    return {
      x: Math.max(180, Math.min(sc.width - 180, s.x - 260)),
      y: Math.max(110, s.y - 190),
    };
  }

  /** Spawn the air drone once — only after the player is armed with a phaser. */
  private spawnDrone() {
    if (this.drones.length > 0) return;
    const px = this.player.position.x;
    const drone = new AirDrone(this.scene, this.havok, this.mats,
      new BABYLON.Vector3(px + 22, this.player.position.y + 8, 0));
    drone.onZap = () => this.audio.droneZap();
    drone.onPlayerHit = (hx, hy) => {
      if (this.forceField?.active && this.forceField.absorb(hx, hy)) return;
      this.audio.bail();
      const s = this.toScreen(new BABYLON.Vector3(hx, hy, 0));
      this.juice.screenFlash(0xff5f6f, 0.25);
      this.juice.floatText(s.x, s.y, 'ZAPPED!', 0xff5f6f, 26);
      this.player.velocity.y = -8;
      this.player.velocity.x *= 0.6;
      this.camera.shake(0.2, 7);
    };
    drone.onDestroyed = (pts, dx, dy) => {
      this.audio.droneDown();
      this.score += pts;
      const s = this.toScreen(new BABYLON.Vector3(dx, dy, 0));
      this.juice.callout(s.x, s.y - 90, 'DRONE DOWN! +500', 0x7fffe0, 38);
      this.juice.megaBurst(s.x, s.y, 0xffa060);
      this.juice.radialBurst(s.x, s.y, 0xffffff, 30);
      this.juice.radialBurst(s.x, s.y, 0x7fffe0, 20);
      this.juice.screenFlash(0xffffff, 0.5);
      this.camera.shake(0.5, 16);
      this.camera.punch(20, 0.3);
      this.hitStop(0.08);
      this.updateHUD();
    };
    this.drones.push(drone);
    this.juice.callout(this.juice.getScreen().width / 2, 170, '⚠ DRONE INBOUND!', 0xff5f6f, 36);
    this.audio.droneZap();
  }

  /** Jetpack level: booster packs, drone combat, phaser firing, jet audio. */
  private stepJetLevel(dt: number) {
    const p = this.player, input = this.input.state;
    // Retro jet audio follows thrust
    if (p.jetActive) this.audio.jetHum(0.6 + this.jetBoostLevel * 0.12);
    else this.audio.jetHum(0.05);
    this.jetBackpack?.setActive(p.jetActive);
    this.jetBackpack?.update(dt);
    // Keep the phaser held & pointed the way the hero faces, always
    this.phaser?.aim(p.facingDir, (this.phaser?.ammo ?? 0) > 0);
    p.rig.gunAim = this.phaser?.hasGun ?? false; // right arm always up with gun

    // Booster packs → speedier jet
    for (const b of this.boosters) {
      b.update(dt);
      if (!b.collected && BABYLON.Vector3.Distance(b.pos, p.position) < 2.2) {
        b.collect();
        this.jetBoostLevel = Math.min(5, this.jetBoostLevel + 1);
        p.jetThrust = 46 + this.jetBoostLevel * 9;
        p.jetDrain = Math.max(0.15, 0.45 - this.jetBoostLevel * 0.05);
        this.score += 250;
        this.audio.boosterPickup();
        const s = this.toScreen(b.pos);
        this.juice.ring(s.x, s.y, 0xffb040, 150);
        this.juice.radialBurst(s.x, s.y, 0xffcf60, 18);
        this.juice.floatText(s.x, s.y - 90, `BOOST x${this.jetBoostLevel}! +250`, 0xffcf60, 28);
        this.camera.punch(8, 0.12);
        this.updateHUD();
      }
    }

    // Force-field pickups
    this.forceField?.update(dt);
    for (const f of this.forcePickups) {
      f.update(dt);
      if (!f.collected && BABYLON.Vector3.Distance(f.pos, p.position) < 2.2) {
        f.collect();
        this.forceField?.activate(12);
        this.audio.boosterPickup();
        const s = this.toScreen(f.pos);
        this.juice.ring(s.x, s.y, 0x7fffe0, 160);
        this.juice.callout(s.x, s.y - 90, 'FORCE FIELD ON!', 0x7fffe0, 32);
        this.camera.punch(8, 0.12);
        this.updateHUD();
      }
    }

    // Phaser pickups
    for (const g of this.phaserPickups) {
      g.update(dt);
      if (!g.collected && BABYLON.Vector3.Distance(g.pos, p.position) < 2.2) {
        g.collect();
        this.phaser?.grant();
        this.audio.gold();
        const s = this.toScreen(g.pos);
        this.juice.ring(s.x, s.y, 0x7fffe0, 140);
        this.juice.floatText(s.x, s.y - 90, 'PHASER ACQUIRED!', 0x7fffe0, 28);
        this.spawnDrone(); // now that the player is armed, send in the drone
        this.updateHUD();
      }
    }

    // Fire strictly along the direction the player is facing — right = +X,
    // left = -X. Keep the shot origin and beam on that exact side.
    if (this.phaser && input.firePressed) {
      const faceDir = p.facingDir >= 0 ? 1 : -1;
      const dir = new BABYLON.Vector3(faceDir, 0, 0);
      const origin = p.position.clone();
      origin.x += faceDir * 1.0;
      this.phaser.fire(origin, dir);
    }

    // Drone update + phaser-vs-drone hits
    const targets = this.drones.filter(d => d.alive).map(d => ({
      pos: (d.body.transformNode as BABYLON.Mesh).position,
      radius: 1.4,
      hit: (from: BABYLON.Vector3) => d.hit(from),
    }));
    for (const d of this.drones) d.update(dt, p.position);
    this.phaser?.update(dt, targets);
  }

  /** Skating level simulation — momentum, tricks, gold juice, camera, portals. */
  private stepSkate(dt: number) {
    const sk = this.skate!;
    // Endless: shove callout text into a lane left of the skater so it never
    // covers him. Particles still fire at his real position.
    this.juice.textOffset = sk.endless ? { x: -230, y: -150 } : { x: 0, y: 0 };
    if (this.flowCalloutTimer > 0) this.flowCalloutTimer -= dt;
    if (this.handPlantJuiceTimer > 0) this.handPlantJuiceTimer -= dt;
    sk.update(dt, this.input.state);
    // TRIPLE AAA: golden-hour sky washes in while the handplant is held
    const wantGold = sk.handPlanting ? 1 : 0;
    this.goldenSky += (wantGold - this.goldenSky) * Math.min(1, dt * 5);
    if (this.goldenSky > 0.001) {
      const pal = REALMS[this.realm], g = this.goldenSky;
      const r = pal.clear[0] * (1 - g) + 0.48 * g;
      const gg = pal.clear[1] * (1 - g) + 0.26 * g;
      const b = pal.clear[2] * (1 - g) + 0.07 * g;
      this.scene.clearColor.set(r, gg, b, 1);
      this.scene.fogColor.set(r, gg, b);
    } else if (this.goldenSky <= 0.001) {
      const pal = REALMS[this.realm];
      this.scene.clearColor.set(pal.clear[0], pal.clear[1], pal.clear[2], 1);
      this.scene.fogColor.set(pal.clear[0], pal.clear[1], pal.clear[2]);
    }
    // Level 4: SUPER-WIDE vista. Camera pulls back further as speed builds;
    // zoom-in is reserved for genuinely rare, huge moments only.
    if (this.camera.skateMode) {
      this.camera.setDistance(44 + Math.abs(sk.speed) * 0.22);
      if (this.specialZoomTimer > 0) this.specialZoomTimer -= dt;
      const special = sk.trickPoints > 0 && (sk.combo >= 5 || sk.trickName.includes('720'));
      if (special && this.specialZoomTimer <= 0) this.specialZoomTimer = 1.0;
      const target = this.specialZoomTimer > 0 ? 1 : 0;
      this.camera.trickZoom += (target - this.camera.trickZoom) * Math.min(1, dt * (target ? 8 : 2));
    }
    // Cinematic push-in on the handplant
    const baseDist = this.camera.skateMode ? 44 + Math.abs(sk.speed) * 0.22 : 30;
    this.camera.setDistance(baseDist - this.goldenSky * 9);
    this.player.position.copyFrom(sk.position);
    this.audio.skateRoll(sk.speed);

    // Camera — pure side-scroll follow in skate levels. Gamepad triggers and
    // LB/RB are trick inputs only — they must NEVER orbit the camera here.
    this.camera.update(dt, sk.position.x, sk.position.y, sk.speed, 0, !sk.isAirborne, 0, 0, 0);
    if (this.parallaxMax) {
      this.parallaxMax.update(dt);
      this.parallaxMax.scroll(this.camera.getPosition().x, WORLD[this.realm].spawn.x);
    }
    if (this.mystery) this.mystery.update(dt);
    if (this.decorations) this.decorations.update(dt);
    if (this.meteorField) this.meteorField.update(dt);

    // Portals / goal for the skate level
    if (this.portalCooldown <= 0) {
      for (const p of this.portals) {
        if (BABYLON.Vector3.Distance(sk.position, p.mesh.position) < 2.4) {
          this.enterPortal(p.targetRealm);
          return;
        }
      }
    }
    if (this.goalMesh && this.goalPos && BABYLON.Vector3.Distance(sk.position, this.goalPos) < 2.6) {
      this.win();
    }
    if (this.goalMesh) {
      this.goalMesh.rotation.z += dt * 1.4;
      this.goalMesh.rotation.y += dt * 0.7;
    }
    this.updateHUD();
  }

  private transitioning = false;
  private static readonly LEVEL_TIPS = [
    'Spin the blob. Own the grove!',
    'Gilded ascent — mind the smashers!',
    'Half-pipe hustle. Grab that air!',
    'Endless ollies — chase the combo!',
  ];

  /** Playful preloader with a fake progress sweep so portal jumps never hard-cut. */
  private showPreloader(target: number, done: () => void) {
    const el = document.getElementById('preloader');
    const title = document.getElementById('pre-title');
    const tip = document.getElementById('pre-tip');
    const fill = document.getElementById('pre-fill');
    if (!el || !fill) { done(); return; }
    if (title) title.textContent = REALMS[target]?.name.toUpperCase() ?? 'GET READY!';
    if (tip) tip.textContent = Game.LEVEL_TIPS[target] ?? 'Here we go!';
    el.classList.add('show');
    fill.style.width = '0%';
    let p = 0;
    const tick = window.setInterval(() => {
      p = Math.min(100, p + 7 + Math.random() * 16);
      fill.style.width = `${p}%`;
      if (p >= 100) {
        window.clearInterval(tick);
        window.setTimeout(() => { el.classList.remove('show'); done(); }, 160);
      }
    }, 70);
  }

  private enterPortal(target: number) {
    if (this.transitioning || target === this.realm) return;
    this.transitioning = true;
    this.portalCooldown = 1.5;
    this.camera.punch(14, 0.3);
    this.audio.portal();
    this.score += 500;
    const s = this.toScreen(this.player.position);
    this.juice.ring(s.x, s.y, 0xbffff0, 200);
    const overlay = document.getElementById('transition');
    if (overlay) overlay.classList.add('active');
    // Playful preloader covers the synchronous world rebuild — no hard cut.
    this.showPreloader(target, () => {
      this.realm = target;
      this.buildWorld(target);
      this.portalCooldown = 1.5; // don't re-trigger a portal at the new spawn
      this.updateHUD();
      if (overlay) overlay.classList.remove('active');
      this.juice.screenFlash(0x9fffe0, 0.28);
      const sc = this.juice.getScreen();
      this.juice.callout(sc.width / 2, sc.height / 2 - 150, `LEVEL ${target + 1}`, 0xffd45b, 66);
      this.juice.floatText(sc.width / 2, sc.height / 2 - 60, REALMS[target].name.toUpperCase(), 0x9fffe0, 44);
      this.juice.radialBurst(sc.width / 2, sc.height / 2, 0x9fffe0, 26);
      this.transitioning = false;
    });
  }

  private die() {
    if (this.gameOver || this.won) return;
    this.deaths++;
    this.gameOver = true;
    this.audio.stopGroove();
    this.coinCombo = 0; this.coinComboTimer = 0; this.juice.setCombo(0);
    const go = document.getElementById('gameover');
    const msg = document.getElementById('gameover-msg');
    if (msg) msg.textContent = `The grove reclaims you. ${this.score} points · ${this.rabbitsFlat} rabbits flattened.`;
    if (go) go.classList.add('visible');
    this.camera.shake(0.4, 12);
    this.audio.death();
    this.juice.screenFlash(0xff6b8a, 0.4);
  }

  private win() {
    if (this.gameOver || this.won) return;
    this.won = true;
    this.audio.stopGroove();
    const w = document.getElementById('win');
    const msg = document.getElementById('win-msg');
    if (msg) msg.textContent = `You shredded all four realms. ${this.score} points!`;
    if (w) w.classList.add('visible');
    if (this.skate) this.skate.celebrate(); else this.player.celebrate();
    this.audio.goal();
    this.camera.punch(18, 0.6);
    this.juice.screenFlash(0x9fffe0, 0.5);
    const cs = this.toScreen(this.player.position);
    this.juice.discoSplat(cs.x, cs.y, 0xffd86b);
  }

  // ---------------------------------------------------------------- helpers
  private toScreen(worldPos: BABYLON.Vector3) {
    const eng = this.engine;
    const cam = this.camera['camera'] as BABYLON.Camera;
    const vp = cam.getViewMatrix().multiply(cam.getProjectionMatrix());
    const p = BABYLON.Vector3.Project(worldPos, BABYLON.Matrix.Identity(), vp, cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
    const sx = p.x * (this.juice.getScreen().width / eng.getRenderWidth());
    const sy = p.y * (this.juice.getScreen().height / eng.getRenderHeight());
    return { x: sx, y: sy };
  }

  private hitStop(seconds = 0.06) { this.freezeTimer = Math.max(this.freezeTimer, seconds); }

  private updateHUD() {
    const set = (id: string, v: string | number) => { const e = document.getElementById(id); if (e) e.textContent = String(v); };
    if (this.skate) {
      set('label-spores', 'Trick Score');
      set('label-bumpers', 'Speed');
      set('label-rabbits', this.skate.endless ? 'Distance' : 'G-Force');
      set('stat-spores', this.score + this.skate.score);
      set('stat-bumpers', `${Math.abs(this.skate.speed * 3.6) | 0} KM/H`);
      set('stat-rabbits', this.skate.endless ? `${Math.floor(this.skate.distance)} m` : `${this.skate.gForce.toFixed(1)} G`);
      return;
    }
    set('label-spores', 'Sporelights');
    set('label-bumpers', 'Bumper Hits');
    set('label-rabbits', 'Rabbits Flattened');
    set('stat-spores', this.score);
    set('stat-bumpers', this.bumps);
    set('stat-rabbits', this.rabbitsFlat);
  }

  /** Return to the title screen (dev panel / in-game menu button). */
  public goToMenu() {
    this.started = false;
    this.gameOver = false;
    this.won = false;
    this.audio.stopGroove();
    this.audio.startMenuMusic();
    const title = document.getElementById('title');
    if (title) { title.style.display = 'flex'; title.classList.add('visible'); }
    for (const id of ['gameover', 'win']) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('visible');
    }
    this.coinCombo = 0; this.coinComboTimer = 0;
    this.juice.setCombo(0);
    this.juice.textOffset = { x: 0, y: 0 };
    this.camera.setSkateMode(false);
    this.camera.setDistance(30);
    this.buildWorld(0);
    this.realm = 0;
    this.updateHUD();
    const mb = document.getElementById('menu-btn');
    if (mb) mb.classList.add('hidden');
  }

  private wireUI() {
    // --- Always-on audio controls ---
    const muteBtn = document.getElementById('audio-mute');
    const playBtn = document.getElementById('audio-play');
    const syncAudioUI = () => {
      if (muteBtn) {
        const muted = this.audio.isMuted;
        muteBtn.textContent = muted ? '🔇 MUTED' : '🔊 SOUND ON';
        muteBtn.classList.toggle('muted', muted);
      }
      if (playBtn) {
        playBtn.textContent = this.audio.isPaused ? '▶ PLAY AUDIO' : '⏸ PAUSE AUDIO';
      }
    };
    muteBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted);
      syncAudioUI();
    });
    playBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setPaused(!this.audio.isPaused);
      syncAudioUI();
    });
    syncAudioUI();

    // Customization screen
    this.customization = new CustomizationUI(() => {});
    if (this.player) this.customization.setPlayer(this.player);
    document.getElementById('btn-customize')?.addEventListener('click', () => {
      this.audio.unlock();
      this.customization.open();
    });

    // Start chiptune menu music on the first user gesture (autoplay policy)
    const kickMusic = () => { this.audio.startMenuMusic(); };
    window.addEventListener('pointerdown', kickMusic, { once: true });
    window.addEventListener('keydown', kickMusic, { once: true });

    const begin = () => {
      const t = document.getElementById('title');
      if (t) { t.classList.remove('visible'); t.style.display = 'none'; }
      const mb = document.getElementById('menu-btn');
      if (mb) mb.classList.remove('hidden');
      this.audio.stopMenuMusic();
      this.audio.unlock();
      this.audio.start();
      this.started = true;
      this.lastTime = performance.now();
      this.juice.screenFlash(0x9fffe0, 0.3);
      // Arcade intro: big "GO!" pop + celebratory burst
      const sc = this.juice.getScreen();
      this.juice.callout(sc.width / 2, sc.height / 2 - 220, 'GO!', 0x9fffe0, 84);
      this.juice.ring(sc.width / 2, sc.height / 2, 0x9fffe0, 280);
      this.juice.radialBurst(sc.width / 2, sc.height / 2, 0xffffff, 22);
      this.audio.spore();
    };
    const start = document.getElementById('btn-start');
    if (start) start.addEventListener('click', begin);

    // Always-on Main Menu button
    document.getElementById('menu-btn')?.addEventListener('click', () => this.goToMenu());

    // Level select buttons on the main menu
    document.querySelectorAll('#level-select .btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = parseInt((btn as HTMLElement).dataset.level ?? '0', 10);
        begin();
        if (lvl !== 0) this.enterPortal(lvl);
      });
    });

    this.input.onKeyDown('jump', () => { if (!this.started && !this.gameOver && !this.won) begin(); });
    const restart = () => {
      const go = document.getElementById('gameover'); const w = document.getElementById('win');
      if (go) go.classList.remove('visible');
      if (w) w.classList.remove('visible');
      this.gameOver = false; this.won = false;
      this.score = 0; this.bumps = 0; this.rabbitsFlat = 0;
      this.coinCombo = 0; this.coinComboTimer = 0;
      this.realm = 0;
      for (const r of this.rabbits) r.reset();
      for (const s of this.spores) s.reset();
      for (const d of this.dust) d.reset();
      this.updateHUD();
      this.buildWorld(0);
      this.started = true;
    };
    const rb = document.getElementById('btn-restart'); if (rb) rb.addEventListener('click', restart);
    const wb = document.getElementById('btn-win-restart'); if (wb) wb.addEventListener('click', restart);
    this.input.onKeyDown('jump', () => { if (this.gameOver || this.won) restart(); });
    const reload = document.getElementById('btn-reload'); if (reload) reload.addEventListener('click', () => location.reload());

    // (Win is triggered by reaching the goal in the final realm.)
  }
}

function setLoading(pct: number, _text: string) {
  const f = document.getElementById('loading-fill');
  if (f) f.style.width = pct + '%';
}
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
