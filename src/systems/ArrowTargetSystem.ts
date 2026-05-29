import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { ArrowTargetDef } from '../levels/LevelLoader';

interface LiveTarget {
  def:          ArrowTargetDef;
  gfx:          Phaser.GameObjects.Graphics;
  cooldownMs:   number;   // time until triggerable again
  angle:        number;   // rotating_disc rotation; pendulum swing; orbital spin
  panelOffset:  number;   // sliding_panel current x offset
}

const TRIGGER_COOLDOWN = 3000; // ms before same target can trigger again

export class ArrowTargetSystem {
  private scene:   Phaser.Scene;
  private players: Player[];
  private targets: LiveTarget[] = [];

  constructor(scene: Phaser.Scene, players: Player[]) {
    this.scene   = scene;
    this.players = players;
  }

  addTargets(defs: ArrowTargetDef[]): void {
    for (const def of defs) {
      this.targets.push({
        def,
        gfx:         this.scene.add.graphics(),
        cooldownMs:  0,
        angle:       0,
        panelOffset: 0,
      });
    }
  }

  update(delta: number): void {
    const dt  = delta / 1000;
    const now = this.scene.time.now;

    for (const target of this.targets) {
      if (target.cooldownMs > 0) target.cooldownMs = Math.max(0, target.cooldownMs - delta);

      // Animate state
      switch (target.def.type) {
        case 'rotating_disc':
          target.angle += Math.PI * 0.7 * dt;
          break;
        case 'pendulum': {
          const period = target.def.pendulumPeriod ?? 2400;
          target.angle = Math.sin((now / period) * Math.PI * 2) * (Math.PI / 3.5);
          break;
        }
        case 'sliding_panel': {
          const period = target.def.panelPeriod ?? 3000;
          const amp    = target.def.panelAmp    ?? 80;
          target.panelOffset = Math.sin((now / period) * Math.PI * 2) * amp;
          break;
        }
        case 'orbital_ring':
          target.angle = (now / 1000) * 1.4;
          break;
      }

      if (target.cooldownMs <= 0) this.checkHit(target);
      this.drawTarget(target);
    }
  }

  private checkHit(target: LiveTarget): void {
    const zones = this.getHitZones(target);
    for (const player of this.players) {
      if (player.incapacitated) continue;
      const archer = player.formManager.getArcherForm();
      if (!archer) continue;
      for (const z of zones) {
        if (archer.checkAndConsumeHit(z.x, z.y, z.r)) {
          target.cooldownMs = TRIGGER_COOLDOWN;
          this.scene.events.emit('arrowTarget:hit', {
            id:           target.def.id,
            effect:       target.def.effect,
            effectTarget: target.def.effectTarget,
            durationMs:   target.def.effectDurationMs,
          });
          return;
        }
      }
    }
  }

  private getHitZones(target: LiveTarget): { x: number; y: number; r: number }[] {
    const { def } = target;
    switch (def.type) {
      case 'rotating_disc':
        return [{ x: def.x, y: def.y, r: def.radius ?? 22 }];

      case 'sliding_panel': {
        const cx = def.x + target.panelOffset;
        return [{ x: cx, y: def.y, r: (def.panelW ?? 60) / 2 }];
      }

      case 'pendulum': {
        const len = def.pendulumLen ?? 60;
        return [{
          x: def.x + Math.sin(target.angle) * len,
          y: def.y + Math.cos(target.angle) * len,
          r: 16,
        }];
      }

      case 'orbital_ring': {
        const count = def.orbitalCount  ?? 3;
        const rad   = def.orbitalRadius ?? 28;
        const zones: { x: number; y: number; r: number }[] = [];
        for (let i = 0; i < count; i++) {
          const a = target.angle + (i / count) * Math.PI * 2;
          zones.push({ x: def.x + Math.cos(a) * rad, y: def.y + Math.sin(a) * rad, r: 12 });
        }
        return zones;
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawTarget(target: LiveTarget): void {
    const g      = target.gfx;
    const { def } = target;
    const t      = this.scene.time.now;
    g.clear();

    const onCooldown = target.cooldownMs > 0;
    const color  = onCooldown ? 0x00ff88 : 0xff6600;
    const alpha  = onCooldown ? 0.55     : 1.0;
    const pulse  = 0.65 + Math.sin(t / 280) * 0.35;

    switch (def.type) {
      case 'rotating_disc':
        this.drawDisc(g, def.x, def.y, def.radius ?? 22, target.angle, color, alpha * pulse);
        break;

      case 'sliding_panel': {
        const cx = def.x + target.panelOffset;
        const pw = def.panelW ?? 60;
        const ph = def.panelH ?? 18;
        // Track line
        const amp = def.panelAmp ?? 80;
        g.lineStyle(1, 0x334455, 0.35);
        g.beginPath(); g.moveTo(def.x - amp, def.y); g.lineTo(def.x + amp, def.y); g.strokePath();
        g.lineStyle(2, color, alpha * pulse);
        g.fillStyle(color, 0.15 * alpha);
        g.fillRect(cx - pw / 2, def.y - ph / 2, pw, ph);
        g.strokeRect(cx - pw / 2, def.y - ph / 2, pw, ph);
        g.lineStyle(1.5, 0xffffff, 0.65 * alpha);
        g.beginPath(); g.moveTo(cx - 10, def.y); g.lineTo(cx + 10, def.y); g.strokePath();
        g.beginPath(); g.moveTo(cx, def.y - 7); g.lineTo(cx, def.y + 7); g.strokePath();
        g.fillStyle(color, alpha);
        g.fillCircle(cx, def.y, 4);
        break;
      }

      case 'pendulum': {
        const len = def.pendulumLen ?? 60;
        const bx  = def.x + Math.sin(target.angle) * len;
        const by  = def.y + Math.cos(target.angle) * len;
        g.lineStyle(1.5, 0x556677, 0.6);
        g.beginPath(); g.moveTo(def.x, def.y); g.lineTo(bx, by); g.strokePath();
        g.fillStyle(0x556677, 0.8); g.fillCircle(def.x, def.y, 5);
        g.lineStyle(6, color, 0.08 * alpha); g.strokeCircle(bx, by, 18);
        g.lineStyle(2, color, alpha);         g.strokeCircle(bx, by, 14);
        g.fillStyle(color, 0.18 * alpha);     g.fillCircle(bx, by, 14);
        g.lineStyle(1.5, 0xffffff, 0.7 * alpha);
        g.beginPath(); g.moveTo(bx - 8, by); g.lineTo(bx + 8, by); g.strokePath();
        g.beginPath(); g.moveTo(bx, by - 8); g.lineTo(bx, by + 8); g.strokePath();
        g.fillStyle(color, alpha * pulse); g.fillCircle(bx, by, 4);
        break;
      }

      case 'orbital_ring': {
        const count = def.orbitalCount  ?? 3;
        const rad   = def.orbitalRadius ?? 28;
        g.fillStyle(0x223344, 0.9); g.fillCircle(def.x, def.y, 7);
        g.lineStyle(1, color, 0.25); g.strokeCircle(def.x, def.y, rad);
        for (let i = 0; i < count; i++) {
          const a = target.angle + (i / count) * Math.PI * 2;
          const nx = def.x + Math.cos(a) * rad;
          const ny = def.y + Math.sin(a) * rad;
          g.lineStyle(5, color, 0.08 * alpha); g.strokeCircle(nx, ny, 14);
          g.lineStyle(2, color, alpha);         g.strokeCircle(nx, ny, 11);
          g.fillStyle(color, 0.18 * alpha);     g.fillCircle(nx, ny, 11);
          g.lineStyle(1.5, 0xffffff, 0.6 * alpha);
          g.beginPath(); g.moveTo(nx - 6, ny); g.lineTo(nx + 6, ny); g.strokePath();
          g.beginPath(); g.moveTo(nx, ny - 6); g.lineTo(nx, ny + 6); g.strokePath();
          g.fillStyle(color, alpha * pulse); g.fillCircle(nx, ny, 3);
        }
        break;
      }
    }

    // Cooldown arc at target center
    if (onCooldown) {
      const frac     = target.cooldownMs / TRIGGER_COOLDOWN;
      const endAngle = -Math.PI / 2 + (1 - frac) * Math.PI * 2;
      g.lineStyle(3, 0x00ff88, 0.7);
      g.beginPath(); g.arc(def.x, def.y, 30, -Math.PI / 2, endAngle); g.strokePath();
    }
  }

  private drawDisc(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, angle: number, color: number, alpha: number): void {
    g.lineStyle(7, color, 0.07 * alpha); g.strokeCircle(x, y, r + 9);
    g.lineStyle(2.5, color, alpha);       g.strokeCircle(x, y, r);
    g.fillStyle(color, 0.12 * alpha);     g.fillCircle(x, y, r);

    const spoke = 4;
    for (let i = 0; i < spoke; i++) {
      const a = angle + (i / spoke) * Math.PI * 2;
      g.lineStyle(1.5, color, alpha * 0.75);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.strokePath();
      g.fillStyle(color, alpha); g.fillCircle(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3), 3);
    }

    g.fillStyle(color, alpha);       g.fillCircle(x, y, 5);
    g.fillStyle(0xffffff, 0.55 * alpha); g.fillCircle(x, y, 2.5);
  }
}
