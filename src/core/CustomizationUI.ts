import { Cosmetics, CATALOG, Slot, CosmeticItem } from '../entities/Cosmetics';
import { BallPlayer } from '../entities/BallPlayer';

/**
 * Customization screen controller — builds the slot tabs + item grid, wires
 * equipping to localStorage persistence, and applies the look to the live rig.
 */
export class CustomizationUI {
  private cosmetics = new Cosmetics();
  private player: BallPlayer | null = null;
  private activeSlot: Slot = 'hat';
  private panel: HTMLElement;
  private tabs: HTMLElement;
  private grid: HTMLElement;
  private onClose: () => void;

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.panel = document.getElementById('customize')!;
    this.tabs = document.getElementById('cust-tabs')!;
    this.grid = document.getElementById('cust-grid')!;

    document.getElementById('btn-cust-random')?.addEventListener('click', () => {
      this.cosmetics.randomize();
      this.apply();
      this.render();
    });
    document.getElementById('btn-cust-reset')?.addEventListener('click', () => {
      this.cosmetics.reset();
      this.apply();
      this.render();
    });
    document.getElementById('btn-cust-done')?.addEventListener('click', () => this.close());

    this.cosmetics.onChange = () => this.apply();
    this.buildTabs();
    this.render();
  }

  public setPlayer(p: BallPlayer) {
    this.player = p;
    this.apply();
  }

  public open() {
    this.panel.classList.add('visible');
    this.render();
  }
  public close() {
    this.panel.classList.remove('visible');
    this.onClose();
  }
  public get isOpen() { return this.panel.classList.contains('visible'); }

  private buildTabs() {
    const slots: { id: Slot; label: string }[] = [
      { id: 'hat', label: '👑 Hat' },
      { id: 'glasses', label: '🕶️ Glasses' },
      { id: 'shirt', label: '👕 Shirt' },
      { id: 'shoes', label: '👟 Shoes' },
    ];
    this.tabs.innerHTML = '';
    for (const s of slots) {
      const tab = document.createElement('div');
      tab.className = 'cust-tab' + (s.id === this.activeSlot ? ' active' : '');
      tab.textContent = s.label;
      tab.addEventListener('click', () => {
        this.activeSlot = s.id;
        this.buildTabs();
        this.render();
      });
      this.tabs.appendChild(tab);
    }
  }

  private render() {
    this.grid.innerHTML = '';
    const items = CATALOG.filter((i) => i.slot === this.activeSlot);
    for (const item of items) {
      const el = document.createElement('div');
      const equipped = this.cosmetics.equipped[this.activeSlot] === item.id;
      el.className = 'cust-item' + (equipped ? ' equipped' : '');
      el.innerHTML = `<span class="ico">${item.emoji}</span><span class="nm">${item.name}</span>`;
      el.addEventListener('click', () => {
        this.cosmetics.equip(this.activeSlot, item.id);
        this.apply();
        this.render();
      });
      this.grid.appendChild(el);
    }
  }

  /** Apply equipped cosmetics to the live character rig. */
  private apply() {
    const p = this.player;
    if (!p) return;
    p.applyCosmetics(this.cosmetics);
  }
}
