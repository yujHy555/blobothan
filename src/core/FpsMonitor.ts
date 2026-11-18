/** Slick AAA-style FPS counter with a live rolling graph. */
export class FpsMonitor {
  private el: HTMLElement;
  private num: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private history: number[] = new Array(56).fill(60);
  private acc = 0;
  private frames = 0;
  private graphAcc = 0;

  constructor() {
    this.el = document.getElementById('fps')!;
    this.num = document.getElementById('fps-num')!;
    this.canvas = document.getElementById('fps-graph') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');
  }

  /** Call once per rendered frame with delta time in seconds. */
  update(dt: number) {
    if (!this.el) return;
    if (dt > 0) { this.acc += dt; this.frames++; }
    if (this.acc >= 0.25) {
      const fps = Math.round(this.frames / this.acc);
      this.num.textContent = String(fps);
      this.el.classList.toggle('warn', fps < 50 && fps >= 30);
      this.el.classList.toggle('bad', fps < 30);
      this.acc = 0; this.frames = 0;
      this.history.push(fps);
      if (this.history.length > 56) this.history.shift();
    }
    this.graphAcc += dt;
    if (this.graphAcc >= 0.1 && this.ctx) {
      this.graphAcc = 0;
      this.draw();
    }
  }

  private draw() {
    const c = this.ctx!, w = this.canvas.width, h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    // baseline grid
    c.strokeStyle = 'rgba(127,255,212,0.12)'; c.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const y = (h / 3) * i;
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
    // 60fps ref line
    const y60 = h - (60 / 90) * h;
    c.strokeStyle = 'rgba(127,255,212,0.3)'; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(0, y60); c.lineTo(w, y60); c.stroke();
    c.setLineDash([]);
    // history bars
    const n = this.history.length;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const fps = this.history[i];
      const bh = Math.max(2, Math.min(h, (fps / 90) * h));
      const x = i * bw;
      c.fillStyle = fps >= 50 ? 'rgba(127,255,212,0.75)' : fps >= 30 ? 'rgba(255,212,91,0.8)' : 'rgba(255,95,111,0.85)';
      c.fillRect(x, h - bh, Math.max(1, bw - 1), bh);
    }
  }
}
