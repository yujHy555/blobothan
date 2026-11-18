import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';
import { Cosmetics } from './Cosmetics';

export type AnimState = 'idle' | 'run' | 'skate' | 'push' | 'handPlant' | 'jump' | 'doubleJump' | 'tripleJump' | 'land' | 'slide' | 'dash' | 'crouch' | 'fly';

interface StickLimb {
  pivot: BABYLON.TransformNode;
  upper: BABYLON.Mesh;
  knee: BABYLON.TransformNode;
  lower: BABYLON.Mesh;
  foot: BABYLON.Mesh;
  side: number;
  leg: boolean;
}

interface GooglyEye {
  socket: BABYLON.TransformNode;
  ball: BABYLON.Mesh;
  iris: BABYLON.Mesh;
  pupil: BABYLON.Mesh;
  glint: BABYLON.Mesh;
  offset: BABYLON.Vector3;
  vel: BABYLON.Vector3;
  side: number;
}

/**
 * Blobothan's AAA rig — EXACTLY 2 arms + 2 legs, all BLACK, with a full
 * animation set: idle breathing, run cycle, jump/double/triple, land squash,
 * slide, dash, crouch charge, and jetpack flight. Googly eyes use spring physics.
 */
export class BlobothanRig {
  private scene: BABYLON.Scene;
  private mats: Materials;
  private parent: BABYLON.TransformNode;
  private legs: StickLimb[] = [];
  private arms: StickLimb[] = [];
  private eyes: GooglyEye[] = [];
  private brows: BABYLON.Mesh[] = [];
  public rightHand: BABYLON.TransformNode | null = null;
  public leftHand: BABYLON.TransformNode | null = null;
  public gunAim = false; // hold right arm up, pointing the phaser forward
  private face: BABYLON.TransformNode;
  private body: BABYLON.Mesh | null = null;
  private phase = 0;
  private time = 0;
  private curState: AnimState = 'idle';
  private blend = 0;
  private watch!: BABYLON.Mesh;         // golden wristwatch
  private hat!: BABYLON.TransformNode;  // bouncy reactive hat
  private visorPivot!: BABYLON.TransformNode;
  private backpack!: BABYLON.TransformNode;
  private backpackVel = 0;
  private hatVel = new BABYLON.Vector2();
  private hatBaseY = 0.95;
  private watchCheckTimer = 3;          // seconds until next glance
  private watchGlance = 0;              // 0..1 progress of the glance
  private blinkTimer = 2.5;
  private blinking = 0;
  // Mouth expressions (only one visible at a time)
  private mouths: { mesh: BABYLON.Mesh; name: string }[] = [];
  private currentMouth = 'neutral';
  public pushSide = 1; // which leg is pushing (alternating skateboard push)
  public angryFlow = false; // fierce face during a big flow run
  private shoeMat!: BABYLON.StandardMaterial;
  private gloveMat!: BABYLON.StandardMaterial;
  private helmetShellMat!: BABYLON.PBRMaterial;
  private helmetBrimMat!: BABYLON.StandardMaterial;
  private bodyMesh: BABYLON.Mesh | null = null;

  // 12 Principles state
  private anticipation = 0;     // pre-action squash/lean
  private followThrough = new BABYLON.Vector3(); // lagging secondary motion
  private prevVelX = 0;
  private eyeWobblePhase = 0;   // micro-wobble jitter
  private prevAnim: AnimState = 'idle';

  constructor(scene: BABYLON.Scene, mats: Materials, parent: BABYLON.TransformNode, radius: number) {
    this.scene = scene;
    this.mats = mats;
    this.parent = parent;

    this.face = new BABYLON.TransformNode('face', scene);
    this.face.parent = parent;

    // Cartoon WHITE limbs with soft shading (classic rubber-hose style)
    const limbMat = new BABYLON.StandardMaterial('whiteLimb', scene);
    limbMat.diffuseColor = new BABYLON.Color3(0.95, 0.97, 1.0);
    limbMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.35);
    limbMat.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.14);
    // Black shoes & white gloves
    this.shoeMat = new BABYLON.StandardMaterial('shoe', scene);
    this.shoeMat.diffuseColor = new BABYLON.Color3(0.82, 0.86, 0.95); // bright sneakers — no black dots on the body
    this.shoeMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.25);
    this.gloveMat = new BABYLON.StandardMaterial('glove', scene);
    this.gloveMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    this.gloveMat.emissiveColor = new BABYLON.Color3(0.15, 0.15, 0.15);

    // 2 LEGS — pivot near ball center so the two segments + shoe reach the ground
    // exactly (ball center 1.5, ground 0.5 → foot must be ~-0.98 from center).
    for (const side of [-1, 1]) this.legs.push(this.makeLimb(side, true, -0.42, -0.1, limbMat));
    // 2 ARMS
    for (const side of [-1, 1]) {
      const arm = this.makeLimb(side, false, 0.9, 0.3, limbMat);
      this.arms.push(arm);
      if (side === 1) this.rightHand = arm.foot as any; // +X glove
      else this.leftHand = arm.foot as any;             // -X glove
    }

    // Golden wristwatch on the left arm's hand (waiting-for-something vibe)
    const watchFace = mats.glow('watchFace', [1.0, 0.82, 0.3]);
    this.watch = BABYLON.MeshBuilder.CreateCylinder('watch', { diameter: 0.26, height: 0.1, tessellation: 16 }, scene);
    this.watch.parent = this.arms[0].foot; // left hand
    this.watch.position = new BABYLON.Vector3(0, -0.05, -0.08);
    this.watch.rotation.x = Math.PI / 2;
    this.watch.material = watchFace;
    const watchHand = BABYLON.MeshBuilder.CreateBox('watchHand', { width: 0.02, height: 0.09, depth: 0.01 }, scene);
    watchHand.parent = this.watch;
    watchHand.position.y = 0.04;
    watchHand.material = mats.glow('watchHandMat', [0.9, 0.95, 1.0]); // silver hand, not a black speck

    // Eyes (spring physics) — big, bright, expressive. NO heavy black outline.
    const whiteMat = mats.eyeWhite();
    const glintMat = new BABYLON.StandardMaterial('glint', scene);
    glintMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    glintMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    glintMat.disableLighting = true;
    // Soft plum iris + deep-but-not-black pupil (reads friendly, not creepy)
    const irisMat = new BABYLON.StandardMaterial('iris', scene);
    irisMat.diffuseColor = new BABYLON.Color3(0.35, 0.18, 0.5);
    irisMat.emissiveColor = new BABYLON.Color3(0.12, 0.05, 0.2);
    irisMat.disableLighting = true;
    const pupilMat = new BABYLON.StandardMaterial('softPupil', scene);
    pupilMat.diffuseColor = new BABYLON.Color3(0.12, 0.06, 0.18);
    pupilMat.emissiveColor = new BABYLON.Color3(0.03, 0.01, 0.05);
    pupilMat.disableLighting = true;
    // No zOffset — the nested spheres are geometrically layered already.
    // A screen-space depth bias caused the pupil to render over its glints at
    // some camera distances (wrong shading in narrow preview panes).
    // Eyelid = soft magenta matching the body, NOT heavy black
    const lidMat = new BABYLON.StandardMaterial('lidMat', scene);
    lidMat.diffuseColor = new BABYLON.Color3(0.95, 0.3, 0.6);
    lidMat.emissiveColor = new BABYLON.Color3(0.3, 0.06, 0.15);
    lidMat.disableLighting = true;

    for (const side of [-1, 1]) {
      const socket = new BABYLON.TransformNode('eyeSocket', scene);
      socket.parent = this.face;
      socket.position = new BABYLON.Vector3(side * 0.38, 0.32, -radius * 0.94);
      // Angry brow — hidden until a big flow run (angled inward = fierce)
      const brow = BABYLON.MeshBuilder.CreateBox('angryBrow', { width: 0.34, height: 0.07, depth: 0.05 }, scene);
      brow.parent = socket;
      brow.position.set(0, 0.34, -0.1);
      brow.rotation.z = -side * 0.42; // slant down toward the nose
      brow.material = mats.pupil();
      brow.setEnabled(false);
      this.brows.push(brow);
      // Big expressive white eyeball (blink = squash this vertically, no lid mesh)
      const ball = BABYLON.MeshBuilder.CreateSphere('googly', { diameter: 0.66, segments: 18 }, scene);
      ball.parent = socket; ball.material = whiteMat;
      // Colored iris
      const iris = BABYLON.MeshBuilder.CreateSphere('irisBall', { diameter: 0.34, segments: 14 }, scene);
      iris.parent = ball; iris.position = new BABYLON.Vector3(0, 0, -0.24); iris.material = irisMat;
      // Soft pupil (small, on the iris)
      const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: 0.2, segments: 12 }, scene);
      pupil.parent = iris; pupil.position = new BABYLON.Vector3(0, 0, -0.12); pupil.material = pupilMat;
      // Two bright glints for a glossy, lively look
      const glint = BABYLON.MeshBuilder.CreateSphere('glint', { diameter: 0.09, segments: 8 }, scene);
      glint.parent = pupil; glint.position = new BABYLON.Vector3(-0.05, 0.05, -0.08); glint.material = glintMat;
      const glint2 = BABYLON.MeshBuilder.CreateSphere('glint2', { diameter: 0.045, segments: 8 }, scene);
      glint2.parent = pupil; glint2.position = new BABYLON.Vector3(0.06, -0.04, -0.07); glint2.material = glintMat;
      // Clean single eyeball per side — blink by scaling the ball on Y.
      this.eyes.push({ socket, ball, iris, pupil, glint, offset: BABYLON.Vector3.Zero(), vel: BABYLON.Vector3.Zero(), side });
    }

    // ---- Mouth expressions (only one visible at a time) ----
    const mouthZ = -radius * 0.95;
    const makeMouth = (name: string, mesh: BABYLON.Mesh) => {
      mesh.parent = this.face;
      mesh.position = new BABYLON.Vector3(0, -0.24, mouthZ);
      mesh.material = mats.glow('mouthMat', [0.35, 0.04, 0.16]); // dark rosy mouth, never a black speck
      mesh.renderingGroupId = 1;
      mesh.setEnabled(name === 'neutral');
      this.mouths.push({ mesh, name });
    };
    // Curved arc helper (a semicircular tube) for smiles / frowns.
    const makeArc = (name: string, radius: number, start: number, end: number, thickness: number) => {
      const pts: BABYLON.Vector3[] = [];
      const segs = 16;
      for (let i = 0; i <= segs; i++) {
        const a = start + (end - start) * (i / segs);
        pts.push(new BABYLON.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      }
      return BABYLON.MeshBuilder.CreateTube(name, { path: pts, radius: thickness, tessellation: 6 }, scene);
    };
    makeMouth('neutral', BABYLON.MeshBuilder.CreateBox('mouthNeutral', { width: 0.36, height: 0.08, depth: 0.05 }, scene));
    makeMouth('smile', makeArc('mouthSmile', 0.21, Math.PI, Math.PI * 2, 0.05));       // U shape
    makeMouth('open', BABYLON.MeshBuilder.CreateSphere('mouthOpen', { diameter: 0.3, segments: 12 }, scene));
    this.mouths[2].mesh.scaling.set(1, 1.2, 0.4);
    makeMouth('grin', BABYLON.MeshBuilder.CreateBox('mouthGrin', { width: 0.46, height: 0.16, depth: 0.05 }, scene));
    makeMouth('o', BABYLON.MeshBuilder.CreateTorus('mouthO', { diameter: 0.22, thickness: 0.06, tessellation: 16 }, scene));
    makeMouth('frown', makeArc('mouthFrown', 0.2, 0, Math.PI, 0.05));                  // upside-down U

    // Bouncy YELLOW MOTORCYCLE HELMET — glossy shell, dark visor, chin bar
    this.hat = new BABYLON.TransformNode('hatPivot', scene);
    this.hat.parent = this.parent;
    this.hatBaseY = radius * 0.62; // lowered so the shell wraps around the head
    this.hat.position = new BABYLON.Vector3(0, this.hatBaseY, -0.02);

    // Glossy yellow shell — a dome that hugs the top of the head (radius ~1.0).
    // Hat pivot sits at head-top (y=0.95); a half-sphere cap wraps the crown.
    const shell = BABYLON.MeshBuilder.CreateSphere('helmetShell', { diameter: 2.0, segments: 20, slice: 0.55 }, scene);
    shell.parent = this.hat;
    shell.position.y = 0.02;
    shell.scaling.set(1.0, 0.92, 1.0);
    const shellMat = new BABYLON.PBRMaterial('helmetYellow', scene);
    shellMat.albedoColor = new BABYLON.Color3(1.0, 0.78, 0.08);
    shellMat.metallic = 0.25;
    shellMat.roughness = 0.2;
    shellMat.emissiveColor = new BABYLON.Color3(0.2, 0.12, 0.0);
    shell.material = shellMat;
    this.helmetShellMat = shellMat;

    const visorMat = new BABYLON.PBRMaterial('helmetVisorMat', scene);
    visorMat.albedoColor = new BABYLON.Color3(0.04, 0.06, 0.10);
    visorMat.metallic = 0.6;
    visorMat.roughness = 0.08;
    visorMat.emissiveColor = new BABYLON.Color3(0.02, 0.05, 0.08);

    // Visor flipped UP on top of the helmet (hinged at the front edge)
    const visorPivot = new BABYLON.TransformNode('visorPivot', scene);
    visorPivot.parent = this.hat;
    visorPivot.position.set(0, 0.5, -0.5); // hinge at front-top of the shell
    visorPivot.rotation.x = -1.15;         // tilt back/up so it clears the eyes
    this.visorPivot = visorPivot;
    const visor = BABYLON.MeshBuilder.CreateSphere('helmetVisor', { diameter: 1.2, segments: 18, slice: 0.42 }, scene);
    visor.parent = visorPivot;
    visor.position.set(0, -0.12, -0.34);
    visor.scaling.set(1, 0.5, 0.75);
    visor.material = visorMat;
    // visor rim
    const rim = BABYLON.MeshBuilder.CreateTorus('visorRim', { diameter: 1.0, thickness: 0.05, tessellation: 20 }, scene);
    rim.parent = visorPivot;
    rim.position.set(0, -0.05, -0.34);
    rim.scaling.set(1.2, 1, 0.92); // match the visor's elliptical rim, sit just outside it
    rim.material = mats.glow('visorRimMat', [0.15, 0.18, 0.24], 1);

    // Slim chin guard bar (dark, tucked under the face but not covering eyes)
    const chin = BABYLON.MeshBuilder.CreateBox('helmetChin', { width: 0.8, height: 0.12, depth: 0.3 }, scene);
    chin.parent = this.hat;
    chin.position.set(0, -0.02, -0.86); // clear of the face surface (z=-0.8)
    chin.material = visorMat;

    // Racing stripes down the middle (black)
    const stripe = BABYLON.MeshBuilder.CreateBox('helmetStripe', { width: 0.12, height: 0.02, depth: 0.25 }, scene);
    stripe.parent = this.hat;
    stripe.position.set(0, 0.66, -0.78); // on the shell's front surface, not buried inside
    stripe.material = mats.glow('helmetStripeMat', [0.15, 0.8, 1.0], 1); // cyan racing stripe, not a black mark

    // Side vents
    for (const sx of [-1, 1]) {
      const vent = BABYLON.MeshBuilder.CreateBox('helmetVent', { width: 0.06, height: 0.18, depth: 0.3 }, scene);
      vent.parent = this.hat;
      vent.position.set(sx * 0.94, 0.3, 0.05); // on the shell surface instead of inside it
      vent.material = mats.glow('ventMat', [0.2, 0.7, 0.9], 0.95); // bright vents — no dark blobs on the helmet
    }

    // Dynamic BLUE BACKPACK — a bouncy pack on the back (+Z, opposite the face)
    this.backpack = new BABYLON.TransformNode('backpackPivot', scene);
    this.backpack.parent = this.parent;
    this.backpack.position.set(0, 0.18, 0.86);
    const packMat = new BABYLON.PBRMaterial('backpackBlue', scene);
    packMat.albedoColor = new BABYLON.Color3(0.15, 0.42, 0.92);
    packMat.metallic = 0.1;
    packMat.roughness = 0.5;
    packMat.emissiveColor = new BABYLON.Color3(0.03, 0.08, 0.2);
    const pack = BABYLON.MeshBuilder.CreateBox('backpack', { width: 0.62, height: 0.78, depth: 0.4 }, scene);
    pack.parent = this.backpack;
    pack.material = packMat;
    pack.receiveShadows = true;
    // Front pocket + flap
    const pocket = BABYLON.MeshBuilder.CreateBox('packPocket', { width: 0.5, height: 0.34, depth: 0.14 }, scene);
    pocket.parent = this.backpack;
    pocket.position.set(0, -0.1, 0.26);
    pocket.material = mats.glow('packPocket', [0.25, 0.55, 1.0], 0.9);
    const flap = BABYLON.MeshBuilder.CreateBox('packFlap', { width: 0.54, height: 0.1, depth: 0.16 }, scene);
    flap.parent = this.backpack;
    flap.position.set(0, 0.15, 0.27); // gap above pocket top (0.07) — no coplanar seam
    flap.material = mats.glow('packFlap', [0.1, 0.3, 0.7], 1);
    // Shoulder straps (thin, over the shoulders toward front)
    for (const sx of [-1, 1]) {
      const sh = BABYLON.MeshBuilder.CreateBox('packStrap', { width: 0.1, height: 0.5, depth: 0.1 }, scene);
      sh.parent = this.backpack;
      // Sit just OUTSIDE the body surface — buried dark straps showed through
      // the matte jelly as black marks on the back while skating.
      sh.position.set(sx * 0.26, 0.42, 0.05);
      sh.rotation.x = -0.4;
      sh.material = mats.glow('packShoulder', [0.25, 0.5, 0.9], 1);
    }
  }

  private makeLimb(side: number, leg: boolean, x: number, y: number, mat: BABYLON.Material): StickLimb {
    const s = this.scene;
    const pivot = new BABYLON.TransformNode(leg ? 'legPivot' : 'armPivot', s);
    pivot.parent = this.parent;
    pivot.position = new BABYLON.Vector3(x * (leg ? side : 1), y, 0);
    if (!leg) pivot.position.x = side * 0.9;

    // Longer, clearly visible legs. Pivot near the ball's lower-mid; the two
    // segments reach down to the ground (ball bottom ≈ -1.0 from center):
    // pivot y=-0.18 + upper 0.42 + lower 0.4 = -1.0 at the shoe.
    const upperH = leg ? 0.4 : 0.55;
    const lowerH = leg ? 0.38 : 0.5;
    const upper = BABYLON.MeshBuilder.CreateCylinder('limbUpper', { height: upperH, diameter: leg ? 0.13 : 0.09, tessellation: 10 }, s);
    upper.parent = pivot; upper.position.y = -upperH / 2; upper.material = mat;

    const knee = new BABYLON.TransformNode('knee', s);
    knee.parent = pivot; knee.position.y = -upperH;

    const lower = BABYLON.MeshBuilder.CreateCylinder('limbLower', { height: lowerH, diameter: leg ? 0.11 : 0.08, tessellation: 10 }, s);
    lower.parent = knee; lower.position.y = -lowerH / 2; lower.material = mat;

    const foot = leg
      ? BABYLON.MeshBuilder.CreateBox('shoe', { width: 0.38, height: 0.18, depth: 0.3 }, s)
      : BABYLON.MeshBuilder.CreateSphere('glove', { diameter: 0.24, segments: 10 }, s);
    // Seat the shoe just BELOW the lower-leg tip so they never intersect:
    // lower leg ends at -lowerH; shoe half-height 0.09 → center = -lowerH - 0.09
    foot.parent = knee; foot.position.y = leg ? -(lowerH + 0.09) : -0.5;
    foot.material = leg ? this.shoeMat : this.gloveMat; // black shoes, white gloves

    return { pivot, upper, knee, lower, foot, side, leg };
  }

  public setBody(mesh: BABYLON.Mesh) { this.body = mesh; this.bodyMesh = mesh; }

  /** Switch to one of the expressive 8-bit mouth shapes. */
  private setMouth(name: string) {
    if (name === this.currentMouth) return;
    for (const m of this.mouths) m.mesh.setEnabled(m.name === name);
    this.currentMouth = name;
  }

  /**
   * KNARLY 8-BIT helmet stickers (skate mode only). Pixel sprites mapped onto
   * the shell with a flat root that follows the helmet's spring animation.
   */
  public addSkateStickers(mats: Materials) {
    const s = this.scene;
    type Pix = [number, number, [number, number, number]];
    const bolt: Pix[] = [
      [1,2,[1,0.9,0.2]],[2,2,[1,0.9,0.2]],
      [0,1,[1,0.9,0.2]],[1,1,[1,0.9,0.2]],
      [-1,0,[1,0.9,0.2]],[0,0,[1,0.9,0.2]],[1,0,[1,0.9,0.2]],
      [0,-1,[1,0.9,0.2]],[1,-1,[1,0.9,0.2]],
      [-1,-2,[1,0.9,0.2]],[0,-2,[1,0.9,0.2]],
    ];
    const star: Pix[] = [
      [0,2,[1,0.3,0.75]],
      [-1,1,[1,0.5,0.85]],[0,1,[1,0.3,0.75]],[1,1,[1,0.5,0.85]],
      [-2,0,[1,0.3,0.75]],[-1,0,[1,1,1]],[0,0,[1,0.3,0.75]],[1,0,[1,1,1]],[2,0,[1,0.3,0.75]],
      [-1,-1,[1,0.5,0.85]],[0,-1,[1,0.3,0.75]],[1,-1,[1,0.5,0.85]],
      [0,-2,[1,1,1]],
    ];
    const checker: Pix[] = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      if ((x + y) % 2 === 0) checker.push([x, y, [0.2, 0.95, 1.0]]);
    }

    const place = (phi: number, theta: number, pixels: Pix[]) => {
      const root = new BABYLON.TransformNode('helmSticker', s);
      root.parent = this.hat;
      const n = new BABYLON.Vector3(
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta) * 0.92,
        Math.sin(theta) * Math.cos(phi),
      );
      root.position = n.scale(1.04);
      root.rotation.set(theta, phi, 0);
      for (const p of pixels) {
        const b = BABYLON.MeshBuilder.CreateBox('stickerPixel', { size: 0.1 }, s);
        b.parent = root;
        b.position.set(p[0] * 0.105, p[1] * 0.105, 0);
        b.scaling.z = 0.35;
        b.material = mats.glow(`sticker${p[2].join('')}`, p[2]);
        b.renderingGroupId = 1;
        b.isPickable = false;
      }
    };
    place(0.55, 0.85, bolt);    // lightning on the front-right
    place(-0.6, 0.9, star);     // star on the front-left
    place(1.75, 1.05, checker); // cyan checker on the side
    place(-1.8, 1.05, checker);
  }

  /** Apply equipped cosmetics to the character's visible materials. */
  public applyCosmetics(c: Cosmetics) {
    const hat = c.get('hat');
    const glasses = c.get('glasses');
    const shirt = c.get('shirt');
    const shoes = c.get('shoes');

    // Hat → helmet shell color
    if (this.helmetShellMat) {
      const col = hat.id === 'hat-none' ? [1.0, 0.78, 0.08] : hat.color;
      this.helmetShellMat.albedoColor = new BABYLON.Color3(col[0], col[1], col[2]);
      this.helmetShellMat.emissiveColor = new BABYLON.Color3(col[0] * 0.2, col[1] * 0.15, col[2] * 0.1);
    }
    // Glasses → iris/brow tint (subtle since eyes stay white)
    // Glasses are a subtle iris tint shift (brows removed for a clean look)
    if (glasses.id !== 'glass-none') {
      for (const e of this.eyes) e.iris.scaling.setAll(1.12);
    } else {
      for (const e of this.eyes) e.iris.scaling.setAll(1);
    }
    // Shirt → body tint
    if (this.bodyMesh && this.bodyMesh.material instanceof BABYLON.PBRMaterial) {
      const base = [1.0, 0.16, 0.58];
      const col = shirt.id === 'shirt-none' ? base : shirt.color;
      this.bodyMesh.material.albedoColor = new BABYLON.Color3(col[0], col[1], col[2]);
    }
    // Shoes → shoe color
    if (this.shoeMat) {
      const col = shoes.id === 'shoe-none' ? [0.04, 0.04, 0.06] : shoes.color;
      this.shoeMat.diffuseColor = new BABYLON.Color3(col[0], col[1], col[2]);
    }
  }

  public update(dt: number, state: {
    velX: number; velY: number; accelX: number; accelY: number; speed?: number;
    grounded: boolean; stateName: AnimState; facing: number; crouchCharge?: number; legStretch?: number;
  }) {
    this.time += dt;
    const { velX, velY, accelX, accelY, grounded, stateName, facing } = state;
    const legStretch = state.legStretch ?? 1;
    const lowerHGlobal = 0.38; // matches makeLimb lower leg height
    // Use full horizontal speed (works in 2.5D and third-person 3D)
    const speed = state.speed !== undefined ? state.speed : Math.abs(velX);

    // State from gameplay with smooth blend for expressive transitions
    let anim: AnimState = stateName;
    // 'skate' is a dedicated stance — never override it with the run cycle
    if (anim !== 'skate' && anim !== 'push' && anim !== 'handPlant') {
      if (grounded && speed > 2.4) anim = 'run';
      else if (grounded && (stateName as string) === 'crouch') anim = 'crouch';
      else if (grounded) anim = 'idle';
    }
    // Anticipation: when leaving idle/run for a jump, compress first (principle 2)
    if (anim !== this.prevAnim && (anim === 'jump' || anim === 'doubleJump' || anim === 'tripleJump')) {
      this.anticipation = 1;
    }
    this.anticipation = Math.max(0, this.anticipation - dt * 6);
    this.prevAnim = anim;

    // Follow-through & overlapping action (principle 5): limbs/body lag behind
    // velocity changes with a spring so motion feels organic, not robotic.
    const targetLag = BABYLON.Scalar.Clamp(-accelX * 0.004, -0.25, 0.25);
    this.followThrough.x += (targetLag - this.followThrough.x) * Math.min(1, dt * 6);
    this.followThrough.y += (-velY * 0.006 - this.followThrough.y) * Math.min(1, dt * 5);

    // Hat spring physics — lags behind acceleration, wobbles on landings/jumps
    const hatTargetX = BABYLON.Scalar.Clamp(-accelX * 0.02, -0.5, 0.5);
    const hatTargetY = BABYLON.Scalar.Clamp(-velY * 0.02 - 0.1, -0.4, 0.4);
    const hatK = 90, hatD = 9;
    this.hatVel.x += ((hatTargetX - this.hat.rotation.z) * hatK - this.hatVel.x * hatD) * dt;
    this.hatVel.y += ((hatTargetY - this.hat.rotation.x) * hatK - this.hatVel.y * hatD) * dt;
    this.hat.rotation.z += this.hatVel.x * dt;
    this.hat.rotation.x += this.hatVel.y * dt;
    this.hat.position.y = this.hatBaseY + Math.sin(this.time * 3) * 0.02 + (anim === 'land' ? -0.08 : 0);


    // Backpack bobs and lags behind vertical motion (spring), tilts into turns
    const bpTargetY = BABYLON.Scalar.Clamp(-velY * 0.015, -0.25, 0.25);
    this.backpackVel += ((bpTargetY - this.backpack.rotation.x) * 70 - this.backpackVel * 9) * dt;
    this.backpack.rotation.x += this.backpackVel * dt;
    this.backpack.rotation.z += ((-accelX * 0.01) - this.backpack.rotation.z) * Math.min(1, dt * 8);
    this.backpack.position.y = 0.18 + Math.sin(this.time * 3.5) * 0.03 + (anim === 'land' ? -0.1 : 0);

    this.curState = anim;
    this.blend = Math.min(1, this.blend + dt * 12);

    // Mouth expression follows the action — extra character juice
    // ANGRY FLOW: fierce grin + squint when cruising fast in a flow run
    if (this.angryFlow) this.setMouth('grin');
    else if (anim === 'skate') this.setMouth(speed > 24 ? 'grin' : 'smile');
    else if (anim === 'run') this.setMouth(speed > 18 ? 'grin' : 'smile');
    else if (anim === 'jump' || anim === 'doubleJump' || anim === 'tripleJump' || anim === 'fly') this.setMouth('open');
    else if (anim === 'land' || anim === 'dash') this.setMouth('o');
    else if (anim === 'crouch' || anim === 'slide') this.setMouth('grin');
    else this.setMouth('neutral');

    for (const b of this.brows) b.setEnabled(this.angryFlow);

    this.phase += dt * (2.5 + speed * 0.5);
    const t = this.time;
    this.eyeWobblePhase += dt * 6; // calmer micro-wobble timing

    // Watch-check: periodically glance at the wristwatch while idling ("waiting")
    if (anim === 'idle') {
      this.watchCheckTimer -= dt;
      if (this.watchCheckTimer <= 0 && this.watchGlance <= 0) {
        this.watchGlance = 0.001; // start a glance
      }
    } else {
      this.watchGlance = 0;
      this.watchCheckTimer = 3.5 + Math.random() * 3;
    }
    if (this.watchGlance > 0) {
      // Glance lasts ~2.2s: raise arm, hold, lower
      this.watchGlance += dt;
      if (this.watchGlance > 2.2) {
        this.watchGlance = 0;
        this.watchCheckTimer = 4 + Math.random() * 4;
      }
    }
    const glance = this.watchGlance > 0
      ? Math.min(1, Math.min(this.watchGlance / 0.4, (2.2 - this.watchGlance) / 0.4))
      : 0;

    // Animate all 4 limbs
    const allLimbs = [...this.legs, ...this.arms];
    for (const l of allLimbs) {
      let swing = 0, kneeBend = 0, lift = 0, splay = 0;
      const ph = this.phase + (l.side > 0 ? Math.PI : 0) + (l.leg ? 0 : Math.PI / 2);

      switch (anim) {
        case 'run':
          swing = Math.sin(ph) * (l.leg ? 0.95 : 0.75);
          // Knee bends most when the leg swings BACK (heel toward butt).
          // sin(ph) < 0 = leg behind → bend. Phase-shifted for natural gait.
          kneeBend = Math.max(0, -Math.sin(ph)) * (l.leg ? 1.0 : 0.5)
            + (l.leg ? Math.max(0, -Math.sin(ph - 0.6)) * 0.35 : 0);
          lift = Math.max(0, Math.sin(ph)) * 0.1; // foot rises on forward swing
          break;
        case 'skate':
          // Real skater stance: knees bent, feet staggered on the deck, arms
          // out for balance. NO running/walking cycle — planted and flowing.
          swing = l.leg ? l.side * 0.42 : -l.side * 0.95;
          kneeBend = l.leg ? 0.68 : 0.32;
          splay = l.leg ? l.side * 0.16 : l.side * 0.3;
          lift = 0;
          break;
        case 'push':
          // Skateboarder push: front leg planted on the deck, back leg reaches
          // behind and kicks the ground. Alternates legs with each stroke.
          swing = l.leg
            ? (l.side === this.pushSide ? -1.05 : 0.12)
            : -l.side * 0.7;
          kneeBend = l.leg
            ? (l.side === this.pushSide ? 0.15 : 0.55)
            : 0.35;
          splay = l.side * 0.18;
          lift = l.side === this.pushSide ? 0.12 : 0;
          break;
        case 'handPlant':
          // Inverted handstand: one arm drives toward the bar, the other
          // reaches skyward; legs tuck up by the board at the feet.
          swing = l.leg ? (l.side > 0 ? -0.75 : 0.55) : -1.75;
          kneeBend = l.leg ? (l.side > 0 ? 0.85 : 0.25) : 0.15;
          splay = l.side * 0.22;
          lift = 0;
          break;
        case 'idle':
          swing = Math.sin(t * 2 + l.side) * 0.05;
          kneeBend = 0.03;
          break;
        case 'crouch':
          swing = l.leg ? 0.2 : -0.3;
          kneeBend = l.leg ? 0.7 : 0.5;
          break;
        case 'jump':
          swing = l.leg ? -0.6 : -1.2;
          kneeBend = l.leg ? 0.7 : 0.3;
          splay = l.side * 0.25;
          break;
        case 'doubleJump':
          swing = l.leg ? -0.8 : -1.6 + Math.sin(t * 10) * 0.3;
          kneeBend = l.leg ? 0.9 : 0.2;
          splay = l.side * 0.45;
          break;
        case 'tripleJump':
          swing = l.leg ? -1.0 : -2.0;
          kneeBend = l.leg ? 1.0 : 0.1;
          splay = l.side * 0.6;
          break;
        case 'land':
          swing = l.leg ? 0.25 : 0.4;
          kneeBend = l.leg ? 0.6 : 0.4;
          break;
        case 'slide':
          swing = l.leg ? -0.9 : 1.1;
          kneeBend = l.leg ? 0.3 : 0.1;
          break;
        case 'dash':
          swing = l.leg ? 0.5 : -1.4;
          kneeBend = l.leg ? 0.2 : 0.1;
          splay = l.side * 0.3;
          break;
        case 'fly':
          swing = l.leg ? -0.4 : -1.5 + Math.sin(t * 8 + l.side) * 0.4;
          kneeBend = l.leg ? 0.5 : 0.2;
          splay = l.side * 0.35;
          break;
      }
      l.pivot.rotation.x = swing;
      l.pivot.rotation.z = l.leg ? splay * 0.3 : splay;
      // Super-long-legs ability: stretch the leg pivots vertically
      if (l.leg) l.pivot.scaling.y = legStretch;
      // Knees bend BACKWARD (shin goes behind the thigh). The character faces
      // -Z, so a negative X rotation sends the shin backward. Arms (elbows)
      // keep positive so the forearm comes up toward the face/body.
      l.knee.rotation.x = l.leg ? -kneeBend : kneeBend;
      l.foot.position.y = (l.leg ? -(lowerHGlobal + 0.09) : -0.5) + lift;

      // GUN AIM override: right arm (+1) extends forward holding the phaser
      if (this.gunAim && !l.leg && l.side === 1) {
        l.pivot.rotation.x = -1.5;       // raise arm forward
        l.pivot.rotation.z = 0.25;       // out to the side a touch
        l.knee.rotation.x = 0.1;         // nearly straight arm
      }
      // Watch-check override: left arm (side -1) raises to show the watch
      if (glance > 0 && !l.leg && l.side === -1) {
        l.pivot.rotation.x = -1.5 * glance;       // raise forearm
        l.pivot.rotation.z = -0.5 * glance;       // turn inward
        l.knee.rotation.x = 0.9 * glance;         // bend elbow to face view
      }
    }

    // Face the camera when idle; lean toward travel when moving
    let targetY = 0;
    if (anim === 'run' || anim === 'skate') targetY = -facing * 0.4;
    let d = targetY - this.face.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.face.rotation.y += d * Math.min(1, dt * (anim === 'idle' ? 5 : 9));

    // Blink / squint timing (shared across both eyes)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinking = 0.001; this.blinkTimer = 1.1 + Math.random() * 1.9; }
    let lidAmt = 0;
    if (this.blinking > 0) {
      this.blinking += dt;
      const p = Math.min(1, this.blinking / 0.18);
      lidAmt = p < 0.5 ? p * 2 : (1 - p) * 2; // close then open
      if (p >= 1) this.blinking = 0;
    }
    // Strong determined SQUINT while dashing — focused speed face
    const hardEyes = anim === 'dash' ? 0.85
      : (anim === 'land' || anim === 'crouch') ? 0.15
      : (this.angryFlow ? 0.5 : 0); // fierce angry squint during flow

    // ---- GAZE TARGET (mo-cap detail) ----
    // During the watch-check, eyes track down toward the wristwatch on the left
    // arm. Otherwise they lead travel, with a small idle wander.
    let gazeX = BABYLON.Scalar.Clamp(velX * 0.014, -0.17, 0.17);
    let gazeY = BABYLON.Scalar.Clamp(velY * 0.005, -0.1, 0.1);
    if (glance > 0) {
      // Watch is lower-left: eyes look down and to the left (character's left = +x on screen)
      gazeX = gazeX * (1 - glance) + 0.16 * glance;
      gazeY = gazeY * (1 - glance) + (-0.13) * glance;
    } else if (anim === 'idle') {
      // Subtle idle eye wander (saccades) — never perfectly still
      gazeX += Math.sin(t * 0.7) * 0.04 + Math.sin(t * 1.9) * 0.015;
      gazeY += Math.cos(t * 0.9) * 0.03;
    }

    // Eye micro-wobble: a tiny high-frequency jitter layered on the spring
    const wobX = Math.sin(this.eyeWobblePhase * 1.3) * 0.004;
    const wobY = Math.cos(this.eyeWobblePhase * 1.7) * 0.003;

    // Googly eye spring physics + expression
    for (const e of this.eyes) {
      const target = new BABYLON.Vector3(
        BABYLON.Scalar.Clamp(-accelX * 0.012 + velX * 0.006, -0.16, 0.16),
        BABYLON.Scalar.Clamp(-accelY * 0.008 - 0.03, -0.14, 0.14), 0,
      );
      const k = 120, damp = 12;
      e.vel.x += (k * (target.x - e.offset.x) - damp * e.vel.x) * dt;
      e.vel.y += (k * (target.y - e.offset.y) - damp * e.vel.y) * dt;
      e.offset.x += e.vel.x * dt; e.offset.y += e.vel.y * dt;
      // follow-through lag on the eyeball itself + micro wobble
      e.ball.position.set(e.offset.x + this.followThrough.x * 0.5 + wobX, e.offset.y + this.followThrough.y * 0.4 + wobY, 0);

      // Iris carries the pupil — move the iris to make the eye look around.
      // Slight per-eye convergence gives natural parallax.
      const conv = e.side * 0.012;
      const targetIX = gazeX + conv + Math.sin(this.eyeWobblePhase + e.side) * 0.008;
      const targetIY = gazeY + Math.cos(this.eyeWobblePhase + e.side) * 0.006;
      e.iris.position.x += (targetIX - e.iris.position.x) * Math.min(1, dt * 14);
      e.iris.position.y += (targetIY - e.iris.position.y) * Math.min(1, dt * 14);
      // keep iris within the white eyeball surface (radius ~0.1 at z=-0.24)
      const ix = e.iris.position.x, iy = e.iris.position.y;
      const ir = Math.hypot(ix, iy);
      if (ir > 0.1) { e.iris.position.x = ix / ir * 0.1; e.iris.position.y = iy / ir * 0.1; }

      // Industry-standard blink: squash the eyeball vertically to a thin line.
      // Open = 1, fully closed ≈ 0.06. No lid/visor mesh, no floating shapes.
      let openness = 1 - lidAmt;            // 1 open, 0 closed
      openness = Math.min(openness, 1 - hardEyes * 0.4); // subtle squint on impact
      openness = Math.max(0.06, openness);
      // Slight squint when checking the watch
      if (glance > 0) openness = Math.min(openness, 1 - 0.12 * glance);
      e.ball.scaling.y += (openness - e.ball.scaling.y) * Math.min(1, dt * 24);
      e.ball.scaling.x += (1 - e.ball.scaling.x) * Math.min(1, dt * 12);
    }

    // Head nod toward the watch during the glance (mo-cap secondary action)
    const headTiltTarget = glance > 0 ? 0.22 * glance : 0;
    this.face.rotation.x += (headTiltTarget - this.face.rotation.x) * Math.min(1, dt * 6);

    // Idle breathing on the body (visual only)
    if (this.body && anim === 'idle') {
      const b = 1 + Math.sin(t * 2) * 0.02;
      this.body.scaling.y = b;
    }
  }

  public dispose() {
    // Dispose MESHES only — never materials. Materials are cached & shared by
    // the Materials class; disposing them here broke the next rig that loaded
    // (eyes rendering with different shading).
    this.face.dispose(false, false);
    for (const l of [...this.legs, ...this.arms]) l.pivot.dispose(false, false);
    for (const e of this.eyes) e.socket.dispose(false, false);
  }
}
