import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { RadiationZoneDef } from '../levels/LevelLoader';

const REGEN_RATE    = 5;   // hp/s outside radiation
const INCAP_REVIVE  = 3000; // ms auto-recovery if no teammate revives
const REVIVE_RANGE  = 80;  // px — range to revive incapacitated teammate
const REVIVE_HP     = 40;

interface LiveZone {
  def: RadiationZoneDef;
  sealed: boolean;        // set true by arrow target hit
  sealMs: number;         // remaining seal duration
  gfx: Phaser.GameObjects.Graphics;
}

export class RadiationSystem {
  private scene:   Phaser.Scene;
  private players: Player[];
  private zones:   LiveZone[] = [];

  constructor(scene: Phaser.Scene, players: Player[]) {
    this.scene   = scene;
    this.players = players;
  }

  addZones(defs: RadiationZoneDef[]): void {
    for (const def of defs) {
      this.zones.push({
        def,
        sealed: false,
        sealMs: 0,
        gfx: this.scene.add.graphics(),
      });
    }
  }

  sealZone(id: string, durationMs: number): void {
    const z = this.zones.find(z => z.def.id === id);
    if (!z) return;
    z.sealed = true;
    z.sealMs = durationMs;
  }

  update(delta: number): void {
    const dt = delta / 1000; // seconds

    // Tick seal timers
    for (const z of this.zones) {
      if (z.sealed) {
        z.sealMs -= delta;
        if (z.sealMs <= 0) { z.sealed = false; z.sealMs = 0; }
      }
    }

    for (const player of this.players) {
      if (player.incapacitated) {
        player.incapTimer -= delta;
        if (player.incapTimer <= 0) {
          // Auto-revive with partial health
          this.revivePlayer(player, REVIVE_HP * 0.5);
        }
        continue;
      }

      let inRad = false;
      let maxDrain = 0;
      for (const z of this.zones) {
        if (z.sealed) continue;
        const { x, y, w, h } = z.def;
        if (player.x >= x && player.x <= x + w &&
            player.y >= y && player.y <= y + h) {
          inRad = true;
          maxDrain = Math.max(maxDrain, z.def.drainRate);
        }
      }

      if (inRad) {
        player.health = Math.max(0, player.health - maxDrain * dt);
      } else {
        player.health = Math.min(100, player.health + REGEN_RATE * dt);
      }

      if (player.health <= 0 && !player.incapacitated) {
        this.incapacitate(player);
      }
    }

    this.drawZones();
  }

  // Called when player presses E near an incapacitated teammate
  tryRevive(reviver: Player): boolean {
    for (const target of this.players) {
      if (target === reviver || !target.incapacitated) continue;
      const dist = Phaser.Math.Distance.Between(reviver.x, reviver.y, target.x, target.y);
      if (dist <= REVIVE_RANGE) {
        this.revivePlayer(target, REVIVE_HP);
        return true;
      }
    }
    return false;
  }

  getIncapacitated(): Player[] {
    return this.players.filter(p => p.incapacitated);
  }

  /** Returns true if the player is currently inside any active (unsealed) radiation zone. */
  isPlayerInZone(player: Player): boolean {
    for (const z of this.zones) {
      if (z.sealed) continue;
      const { x, y, w, h } = z.def;
      if (player.x >= x && player.x <= x + w &&
          player.y >= y && player.y <= y + h) return true;
    }
    return false;
  }

  private incapacitate(player: Player): void {
    player.incapacitated = true;
    player.incapTimer    = INCAP_REVIVE;
    player.health        = 0;
    player.setVelocity(0, 0);
    this.scene.events.emit('player:incapacitated', { player });
  }

  private revivePlayer(player: Player, hp: number): void {
    player.incapacitated = false;
    player.incapTimer    = 0;
    player.health        = hp;
    this.scene.events.emit('player:revived', { player });
  }

  private drawZones(): void {
    const t = this.scene.time.now;
    for (const z of this.zones) {
      const g   = z.gfx;
      const def = z.def;
      g.clear();

      if (z.sealed) {
        // Sealed: dim green outline only
        g.lineStyle(2, 0x00ff44, 0.2);
        g.strokeRect(def.x, def.y, def.w, def.h);
        continue;
      }

      // Active radiation: animated green fill
      const pulse = 0.06 + Math.sin(t / 400) * 0.03;
      g.fillStyle(0x00ff44, pulse);
      g.fillRect(def.x, def.y, def.w, def.h);

      // Border glow
      const borderAlpha = 0.3 + Math.sin(t / 300) * 0.1;
      g.lineStyle(3, 0x00ff44, borderAlpha);
      g.strokeRect(def.x, def.y, def.w, def.h);

      // Hazard stripes on edges
      g.lineStyle(1, 0x00aa33, 0.25);
      const stripeW = 20;
      for (let sx = def.x; sx < def.x + def.w; sx += stripeW * 2) {
        g.fillStyle(0x00ff44, 0.04);
        g.fillRect(sx, def.y, stripeW, def.h);
      }

      // "RAD" label at top of each zone
      const cx = def.x + def.w / 2;
      const cy = def.y + 14;
      g.fillStyle(0x00ff44, 0.5 + Math.sin(t / 200) * 0.2);
      // Draw simple triangular radiation symbol
      g.fillCircle(cx, cy, 4);
      g.lineStyle(1, 0x00ff44, 0.6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        g.beginPath();
        g.arc(cx, cy, 9, a - 0.5, a + 0.5);
        g.strokePath();
      }
    }
  }
}
