import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { HazardDef } from '../levels/LevelLoader';
import type { LevelLoader } from '../levels/LevelLoader';
import { getMatter } from '../utils/MatterUtils';

const INV_MS = 1400; // ms of invincibility after being hit
const PW = 24, PH = 44; // player half-extents

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveHazard {
  def:    HazardDef;
  gfx:    Phaser.GameObjects.Graphics;
  age:    number;   // ms since first update
  active: boolean;  // is kill-zone currently deadly
  kx: number; ky: number; kw: number; kh: number;  // kill-zone rect
  state:  HazardState;
}

type HazardState =
  | { type: 'crusher'; extendRatio: number }
  | { type: 'saw_pendulum'; angle: number; sawX: number; sawY: number }
  | { type: 'saw_sweep'; x: number; dir: 1 | -1 }
  | { type: 'laser'; on: boolean }
  | { type: 'saw_pit' }
  | { type: 'wind' }
  | { type: 'turret'; beamX: number; dir: 1 | -1 }
  | { type: 'collapse_floor'; contactMs: number; triggered: boolean };

export class HazardSystem {
  private scene:       Phaser.Scene;
  private players:     Player[];
  private levelLoader: LevelLoader;
  private hazards:     LiveHazard[] = [];
  private invTimer     = new Map<number, number>(); // playerIndex → ms remaining

  // Alarm (triggered when key is grabbed — turrets speed up)
  alarmActive = false;

  // Difficulty multiplier set by GameScene (1.0 = 2 players, up to 2.2 = 8 players)
  difficulty = 1.0;

  // Flood
  private floodActive  = false;
  private floodX       = 0;
  private floodSpeed   = 80; // px/s
  private floodGfx:    Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, players: Player[], levelLoader: LevelLoader) {
    this.scene       = scene;
    this.players     = players;
    this.levelLoader = levelLoader;
  }

  addHazards(defs: HazardDef[]): void {
    for (const def of defs) {
      this.hazards.push({
        def,
        gfx:    this.scene.add.graphics(),
        age:    0,
        active: false,
        kx: def.x, ky: def.y, kw: def.w ?? 0, kh: def.h ?? 0,
        state:  this.initState(def),
      });
    }
  }

  startFlood(): void {
    if (this.floodActive) return;
    this.floodActive = true;
    this.floodX      = 0;
    this.floodSpeed  = 80 * this.difficulty;
    this.floodGfx    = this.scene.add.graphics();
  }

  update(delta: number): void {
    // Tick invincibility
    for (const [idx, ms] of this.invTimer) {
      const rem = ms - delta;
      if (rem <= 0) this.invTimer.delete(idx);
      else          this.invTimer.set(idx, rem);
    }

    for (const h of this.hazards) {
      h.age += delta;
      this.updateHazard(h, delta);

      if (h.active) {
        for (const player of this.players) {
          if (this.invTimer.has(player.index)) continue;
          if (this.aabbHit(player, h)) this.killPlayer(player);
        }
      }
    }

    // Wind forces applied to players inside wind zones
    for (const h of this.hazards) {
      if (h.def.type !== 'wind') continue;
      const { x, y, w, h: hh } = h.def;
      for (const player of this.players) {
        if (player.x >= (x ?? 0) && player.x <= (x ?? 0) + (w ?? 0) &&
            player.y >= (y ?? 0) && player.y <= (y ?? 0) + (hh ?? 0)) {
          const fx = ((h.def.forceX ?? 0) * 0.000028);
          const fy = ((h.def.forceY ?? 0) * 0.000028);
          getMatter().Body.applyForce(player.body, player.body.position, { x: fx, y: fy });
        }
      }
    }

    // Flood
    if (this.floodActive && this.floodGfx) {
      this.floodX += (this.floodSpeed * delta) / 1000;
      const g = this.floodGfx;
      g.clear();
      g.fillStyle(0x1D9E75, 0.7);
      g.fillRect(0, 680, this.floodX, 220);
      // Flood surface shimmer
      g.lineStyle(2, 0x33ffbb, 0.35);
      g.beginPath(); g.moveTo(0, 680); g.lineTo(this.floodX, 680); g.strokePath();
      // Kill any player caught in flood
      for (const player of this.players) {
        if (this.invTimer.has(player.index)) continue;
        if (player.x < this.floodX && player.y > 660) this.killPlayer(player);
      }
    }
  }

  isPlayerInvincible(playerIndex: number): boolean {
    return this.invTimer.has(playerIndex);
  }

  grantInvincibility(playerIndex: number): void {
    this.invTimer.set(playerIndex, INV_MS);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private initState(def: HazardDef): HazardState {
    switch (def.type) {
      case 'crusher':        return { type: 'crusher', extendRatio: 0 };
      case 'saw_pendulum':   return { type: 'saw_pendulum', angle: (def.phase ?? 0) * Math.PI * 2, sawX: def.x, sawY: def.y };
      case 'saw_sweep':      return { type: 'saw_sweep', x: def.sweepLeft ?? def.x, dir: 1 };
      case 'laser':          return { type: 'laser', on: false };
      case 'saw_pit':        return { type: 'saw_pit' };
      case 'wind':           return { type: 'wind' };
      case 'turret':         return { type: 'turret', beamX: def.sweepZoneLeft ?? def.x, dir: 1 };
      case 'collapse_floor': return { type: 'collapse_floor', contactMs: 0, triggered: false };
    }
  }

  private updateHazard(h: LiveHazard, delta: number): void {
    h.gfx.clear();
    switch (h.def.type) {
      case 'crusher':        this.updateCrusher(h, delta);   break;
      case 'saw_pit':        this.updateSawPit(h);           break;
      case 'saw_pendulum':   this.updatePendulum(h, delta);  break;
      case 'saw_sweep':      this.updateSweep(h, delta);     break;
      case 'laser':          this.updateLaser(h);            break;
      case 'turret':         this.updateTurret(h, delta);    break;
      case 'collapse_floor': this.updateCollapse(h, delta);  break;
      case 'wind':           /* force applied separately */  break;
    }
  }

  // ── Crusher ──────────────────────────────────────────────────────────────

  private updateCrusher(h: LiveHazard, delta: number): void {
    const def    = h.def;
    const state  = h.state as { type: 'crusher'; extendRatio: number };
    const g      = h.gfx;
    const w      = def.w ?? 140;
    const bh     = def.h ?? 60;
    const period = ((def.downT ?? 1.5) + (def.upT ?? 2.2)) * 1000 / this.difficulty;
    const offset = (def.phase ?? 0) * 1000;

    const t = ((h.age - offset) % period + period) % period;
    const downMs = (def.downT ?? 1.5) * 1000;
    let ratio = t < downMs
      ? t / downMs
      : 1 - (t - downMs) / ((def.upT ?? 2.2) * 1000);
    ratio = Phaser.Math.Clamp(ratio, 0, 1);
    state.extendRatio = ratio;

    const retractedTop = def.y;
    const extendedTop  = (def.floorY ?? 800) - bh;
    const topY         = retractedTop + ratio * (extendedTop - retractedTop);
    const cx           = def.x + w / 2;

    // Mounting rod
    g.lineStyle(3, 0x445566, 0.9);
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, topY); g.strokePath();

    // Outer glow when nearly extended
    if (ratio > 0.6) {
      const glow = (ratio - 0.6) / 0.4;
      g.lineStyle(8, 0xff2200, glow * 0.25);
      g.strokeRect(def.x - 4, topY - 4, w + 8, bh + 8);
    }

    // Body
    g.fillGradientStyle(0x3a1a08, 0x3a1a08, 0x221005, 0x221005, 1);
    g.fillRect(def.x, topY, w, bh);
    g.lineStyle(2, ratio > 0.7 ? 0xff4422 : 0x445566, 0.7);
    g.strokeRect(def.x, topY, w, bh);

    // Teeth on bottom edge
    const teeth = Math.max(2, Math.floor(w / 28));
    g.fillStyle(0xcc3311, 1);
    for (let i = 0; i < teeth; i++) {
      const tx = def.x + (i + 0.5) * (w / teeth) - 7;
      g.fillTriangle(tx, topY + bh, tx + 7, topY + bh, tx + 3.5, topY + bh + 12);
    }

    // Thorns on top edge — upward-pointing spikes, always deadly
    const thornH  = 13;
    const thornCount = Math.max(2, Math.floor(w / 22));
    g.fillStyle(0xcc3311, 1);
    for (let i = 0; i < thornCount; i++) {
      const tx = def.x + (i + 0.5) * (w / thornCount) - 6;
      g.fillTriangle(tx, topY, tx + 12, topY, tx + 6, topY - thornH);
    }
    // Thorn glow when crusher is near-retracted (player most likely to land on top)
    if (ratio < 0.3) {
      const pulse = (0.3 - ratio) / 0.3;
      g.lineStyle(3, 0xff2200, pulse * 0.5);
      g.beginPath(); g.moveTo(def.x, topY); g.lineTo(def.x + w, topY); g.strokePath();
    }

    // Kill zone: tracks the crusher face — active from 2% extension so it
    // sweeps through mid-air players as it descends (contact-based, not column-wide).
    h.active = ratio > 0.02;
    h.kx = def.x;
    h.ky = topY;
    h.kw = w;
    h.kh = bh + 14;  // just the crusher body + spike teeth

    // Thorn top kill zone — always active, kills anyone standing on top
    for (const player of this.players) {
      if (this.invTimer.has(player.index)) continue;
      const pL = player.x - PW / 2, pR = player.x + PW / 2;
      const pT = player.y - PH / 2, pB = player.y + PH / 2;
      if (pL < def.x + w && pR > def.x && pT < topY && pB > topY - thornH) {
        this.killPlayer(player);
      }
    }

    void delta;
  }

  // ── Saw pit (static death zone) ──────────────────────────────────────────

  private updateSawPit(h: LiveHazard): void {
    const g   = h.gfx;
    const t   = this.scene.time.now;
    const def = h.def;
    const w   = def.w ?? 80;
    const hh  = def.h ?? 80;

    // Spinning saw blades in zone
    const sawCount = Math.max(1, Math.floor(w / 80));
    for (let i = 0; i < sawCount; i++) {
      const sx = def.x + (i + 0.5) * (w / sawCount);
      const sy = def.y + hh / 2;
      const r  = 28;
      const rot = (t / 300) * (i % 2 === 0 ? 1 : -1);

      g.lineStyle(3, 0xff2200, 0.15);
      g.strokeCircle(sx, sy, r + 4);
      g.lineStyle(2, 0xdd3311, 0.9);
      g.strokeCircle(sx, sy, r);
      // Blade spokes
      g.lineStyle(3, 0xff4422, 0.85);
      for (let b = 0; b < 6; b++) {
        const a = rot + (b / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5);
        g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        g.strokePath();
      }
      g.fillStyle(0xff2200, 0.9); g.fillCircle(sx, sy, 4);
    }

    h.active = true;
    h.kx = def.x; h.ky = def.y; h.kw = w; h.kh = hh;
  }

  // ── Pendulum saw ──────────────────────────────────────────────────────────

  private updatePendulum(h: LiveHazard, delta: number): void {
    const def   = h.def;
    const state = h.state as { type: 'saw_pendulum'; angle: number; sawX: number; sawY: number };
    const g     = h.gfx;
    const r     = def.radius ?? 42;
    const period = (def.period ?? 3.0) * 1000 / this.difficulty;

    // Pendulum physics via simple sin
    state.angle = Math.sin((h.age / period) * Math.PI * 2) * (Math.PI * 0.4);

    const anchorX = def.x;
    const anchorY = def.pendulumAnchorY ?? (def.y - 180);
    const armLen  = def.y - anchorY;
    state.sawX = anchorX + Math.sin(state.angle) * armLen;
    state.sawY = anchorY + Math.cos(state.angle) * armLen;

    // Chain
    g.lineStyle(2, 0x445566, 0.8);
    g.beginPath(); g.moveTo(anchorX, anchorY); g.lineTo(state.sawX, state.sawY); g.strokePath();
    g.fillStyle(0x556677, 0.9); g.fillCircle(anchorX, anchorY, 5);

    // Saw
    const t   = this.scene.time.now;
    const rot = (t / 250) * Math.sign(Math.cos((h.age / period) * Math.PI * 2) > 0 ? 1 : -1);
    g.lineStyle(3, 0xff2200, 0.15); g.strokeCircle(state.sawX, state.sawY, r + 4);
    g.lineStyle(2, 0xdd3311, 0.9);  g.strokeCircle(state.sawX, state.sawY, r);
    g.lineStyle(3, 0xff4422, 0.85);
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(state.sawX + Math.cos(a) * 6, state.sawY + Math.sin(a) * 6);
      g.lineTo(state.sawX + Math.cos(a) * r, state.sawY + Math.sin(a) * r);
      g.strokePath();
    }
    g.fillStyle(0xff2200, 0.9); g.fillCircle(state.sawX, state.sawY, 5);

    h.active = true;
    h.kx = state.sawX - r; h.ky = state.sawY - r; h.kw = r * 2; h.kh = r * 2;

    void delta;
  }

  // ── Sweep saw ─────────────────────────────────────────────────────────────

  private updateSweep(h: LiveHazard, delta: number): void {
    const def   = h.def;
    const state = h.state as { type: 'saw_sweep'; x: number; dir: 1 | -1 };
    const g     = h.gfx;
    const r     = def.radius ?? 30;
    const speed = (def.sweepSpeed ?? 160) * this.difficulty;
    const left  = def.sweepLeft  ?? def.x - 120;
    const right = def.sweepRight ?? def.x + 120;

    state.x += state.dir * speed * (delta / 1000);
    if (state.x >= right) { state.x = right; state.dir = -1; }
    if (state.x <= left)  { state.x = left;  state.dir =  1; }

    // Track
    g.lineStyle(2, 0x334455, 0.5);
    g.beginPath(); g.moveTo(left, def.y); g.lineTo(right, def.y); g.strokePath();
    for (let tx = left; tx <= right; tx += 20) {
      g.fillStyle(0x334455, 0.4); g.fillRect(tx - 2, def.y - 3, 4, 6);
    }

    // Saw body
    const t   = this.scene.time.now;
    const rot = (t / 200) * state.dir;
    g.lineStyle(3, 0xff2200, 0.15); g.strokeCircle(state.x, def.y, r + 4);
    g.lineStyle(2, 0xdd3311, 0.9);  g.strokeCircle(state.x, def.y, r);
    g.lineStyle(3, 0xff4422, 0.85);
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(state.x + Math.cos(a) * 5, def.y + Math.sin(a) * 5);
      g.lineTo(state.x + Math.cos(a) * r, def.y + Math.sin(a) * r);
      g.strokePath();
    }
    g.fillStyle(0xff2200, 0.9); g.fillCircle(state.x, def.y, 5);

    h.active = true;
    h.kx = state.x - r; h.ky = def.y - r; h.kw = r * 2; h.kh = r * 2;
  }

  // ── Laser ─────────────────────────────────────────────────────────────────

  private updateLaser(h: LiveHazard): void {
    const def   = h.def;
    const state = h.state as { type: 'laser'; on: boolean };
    const g     = h.gfx;
    const w     = def.w ?? 400;
    const hh    = def.h ?? 4;

    const onMs   = (def.onT  ?? 1.8) * 1000 / this.difficulty;
    const offMs  = (def.offT ?? 1.8) * 1000 / this.difficulty;
    const period = onMs + offMs;
    const offset = (def.phase ?? 0) * 1000;
    const t      = ((h.age - offset) % period + period) % period;

    state.on  = t < onMs;
    h.active  = state.on;

    const pulse = this.scene.time.now;

    if (state.on) {
      // Glow
      const p = 0.65 + Math.sin(pulse / 80) * 0.25;
      g.lineStyle(hh + 6, 0xff2200, 0.18 * p);
      g.beginPath(); g.moveTo(def.x, def.y + hh / 2); g.lineTo(def.x + w, def.y + hh / 2); g.strokePath();
      // Core
      g.fillStyle(0xff4422, 0.95);
      g.fillRect(def.x, def.y, w, hh);
      g.fillStyle(0xffffff, 0.5);
      g.fillRect(def.x, def.y + 1, w, 1);
    } else {
      // Emitter nodes (dim)
      g.fillStyle(0x442200, 0.5);
      g.fillRect(def.x, def.y, w, hh);
      g.fillStyle(0xcc4422, 0.35);
      g.fillRect(def.x, def.y, 6, hh);
      g.fillRect(def.x + w - 6, def.y, 6, hh);
    }

    h.kx = def.x; h.ky = def.y; h.kw = w; h.kh = hh;
  }

  // ── Turret ────────────────────────────────────────────────────────────────

  private updateTurret(h: LiveHazard, delta: number): void {
    const def   = h.def;
    const state = h.state as { type: 'turret'; beamX: number; dir: 1 | -1 };
    const g     = h.gfx;
    const left  = def.sweepZoneLeft  ?? def.x - 200;
    const right = def.sweepZoneRight ?? def.x + 200;
    const bw    = def.beamW ?? 28;
    const speed = (this.alarmActive ? 180 : 90) * this.difficulty;

    state.beamX += state.dir * speed * (delta / 1000);
    if (state.beamX >= right) { state.beamX = right; state.dir = -1; }
    if (state.beamX <= left)  { state.beamX = left;  state.dir =  1; }

    const t = this.scene.time.now;

    // Turret body
    g.fillStyle(0x223344, 0.9);
    g.fillRect(def.x - 12, def.y, 24, 20);
    g.lineStyle(1, 0x4488aa, 0.6);
    g.strokeRect(def.x - 12, def.y, 24, 20);
    // Emitter
    g.fillStyle(this.alarmActive ? 0xff2200 : 0x22ccff, 0.9);
    g.fillCircle(def.x, def.y + 10, 5);
    // Sweep indicator
    g.lineStyle(1, 0x224455, 0.3);
    g.beginPath(); g.moveTo(left, def.y + 20); g.lineTo(right, def.y + 20); g.strokePath();

    // Beam
    const pulse = 0.7 + Math.sin(t / 100) * 0.3;
    g.lineStyle(bw + 8, this.alarmActive ? 0xff4400 : 0x22ccff, 0.06 * pulse);
    g.beginPath(); g.moveTo(state.beamX, def.y + 20); g.lineTo(state.beamX, 900); g.strokePath();
    g.lineStyle(bw, this.alarmActive ? 0xff2200 : 0x33ddff, 0.15 * pulse);
    g.beginPath(); g.moveTo(state.beamX, def.y + 20); g.lineTo(state.beamX, 900); g.strokePath();
    g.lineStyle(bw - 12, this.alarmActive ? 0xff6600 : 0x88eeff, 0.65 * pulse);
    g.beginPath(); g.moveTo(state.beamX, def.y + 20); g.lineTo(state.beamX, 900); g.strokePath();

    h.active = true;
    h.kx = state.beamX - bw / 2; h.ky = def.y + 20; h.kw = bw; h.kh = 900;
  }

  // ── Collapse floor ────────────────────────────────────────────────────────

  private updateCollapse(h: LiveHazard, delta: number): void {
    const def   = h.def;
    const state = h.state as { type: 'collapse_floor'; contactMs: number; triggered: boolean };
    if (state.triggered) { h.active = false; return; }

    const w  = def.w ?? 80;
    const hh = def.h ?? 15;
    const g  = h.gfx;

    // Check player contact
    let anyOn = false;
    for (const player of this.players) {
      if (player.x >= def.x - PW / 2 && player.x <= def.x + w + PW / 2 &&
          player.y + PH / 2 >= def.y - 4 && player.y + PH / 2 <= def.y + hh + 10) {
        anyOn = true;
        break;
      }
    }

    if (anyOn) {
      state.contactMs += delta;
    } else {
      state.contactMs = Math.max(0, state.contactMs - delta * 0.5);
    }

    const progress = Phaser.Math.Clamp(state.contactMs / ((def.triggerDelay ?? 1.0) * 1000), 0, 1);

    // Visual shake when about to collapse
    if (progress > 0) {
      const shakeX = progress > 0.6 ? (Math.random() - 0.5) * 3 * progress : 0;
      const r = Math.floor(0xff * progress), gb = Math.floor(0x66 * (1 - progress));
      const col = Phaser.Display.Color.GetColor(r, gb, gb);
      g.fillStyle(col, 0.5);
      g.fillRect(def.x + shakeX, def.y, w, hh);
      g.lineStyle(2, col, 0.8);
      g.strokeRect(def.x + shakeX, def.y, w, hh);
      // Crack effect when imminent
      if (progress > 0.75) {
        g.lineStyle(1, 0xff4422, 0.6);
        for (let i = 0; i < 3; i++) {
          const cx2 = def.x + (w * (i + 1)) / 4;
          g.beginPath(); g.moveTo(cx2 + shakeX, def.y); g.lineTo(cx2 - 3 + shakeX, def.y + hh); g.strokePath();
        }
      }
    }

    if (progress >= 1) {
      state.triggered = true;
      if (def.id) this.levelLoader.removeCollapsePlatform(def.id);
    }

    h.active = false; // collapse zone itself isn't a kill zone (fall damage handled by world)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private aabbHit(player: Player, h: LiveHazard): boolean {
    const pL = player.x - PW / 2, pR = player.x + PW / 2;
    const pT = player.y - PH / 2, pB = player.y + PH / 2;
    return pL < h.kx + h.kw && pR > h.kx && pT < h.ky + h.kh && pB > h.ky;
  }

  private killPlayer(player: Player): void {
    this.invTimer.set(player.index, INV_MS);
    this.scene.events.emit('player:hazardDied', { player });
  }
}
