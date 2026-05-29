import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { DoorDef, WeightPlateDef } from '../levels/LevelLoader';
import type { LevelLoader } from '../levels/LevelLoader';

const PW = 24, PH = 44;

interface PlateState {
  def:     WeightPlateDef;
  active:  boolean;
  count:   number;   // players currently on plate
  gfx:     Phaser.GameObjects.Graphics;
}

interface DoorState {
  def:        DoorDef;
  open:       boolean;
  openTimer:  number;  // ms remaining if auto-close door
}

export class DoorSystem {
  private scene:    Phaser.Scene;
  private players:  Player[];
  private loader:   LevelLoader;
  private plates:   PlateState[] = [];
  private doors:    DoorState[]  = [];

  constructor(scene: Phaser.Scene, players: Player[], loader: LevelLoader) {
    this.scene   = scene;
    this.players = players;
    this.loader  = loader;
  }

  addWeightPlates(defs: WeightPlateDef[]): void {
    for (const def of defs) {
      this.plates.push({
        def,
        active: false,
        count:  0,
        gfx:    this.scene.add.graphics(),
      });
    }
  }

  addDoors(defs: DoorDef[]): void {
    for (const def of defs) {
      this.doors.push({ def, open: false, openTimer: 0 });
    }
  }

  update(_delta: number): void {
    // Count players on each plate
    for (const plate of this.plates) {
      plate.count = 0;
      for (const player of this.players) {
        if (this.playerOnPlate(player, plate.def)) plate.count++;
      }
      const maxOk = plate.def.maxMass == null || plate.count <= plate.def.maxMass;
      plate.active = plate.count >= plate.def.requiredMass && maxOk;
      this.drawPlate(plate);
    }

    // Evaluate door triggers
    for (const door of this.doors) {
      const triggered = this.evalTrigger(door.def.trigger);

      if (triggered && !door.open) {
        this.loader.openDoor(door.def.id);
        door.open = true;
        door.openTimer = door.def.openWindow ?? 0;
        this.scene.events.emit('door:opened', { id: door.def.id });
      }

      if (door.open) {
        if (door.def.closeOnRelease && !triggered) {
          this.loader.closeDoor(door.def.id, door.def);
          door.open = false;
        }
        if (door.def.openWindow && door.openTimer > 0) {
          door.openTimer -= _delta;
          if (door.openTimer <= 0) {
            this.loader.closeDoor(door.def.id, door.def);
            door.open = false;
          }
        }
      }
    }
  }

  isPlateActive(id: string): boolean {
    return this.plates.find(p => p.def.id === id)?.active ?? false;
  }

  private evalTrigger(trigger: string): boolean {
    if (trigger === 'allPlates') {
      // All S3 vault plates active simultaneously
      const plateIds = ['plateA', 'plateB', 'plateC'];
      return plateIds.every(id => this.isPlateActive(id));
    }
    return this.isPlateActive(trigger);
  }

  private playerOnPlate(player: Player, plate: WeightPlateDef): boolean {
    const pL = player.x - PW / 2 - 2;
    const pR = player.x + PW / 2 + 2;
    const pB = player.y + PH / 2;
    const pT = player.y - PH / 2;
    return pL < plate.x + plate.w &&
           pR > plate.x &&
           pB >= plate.y - 4 &&
           pT < plate.y + plate.h + 8;
  }

  private drawPlate(plate: PlateState): void {
    const g   = plate.gfx;
    const def = plate.def;
    const t   = this.scene.time.now;
    g.clear();

    const col     = plate.active ? 0x44ff66 : 0x336633;
    const alpha   = plate.active ? 1 : 0.5;
    const pulse   = plate.active ? 0.6 + Math.sin(t / 160) * 0.35 : 0;

    // Active pulse glow
    if (plate.active) {
      g.lineStyle(8, col, pulse * 0.2);
      g.strokeRect(def.x - 4, def.y - 4, def.w + 8, def.h + 8);
    }

    // Platform body
    g.fillGradientStyle(
      plate.active ? 0x113322 : 0x0a1508,
      plate.active ? 0x113322 : 0x0a1508,
      plate.active ? 0x071a0f : 0x060d04,
      plate.active ? 0x071a0f : 0x060d04,
      1,
    );
    g.fillRect(def.x, def.y, def.w, def.h);
    g.lineStyle(2, col, alpha * 0.7);
    g.strokeRect(def.x, def.y, def.w, def.h);

    // Indicator dashes
    const dashCount = Math.min(def.requiredMass, 5);
    const dashW     = Math.min(18, (def.w - 12) / Math.max(dashCount, 1));
    const totalW    = dashCount * dashW + (dashCount - 1) * 4;
    const startX    = def.x + (def.w - totalW) / 2;
    for (let i = 0; i < dashCount; i++) {
      const filled = i < plate.count;
      g.lineStyle(3, filled ? 0x44ff66 : 0x336633, filled ? 0.9 : 0.4);
      g.beginPath();
      g.moveTo(startX + i * (dashW + 4),          def.y + def.h / 2);
      g.lineTo(startX + i * (dashW + 4) + dashW,  def.y + def.h / 2);
      g.strokePath();
    }

    // Player count
    if (plate.count > 0) {
      g.fillStyle(0x44ff66, 0.85);
      g.fillCircle(def.x + def.w - 8, def.y + def.h / 2, 4);
    }
  }
}
