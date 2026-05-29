import Phaser from 'phaser';
import type { Form } from './FormManager';
import type { Player } from '../entities/Player';
import { getMatter, getWorldBodies } from '../utils/MatterUtils';

const PULL_RANGE    = 260;   // px — passive pull range
const PULL_FORCE    = 0.003; // force magnitude per frame (scales with proximity)
const REPEL_RANGE   = 200;   // px — repel pulse radius
const REPEL_FORCE   = 0.14;  // one-shot push magnitude
const REPEL_CD      = 800;   // ms between repel pulses

export class MagnetForm implements Form {
  private player: Player;

  private gfx:         Phaser.GameObjects.Graphics;
  private lastRepel    = -REPEL_CD;
  private pulseAnim    = 0;   // countdown for repel visual (ms)
  private pullTarget: any = null; // nearest body being pulled
  private lastPullSound = 0; // throttle pull sound (ms)

  constructor(player: Player, getPlayers: () => Player[]) {
    this.player = player;
    void getPlayers; // reserved for orbit-swing (Step 7)
    this.gfx        = player.scene.add.graphics();
  }

  activate(): void { this.gfx.setVisible(true); }
  deactivate(): void { this.gfx.setVisible(false); this.gfx.clear(); this.pullTarget = null; }

  // G key — REPEL PULSE
  primaryAction(): void {
    const now = this.player.scene.time.now;
    if (now - this.lastRepel < REPEL_CD) return;
    this.lastRepel = now;
    this.pulseAnim = 300;
    this.player.scene.events.emit('magnet:repel');

    const M    = getMatter();
    const allB = getWorldBodies(this.player.scene);
    const px   = this.player.x, py = this.player.y;

    for (const body of allB) {
      if (body === this.player.body || body.isStatic) continue;
      const dx   = body.position.x - px;
      const dy   = body.position.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1 || dist > REPEL_RANGE) continue;

      const mag  = REPEL_FORCE * (1 - dist / REPEL_RANGE);
      M.Body.applyForce(body, body.position, { x: (dx / dist) * mag, y: (dy / dist) * mag });
    }
  }

  secondaryAction(): void {}
  interactAction(): void {}

  update(delta: number): void {
    this.gfx.clear();
    if (this.pulseAnim > 0) this.pulseAnim -= delta;

    const M    = getMatter();
    const px   = this.player.x;
    const py   = this.player.y;

    // ── Passive pull on nearest non-static, non-self body ──
    this.pullTarget = null;
    const allB  = getWorldBodies(this.player.scene);
    let bestDist = PULL_RANGE;

    for (const body of allB) {
      if (body === this.player.body || body.isStatic) continue;
      const dx   = body.position.x - px;
      const dy   = body.position.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) { bestDist = dist; this.pullTarget = body; }
    }

    if (this.pullTarget) {
      const dx   = px - this.pullTarget.position.x;
      const dy   = py - this.pullTarget.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const mag = PULL_FORCE * (1 - dist / PULL_RANGE);
        M.Body.applyForce(this.pullTarget, this.pullTarget.position,
          { x: (dx / dist) * mag, y: (dy / dist) * mag });
        const now = this.player.scene.time.now;
        if (now - this.lastPullSound > 600) {
          this.lastPullSound = now;
          this.player.scene.events.emit('magnet:pull');
        }
      }
    }

    this.drawBeam(delta);
  }

  private drawBeam(_delta: number): void {
    const g    = this.gfx;
    const t    = this.player.scene.time.now;
    const px   = this.player.x, py = this.player.y;

    // Repel pulse ring
    if (this.pulseAnim > 0) {
      const ratio = this.pulseAnim / 300;
      const ring  = REPEL_RANGE * (1 - ratio);
      g.lineStyle(4, 0xffee33, ratio * 0.7);
      g.strokeCircle(px, py, ring);
      g.lineStyle(2, 0xffffff, ratio * 0.4);
      g.strokeCircle(px, py, ring * 0.6);
    }

    // Pull beam to target
    if (this.pullTarget) {
      const tx = this.pullTarget.position.x;
      const ty = this.pullTarget.position.y;
      const dist = Phaser.Math.Distance.Between(px, py, tx, ty);

      // Dashed beam
      const angle   = Math.atan2(ty - py, tx - px);
      const segLen  = 10, gap = 6;
      let traveled  = 0;
      while (traveled < dist - 6) {
        const end = Math.min(traveled + segLen, dist - 6);
        const flicker = 0.5 + Math.sin(t / 80 + traveled * 0.1) * 0.4;
        g.lineStyle(2, 0xffee33, flicker * 0.85);
        g.beginPath();
        g.moveTo(px + Math.cos(angle) * traveled, py + Math.sin(angle) * traveled);
        g.lineTo(px + Math.cos(angle) * end,      py + Math.sin(angle) * end);
        g.strokePath();
        traveled += segLen + gap;
      }

      // Glow at target
      g.lineStyle(6, 0xffee33, 0.12);
      g.strokeCircle(tx, ty, 14);
      g.lineStyle(2, 0xffee33, 0.5);
      g.strokeCircle(tx, ty, 8);

      // Arrow toward player on beam
      g.fillStyle(0xffee33, 0.8);
      const midDist = dist * 0.5;
      const mx = px + Math.cos(angle) * midDist;
      const my = py + Math.sin(angle) * midDist;
      const perpX = -Math.sin(angle) * 4;
      const perpY =  Math.cos(angle) * 4;
      g.fillTriangle(
        mx - Math.cos(angle) * 5, my - Math.sin(angle) * 5,
        mx + perpX, my + perpY,
        mx - perpX, my - perpY,
      );
    }
  }
}
