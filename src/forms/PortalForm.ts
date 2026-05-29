import Phaser from 'phaser';
import type { Form } from './FormManager';
import type { Player } from '../entities/Player';

const PORTAL_RADIUS   = 22;
const PORTAL_LIFETIME = 8000; // ms
const USE_RADIUS      = 36;   // px — how close a player must be to press F and TP
const TELEPORT_CD     = 800;  // ms cooldown per player after teleport

interface PortalData {
  x: number;
  y: number;
  age: number;
  gfx: Phaser.GameObjects.Graphics;
}

export class PortalForm implements Form {
  private player:  Player;
  /** All players — used to let any teammate teleport via F near this player's portals. */
  private getPlayers: () => Player[];

  private portalA: PortalData | null = null;
  private portalB: PortalData | null = null;
  private phase: 'A' | 'B' = 'A';

  // Per-player teleport cooldown (player index → timestamp)
  private tpCooldown = new Map<number, number>();

  constructor(player: Player, getPlayers: () => Player[]) {
    this.player     = player;
    this.getPlayers = getPlayers;
  }

  activate(): void {}
  deactivate(): void {}

  // ── G key: place portals ──────────────────────────────────────────────────
  primaryAction(): void {
    const { x, y } = this.player;
    const scene     = this.player.scene;

    if (this.phase === 'A') {
      this.portalA?.gfx.destroy();
      this.portalA = { x, y, age: 0, gfx: scene.add.graphics() };
      this.phase   = 'B';
      scene.events.emit('portal:place', { isA: true, x, y, slot: this.player.index });
    } else {
      this.portalB?.gfx.destroy();
      this.portalB = { x, y, age: 0, gfx: scene.add.graphics() };
      this.phase   = 'A';
      scene.events.emit('portal:place', { isA: false, x, y, slot: this.player.index });
    }
  }

  /** Called on remote clients to sync a portal placed by another player. */
  syncPortal(isA: boolean, x: number, y: number): void {
    const scene = this.player.scene;
    if (isA) {
      this.portalA?.gfx.destroy();
      this.portalA = { x, y, age: 0, gfx: scene.add.graphics() };
      this.phase   = 'B';
    } else {
      this.portalB?.gfx.destroy();
      this.portalB = { x, y, age: 0, gfx: scene.add.graphics() };
      this.phase   = 'A';
    }
  }

  /** Called on remote clients to clear portals placed by another player. */
  clearPortals(): void {
    this.portalA?.gfx.destroy(); this.portalA = null;
    this.portalB?.gfx.destroy(); this.portalB = null;
    this.phase = 'A';
  }

  // ── F key: any player near a portal presses F to teleport ────────────────
  interactAction(): void {
    if (!this.portalA || !this.portalB) return;
    const now = this.player.scene.time.now;

    // Check the pressing player AND all teammates near this player's portals
    for (const p of this.getPlayers()) {
      const lastTp = this.tpCooldown.get(p.index) ?? 0;
      if (now - lastTp < TELEPORT_CD) continue;

      const distA = Phaser.Math.Distance.Between(p.x, p.y, this.portalA.x, this.portalA.y);
      const distB = Phaser.Math.Distance.Between(p.x, p.y, this.portalB.x, this.portalB.y);

      if (distA < USE_RADIUS) {
        p.setPosition(this.portalB.x, this.portalB.y - 4);
        this.tpCooldown.set(p.index, now);
        this.flashPortal(this.portalA);
        this.flashPortal(this.portalB);
        this.player.scene.events.emit('portal:teleport');
      } else if (distB < USE_RADIUS) {
        p.setPosition(this.portalA.x, this.portalA.y - 4);
        this.tpCooldown.set(p.index, now);
        this.flashPortal(this.portalA);
        this.flashPortal(this.portalB);
        this.player.scene.events.emit('portal:teleport');
      }
    }
  }

  // ── Secondary (unused / clear) ────────────────────────────────────────────
  secondaryAction(): void {
    if (this.portalA || this.portalB) {
      this.player.scene.events.emit('portal:clear', { slot: this.player.index });
    }
    this.portalA?.gfx.destroy(); this.portalA = null;
    this.portalB?.gfx.destroy(); this.portalB = null;
    this.phase = 'A';
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(delta: number): void {
    // Tick lifetimes
    if (this.portalA) this.portalA.age += delta;
    if (this.portalB) this.portalB.age += delta;

    if (this.portalA && this.portalA.age > PORTAL_LIFETIME) {
      this.portalA.gfx.destroy(); this.portalA = null; this.phase = 'A';
    }
    if (this.portalB && this.portalB.age > PORTAL_LIFETIME) {
      this.portalB.gfx.destroy(); this.portalB = null;
    }

    // Draw portals
    if (this.portalA) this.drawPortal(this.portalA, 0x44aaff, 'A');
    if (this.portalB) this.drawPortal(this.portalB, 0xff8844, 'B');

    // Connection line
    if (this.portalA && this.portalB) {
      const ratio = 1 - Math.max(this.portalA.age, this.portalB.age) / PORTAL_LIFETIME;
      this.portalA.gfx.lineStyle(1, 0xffffff, 0.07 * ratio);
      this.portalA.gfx.beginPath();
      this.portalA.gfx.moveTo(this.portalA.x, this.portalA.y);
      this.portalA.gfx.lineTo(this.portalB.x, this.portalB.y);
      this.portalA.gfx.strokePath();
    }

    // "Press F" prompt above nearby portals for the owning player
    this.drawUsePrompt();
  }

  private drawUsePrompt(): void {
    // Show prompt on whichever portal the player is near
    for (const portal of [this.portalA, this.portalB]) {
      if (!portal) continue;
      const other = portal === this.portalA ? this.portalB : this.portalA;
      if (!other) continue; // need both for TP to work

      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, portal.x, portal.y);

      if (dist < USE_RADIUS) {
        const g = portal.gfx;
        const t = this.player.scene.time.now;
        const pulse = 0.6 + Math.sin(t / 180) * 0.4;

        // Highlight ring
        g.lineStyle(3, 0xffffff, pulse * 0.8);
        g.strokeCircle(portal.x, portal.y, PORTAL_RADIUS + 5);

        // "F" label above portal — simple geometric F shape
        const lx = portal.x - 4, ly = portal.y - PORTAL_RADIUS - 20;
        g.lineStyle(2, 0xffffff, 0.9);
        g.beginPath(); g.moveTo(lx, ly);      g.lineTo(lx + 8, ly);      g.strokePath();
        g.beginPath(); g.moveTo(lx, ly);      g.lineTo(lx, ly + 12);     g.strokePath();
        g.beginPath(); g.moveTo(lx, ly + 6);  g.lineTo(lx + 6, ly + 6);  g.strokePath();
      }
    }
  }

  private flashPortal(p: PortalData): void {
    p.age = Math.max(0, p.age - 300);
  }

  private drawPortal(p: PortalData, color: number, label: string): void {
    const g          = p.gfx;
    g.clear();

    const t         = this.player.scene.time.now;
    const lifeRatio = 1 - p.age / PORTAL_LIFETIME;
    const pulse     = 0.85 + Math.sin(t / 200) * 0.15;
    const r         = PORTAL_RADIUS;

    // Outer glow
    g.lineStyle(12, color, 0.05 * lifeRatio);
    g.strokeCircle(p.x, p.y, r + 12);
    g.lineStyle(6, color, 0.12 * lifeRatio);
    g.strokeCircle(p.x, p.y, r + 6);

    // Main ring
    g.lineStyle(3, color, 0.9 * lifeRatio * pulse);
    g.strokeCircle(p.x, p.y, r);

    // Rotating inner arc segments
    const rotOffset = (t / 600) % (Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const startA = rotOffset + (i / 4) * Math.PI * 2;
      const endA   = startA + Math.PI / 2 * 0.6;
      g.lineStyle(2, color, 0.7 * lifeRatio);
      g.beginPath();
      g.arc(p.x, p.y, r - 5, startA, endA);
      g.strokePath();
    }

    // Dark interior
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(p.x, p.y, r - 4);

    // Center glow
    g.fillStyle(color, 0.6 * lifeRatio * pulse);
    g.fillCircle(p.x, p.y, 5);

    // Time-remaining drain arc
    const remaining = 1 - p.age / PORTAL_LIFETIME;
    g.lineStyle(2, 0xffffff, 0.25 * remaining);
    g.beginPath();
    g.arc(p.x, p.y, r + 3, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
    g.strokePath();

    // Identity symbol
    g.fillStyle(color, 0.85 * lifeRatio);
    if (label === 'A') {
      g.fillTriangle(p.x, p.y - 7, p.x - 5, p.y + 4, p.x + 5, p.y + 4);
    } else {
      g.fillRect(p.x - 4, p.y - 4, 8, 8);
    }
  }
}
