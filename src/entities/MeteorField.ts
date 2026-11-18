import * as BABYLON from 'babylonjs';
import { Materials } from '../art/Materials';

interface Meteor {
  head: BABYLON.Mesh;
  trail: BABYLON.Mesh;
  speed: number;
  angle: number;
  len: number;
  phase: number;
}

/** AAA background meteor/comet shower — pure ambience, far behind the level. */
export class MeteorField {
  private meteors: Meteor[] = [];
  private root: BABYLON.TransformNode;
  private t = 0;
  private centerX: number;

  constructor(scene: BABYLON.Scene, mats: Materials, centerX: number, accent: [number, number, number]) {
    this.centerX = centerX;
    this.root = new BABYLON.TransformNode('meteorField', scene);
    const colors: [number, number, number][] = [
      accent,
      [1.0, 0.85, 0.4],
      [0.6, 0.9, 1.0],
      [1.0, 0.5, 0.8],
    ];
    for (let i = 0; i < 14; i++) {
      const col = colors[i % colors.length];
      const head = BABYLON.MeshBuilder.CreateSphere('meteorHead', { diameter: 0.6 + Math.random() * 0.8, segments: 10 }, scene);
      head.parent = this.root;
      head.material = mats.glow(`meteorHead${i}`, col);
      // Trail = a stretched cone pointing back along the travel direction
      const trail = BABYLON.MeshBuilder.CreateCylinder('meteorTrail', {
        diameterTop: 0.5, diameterBottom: 0, height: 1, tessellation: 10,
      }, scene);
      trail.parent = head;
      trail.material = mats.glow(`meteorTrail${i}`, col, 0.35);
      trail.isPickable = false;
      head.isPickable = false;
      const m: Meteor = {
        head, trail,
        speed: 22 + Math.random() * 30,
        angle: -0.5 - Math.random() * 0.35, // streaking down-right
        len: 8 + Math.random() * 16,
        phase: Math.random() * 100,
      };
      this.meteors.push(m);
      this.resetMeteor(m, true);
    }
  }

  private resetMeteor(m: Meteor, initial = false) {
    const span = 160;
    const x = this.centerX + (initial ? (Math.random() - 0.5) * span : -span * 0.6);
    const y = 90 + Math.random() * 40;
    m.head.position.set(x, y, -150 - Math.random() * 40);
  }

  public update(dt: number) {
    this.t += dt;
    for (const m of this.meteors) {
      m.head.position.x += Math.cos(m.angle) * m.speed * dt;
      m.head.position.y += Math.sin(m.angle) * m.speed * dt;
      // Trail trails behind the head along travel direction
      m.trail.rotation.z = m.angle - Math.PI / 2;
      m.trail.position.set(-Math.cos(m.angle) * m.len * 0.5, -Math.sin(m.angle) * m.len * 0.5, 0);
      m.trail.scaling.y = m.len;
      m.head.scaling.setAll(0.85 + Math.sin(this.t * 12 + m.phase) * 0.15);
      if (m.head.position.y < 10 || m.head.position.x > this.centerX + 120) this.resetMeteor(m);
    }
  }

  public dispose() { this.root.dispose(false, true); }
}
