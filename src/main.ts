import Phaser from 'phaser';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';

// ── Fullscreen scale ────────────────────────────────────────────────────────
// Phaser renders at a fixed 1280×720 logical canvas.
// A CSS transform on #game-wrapper scales the whole thing (canvas + HTML HUD)
// to fill the browser window while keeping the aspect ratio.
function fitToWindow(): void {
  const wrapper = document.getElementById('game-wrapper');
  if (!wrapper) return;
  const scaleX = window.innerWidth  / 1280;
  const scaleY = window.innerHeight / 720;
  const scale  = Math.max(scaleX, scaleY);   // cover: fill window, clip overflow
  const ox = (window.innerWidth  - 1280 * scale) / 2;
  const oy = (window.innerHeight - 720  * scale) / 2;
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.left = `${ox}px`;
  wrapper.style.top  = `${oy}px`;
}

window.addEventListener('resize', fitToWindow);
fitToWindow();

// Block browser right-click context menu on the game
document.getElementById('game-wrapper')?.addEventListener('contextmenu', e => e.preventDefault());

// ── Phaser game ─────────────────────────────────────────────────────────────
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#070b12',
  parent: 'game-wrapper',
  input: {
    gamepad: true,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 2 },
      debug: false,
    },
  },
  scene: [LobbyScene, GameScene],
};

new Phaser.Game(config);
