import { Game } from './main';

const babylon = document.getElementById('babylon') as HTMLCanvasElement;
const pixi = document.getElementById('pixi') as HTMLCanvasElement;

if (!babylon || !pixi) {
  console.error('Canvas elements not found');
} else {
  const game = new Game(babylon, pixi);
  (window as any).__blobothan = game;
  window.addEventListener('beforeunload', () => location.reload);
}
