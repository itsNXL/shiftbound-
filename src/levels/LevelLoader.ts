import Phaser from 'phaser';

// ── Type definitions ─────────────────────────────────────────────────────────

export interface PlatformDef {
  x: number; y: number; w: number; h: number;
  wall?: boolean;
  goal?: boolean;
  type?: 'solid' | 'catwalk' | 'collapse' | 'weightPlate' | 'pedestal' | 'goal';
  id?: string;
}

export interface HazardDef {
  type: 'crusher' | 'saw_pit' | 'saw_pendulum' | 'saw_sweep' | 'laser' | 'wind' | 'turret' | 'collapse_floor';
  x: number; y: number;
  w?: number; h?: number;
  // crusher
  downT?: number; upT?: number; phase?: number; floorY?: number;
  // saw
  radius?: number;
  sweepLeft?: number; sweepRight?: number; sweepSpeed?: number;
  pendulumAnchorY?: number; period?: number;
  // laser
  onT?: number; offT?: number;
  // wind
  forceX?: number; forceY?: number;
  // turret
  sweepZoneLeft?: number; sweepZoneRight?: number; beamW?: number;
  // collapse floor
  triggerDelay?: number;
  id?: string;
  // scaling: only spawned when numPlayers >= this value
  minPlayers?: number;
}

export interface DoorDef {
  x: number; y: number; w: number; h: number;
  id: string;
  trigger: string;
  openWindow?: number;       // ms — door auto-closes after this
  closeOnRelease?: boolean;  // close when trigger deactivates
}

export interface WeightPlateDef {
  x: number; y: number; w: number; h: number;
  id: string;
  requiredMass: number;
  maxMass?: number;
}

export interface CheckpointDef {
  id: string;
  x: number; y: number; w: number; h: number;
  spawnX: number; spawnY: number;
}

export interface KeyDef { x: number; y: number; }

export interface ExitZoneDef {
  x: number; y: number; w: number; h: number;
}

export interface RadiationZoneDef {
  id: string;
  x: number; y: number; w: number; h: number;
  drainRate: number;   // hp/s
  sealable?: boolean;
}

export interface CoreChargeDef { id: string; x: number; y: number; }
export interface InsertionSlotDef { id: string; x: number; y: number; w: number; h: number; }

export interface ArrowTargetDef {
  id: string;
  type: 'rotating_disc' | 'sliding_panel' | 'pendulum' | 'orbital_ring';
  x: number; y: number;
  effect: string;
  effectTarget: string;
  effectDurationMs: number;
  radius?: number;
  panelW?: number; panelH?: number; panelAmp?: number; panelPeriod?: number;
  pendulumLen?: number; pendulumPeriod?: number;
  orbitalRadius?: number; orbitalCount?: number;
}

/**
 * A scaling group activates when numPlayers >= minPlayers.
 * Adds extra hazards, weight plates, doors, and overrides
 * existing weight-plate required-mass values.
 */
export interface ScalingGroupDef {
  minPlayers:          number;
  hazards?:            HazardDef[];
  weightPlates?:       WeightPlateDef[];
  doors?:              DoorDef[];
  /** Override the requiredMass of existing weight plates by id. */
  plateMassOverrides?: { id: string; requiredMass: number }[];
  /** L2: extra radiation zones activated at this tier. */
  radiationZones?:     RadiationZoneDef[];
  /** L2: extra arrow targets activated at this tier. */
  arrowTargets?:       ArrowTargetDef[];
}

export interface LevelData {
  name?: string;
  width: number;
  height: number;
  deathY?: number;              // default 890 for L1
  playerStarts: { x: number; y: number }[];
  respawnTokens?: number;
  platforms: PlatformDef[];
  hazards?: HazardDef[];
  doors?: DoorDef[];
  weightPlates?: WeightPlateDef[];
  checkpoints?: CheckpointDef[];
  key?: KeyDef;
  exitZone?: ExitZoneDef;
  floodDuration?: number;
  escapeTimerDuration?: number;
  radiationZones?:    RadiationZoneDef[];
  coreCharges?:       CoreChargeDef[];
  insertionSlots?:    InsertionSlotDef[];
  arrowTargets?:      ArrowTargetDef[];
  coreChargesNeeded?: number;
  scalingGroups?:     ScalingGroupDef[];
}

// ── LevelLoader ──────────────────────────────────────────────────────────────

export class LevelLoader {
  private scene:     Phaser.Scene;
  doorBodies         = new Map<string, any>();
  private doorGfx    = new Map<string, Phaser.GameObjects.Graphics>();
  collapseBodyRefs   = new Map<string, any>();
  private collapseGfx = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  load(data: LevelData): void {
    for (const plat of data.platforms)       this.spawnPlatform(plat);
    if (data.doors)        for (const d  of data.doors)        this.spawnDoor(d);
    if (data.weightPlates) for (const wp of data.weightPlates) this.drawWeightPlateVisual(wp);
    if (data.checkpoints)  for (const cp of data.checkpoints)  this.drawCheckpointVisual(cp);
    if (data.exitZone)     this.drawExitZoneVisual(data.exitZone);
  }

  // ── Scaling-group helpers (called by GameScene after load) ───────────────

  /** Draw the visual overlay for a weight-plate zone added by a scaling group. */
  addScalingWeightPlate(def: WeightPlateDef): void {
    this.drawWeightPlateVisual(def);
  }

  /** Spawn a door physics body + visual added by a scaling group. */
  addScalingDoor(def: DoorDef): void {
    this.spawnDoor(def);
  }

  // ── Door control (called by DoorSystem) ──────────────────────────────────

  openDoor(id: string): void {
    const body = this.doorBodies.get(id);
    if (!body) return;
    (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).world.remove(body);
    this.doorBodies.delete(id);
    const g = this.doorGfx.get(id);
    if (g) g.setVisible(false);
  }

  closeDoor(id: string, def: DoorDef): void {
    if (this.doorBodies.has(id)) return;
    const body = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).add.rectangle(
      def.x + def.w / 2, def.y + def.h / 2, def.w, def.h,
      { isStatic: true, label: `door_${def.id}`, friction: 0, restitution: 0 }
    );
    this.doorBodies.set(id, body);
    const g = this.doorGfx.get(id);
    if (g) g.setVisible(true);
  }

  removeCollapsePlatform(id: string): void {
    const body = this.collapseBodyRefs.get(id);
    if (body) {
      (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).world.remove(body);
      this.collapseBodyRefs.delete(id);
    }
    const g = this.collapseGfx.get(id);
    if (g) { g.destroy(); this.collapseGfx.delete(id); }
  }

  // ── Platform spawning ─────────────────────────────────────────────────────

  private spawnPlatform(def: PlatformDef): void {
    const { x, y, w, h, wall = false, type } = def;
    const isGoal = def.goal || type === 'goal';

    const body = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).add.rectangle(
      x + w / 2, y + h / 2, w, h,
      { isStatic: true, label: isGoal ? 'goal' : 'platform', friction: 0.6, restitution: 0 }
    );

    if (type === 'collapse' && def.id) {
      this.collapseBodyRefs.set(def.id, body);
    }

    if (wall) return;

    const g = this.scene.add.graphics();
    if (type === 'collapse' && def.id) {
      this.collapseGfx.set(def.id, g);
    }

    if (isGoal) {
      this.drawGoalPlatform(g, x, y, w, h);
    } else if (type === 'catwalk') {
      this.drawCatwalk(g, x, y, w, h);
    } else if (type === 'collapse') {
      this.drawCollapsePlatform(g, x, y, w, h);
    } else if (type === 'pedestal') {
      this.drawPedestal(g, x, y, w, h);
    } else {
      this.drawPlatform(g, x, y, w, h);
    }
  }

  private spawnDoor(def: DoorDef): void {
    const body = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).add.rectangle(
      def.x + def.w / 2, def.y + def.h / 2, def.w, def.h,
      { isStatic: true, label: `door_${def.id}`, friction: 0, restitution: 0 }
    );
    this.doorBodies.set(def.id, body);
    const g = this.scene.add.graphics();
    this.doorGfx.set(def.id, g);
    this.drawDoorBodyVisual(g, def.x, def.y, def.w, def.h);
  }

  // ── Visual helpers ────────────────────────────────────────────────────────

  private drawDoorBodyVisual(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(0x1a2535, 1);
    g.fillRect(x, y, w, h);
    const stripeH = 12;
    for (let sy = y; sy < y + h; sy += stripeH * 2) {
      g.fillStyle(0xddbb00, 0.22);
      g.fillRect(x, sy, w, Math.min(stripeH, y + h - sy));
    }
    g.lineStyle(2, 0xffdd44, 0.7);
    g.strokeRect(x, y, w, h);
    // Warning arrows
    g.fillStyle(0xffdd44, 0.6);
    const arrowCY = y + h / 2;
    g.fillTriangle(x + w / 2, arrowCY - 8, x + 4, arrowCY + 4, x + w - 4, arrowCY + 4);
  }

  private drawWeightPlateVisual(wp: WeightPlateDef): void {
    const g = this.scene.add.graphics();
    const { x, y, w, h } = wp;
    g.fillGradientStyle(0x0a1508, 0x0a1508, 0x061005, 0x061005, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0x33bb44, 0.5);
    g.strokeRect(x, y, w, h);
    // Mass indicator dashes
    const dashCount = Math.min(wp.requiredMass, 5);
    const dashW = Math.min(18, (w - 12) / dashCount);
    const totalW = dashCount * dashW + (dashCount - 1) * 4;
    const startX = x + (w - totalW) / 2;
    g.lineStyle(2, 0x44dd55, 0.8);
    for (let i = 0; i < dashCount; i++) {
      g.beginPath();
      g.moveTo(startX + i * (dashW + 4), y + h / 2);
      g.lineTo(startX + i * (dashW + 4) + dashW, y + h / 2);
      g.strokePath();
    }
    this.scene.add.text(x + w / 2, y - 6, `×${wp.requiredMass}`, {
      fontFamily: 'Orbitron, monospace', fontSize: '7px', color: '#44dd55',
    }).setOrigin(0.5, 1).setAlpha(0.65);
  }

  private drawCheckpointVisual(cp: CheckpointDef): void {
    const g = this.scene.add.graphics();
    const { x, y, w, h } = cp;
    g.fillStyle(0x001133, 0.35);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0x0088ff, 0.45);
    g.strokeRect(x, y, w, h);
    g.lineStyle(1, 0x0044aa, 0.2);
    g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, 0); g.strokePath();
    this.scene.add.text(x + w / 2, y - 10, 'CHECKPOINT', {
      fontFamily: 'Orbitron, monospace', fontSize: '7px', color: '#0088ff',
    }).setOrigin(0.5, 1).setAlpha(0.6);
  }

  private drawExitZoneVisual(ez: ExitZoneDef): void {
    const g = this.scene.add.graphics();
    const { x, y, w, h } = ez;
    g.fillStyle(0x00ff88, 0.07);
    g.fillRect(x, y, w, h);
    g.lineStyle(3, 0x00ff88, 0.6);
    g.strokeRect(x, y, w, h);
    this.scene.add.text(x + w / 2, y - 14, 'EXIT', {
      fontFamily: 'Orbitron, monospace', fontSize: '11px', fontStyle: 'bold', color: '#00ff88',
    }).setOrigin(0.5, 1).setAlpha(0.85);
    this.drawDoorArt(x + w / 2, y);
  }

  // ── Normal platform ───────────────────────────────────────────────────────

  private drawPlatform(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillGradientStyle(0x0f1826, 0x0f1826, 0x172234, 0x172234, 1);
    g.fillRect(x, y, w, h);
    if (h > 8) {
      g.fillGradientStyle(0x1c2b40, 0x1c2b40, 0x121e2e, 0x121e2e, 0.7);
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
    g.lineStyle(2, 0x5588cc, 0.9);
    g.beginPath(); g.moveTo(x + 4, y + 1); g.lineTo(x + w - 4, y + 1); g.strokePath();
    g.lineStyle(1, 0x3366aa, 0.4);
    g.beginPath(); g.moveTo(x + 2, y + 3); g.lineTo(x + w - 2, y + 3); g.strokePath();
    g.lineStyle(1, 0x1a2840, 0.6);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h); g.strokePath();
    g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.strokePath();
    g.lineStyle(2, 0x040810, 1);
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.strokePath();
    g.fillStyle(0x4477aa, 0.7);
    g.fillRect(x, y, 3, 3);
    g.fillRect(x + w - 3, y, 3, 3);
    if (w > 80) {
      g.fillStyle(0x223344, 0.6);
      const spacing = Math.min(60, w / 4);
      for (let rx = x + spacing; rx < x + w - 10; rx += spacing) {
        g.fillCircle(rx, y + 1, 1.5);
      }
    }
  }

  private drawCatwalk(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(0x1a2a3a, 0.9);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, 0x4488aa, 0.85);
    g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + w, y + 1); g.strokePath();
    const grate = 18;
    g.lineStyle(1, 0x2a3a4a, 0.45);
    for (let gx = x; gx < x + w; gx += grate) {
      g.beginPath(); g.moveTo(gx, y); g.lineTo(gx, y + h); g.strokePath();
    }
    g.fillStyle(0x4488aa, 0.5);
    g.fillRect(x, y, 2, h);
    g.fillRect(x + w - 2, y, 2, h);
  }

  private drawCollapsePlatform(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillGradientStyle(0x2a1810, 0x2a1810, 0x1a1008, 0x1a1008, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0xff6633, 0.55);
    g.beginPath(); g.moveTo(x + 4, y + 1); g.lineTo(x + w - 4, y + 1); g.strokePath();
    // Crack lines
    g.lineStyle(1, 0x442200, 0.7);
    for (let i = 1; i < 3; i++) {
      const cx2 = x + (w / 3) * i;
      g.beginPath(); g.moveTo(cx2 - 4, y); g.lineTo(cx2 + 4, y + h); g.strokePath();
    }
    g.fillStyle(0xff6633, 0.45);
    g.fillRect(x, y, 2, 2); g.fillRect(x + w - 2, y, 2, 2);
  }

  private drawPedestal(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillGradientStyle(0x332200, 0x332200, 0x221100, 0x221100, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0xffcc44, 0.85);
    g.strokeRect(x, y, w, h);
    for (let cx2 = x + 12; cx2 < x + w; cx2 += 20) {
      g.lineStyle(1, 0x443300, 0.5);
      g.beginPath(); g.moveTo(cx2, y); g.lineTo(cx2, y + h); g.strokePath();
    }
    g.lineStyle(3, 0xffcc44, 0.3);
    g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.strokePath();
  }

  private drawGoalPlatform(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.lineStyle(8, 0x00ff88, 0.05);
    g.strokeRect(x - 4, y - 4, w + 8, h + 8);
    g.lineStyle(3, 0x00ff88, 0.12);
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    g.fillGradientStyle(0x072010, 0x072010, 0x0d2a18, 0x0d2a18, 1);
    g.fillRect(x, y, w, h);
    if (h > 8) {
      g.fillGradientStyle(0x0d2a1a, 0x0d2a1a, 0x051808, 0x051808, 0.7);
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
    g.lineStyle(2, 0x00ee77, 1);
    g.beginPath(); g.moveTo(x + 4, y + 1); g.lineTo(x + w - 4, y + 1); g.strokePath();
    g.fillStyle(0x00ff88, 0.9);
    g.fillRect(x, y, 4, 4); g.fillRect(x + w - 4, y, 4, 4);
  }

  // ── Door art (decorative, appears above exit platforms) ───────────────────

  private drawDoorArt(cx: number, platformY: number): void {
    const g     = this.scene.add.graphics();
    const DW = 52, DH = 88, ARCH = 26;
    const left  = cx - DW / 2;
    const top   = platformY - DH - ARCH;

    g.lineStyle(16, 0x00ff99, 0.03); g.strokeRect(left - 10, top - 6, DW + 20, DH + ARCH + 12);
    g.lineStyle(8,  0x00ff99, 0.07); g.strokeRect(left - 5,  top - 3, DW + 10, DH + ARCH + 6);
    g.lineStyle(2,  0x00ff99, 0.35); g.strokeRect(left - 1,  top,     DW + 2,  DH + ARCH);

    g.fillGradientStyle(0x0a1e10, 0x0a1e10, 0x061408, 0x061408, 1);
    g.fillRect(left, top, DW, DH + ARCH);
    g.fillStyle(0x0a1e10, 1); g.fillCircle(cx, top + ARCH, ARCH);

    const FT = 7;
    g.fillGradientStyle(0x0d2818, 0x0d2818, 0x071008, 0x071008, 1);
    g.fillRect(left, top + ARCH, FT, DH);
    g.fillRect(left + DW - FT, top + ARCH, FT, DH);
    g.fillRect(left, top + ARCH - FT, DW, FT);
    g.lineStyle(FT, 0x0d2818, 1);
    g.beginPath(); g.arc(cx, top + ARCH, ARCH - FT / 2, Math.PI, 0); g.strokePath();

    g.lineStyle(1, 0x00ff88, 0.8);
    g.beginPath(); g.moveTo(left + FT, top + ARCH); g.lineTo(left + FT, top + ARCH + DH); g.strokePath();
    g.beginPath(); g.moveTo(left + DW - FT, top + ARCH); g.lineTo(left + DW - FT, top + ARCH + DH); g.strokePath();

    const pL = left + FT + 2, pTop2 = top + ARCH, pW = DW - FT * 2 - 4, pH = DH;
    const pArch = ARCH - FT - 2;
    g.fillStyle(0x020a05, 0.95); g.fillRect(pL, pTop2, pW, pH); g.fillCircle(cx, pTop2, pArch);
    g.fillStyle(0x00ff44, 0.05); g.fillRect(pL, pTop2, pW, pH);
    g.fillStyle(0x00ff44, 0.15); g.fillCircle(cx, pTop2, pArch - 4);

    const sy = pTop2 + 22;
    g.fillStyle(0x00ff88, 0.65);
    g.fillTriangle(cx, sy - 10, cx - 8, sy + 4, cx + 8, sy + 4);
    g.fillStyle(0x00ff88, 0.5); g.fillRect(cx - 3, sy + 3, 6, 10);

    this.scene.add.text(cx, top - 10, 'EXIT', {
      fontFamily: 'Orbitron, monospace', fontSize: '9px', fontStyle: 'bold', color: '#00ff88',
    }).setOrigin(0.5, 1).setAlpha(0.55);

    g.lineStyle(2, 0x00ff88, 0.5);
    g.beginPath(); g.moveTo(left - 4, platformY); g.lineTo(left + DW + 4, platformY); g.strokePath();
  }
}
