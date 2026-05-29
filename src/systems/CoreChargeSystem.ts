import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { CoreChargeDef, InsertionSlotDef } from '../levels/LevelLoader';
import { getMatter } from '../utils/MatterUtils';

const PICKUP_RANGE   = 50;  // px
const INSERT_RANGE   = 55;  // px
const INSERT_TIME    = 2000; // ms to stand at slot
const DECAY_TIME     = 30000; // ms before dropped charge decays
const BLINK_START    = 20000; // ms — when blinking starts

interface LiveCharge {
  id:         string;
  x:          number;
  y:          number;
  carrier:    Player | null;
  dropped:    boolean;
  decayMs:    number;  // remaining decay time when dropped
  gfx:        Phaser.GameObjects.Graphics;
  inserted:   boolean;
}

interface InsertProgress {
  slotId:  string;
  player:  Player;
  timeMs:  number;
}

export class CoreChargeSystem {
  private scene:     Phaser.Scene;
  private players:   Player[];
  private charges:   LiveCharge[] = [];
  private slots:     InsertionSlotDef[] = [];
  private slotGfx:   Map<string, Phaser.GameObjects.Graphics> = new Map();
  private progress:  Map<string, InsertProgress> = new Map(); // slotId → progress
  private slotFilled: Set<string> = new Set();

  private needed:    number = 3;

  constructor(scene: Phaser.Scene, players: Player[], needed: number) {
    this.scene   = scene;
    this.players = players;
    this.needed  = needed;

    // Force-drop charge when a player is respawned after falling
    scene.events.on('charge:forceDropFor', (ev: { player: Player }) => {
      this.dropCharge(ev.player);
    });
  }

  spawnCharges(defs: CoreChargeDef[]): void {
    for (const def of defs) {
      this.charges.push({
        id:       def.id,
        x:        def.x,
        y:        def.y,
        carrier:  null,
        dropped:  false,
        decayMs:  DECAY_TIME,
        inserted: false,
        gfx:      this.scene.add.graphics(),
      });
    }
  }

  addSlots(defs: InsertionSlotDef[]): void {
    this.slots = defs;
    for (const def of defs) {
      this.slotGfx.set(def.id, this.scene.add.graphics());
    }
  }

  // Called each frame — handles pickup, drop, insertion progress
  update(delta: number): void {
    for (const charge of this.charges) {
      if (charge.inserted) continue;

      if (charge.carrier) {
        // Follow carrier
        charge.x = charge.carrier.x;
        charge.y = charge.carrier.y - 50;
      } else if (charge.dropped) {
        // Tick decay
        charge.decayMs -= delta;
        if (charge.decayMs <= 0) {
          charge.inserted = true; // "decay = disappear"
          charge.gfx.clear();
        }
      }

      this.drawCharge(charge);
    }

    // Auto-pickup: players walking near uncarried charges
    for (const player of this.players) {
      if (player.isCoreCarrier || player.incapacitated) continue;
      for (const charge of this.charges) {
        if (charge.inserted || charge.carrier) continue;
        const dist = Phaser.Math.Distance.Between(player.x, player.y, charge.x, charge.y);
        if (dist < PICKUP_RANGE) {
          this.pickUp(player, charge);
          break;
        }
      }
    }

    // Insertion progress
    for (const [slotId, prog] of this.progress) {
      prog.timeMs += delta;
      if (prog.timeMs >= INSERT_TIME) {
        this.completeInsertion(slotId, prog.player);
        this.progress.delete(slotId);
      }
    }

    // Check for carriers near slots
    for (const player of this.players) {
      if (!player.isCoreCarrier || player.incapacitated) continue;
      for (const slot of this.slots) {
        if (this.slotFilled.has(slot.id)) continue;
        const cx = slot.x + slot.w / 2;
        const cy = slot.y + slot.h / 2;
        const dist = Phaser.Math.Distance.Between(player.x, player.y, cx, cy);
        if (dist < INSERT_RANGE) {
          // Start / continue insertion progress
          const existing = this.progress.get(slot.id);
          if (!existing) {
            this.progress.set(slot.id, { slotId: slot.id, player, timeMs: 0 });
          }
        } else {
          // Cancel insertion if moved away
          const existing = this.progress.get(slot.id);
          if (existing?.player === player) this.progress.delete(slot.id);
        }
      }
    }

    this.drawSlots();
  }

  pickUp(player: Player, charge: LiveCharge): void {
    if (player.isCoreCarrier) return;
    charge.carrier     = player;
    charge.dropped     = false;
    player.isCoreCarrier = true;
    this.scene.events.emit('charge:pickedUp', { player, chargeId: charge.id });
  }

  dropCharge(player: Player): void {
    const charge = this.charges.find(c => c.carrier === player);
    if (!charge) return;
    charge.carrier   = null;
    charge.dropped   = true;
    charge.decayMs   = DECAY_TIME;
    charge.x         = player.x;
    charge.y         = player.y;
    player.isCoreCarrier = false;
    this.scene.events.emit('charge:dropped', { player, chargeId: charge.id });
  }

  getInsertedCount(): number {
    return this.slotFilled.size;
  }

  allInserted(): boolean {
    return this.slotFilled.size >= Math.min(this.needed, this.slots.length);
  }

  getCarriers(): Player[] {
    return this.players.filter(p => p.isCoreCarrier);
  }

  private completeInsertion(slotId: string, player: Player): void {
    this.slotFilled.add(slotId);
    const charge = this.charges.find(c => c.carrier === player);
    if (charge) {
      charge.inserted = true;
      charge.carrier  = null;
      charge.gfx.clear();
    }
    player.isCoreCarrier = false;
    this.scene.events.emit('charge:inserted', { slotId, count: this.slotFilled.size, needed: this.needed });
    if (this.allInserted()) {
      this.scene.events.emit('charges:allInserted');
    }
  }

  private drawCharge(charge: LiveCharge): void {
    if (charge.inserted) return;
    const g   = charge.gfx;
    const t   = this.scene.time.now;
    g.clear();

    // Blink when decaying
    if (charge.dropped && charge.decayMs < (DECAY_TIME - BLINK_START)) {
      const blinkRate = 1 - (charge.decayMs / (DECAY_TIME - BLINK_START));
      if (Math.sin(t * blinkRate * 0.02) < 0) return;
    }

    const { x, y } = charge;
    const pulse = 0.6 + Math.sin(t / 300) * 0.4;

    // Outer glow
    g.lineStyle(8, 0xff4400, 0.1 * pulse);
    g.strokeCircle(x, y, 18);
    g.lineStyle(4, 0xff6600, 0.2 * pulse);
    g.strokeCircle(x, y, 14);

    // Core
    g.fillStyle(0xff2200, 0.9);
    g.fillCircle(x, y, 10);
    g.fillStyle(0xff9900, 0.8 * pulse);
    g.fillCircle(x, y, 6);
    g.fillStyle(0xffffff, 0.4 * pulse);
    g.fillCircle(x - 3, y - 3, 3);

    // Orbiting particles
    for (let i = 0; i < 4; i++) {
      const a  = (i / 4) * Math.PI * 2 + t / 500;
      const ox = x + Math.cos(a) * 14;
      const oy = y + Math.sin(a) * 14;
      g.fillStyle(0xff6600, 0.7);
      g.fillCircle(ox, oy, 2);
    }

    // "CORE" label
    if (!charge.carrier) {
      g.lineStyle(1, 0xff4400, 0.4);
      g.strokeCircle(x, y, 22);
    }

    void getMatter;
  }

  private drawSlots(): void {
    const t = this.scene.time.now;
    for (const slot of this.slots) {
      const g    = this.slotGfx.get(slot.id);
      if (!g) continue;
      g.clear();

      const cx = slot.x + slot.w / 2;
      const cy = slot.y + slot.h / 2;
      const filled = this.slotFilled.has(slot.id);

      if (filled) {
        // Filled: bright green glow
        const pulse = 0.6 + Math.sin(t / 400) * 0.3;
        g.fillStyle(0x00ff88, 0.2 * pulse);
        g.fillRect(slot.x, slot.y, slot.w, slot.h);
        g.lineStyle(3, 0x00ff88, 0.8 * pulse);
        g.strokeRect(slot.x, slot.y, slot.w, slot.h);
        g.fillStyle(0x00ff88, 0.9);
        g.fillCircle(cx, cy, 8);
        continue;
      }

      // Empty slot
      const pulse = 0.3 + Math.sin(t / 600) * 0.15;
      g.fillStyle(0xff4400, 0.06);
      g.fillRect(slot.x, slot.y, slot.w, slot.h);
      g.lineStyle(2, 0xff4400, pulse);
      g.strokeRect(slot.x, slot.y, slot.w, slot.h);
      g.fillStyle(0xff6600, 0.2);
      g.fillCircle(cx, cy, 10);
      g.lineStyle(1, 0xff6600, 0.4);
      g.strokeCircle(cx, cy, 14);

      // Insertion progress bar
      const prog = this.progress.get(slot.id);
      if (prog) {
        const frac  = prog.timeMs / INSERT_TIME;
        g.fillStyle(0xff6600, 0.7);
        g.fillRect(slot.x + 2, slot.y + slot.h - 6, (slot.w - 4) * frac, 4);
      }
    }
  }
}
