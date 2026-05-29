import Phaser from 'phaser';
import type { Form } from './FormManager';
import type { Player } from '../entities/Player';
import { getMatter, getWorldBodies } from '../utils/MatterUtils';

// ── Constants ───────────────────────────────────────────────────────────────
const ARROW_SPEED      = 20;    // px per 60fps frame
const ARROW_GRAVITY    = 0.30;  // downward pull per frame on in-flight arrow
const ARROW_LIFETIME   = 20000; // ms before arrow despawns
const FIRE_COOLDOWN    = 350;   // ms between shots
const MAX_ARROWS       = 8;     // max stuck arrows (4 zip-line pairs)

// Zip-line traversal
const ZIPLINE_SNAP_R   = 38;    // px — grab radius (larger = easier to catch)
const SLIDE_FRICTION   = 0.91;  // velocity damping per frame on rope
const SLIDE_INPUT      = 0.065; // t/frame² acceleration from A/D input
const GRAVITY_PX       = 2.0;   // must match Matter gravity.y

// ── Types ────────────────────────────────────────────────────────────────────
interface ArrowData {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  stuck: boolean;
  age: number;
  gfx: Phaser.GameObjects.Graphics;
}

interface AttachState {
  t: number;       // 0=anchorA end, 1=anchorB end
  tVel: number;    // slide speed along rope
}

const MAX_FREE_ARROWS = 6;  // max in-flight arrows in arrow mode

// ── ArcherForm ────────────────────────────────────────────────────────────────
export class ArcherForm implements Form {
  private player:     Player;
  private getPlayers: () => Player[];

  private arrows:   ArrowData[] = [];
  private zipGfx:   Phaser.GameObjects.Graphics;
  private attached  = new Map<Player, AttachState>();
  private aimGfx:   Phaser.GameObjects.Graphics;
  private modeGfx:  Phaser.GameObjects.Graphics;

  private subMode:    'arrow' | 'zipline' = 'arrow';
  private facingRight = true;
  private lastFire    = -FIRE_COOLDOWN;

  // Crosshair / aim dot position (updated every frame from mouse)
  private aimX = 0;
  private aimY = 0;

  constructor(player: Player, getPlayers: () => Player[]) {
    this.player     = player;
    this.getPlayers = getPlayers;
    this.zipGfx     = player.scene.add.graphics();
    this.aimGfx     = player.scene.add.graphics();
    this.modeGfx    = player.scene.add.graphics();
  }

  activate(): void {
    this.zipGfx.setVisible(true);
    this.aimGfx.setVisible(true);
    this.modeGfx.setVisible(true);
  }

  deactivate(): void {
    this.zipGfx.setVisible(false).clear();
    this.aimGfx.setVisible(false).clear();
    this.modeGfx.setVisible(false).clear();
    // Detach all riders
    for (const p of this.attached.keys()) this.detach(p);
  }

  // ── Primary action — fire toward mouse cursor ─────────────────────────────
  primaryAction(pointer?: { x: number; y: number }): void {
    const now = this.player.scene.time.now;
    if (now - this.lastFire < FIRE_COOLDOWN) return;
    this.lastFire = now;

    // Direction toward pointer (or fallback: horizontal facing)
    const tx  = pointer?.x ?? this.player.x + (this.facingRight ? 120 : -120);
    const ty  = pointer?.y ?? this.player.y;
    const dx  = tx - this.player.x;
    const dy  = ty - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const vx = (dx / len) * ARROW_SPEED;
    const vy = (dy / len) * ARROW_SPEED;

    if (this.subMode === 'zipline') {
      // Evict oldest pair when cap is full
      const stuck = this.arrows.filter(a => a.stuck);
      if (stuck.length >= MAX_ARROWS) {
        const pair = stuck.slice(0, 2);
        for (const a of pair) {
          a.gfx.destroy();
          this.arrows = this.arrows.filter(x => x !== a);
        }
        for (const p of this.attached.keys()) this.detach(p);
      }
    } else {
      // Arrow mode: evict oldest in-flight arrow when cap is reached
      if (this.arrows.length >= MAX_FREE_ARROWS) {
        const oldest = this.arrows[0]!;
        oldest.gfx.destroy();
        this.arrows.shift();
      }
    }

    this.arrows.push({
      x:     this.player.x + (vx / ARROW_SPEED) * 16,
      y:     this.player.y - 4,
      vx, vy,
      angle: Math.atan2(vy, vx),
      stuck: false,
      age:   0,
      gfx:   this.player.scene.add.graphics(),
    });
    this.player.scene.events.emit('archer:fire');
  }

  interactAction(): void {}

  // ── Secondary action — toggle sub-mode ────────────────────────────────────
  secondaryAction(): void {
    this.subMode = this.subMode === 'arrow' ? 'zipline' : 'arrow';
    this.player.archerSubMode = this.subMode;
    this.player.scene.events.emit('archer:modeSwitch');
    // Clear state when switching
    for (const a of this.arrows) a.gfx.destroy();
    this.arrows = [];
    for (const p of this.attached.keys()) this.detach(p);
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(delta: number): void {
    const dt     = delta / 16.67;
    const M      = getMatter();
    const statics = getWorldBodies(this.player.scene).filter((b: any) => b.isStatic);

    // Track facing
    const velX = this.player.body.velocity.x;
    if (velX >  0.5) this.facingRight = true;
    if (velX < -0.5) this.facingRight = false;

    // ── Simulate in-flight arrows ──
    for (const arrow of this.arrows) {
      arrow.age += delta;
      if (!arrow.stuck) {
        arrow.vy    += ARROW_GRAVITY * dt;
        arrow.x     += arrow.vx * dt;
        arrow.y     += arrow.vy * dt;
        arrow.angle  = Math.atan2(arrow.vy, arrow.vx);

        // Tip collision check
        const tipX = arrow.x + Math.cos(arrow.angle) * 10;
        const tipY = arrow.y + Math.sin(arrow.angle) * 10;
        if (M.Query.point(statics, { x: tipX, y: tipY }).length > 0) {
          arrow.stuck = true;
          // Embed tip slightly into surface for visual
          arrow.x -= Math.cos(arrow.angle) * 5;
          arrow.y -= Math.sin(arrow.angle) * 5;
          this.player.scene.events.emit('archer:arrowStick');
        }

        if (arrow.x < 0 || arrow.x > 8200 || arrow.y > 910) {
          arrow.age = ARROW_LIFETIME + 1;
        }
      }
      this.drawArrow(arrow);
    }

    // Remove expired
    const dead = this.arrows.filter(a => a.age > ARROW_LIFETIME);
    for (const a of dead) {
      a.gfx.destroy();
      for (const p of this.attached.keys()) this.detach(p);
    }
    this.arrows = this.arrows.filter(a => a.age <= ARROW_LIFETIME);

    // ── Zip-line (only in zipline mode, needs two stuck arrows) ──
    const stuck = this.arrows.filter(a => a.stuck);
    this.zipGfx.clear();

    if (this.subMode === 'zipline' && stuck.length >= 2) {
      // Every consecutive pair [0,1], [2,3], [4,5]… forms its own zipline
      for (let i = 0; i + 1 < stuck.length; i += 2) {
        const a = stuck[i]!;
        const b = stuck[i + 1]!;
        this.drawZipline(a, b);
        this.handleZiplineRiders(a, b, dt);
      }
    } else {
      // No complete pair — detach any lingering riders
      for (const p of this.attached.keys()) this.detach(p);
    }

    // ── Aim crosshair ──
    this.drawAim();

    // ── Mode selector UI ──
    this.drawModeSelector();
  }

  // ── Zip-line rider physics ─────────────────────────────────────────────────
  private handleZiplineRiders(a: ArrowData, b: ArrowData, dt: number): void {
    const M   = getMatter();
    const dx  = b.x - a.x;
    const dy  = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const nx = dx / len;
    const ny = dy / len; // unit vec A→B

    for (const p of this.getPlayers()) {

      // ── Auto-attach when close enough (works from any state) ──────────────
      if (!this.attached.has(p)) {
        const dist = this.distToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
        if (dist < ZIPLINE_SNAP_R) {
          const t0    = this.projectOntoSegment(p.x, p.y, a.x, a.y, dx, dy, len);
          // Project current velocity onto rope for seamless momentum handoff
          const pv    = p.body.velocity;
          const tVel0 = (pv.x * nx + pv.y * ny) / len;
          this.attached.set(p, { t: t0, tVel: tVel0 });
          // Kill perpendicular velocity so player snaps cleanly onto rope
          M.Body.setVelocity(p.body, { x: tVel0 * len * nx, y: tVel0 * len * ny });
          this.player.scene.events.emit('archer:ziplineAttach');
        }
      }

      const state = this.attached.get(p);
      if (!state) continue;

      // ── Physics along rope ────────────────────────────────────────────────
      // Gravity component: G * sin(angle) = G * ny (ny>0 means rope descends)
      const gravityT = (GRAVITY_PX * ny) / len;
      state.tVel += gravityT * dt;

      // A/D input: map horizontal direction onto rope axis
      // Math.sign(nx) ensures pressing → accelerates toward the higher-x end
      if (p.moveDir !== 0) {
        state.tVel += p.moveDir * Math.sign(nx) * SLIDE_INPUT * dt;
      }

      // Friction (framerate-independent)
      state.tVel *= Math.pow(SLIDE_FRICTION, dt);

      state.t += state.tVel * dt;

      // ── Detach at ends with a launch kick ─────────────────────────────────
      if (state.t < 0 || state.t > 1) {
        // Convert tVel back to px/step and eject in rope direction (+ small upward)
        const exitSpeed = state.tVel * len;
        M.Body.setVelocity(p.body, {
          x: exitSpeed * nx,
          y: exitSpeed * ny - 2.5, // slight upward pop on dismount
        });
        this.detach(p);
        continue;
      }

      // ── Snap position onto rope ───────────────────────────────────────────
      const wx = a.x + state.t * dx;
      const wy = a.y + state.t * dy;
      M.Body.setPosition(p.body, { x: wx, y: wy });
      // Match body velocity to slide so Matter doesn't fight us
      const pxPerStep = state.tVel * len;
      M.Body.setVelocity(p.body, { x: pxPerStep * nx, y: pxPerStep * ny });

      // Draw rider indicator
      const g = this.zipGfx;
      g.fillStyle(0xffffff, 0.75);
      g.fillCircle(wx, wy, 5);
      g.lineStyle(1.5, 0x55ddff, 0.5);
      g.strokeCircle(wx, wy, 8);
    }
  }

  private detach(p: Player): void {
    this.attached.delete(p);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────────
  /** Shortest distance from point (px,py) to line segment (ax,ay)→(bx,by) */
  private distToSegment(px: number, py: number,
    ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.001) return Phaser.Math.Distance.Between(px, py, ax, ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Phaser.Math.Distance.Between(px, py, cx, cy);
  }

  /** Parameter t of nearest point on segment */
  private projectOntoSegment(px: number, py: number,
    ax: number, ay: number, dx: number, dy: number, len: number): number {
    const t = ((px - ax) * dx + (py - ay) * dy) / (len * len);
    return Math.max(0, Math.min(1, t));
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  private drawArrow(a: ArrowData): void {
    const g   = a.gfx;
    g.clear();
    const cos = Math.cos(a.angle);
    const sin = Math.sin(a.angle);
    const tx  = a.x + cos * 10, ty  = a.y + sin * 10;
    const bkx = a.x - cos * 10, bky = a.y - sin * 10;

    // Glow
    g.lineStyle(5, 0x55ddff, 0.12);
    g.beginPath(); g.moveTo(bkx, bky); g.lineTo(tx, ty); g.strokePath();

    // Shaft
    g.lineStyle(2, 0xddbb88, 1);
    g.beginPath(); g.moveTo(bkx, bky); g.lineTo(tx, ty); g.strokePath();

    // Tip
    const px = -sin * 3.5, py = cos * 3.5;
    g.fillStyle(0xaaddff, 1);
    g.fillTriangle(tx, ty, tx - cos * 7 + px, ty - sin * 7 + py, tx - cos * 7 - px, ty - sin * 7 - py);

    // Fletching
    g.fillStyle(0xff4444, 0.9);
    g.fillTriangle(bkx, bky, bkx + cos * 6 + px * 1.5, bky + sin * 6 + py * 1.5, bkx + cos * 6 - px * 1.5, bky + sin * 6 - py * 1.5);

    // Impact glow (fades)
    if (a.stuck) {
      const fade = 1 - Math.min(1, a.age / 2500);
      if (fade > 0) {
        g.lineStyle(3, 0x55ddff, 0.4 * fade);
        g.strokeCircle(tx, ty, 7);
      }
    }
  }

  private drawZipline(a: ArrowData, b: ArrowData): void {
    const g   = this.zipGfx;
    const t   = this.player.scene.time.now;
    const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

    // Proximity ring on the nearest point for each player not yet riding
    for (const p of this.getPlayers()) {
      if (this.attached.has(p)) continue;
      const dist = this.distToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
      if (dist < ZIPLINE_SNAP_R * 2.5) {
        const fade = 1 - dist / (ZIPLINE_SNAP_R * 2.5);
        g.lineStyle(1.5, 0x55ddff, fade * 0.55);
        g.strokeCircle(p.x, p.y, ZIPLINE_SNAP_R);
      }
    }

    // Outer glow
    g.lineStyle(8, 0xffffff, 0.04);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();

    // Rope body — animated shimmer
    const shimmer = 0.55 + Math.sin(t / 180) * 0.2;
    g.lineStyle(2, 0xffffff, shimmer);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();

    // Sliding highlight dot
    const slideFrac = ((t / 600) % 1);
    const hx = a.x + (b.x - a.x) * slideFrac;
    const hy = a.y + (b.y - a.y) * slideFrac;
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(hx, hy, 2);

    // Anchor pulses at both ends
    const aAlpha = 0.5 + Math.sin(t / 250) * 0.3;
    g.lineStyle(2, 0x55ddff, aAlpha);
    g.strokeCircle(a.x, a.y, 6);
    g.strokeCircle(b.x, b.y, 6);

    // Distance label
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 - 12;
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(midX - 18, midY - 7, 36, 12);
    // (actual text would need a Text object — skip for perf)
    void len;
  }

  private drawModeSelector(): void {
    const g   = this.modeGfx;
    const t   = this.player.scene.time.now;
    g.clear();

    const { x, y } = this.player;
    const panelY   = y - 68;
    const slotW    = 34, slotH = 14, gap = 3;
    const totalW   = slotW * 2 + gap;
    const startX   = x - totalW / 2;
    const pulse    = 0.7 + Math.sin(t / 180) * 0.3;

    const arrowActive  = this.subMode === 'arrow';
    const ziplineActive = !arrowActive;

    // Panel background
    g.fillStyle(0x000000, 0.6);
    g.fillRect(startX - 2, panelY - slotH / 2 - 2, totalW + 4, slotH + 4);
    g.lineStyle(1, 0x334455, 0.5);
    g.strokeRect(startX - 2, panelY - slotH / 2 - 2, totalW + 4, slotH + 4);

    // ── ARROW slot ──────────────────────────────────────
    const aSX = startX;
    g.fillStyle(0x55ddff, arrowActive ? 0.18 : 0.05);
    g.fillRect(aSX, panelY - slotH / 2, slotW, slotH);
    g.lineStyle(1, arrowActive ? 0x55ddff : 0x334455, arrowActive ? pulse : 0.25);
    g.strokeRect(aSX, panelY - slotH / 2, slotW, slotH);

    // Arrow icon → centered in slot
    const aCX = aSX + slotW / 2;
    const ac  = arrowActive ? 0x55ddff : 0x446677;
    const aa  = arrowActive ? 0.95 : 0.4;
    g.lineStyle(1.5, ac, aa);
    g.beginPath(); g.moveTo(aCX - 8, panelY); g.lineTo(aCX + 4, panelY); g.strokePath();
    g.fillStyle(ac, aa);
    g.fillTriangle(aCX + 5, panelY, aCX + 1, panelY - 3, aCX + 1, panelY + 3);

    // ── ZIPLINE slot ─────────────────────────────────────
    const zSX = startX + slotW + gap;
    g.fillStyle(0x55ddff, ziplineActive ? 0.18 : 0.05);
    g.fillRect(zSX, panelY - slotH / 2, slotW, slotH);
    g.lineStyle(1, ziplineActive ? 0x55ddff : 0x334455, ziplineActive ? pulse : 0.25);
    g.strokeRect(zSX, panelY - slotH / 2, slotW, slotH);

    // Zipline icon — diagonal line with rider dot
    const zCX = zSX + slotW / 2;
    const zc  = ziplineActive ? 0x55ddff : 0x446677;
    const za  = ziplineActive ? 0.95 : 0.4;
    g.lineStyle(1.5, zc, za);
    g.beginPath(); g.moveTo(zCX - 9, panelY - 4); g.lineTo(zCX + 9, panelY + 4); g.strokePath();
    // Rider dot (animated sliding position in active mode)
    const riderT = ziplineActive ? ((t / 900) % 1) : 0.5;
    const riderX = zCX - 9 + riderT * 18;
    const riderY = panelY - 4 + riderT * 8;
    g.fillStyle(zc, za);
    g.fillCircle(riderX, riderY, 2.5);

    // Active indicator dot above the selected slot
    const activeCX = arrowActive ? (aSX + slotW / 2) : (zSX + slotW / 2);
    g.fillStyle(0x55ddff, pulse * 0.9);
    g.fillCircle(activeCX, panelY - slotH / 2 - 5, 2);
  }

  // ── Arrow target hit detection ────────────────────────────────────────────
  /** Returns true if any stuck arrow tip is within `radius` px of (bx,by) — consumes that arrow. */
  checkAndConsumeHit(bx: number, by: number, radius: number): boolean {
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i]!;
      if (!a.stuck) continue;
      const tipX = a.x + Math.cos(a.angle) * 10;
      const tipY = a.y + Math.sin(a.angle) * 10;
      if (Phaser.Math.Distance.Between(tipX, tipY, bx, by) < radius) {
        a.gfx.destroy();
        this.arrows.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  private drawAim(): void {
    const g   = this.aimGfx;
    const ptr = this.player.scene.input.activePointer;
    this.aimX = ptr.worldX;
    this.aimY = ptr.worldY;
    g.clear();

    const t     = this.player.scene.time.now;
    const pulse = 0.7 + Math.sin(t / 120) * 0.3;
    const px    = this.aimX, py = this.aimY;

    // Outer ring
    g.lineStyle(1, 0x55ddff, 0.4 * pulse);
    g.strokeCircle(px, py, 14);

    // Crosshair lines
    g.lineStyle(1, 0x55ddff, 0.7);
    g.beginPath(); g.moveTo(px - 18, py); g.lineTo(px - 6, py); g.strokePath();
    g.beginPath(); g.moveTo(px + 6,  py); g.lineTo(px + 18, py); g.strokePath();
    g.beginPath(); g.moveTo(px, py - 18); g.lineTo(px, py - 6); g.strokePath();
    g.beginPath(); g.moveTo(px, py + 6);  g.lineTo(px, py + 18); g.strokePath();

    // Center dot
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(px, py, 2);

    // Trajectory preview line from player to aim (dashed)
    const dx  = px - this.player.x;
    const dy  = py - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;
    const nx = dx / len, ny = dy / len;
    const segL = 8, gap = 5;
    let traveled = 16;
    while (traveled < Math.min(len, 200)) {
      const end = Math.min(traveled + segL, len);
      const fadeAlpha = (1 - traveled / 200) * 0.25;
      g.lineStyle(1, 0x55ddff, fadeAlpha);
      g.beginPath();
      g.moveTo(this.player.x + nx * traveled, this.player.y + ny * traveled);
      g.lineTo(this.player.x + nx * end,      this.player.y + ny * end);
      g.strokePath();
      traveled += segL + gap;
    }
  }
}
