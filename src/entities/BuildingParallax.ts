import * as BABYLON from 'babylonjs';
import { cardboardTextures, RGB } from '../art/CardboardArt';

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 3D BUILDING PARALLAX — the real GLB Mediterranean building kit, reskinned
 * into the hand-crafted cardboard diorama and reduced to a cheap repeating
 * backdrop layer. The geometry is baked once into merged meshes, then cloned
 * as a wrapping parallax strip so it costs only a handful of draw calls.
 *
 * Window / glass materials get a warm emissive so they read as cozy occupied
 * interiors under the glow layer — the "juice".
 */
// Cached once at startup so level-4 transitions never re-fetch / re-parse the
// 1.5 MB GLB — the #1 cause of the staggered intro and frame drop.
let cachedContainer: BABYLON.AssetContainer | null = null;
let containerPromise: Promise<BABYLON.AssetContainer> | null = null;

export function preloadBuilding(scene: BABYLON.Scene): Promise<void> {
  if (cachedContainer) return Promise.resolve();
  if (!containerPromise) {
    containerPromise = BABYLON.SceneLoader.LoadAssetContainerAsync(
      '/models/', 'modular_modernist_mediterranean_buildings_kit.glb', scene)
      .then((c) => { cachedContainer = c; return c; })
      .catch((e) => { containerPromise = null; throw e; });
  }
  return containerPromise.then(() => undefined);
}

export class BuildingParallax {
  private scene: BABYLON.Scene;
  private centerX: number;
  private root!: BABYLON.TransformNode;
  private layer!: { tiles: BABYLON.TransformNode[]; tileWidth: number; speed: number };
  private disposables: BABYLON.Material[] = [];
  private textures: BABYLON.Texture[] = [];
  private lights: BABYLON.Light[] = [];
  private ready = false;

  constructor(scene: BABYLON.Scene, centerX: number, _accent: RGB) {
    this.scene = scene;
    this.centerX = centerX;
    this.load();
  }

  private pbr(name: string, color: RGB, seed: number, roughness: number) {
    const tex = cardboardTextures(this.scene, name, color, seed);
    this.textures.push(tex.albedo, tex.normal);
    const m = new BABYLON.PBRMaterial(name, this.scene);
    m.albedoTexture = tex.albedo;
    m.bumpTexture = tex.normal;
    (m.bumpTexture as BABYLON.Texture).level = 0.6;
    m.metallic = 0;
    m.roughness = roughness;
    m.environmentIntensity = 0.6;
    m.alpha = 1;
    m.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
    // Backdrop sits far from the lights — add gentle self-illumination so the
    // cardboard reads clearly instead of vanishing into the dark fog.
    m.emissiveTexture = tex.albedo;
    m.emissiveColor = new BABYLON.Color3(0.55, 0.55, 0.55);
    this.disposables.push(m);
    return m;
  }

  /** Next-gen low-poly cardboard tree: layered faceted canopy + folded trunk. */
  private addTree(tile: BABYLON.TransformNode, x: number, z: number, s: number,
                  trunkMat: BABYLON.Material, leafMat: BABYLON.Material) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder('bldTreeTrunk', {
      diameterTop: 0.5, diameterBottom: 0.9, height: 6, tessellation: 5,
    }, this.scene);
    trunk.parent = tile;
    trunk.position.set(x, 3 * s, z);
    trunk.scaling.setAll(s);
    trunk.material = trunkMat;
    trunk.isPickable = false;
    trunk.applyFog = false;
    // Three stacked faceted icosahedron canopies — crisp low-poly silhouette.
    const tiers = [
      { y: 7, r: 3.4 },
      { y: 10, r: 2.8 },
      { y: 12.6, r: 2.0 },
    ];
    for (const t of tiers) {
      const canopy = BABYLON.MeshBuilder.CreateIcoSphere('bldTreeLeaf', { radius: t.r, subdivisions: 1 }, this.scene);
      canopy.parent = tile;
      canopy.position.set(x, t.y * s, z);
      canopy.scaling.set(1, 0.78, 1);
      canopy.material = leafMat;
      canopy.isPickable = false;
      canopy.applyFog = false;
    }
  }

  /** AAA studio lighting: warm key, cool fill and a golden rim, all restricted
   *  to the building meshes so they never wash out the rest of the scene. */
  private studioLights(meshes: BABYLON.AbstractMesh[]) {
    const key = new BABYLON.DirectionalLight('bldKey', new BABYLON.Vector3(-0.5, -0.8, 0.45), this.scene);
    key.position = new BABYLON.Vector3(60, 120, -40);
    key.intensity = 1.05;
    key.diffuse = new BABYLON.Color3(1.0, 0.9, 0.78);
    const fill = new BABYLON.DirectionalLight('bldFill', new BABYLON.Vector3(0.6, -0.3, -0.7), this.scene);
    fill.intensity = 0.7;
    fill.diffuse = new BABYLON.Color3(0.6, 0.78, 1.0);
    const rim = new BABYLON.DirectionalLight('bldRim', new BABYLON.Vector3(0.2, -0.5, 0.85), this.scene);
    rim.intensity = 1.1;
    rim.diffuse = new BABYLON.Color3(1.0, 0.7, 0.4);
    for (const l of [key, fill, rim]) {
      l.includedOnlyMeshes = meshes;
      this.lights.push(l);
    }
  }

  private load() {
    // Container is preloaded at startup → instantiateModelsToScene is instant.
    const build = (container: BABYLON.AssetContainer | null) => {
        if (!container) return;
        const inst = container.instantiateModelsToScene((n) => n);
        const src = inst.rootNodes.reduce<BABYLON.Mesh[]>((acc, node) => {
          for (const m of (node as BABYLON.AbstractMesh).getChildMeshes ? [node as BABYLON.AbstractMesh, ...(node as BABYLON.AbstractMesh).getChildMeshes(false)] : [node as BABYLON.AbstractMesh]) {
            if (!(m instanceof BABYLON.Mesh) || !m.getTotalVertices || m.getTotalVertices() <= 0) continue;
            // Skip near-zero-height horizontal slabs — those read as floating
            // yellow tables in a side-scrolling view (ground store floors etc).
            const b = m.getBoundingInfo().boundingBox;
            const h = b.maximumWorld.y - b.minimumWorld.y;
            const w = b.maximumWorld.x - b.minimumWorld.x;
            if (h < 2 && w > 20) continue;
            acc.push(m);
          }
          return acc;
        }, []);
        if (!src.length) return;

        // Bounds of the whole kit.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const m of src) {
          m.computeWorldMatrix(true);
          const b = m.getBoundingInfo().boundingBox;
          minX = Math.min(minX, b.minimumWorld.x); maxX = Math.max(maxX, b.maximumWorld.x);
          minY = Math.min(minY, b.minimumWorld.y); maxY = Math.max(maxY, b.maximumWorld.y);
          minZ = Math.min(minZ, b.minimumWorld.z); maxZ = Math.max(maxZ, b.maximumWorld.z);
        }
        const W = maxX - minX, H = maxY - minY;
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

        // Cardboard palette keyed to the source material names.
        const kraft = this.pbr('bldKraft', [0.80, 0.68, 0.50], 311, 0.9);
        const brick = this.pbr('bldBrick', [0.72, 0.44, 0.32], 313, 0.92);
        const cream = this.pbr('bldCream', [0.92, 0.84, 0.66], 317, 0.88);
        const soot = this.pbr('bldSoot', [0.34, 0.30, 0.26], 331, 0.95);
        const trunkMat = this.pbr('bldTrunk', [0.5, 0.36, 0.24], 347, 0.95);
        const leafMat = this.pbr('bldLeaf', [0.42, 0.66, 0.4], 349, 0.92);
        // Warm emissive window material (cozy occupied interiors).
        // Only a FEW windows are warmly lit — most stay dark for contrast.
        const win = new BABYLON.StandardMaterial('bldWindow', this.scene);
        win.diffuseColor = new BABYLON.Color3(0.12, 0.13, 0.16);
        win.emissiveColor = new BABYLON.Color3(0.16, 0.17, 0.2);
        win.disableLighting = true;
        this.disposables.push(win);
        const winLit = new BABYLON.StandardMaterial('bldWindowLit', this.scene);
        winLit.diffuseColor = BABYLON.Color3.Black();
        winLit.emissiveColor = new BABYLON.Color3(1.0, 0.78, 0.42);
        winLit.disableLighting = true;
        this.disposables.push(winLit);

        const isWindow = (n: string) => /window_size|ground_store|transparent/i.test(n);
        const isBrick = (n: string) => /stacco|clay|plaster|solid_color|material$/i.test(n);
        const isMetal = (n: string) => /ac_unit|shutter/i.test(n);

        // Normalize the kit to a fixed strip height, bake world transforms.
        const targetH = 58;
        const scale = targetH / Math.max(1, H);
        const tiles: BABYLON.TransformNode[] = [];
        const mergedMeshes: BABYLON.AbstractMesh[] = [];
        const count = 7;
        const tileWidth = Math.max(70, W * scale * 1.05);

        for (let i = 0; i < count; i++) {
          const tile = new BABYLON.TransformNode(`bldTile_${i}`, this.scene);
          // Between the mid town (z=95) and near town (z=50) so the towers
          // sit inside the neighbourhood rather than behind dense fog.
          tile.position.set(this.centerX + (i - Math.floor(count / 2)) * tileWidth, 0, 78);
          tile.scaling.setAll(scale);
          // The GLB is laid out along X with fronts facing -Z; rotate about Y
          // so the façades look toward the camera (which sits at negative Z).
          tile.rotation.y = Math.PI;
          // Bold per-tile variation: unique height, yaw nudge, tint and palette
          // so no two building clusters read the same.
          const rnd = mulberry32(700 + i * 97);
          const hVar = 0.78 + rnd() * 0.5;      // 0.78x .. 1.28x taller/shorter
          const yawNudge = (rnd() - 0.5) * 0.22; // slight facade angle variation
          tile.scaling.setAll(scale * hVar);
          tile.rotation.y = Math.PI + yawNudge;
          let winIdx = 0;
          for (const m of src) {
            const inst = m.clone(`bld_${i}_${m.name}`, tile);
            if (!inst) continue;
            // Decompose the SOURCE WORLD matrix (the GLB bakes its transforms
            // up in __root__) into the clone's local space, then recenter on
            // the kit bounds so the whole building sits correctly in the tile.
            const wm = m.computeWorldMatrix(true).clone();
            const p = new BABYLON.Vector3(), q = new BABYLON.Quaternion(), sc = new BABYLON.Vector3();
            wm.decompose(sc, q, p);
            inst.position.set(p.x - cx, p.y - minY, p.z - cz);
            inst.rotationQuaternion = q.clone();
            inst.scaling.copyFrom(sc);
            const mn = m.material ? m.material.name : '';
            // Only ~1 in 4 window meshes glow warmly; the rest read dark glass.
            const lit = isWindow(mn) && (winIdx++ % 4 === 0);
            inst.material = lit ? winLit : (isWindow(mn) ? win : (isBrick(mn) ? brick : (isMetal(mn) ? soot : (i % 2 ? kraft : cream))));
            inst.isPickable = false;
            inst.receiveShadows = false;
            inst.visibility = 1; // override any source-GLB transparency
            inst.applyFog = false; // keep the cardboard bright at this depth
          }
          // A few low-poly cardboard trees along the sidewalk.
          for (let t = 0; t < 3; t++) {
            const tx = -25 + rnd() * 50;
            this.addTree(tile, tx, (rnd() - 0.5) * 8, 0.8 + rnd() * 0.7, trunkMat, leafMat);
          }
          // Merge by material into a handful of meshes per tile. Mixing PBR
          // walls and StandardMaterial emissive windows in one MultiMaterial
          // merge fails, so group by material first — 259 calls collapse to ~6.
          const parts = tile.getChildMeshes(false).filter((m) =>
            m instanceof BABYLON.Mesh && !m.isDisposed()) as BABYLON.Mesh[];
          const byMat = new Map<BABYLON.Material, BABYLON.Mesh[]>();
          for (const m of parts) {
            const mat = m.material;
            if (!mat) continue;
            if (!byMat.has(mat)) byMat.set(mat, []);
            byMat.get(mat)!.push(m);
          }
          for (const [mat, group] of byMat) {
            if (group.length < 2) { mergedMeshes.push(group[0]); continue; }
            // Mesh.MergeMeshes throws if vertex attribute sets differ (some GLB
            // pieces lack UVs/normals). Group by attribute signature first.
            const sig = (m: BABYLON.Mesh) => Object.keys(m.getVerticesDataKinds() || {}).sort().join(',');
            const bySig = new Map<string, BABYLON.Mesh[]>();
            for (const m of group) {
              const k = sig(m);
              if (!bySig.has(k)) bySig.set(k, []);
              bySig.get(k)!.push(m);
            }
            for (const sub of bySig.values()) {
              if (sub.length < 2) { mergedMeshes.push(sub[0]); continue; }
              let merged: BABYLON.Mesh | null = null;
              try { merged = BABYLON.Mesh.MergeMeshes(sub, true, true); } catch (e) { void e; }
              if (merged) { merged.material = mat; mergedMeshes.push(merged); }
              else for (const m of sub) mergedMeshes.push(m);
            }
          }
          tiles.push(tile);
        }
        this.studioLights(mergedMeshes);

        // Dispose the template instances (not the cached container) so the
        // next level can instantiate again from the preloaded GLB instantly.
        for (const node of inst.rootNodes.slice()) (node as BABYLON.AbstractMesh).dispose(false, false);

        this.layer = { tiles, tileWidth, speed: 0.42 };
        this.ready = true;
    };
    if (cachedContainer) {
      build(cachedContainer);
    } else {
      preloadBuilding(this.scene).then(() => build(cachedContainer)).catch((e) => console.warn('[BuildingParallax] GLB load failed:', e));
    }
  }

  public scroll(camX: number) {
    if (!this.ready || !this.layer) return;
    const w = this.layer.tileWidth;
    const shift = camX * (1 - this.layer.speed);
    const wrapped = ((shift % w) + w) % w;
    const n = this.layer.tiles.length;
    const half = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      this.layer.tiles[i].position.x = camX + (i - half) * w - wrapped;
    }
  }

  public dispose() {
    if (this.layer) for (const t of this.layer.tiles) t.dispose(false, true);
    for (const l of this.lights) l.dispose();
    for (const m of this.disposables) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
