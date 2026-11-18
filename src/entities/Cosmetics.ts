/**
 * Cosmetics catalogue + persistence. Items are organized by slot; the player
 * can equip one item per slot. Everything is stored locally between sessions.
 */
export type Slot = 'hat' | 'glasses' | 'shirt' | 'shoes';

export interface CosmeticItem {
  id: string;
  name: string;
  emoji: string;
  slot: Slot;
  color: [number, number, number]; // hex-ish 0..1
}

export const CATALOG: CosmeticItem[] = [
  // HATS
  { id: 'hat-none', name: 'Bare', emoji: '○', slot: 'hat', color: [0, 0, 0] },
  { id: 'hat-bowler', name: 'Bowler', emoji: '🎩', slot: 'hat', color: [0.08, 0.08, 0.12] },
  { id: 'hat-crown', name: 'Crown', emoji: '👑', slot: 'hat', color: [1, 0.82, 0.25] },
  { id: 'hat-party', name: 'Party', emoji: '🎉', slot: 'hat', color: [1, 0.4, 0.7] },
  { id: 'hat-wizard', name: 'Wizard', emoji: '🧙', slot: 'hat', color: [0.5, 0.3, 0.85] },
  // GLASSES
  { id: 'glass-none', name: 'None', emoji: '○', slot: 'glasses', color: [0, 0, 0] },
  { id: 'glass-cool', name: 'Cool Shades', emoji: '🕶️', slot: 'glasses', color: [0.05, 0.05, 0.08] },
  { id: 'glass-round', name: 'Round', emoji: '👓', slot: 'glasses', color: [0.9, 0.75, 0.3] },
  { id: 'glass-3d', name: '3D', emoji: '🥽', slot: 'glasses', color: [0.3, 0.8, 1] },
  // SHIRTS
  { id: 'shirt-none', name: 'Jelly', emoji: '○', slot: 'shirt', color: [0, 0, 0] },
  { id: 'shirt-tux', name: 'Tuxedo', emoji: '🥼', slot: 'shirt', color: [0.1, 0.1, 0.15] },
  { id: 'shirt-hawaii', name: 'Hawaiian', emoji: '🌺', slot: 'shirt', color: [0.2, 0.9, 0.6] },
  { id: 'shirt-super', name: 'Hero Cape', emoji: '🦸', slot: 'shirt', color: [0.9, 0.2, 0.25] },
  // SHOES
  { id: 'shoe-none', name: 'Bare', emoji: '○', slot: 'shoes', color: [0, 0, 0] },
  { id: 'shoe-sneakers', name: 'Sneakers', emoji: '👟', slot: 'shoes', color: [1, 1, 1] },
  { id: 'shoe-boots', name: 'Boots', emoji: '👢', slot: 'shoes', color: [0.4, 0.25, 0.12] },
  { id: 'shoe-spring', name: 'Springs', emoji: '🌀', slot: 'shoes', color: [0.4, 1, 0.6] },
];

const DEFAULT: Record<Slot, string> = {
  hat: 'hat-none', glasses: 'glass-none', shirt: 'shirt-none', shoes: 'shoe-none',
};
const KEY = 'blobothan-cosmetics-v1';

export class Cosmetics {
  public equipped: Record<Slot, string> = { ...DEFAULT };
  public onChange?: () => void;

  constructor() { this.load(); }

  public get(slot: Slot): CosmeticItem {
    return CATALOG.find((i) => i.id === this.equipped[slot]) ?? CATALOG[0];
  }

  public equip(slot: Slot, id: string) {
    this.equipped[slot] = id;
    this.save();
    this.onChange?.();
  }

  public randomize() {
    for (const slot of ['hat', 'glasses', 'shirt', 'shoes'] as Slot[]) {
      const items = CATALOG.filter((i) => i.slot === slot);
      this.equipped[slot] = items[Math.floor(Math.random() * items.length)].id;
    }
    this.save();
    this.onChange?.();
  }

  public reset() { this.equipped = { ...DEFAULT }; this.save(); this.onChange?.(); }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.equipped)); } catch { /* ignore */ }
  }
  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const slot of ['hat', 'glasses', 'shirt', 'shoes'] as Slot[]) {
          if (parsed[slot] && CATALOG.some((i) => i.id === parsed[slot])) this.equipped[slot] = parsed[slot];
        }
      }
    } catch { /* ignore */ }
  }
}
