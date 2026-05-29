import Phaser from 'phaser';
import { FormManager } from '../forms/FormManager';

export type FormId = 'archer' | 'portal' | 'magnet' | 'gravity';

// Per-player base / accent colors
const BASE_COLORS   = [0x1550bb, 0xbb4400, 0x117733, 0xbb1111];
const ACCENT_COLORS = [0x4499ff, 0xff7733, 0x33ee66, 0xff3333];
const PLAYER_LABELS = ['P1', 'P2', 'P3', 'P4'];

// Form accent colors
const FORM_CLR: Record<string, number> = {
  archer:  0x55ddff,
  portal:  0xcc88ff,
  magnet:  0xffee33,
  gravity: 0xff8833,
  none:    0x334455,
};

const MOVE_FORCE    = 0.011;   // force per frame
const JUMP_IMPULSE  = -10;     // px/step at jump
const MAX_SPEED     = 12;      // px/step terminal velocity
const AIR_CTRL      = 0.70;    // fraction of force available in air
const COYOTE_MS     = 90;      // ms after leaving ground where jump still fires
const STAMINA_REGEN = 20;
const STAMINA_DRAIN = 30;

function getMatter(): typeof MatterJS {
  return (Phaser.Physics.Matter as unknown as { Matter: typeof MatterJS }).Matter;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MBody = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MConstraint = any;

export class Player {
  scene:       Phaser.Scene;
  index:       number;
  body:        MBody;
  graphics:    Phaser.GameObjects.Graphics;
  fxGfx:       Phaser.GameObjects.Graphics;  // rope / overlays — never flipped
  label:       Phaser.GameObjects.Text;
  formManager: FormManager;

  stamina:        number  = 100;
  facingRight:    boolean = true;
  moveDir:        number  = 0;   // -1/0/+1, set by moveLeft/Right, read by forms
  isGrabbing:     boolean = false;
  grabConstraint: MConstraint | null = null;
  grabTarget:     Player | null = null;
  onGround:       boolean = false;
  currentForm:    string  = 'none';
  gravityFlipped: boolean = false;
  archerSubMode:  'arrow' | 'zipline' = 'arrow';

  // Key-carrier state
  canSwitchForm:          boolean = true;
  speedMultiplier:        number  = 1.0;
  staminaDrainMultiplier: number  = 1.0;
  isKeyCarrier:           boolean = false;

  // Level 2 mechanics
  health:        number  = 100;
  incapacitated: boolean = false;
  incapTimer:    number  = 0;
  isCoreCarrier: boolean = false;

  // Respawn position (updated by CheckpointSystem)
  spawnX: number;
  spawnY: number;

  // Form-switch flash timer (ms)
  private switchFlash     = 0;
  // Coyote time — timestamp of last ground contact
  private lastGroundTime  = 0;

  // Fixed physics box
  private readonly PW = 24;
  private readonly PH = 44;

  constructor(scene: Phaser.Scene, index: number, x: number, y: number) {
    this.scene  = scene;
    this.index  = index;
    this.spawnX = x;
    this.spawnY = y;

    const matter = scene.matter as Phaser.Physics.Matter.MatterPhysics;
    this.body = matter.add.rectangle(x, y, this.PW, this.PH, {
      label:       `player_${index}`,
      friction:    0.05,
      frictionAir: 0.18,   // snappier stop — was 0.05
      restitution: 0,
      density:     0.002,
      chamfer:     { radius: 3 },
    });
    getMatter().Body.setInertia(this.body, Infinity);

    matter.world.on('collisionstart', this.handleCollisionStart, this);
    matter.world.on('collisionend',   this.handleCollisionEnd,   this);

    this.graphics = scene.add.graphics();
    this.fxGfx    = scene.add.graphics();
    this.label = scene.add
      .text(x, y, PLAYER_LABELS[index] ?? `P${index + 1}`, {
        fontSize:   '10px',
        color:      '#ffffff',
        fontFamily: 'Orbitron, monospace',
        fontStyle:  'bold',
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0.8);

    this.formManager = new FormManager(this, () => {
      // Duck-type access to scene.players without circular import
      const gs = this.scene as { players?: Player[] };
      return gs.players ?? [];
    });
  }

  get x(): number { return this.body.position.x; }
  get y(): number { return this.body.position.y; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  update(delta: number): void {
    this.moveDir = 0; // reset each frame; moveLeft/moveRight will set it below
    // Stamina: drain when grabbing (or carrying key); regen when grounded
    const drainMult = this.staminaDrainMultiplier;
    if (this.isGrabbing) {
      this.stamina = Math.max(0, this.stamina - (STAMINA_DRAIN * drainMult * delta) / 1000);
    } else if (this.isKeyCarrier) {
      // Passive drain when carrying key
      this.stamina = Math.max(0, this.stamina - (STAMINA_DRAIN * 0.25 * drainMult * delta) / 1000);
    } else if (this.onGround) {
      this.stamina = Math.min(100, this.stamina + (STAMINA_REGEN * delta) / 1000);
    }
    if (this.stamina <= 0 && this.isGrabbing) this.releaseGrab();

    if (this.switchFlash > 0) this.switchFlash -= delta;

    const vel = this.body.velocity;
    if (Math.abs(vel.x) > MAX_SPEED) {
      getMatter().Body.setVelocity(this.body, {
        x: Phaser.Math.Clamp(vel.x, -MAX_SPEED, MAX_SPEED),
        y: vel.y,
      });
    }

    this.formManager.update(delta);
    this.drawSelf();
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  moveLeft():  void {
    if (this.stamina <= 0) return;
    this.facingRight = false;
    this.moveDir = -1;
    const ctrl = this.onGround ? 1.0 : AIR_CTRL;
    getMatter().Body.applyForce(this.body, this.body.position, { x: -MOVE_FORCE * this.speedMultiplier * ctrl, y: 0 });
  }
  moveRight(): void {
    if (this.stamina <= 0) return;
    this.facingRight = true;
    this.moveDir = 1;
    const ctrl = this.onGround ? 1.0 : AIR_CTRL;
    getMatter().Body.applyForce(this.body, this.body.position, { x: MOVE_FORCE * this.speedMultiplier * ctrl, y: 0 });
  }
  jump(): void {
    const coyoteOk = this.onGround || (this.scene.time.now - this.lastGroundTime < COYOTE_MS);
    if (!coyoteOk) return;
    getMatter().Body.setVelocity(this.body, { x: this.body.velocity.x, y: JUMP_IMPULSE });
    this.onGround      = false;
    this.lastGroundTime = 0;   // consume coyote window
    this.scene.events.emit('player:jump', { player: this });
  }

  // ── Grab ───────────────────────────────────────────────────────────────────

  grab(target: Player): void {
    if (this.isGrabbing || this.stamina <= 0) return;
    this.grabTarget     = target;
    this.isGrabbing     = true;
    this.grabConstraint = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics)
      .add.constraint(this.body, target.body, 60, 0.05);
    this.scene.events.emit('player:grabbed', { grabber: this, grabbed: target });
  }

  releaseGrab(): void {
    if (!this.isGrabbing) return;
    if (this.grabConstraint) {
      (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).world
        .removeConstraint(this.grabConstraint);
      this.grabConstraint = null;
    }
    this.grabTarget = null;
    this.isGrabbing = false;
    this.scene.events.emit('player:released', { releaser: this });
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  switchForm(id: FormId): void {
    if (!this.canSwitchForm) return; // locked (carrying key)
    this.formManager.switchTo(id);
    this.currentForm = id;
    this.switchFlash = 280;
  }

  flipGravity(): void {
    this.gravityFlipped = !this.gravityFlipped;
  }

  applyForce(vec: { x: number; y: number }):         void { getMatter().Body.applyForce(this.body, this.body.position, vec); }
  primaryAction(p?: { x: number; y: number }):       void { this.formManager.primaryAction(p); }
  secondaryAction(p?: { x: number; y: number }):     void { this.formManager.secondaryAction(p); }
  interactAction():                                  void {
    // Broadcast interact event so GameScene can hook revive logic
    this.scene.events.emit('player:interact', { player: this });
    // Key carrier: drop the key instead of using form interact
    if (this.isKeyCarrier) {
      this.scene.events.emit('key:drop', { player: this });
      return;
    }
    this.formManager.interactAction();
  }
  setPosition(x: number, y: number):                 void { getMatter().Body.setPosition(this.body, { x, y }); }
  setVelocity(x: number, y: number):                 void { getMatter().Body.setVelocity(this.body, { x, y }); }

  // ── Rendering dispatcher ───────────────────────────────────────────────────

  private drawSelf(): void {
    this.graphics.clear();
    this.fxGfx.clear();
    const t = this.scene.time.now;

    if (this.incapacitated) {
      this.drawIncapacitated(t);
      return;
    }

    // Mirror the body graphics around the player's centre when facing left.
    // Setting position to (2*px, 0) + scaleX -1 maps any drawn point (px+d)
    // to (px-d), producing a perfect horizontal flip around px.
    if (this.facingRight) {
      this.graphics.setPosition(0, 0);
      this.graphics.setScale(1, 1);
    } else {
      this.graphics.setPosition(2 * this.x, 0);
      this.graphics.setScale(-1, 1);
    }

    switch (this.currentForm) {
      case 'archer':  this.drawArcher(t);  break;
      case 'portal':  this.drawPortal(t);  break;
      case 'magnet':  this.drawMagnet(t);  break;
      case 'gravity': this.drawGravity(t); break;
      default:        this.drawDefault(t); break;
    }

    // Rope goes on fxGfx (never flipped — it must reach the real target position)
    this.drawGrabRope();

    // Form-switch flash — drawn on fxGfx (symmetric, no flip needed)
    if (this.switchFlash > 0) {
      const fc = FORM_CLR[this.currentForm] ?? 0xffffff;
      this.fxGfx.fillStyle(fc, (this.switchFlash / 280) * 0.55);
      this.fxGfx.fillCircle(this.x, this.y - 10, 34);
    }

    // Stamina critical pulse
    if (this.stamina < 25) {
      const pulse = ((Math.sin(t / 110) + 1) / 2) * 0.5;
      this.fxGfx.fillStyle(0xff1111, pulse);
      this.fxGfx.fillRect(this.x - this.PW / 2 - 2, this.y - this.PH / 2 - 2, this.PW + 4, this.PH + 4);
    }
  }

  // ── INCAPACITATED — Flat downed state ──────────────────────────────────────
  private drawIncapacitated(t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const accent = ACCENT_COLORS[this.index] ?? 0x4488ff;

    // Flat body
    g.fillStyle(base, 0.55);
    g.fillRect(x - 22, y - 7, 44, 14);
    g.lineStyle(1, accent, 0.25);
    g.strokeRect(x - 22, y - 7, 44, 14);

    // Head (rolled to side)
    g.fillStyle(base, 0.55);
    g.fillCircle(x + 27, y, 9);
    g.lineStyle(1, accent, 0.25);
    g.strokeCircle(x + 27, y, 9);

    // X eyes
    if (Math.sin(t / 400) > -0.3) {
      g.lineStyle(1.5, 0xff3333, 0.9);
      g.beginPath(); g.moveTo(x + 23, y - 3); g.lineTo(x + 29, y + 3); g.strokePath();
      g.beginPath(); g.moveTo(x + 29, y - 3); g.lineTo(x + 23, y + 3); g.strokePath();
    }

    // "INCAP" label blink
    if (Math.sin(t / 500) > 0) {
      this.fxGfx.fillStyle(0xff3333, 0.18);
      this.fxGfx.fillRect(x - 26, y - 16, 52, 30);
    }

    this.label.setPosition(x, y - 22);
  }

  // ── DEFAULT — Generic agent ────────────────────────────────────────────────
  private drawDefault(_t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const accent = ACCENT_COLORS[this.index] ?? 0x4488ff;
    const HEAD_R = 9;
    const hy = y - this.PH / 2 - HEAD_R;

    // Body shadow
    g.fillStyle(0x000000, 0.35);
    g.fillRect(x - this.PW / 2 + 3, y - this.PH / 2 + 3, this.PW, this.PH);

    // Body
    g.fillStyle(base, 1);
    g.fillRect(x - this.PW / 2, y - this.PH / 2, this.PW, this.PH);
    g.lineStyle(1, accent, 0.45);
    g.strokeRect(x - this.PW / 2, y - this.PH / 2, this.PW, this.PH);

    // Head
    g.fillStyle(base, 1);
    g.fillCircle(x, hy, HEAD_R);
    g.lineStyle(1, accent, 0.5);
    g.strokeCircle(x, hy, HEAD_R);
    // Visor
    g.fillStyle(0x334455, 0.9);
    g.fillRect(x - HEAD_R + 3, hy - 3, (HEAD_R - 3) * 2, 5);
    g.fillStyle(0xaabbcc, 1);
    g.fillCircle(x - 3, hy - 1, 1.5);
    g.fillCircle(x + 3, hy - 1, 1.5);

    this.label.setPosition(x, hy - HEAD_R - 10);
  }

  // ── ARCHER — Slim ranger with hood, cape, bow ──────────────────────────────
  private drawArcher(_t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const fc     = FORM_CLR.archer;           // cyan
    const HEAD_R = 8;
    const hy     = y - this.PH / 2 - HEAD_R + 2;
    const BW     = 17;  // slim body width
    const BH     = 32;
    const bLeft  = x - BW / 2;
    const bTop   = y - BH / 2 + 2;

    // Aura
    g.lineStyle(5, fc, 0.06);
    g.strokeRect(bLeft - 6, bTop - 12, BW + 12, BH + 12);
    g.lineStyle(2, fc, 0.14);
    g.strokeRect(bLeft - 3, bTop - 6, BW + 6, BH + 6);

    // Cape (triangle behind body, left side)
    g.fillStyle(Phaser.Display.Color.GetColor(
      Math.floor(((base >> 16) & 0xff) * 0.5),
      Math.floor(((base >> 8)  & 0xff) * 0.5),
      Math.floor( (base        & 0xff) * 0.5),
    ), 0.9);
    g.fillTriangle(
      bLeft - 1, bTop,
      bLeft - 1, bTop + BH,
      bLeft - 18, bTop + BH,
    );

    // Body shadow
    g.fillStyle(0x000000, 0.3);
    g.fillRect(bLeft + 2, bTop + 2, BW, BH);

    // Body (slim)
    g.fillGradientStyle(
      Phaser.Display.Color.GetColor(
        Math.floor(((base >> 16) & 0xff) * 1.3),
        Math.floor(((base >> 8)  & 0xff) * 1.3),
        Math.floor( (base        & 0xff) * 1.3),
      ),
      Phaser.Display.Color.GetColor(
        Math.floor(((base >> 16) & 0xff) * 1.3),
        Math.floor(((base >> 8)  & 0xff) * 1.3),
        Math.floor( (base        & 0xff) * 1.3),
      ),
      base, base, 1,
    );
    g.fillRect(bLeft, bTop, BW, BH);
    g.lineStyle(1, fc, 0.55);
    g.strokeRect(bLeft, bTop, BW, BH);

    // Form color stripe — left edge
    g.fillStyle(fc, 0.85);
    g.fillRect(bLeft, bTop, 2, BH);

    // Quiver (right back) — 3 arrow shafts
    g.lineStyle(1, 0xddbb88, 0.9);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(bLeft + BW + 2 + i, bTop + 2 + i * 2);
      g.lineTo(bLeft + BW + 2 + i, bTop + 14 + i * 2);
      g.strokePath();
    }
    // Quiver arrowheads
    g.fillStyle(0xddbb88, 0.8);
    for (let i = 0; i < 3; i++) {
      g.fillTriangle(
        bLeft + BW + 2 + i, bTop + 1 + i * 2,
        bLeft + BW + 0 + i, bTop + 4 + i * 2,
        bLeft + BW + 4 + i, bTop + 4 + i * 2,
      );
    }

    // Bow — arc to the right of body
    const bowCX = bLeft + BW + 12;
    const bowCY = y + 2;
    g.lineStyle(2, 0xcc9955, 1);
    g.beginPath();
    g.arc(bowCX, bowCY, 13, -Math.PI / 2, Math.PI / 2);
    g.strokePath();
    // Bow string
    g.lineStyle(1, 0xffeedd, 0.6);
    g.beginPath();
    g.moveTo(bowCX, bowCY - 13);
    g.lineTo(bowCX, bowCY + 13);
    g.strokePath();
    // Arrow nocked on string
    g.lineStyle(1, 0xddbb88, 0.9);
    g.beginPath();
    g.moveTo(bowCX - 14, bowCY);
    g.lineTo(bowCX + 3, bowCY);
    g.strokePath();
    g.fillStyle(0xaaddff, 1);
    g.fillTriangle(bowCX + 3, bowCY, bowCX - 2, bowCY - 2, bowCX - 2, bowCY + 2);

    // Head shadow
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(x + 2, hy + 2, HEAD_R);

    // Hood — pointed triangle above head
    g.fillStyle(fc, 0.25);
    g.fillTriangle(x - HEAD_R + 1, hy + 2, x + HEAD_R - 1, hy + 2, x, hy - HEAD_R - 10);
    g.fillStyle(Phaser.Display.Color.GetColor(
      Math.floor(((base >> 16) & 0xff) * 0.7),
      Math.floor(((base >> 8)  & 0xff) * 0.7),
      Math.floor( (base        & 0xff) * 0.7),
    ), 1);
    g.fillTriangle(x - HEAD_R + 2, hy, x + HEAD_R - 2, hy, x, hy - HEAD_R - 8);

    // Head
    g.fillStyle(base, 1);
    g.fillCircle(x, hy, HEAD_R);
    g.lineStyle(1, fc, 0.6);
    g.strokeCircle(x, hy, HEAD_R);

    // Visor — thin cyan slit
    g.fillStyle(fc, 0.9);
    g.fillRect(x - HEAD_R + 3, hy - 2, (HEAD_R - 3) * 2, 4);
    // Eyes
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - 3, hy - 0.5, 1.5);
    g.fillCircle(x + 3, hy - 0.5, 1.5);

    this.label.setPosition(x, hy - HEAD_R - 13);
  }

  // ── PORTAL — Spherical mystic with orbital rings ───────────────────────────
  private drawPortal(t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const fc     = FORM_CLR.portal;           // purple
    const BODY_R = 18;
    const HEAD_R = 8;
    const by     = y + 2;
    const hy     = y - BODY_R - HEAD_R + 2;

    // Outer glow rings (largest first)
    g.lineStyle(8, fc, 0.04);
    g.strokeCircle(x, by, BODY_R + 12);
    g.lineStyle(4, fc, 0.09);
    g.strokeCircle(x, by, BODY_R + 7);

    // Orbital rings — two tilted using offset circles to fake perspective
    const angle = (t / 1800) % (Math.PI * 2);
    for (let ring = 0; ring < 2; ring++) {
      const ringR   = BODY_R + 4 + ring * 6;
      const ringAlp = ring === 0 ? 0.5 : 0.3;
      g.lineStyle(1, fc, ringAlp);

      // Fake perspective tilt: draw the ring as two arcs with y offset
      const tilt = (ring === 0) ? 6 : -5;
      const phaseOffset = ring === 0 ? angle : -angle;
      // Front arc
      g.beginPath();
      g.arc(x, by + tilt * Math.sin(phaseOffset), ringR,
        0 + phaseOffset, Math.PI + phaseOffset);
      g.strokePath();
      // Back arc (dimmer)
      g.lineStyle(1, fc, ringAlp * 0.4);
      g.beginPath();
      g.arc(x, by - tilt * Math.sin(phaseOffset), ringR,
        Math.PI + phaseOffset, Math.PI * 2 + phaseOffset);
      g.strokePath();
    }

    // Sparkle particles at orbital positions
    const sparkCount = 4;
    for (let i = 0; i < sparkCount; i++) {
      const a  = (i / sparkCount) * Math.PI * 2 + angle;
      const sr = BODY_R + 4;
      const sx = x + Math.cos(a) * sr;
      const sy = by + Math.sin(a) * sr * 0.35;
      const sparkAlpha = (Math.sin(a + t / 400) + 1) / 2;
      g.fillStyle(fc, sparkAlpha * 0.9);
      g.fillCircle(sx, sy, 2);
    }

    // Body shadow
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(x + 3, by + 3, BODY_R);

    // Main body sphere
    g.fillGradientStyle(
      Phaser.Display.Color.GetColor(
        Math.min(255, Math.floor(((base >> 16) & 0xff) * 1.6)),
        Math.min(255, Math.floor(((base >> 8)  & 0xff) * 1.6)),
        Math.min(255, Math.floor( (base        & 0xff) * 1.6)),
      ),
      0xffffff,
      base, base, 1,
    );
    g.fillCircle(x, by, BODY_R);

    // Sphere rim
    g.lineStyle(1, fc, 0.65);
    g.strokeCircle(x, by, BODY_R);

    // Inner sphere highlight (top-left shine)
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(x - 5, by - 5, 8);

    // Diamond core on chest
    g.fillStyle(fc, 0.8);
    g.fillPoints([
      { x: x,     y: by - 8 },
      { x: x + 6, y: by     },
      { x: x,     y: by + 8 },
      { x: x - 6, y: by     },
    ], true);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokePoints([
      { x: x,     y: by - 8 },
      { x: x + 6, y: by     },
      { x: x,     y: by + 8 },
      { x: x - 6, y: by     },
    ], true);
    // Diamond inner shimmer
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(x, by, 2);

    // Head
    g.fillStyle(0x000000, 0.2);
    g.fillCircle(x + 2, hy + 2, HEAD_R);
    g.fillStyle(base, 1);
    g.fillCircle(x, hy, HEAD_R);
    g.lineStyle(1, fc, 0.7);
    g.strokeCircle(x, hy, HEAD_R);
    // Glowing eyes
    g.fillStyle(fc, 1);
    g.fillCircle(x - 3, hy, 2);
    g.fillCircle(x + 3, hy, 2);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(x - 3, hy, 1);
    g.fillCircle(x + 3, hy, 1);

    this.label.setPosition(x, hy - HEAD_R - 13);
  }

  // ── MAGNET — Wide armored tank with U-magnet on chest ─────────────────────
  private drawMagnet(_t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const fc     = FORM_CLR.magnet;           // yellow
    const HEAD_R = 10;
    const BW     = 32;  // wide body
    const BH     = 34;
    const bLeft  = x - BW / 2;
    const bTop   = y - BH / 2 + 2;
    const hy     = bTop - HEAD_R - 1;

    // Outer magnetic field lines
    g.lineStyle(1, fc, 0.08);
    for (let i = 1; i <= 3; i++) {
      g.beginPath();
      g.arc(x - BW / 2, bTop + BH / 2, i * 14, -Math.PI / 2, Math.PI / 2, true);
      g.strokePath();
      g.beginPath();
      g.arc(x + BW / 2, bTop + BH / 2, i * 14, -Math.PI / 2, Math.PI / 2);
      g.strokePath();
    }

    // Body shadow
    g.fillStyle(0x000000, 0.35);
    g.fillRect(bLeft + 3, bTop + 3, BW, BH);

    // Shoulder pads — protruding rectangles
    const shoulderColor = Phaser.Display.Color.GetColor(
      Math.min(255, Math.floor(((base >> 16) & 0xff) * 1.5)),
      Math.min(255, Math.floor(((base >> 8)  & 0xff) * 1.5)),
      Math.min(255, Math.floor( (base        & 0xff) * 1.5)),
    );
    g.fillStyle(shoulderColor, 1);
    g.fillRect(bLeft - 7, bTop,     10, 14);  // left shoulder
    g.fillRect(bLeft + BW - 3, bTop, 10, 14); // right shoulder
    // Shoulder rims
    g.lineStyle(1, fc, 0.5);
    g.strokeRect(bLeft - 7, bTop, 10, 14);
    g.strokeRect(bLeft + BW - 3, bTop, 10, 14);
    // Shoulder bolts
    g.fillStyle(fc, 0.8);
    g.fillCircle(bLeft - 2, bTop + 7, 2);
    g.fillCircle(bLeft + BW + 2, bTop + 7, 2);

    // Main body
    g.fillGradientStyle(shoulderColor, shoulderColor, base, base, 1);
    g.fillRect(bLeft, bTop, BW, BH);
    g.lineStyle(1, fc, 0.4);
    g.strokeRect(bLeft, bTop, BW, BH);

    // Chest panel — inset box
    g.fillStyle(0x000000, 0.4);
    g.fillRect(bLeft + 5, bTop + 5, BW - 10, BH - 10);

    // U-shaped magnet on chest
    const mLeft  = bLeft + 8;
    const mRight = bLeft + BW - 8;
    const mTop   = bTop + 8;
    const mBot   = bTop + BH - 5;
    const armW   = 5;

    // Left arm (N pole — red)
    g.fillStyle(0xff3333, 1);
    g.fillRect(mLeft, mTop, armW, mBot - mTop);
    // Right arm (S pole — blue)
    g.fillStyle(0x3399ff, 1);
    g.fillRect(mRight - armW, mTop, armW, mBot - mTop);
    // Bridge at top connecting both arms
    g.fillStyle(fc, 1);
    g.fillRect(mLeft, mTop, mRight - mLeft, armW);
    // Pole labels
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(mLeft + 1, mTop + armW + 4, 3, 2);  // N mark (just a dot)
    g.fillRect(mRight - armW + 1, mTop + armW + 4, 3, 2); // S mark

    // Energy glow on magnet tips
    g.fillStyle(0xff3333, 0.5);
    g.fillCircle(mLeft + armW / 2, mBot, 4);
    g.fillStyle(0x3399ff, 0.5);
    g.fillCircle(mRight - armW / 2, mBot, 4);

    // Head shadow
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(x + 2, hy + 2, HEAD_R);

    // Head — wide, industrial
    g.fillStyle(shoulderColor, 1);
    g.fillRect(x - HEAD_R, hy - HEAD_R + 2, HEAD_R * 2, HEAD_R * 2 - 2);
    g.fillCircle(x, hy, HEAD_R);
    g.lineStyle(1, fc, 0.5);
    g.strokeCircle(x, hy, HEAD_R);

    // Visor — bright yellow bar
    g.fillStyle(fc, 0.95);
    g.fillRect(x - HEAD_R + 2, hy - 3, (HEAD_R - 2) * 2, 6);
    // Eyes (tiny dots in visor)
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(x - 4, hy, 1.5);
    g.fillCircle(x + 4, hy, 1.5);
    // Visor glow
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(x - HEAD_R + 3, hy - 2, 6, 2);

    this.label.setPosition(x, hy - HEAD_R - 11);
  }

  // ── GRAVITY — Trapezoid floater with orbiting particles ───────────────────
  private drawGravity(t: number): void {
    const g = this.graphics;
    const { x, y } = this;
    const base   = BASE_COLORS[this.index]   ?? 0x224488;
    const fc     = FORM_CLR.gravity;          // orange
    const HEAD_R = 9;
    // Trapezoid: narrow at top, wide at bottom
    const TW = 16;  // top width (half)
    const BW = 22;  // bottom width (half)
    const BH = 32;
    const bTop = y - BH / 2 + 2;
    const bBot = bTop + BH;
    const hy   = bTop - HEAD_R - 2;

    // Pulsing gravity aura
    const pulseFactor = (Math.sin(t / 400) + 1) / 2;
    g.lineStyle(8, fc, 0.04 + pulseFactor * 0.04);
    g.strokeRect(x - BW - 8, bTop - 8, (BW + 8) * 2, BH + 16);
    g.lineStyle(3, fc, 0.10 + pulseFactor * 0.06);
    g.strokeRect(x - BW - 4, bTop - 4, (BW + 4) * 2, BH + 8);

    // Orbiting particles — 4 particles at different phases
    const particleCount = 4;
    for (let i = 0; i < particleCount; i++) {
      const a  = (i / particleCount) * Math.PI * 2 + t / 700;
      const pr = 28;
      const px = x  + Math.cos(a) * pr;
      const py = y  + Math.sin(a) * pr * 0.5 - 4;
      const pAlpha = (Math.sin(a) + 1) / 2 * 0.8 + 0.2;
      g.fillStyle(fc, pAlpha);
      g.fillCircle(px, py, 3 + Math.sin(a + t / 300) * 1.5);
      // Particle trail
      for (let trail = 1; trail <= 3; trail++) {
        const ta  = a - trail * 0.15;
        const tpx = x  + Math.cos(ta) * pr;
        const tpy = y  + Math.sin(ta) * pr * 0.5 - 4;
        g.fillStyle(fc, pAlpha * (1 - trail * 0.3));
        g.fillCircle(tpx, tpy, 2 - trail * 0.4);
      }
    }

    // Body shadow
    g.fillStyle(0x000000, 0.35);
    g.fillPoints([
      { x: x - TW + 3, y: bTop + 3 },
      { x: x + TW + 3, y: bTop + 3 },
      { x: x + BW + 3, y: bBot + 3 },
      { x: x - BW + 3, y: bBot + 3 },
    ], true);

    // Trapezoid body
    const topColor = Phaser.Display.Color.GetColor(
      Math.min(255, Math.floor(((base >> 16) & 0xff) * 1.4)),
      Math.min(255, Math.floor(((base >> 8)  & 0xff) * 1.4)),
      Math.min(255, Math.floor( (base        & 0xff) * 1.4)),
    );
    g.fillGradientStyle(topColor, topColor, base, base, 1);
    g.fillPoints([
      { x: x - TW, y: bTop },
      { x: x + TW, y: bTop },
      { x: x + BW, y: bBot },
      { x: x - BW, y: bBot },
    ], true);
    g.lineStyle(1, fc, 0.5);
    g.strokePoints([
      { x: x - TW, y: bTop },
      { x: x + TW, y: bTop },
      { x: x + BW, y: bBot },
      { x: x - BW, y: bBot },
    ], true);

    // Body gravity arrow — upward pointing triangle in center
    g.fillStyle(fc, 0.7);
    g.fillTriangle(
      x,       bTop + 6,
      x - 7,   bTop + 18,
      x + 7,   bTop + 18,
    );
    // Shaft of arrow
    g.fillStyle(fc, 0.5);
    g.fillRect(x - 2, bTop + 17, 4, 10);

    // Wavy distortion lines across body
    g.lineStyle(1, fc, 0.18);
    for (let row = 0; row < 3; row++) {
      const ly = bTop + 6 + row * 8;
      g.beginPath();
      for (let wx = -BW + 2; wx <= BW - 2; wx += 4) {
        const waveY = ly + Math.sin((wx + t / 200) * 0.4) * 2;
        if (wx === -BW + 2) g.moveTo(x + wx, waveY);
        else                g.lineTo(x + wx, waveY);
      }
      g.strokePath();
    }

    // Form stripe on left edge (angled to match trapezoid)
    g.lineStyle(2, fc, 0.85);
    g.beginPath();
    g.moveTo(x - TW, bTop);
    g.lineTo(x - BW, bBot);
    g.strokePath();

    // Head (slightly levitating — gap above body)
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(x + 2, hy + 2, HEAD_R);
    g.fillStyle(base, 1);
    g.fillCircle(x, hy, HEAD_R);
    g.lineStyle(1, fc, 0.7);
    g.strokeCircle(x, hy, HEAD_R);

    // Visor — orange
    g.fillStyle(fc, 0.9);
    g.fillRect(x - HEAD_R + 3, hy - 3, (HEAD_R - 3) * 2, 5);
    // Eyes — glowing
    g.fillStyle(fc, 1);
    g.fillCircle(x - 3, hy - 1, 2);
    g.fillCircle(x + 3, hy - 1, 2);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(x - 3, hy - 1, 1);
    g.fillCircle(x + 3, hy - 1, 1);

    // Small particle on head
    g.fillStyle(fc, 0.7);
    g.fillCircle(x, hy - HEAD_R - 4 + Math.sin(t / 300) * 3, 2.5);

    this.label.setPosition(x, hy - HEAD_R - 14);
  }

  // ── Shared: grab rope ──────────────────────────────────────────────────────
  private drawGrabRope(): void {
    if (!this.isGrabbing || !this.grabTarget) return;
    const g = this.fxGfx;
    const { x, y } = this;
    const tx = this.grabTarget.x, ty = this.grabTarget.y;
    const angle = Math.atan2(ty - y, tx - x);
    const dist  = Phaser.Math.Distance.Between(x, y, tx, ty);
    const segLen = 8, gap = 5;
    let traveled = 0;
    while (traveled < dist) {
      const end = Math.min(traveled + segLen, dist);
      g.lineStyle(2, 0xffdd44, 0.85);
      g.beginPath();
      g.moveTo(x + Math.cos(angle) * traveled, y + Math.sin(angle) * traveled);
      g.lineTo(x + Math.cos(angle) * end,      y + Math.sin(angle) * end);
      g.strokePath();
      traveled += segLen + gap;
    }
  }

  // ── Collision ──────────────────────────────────────────────────────────────

  private handleCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      if (bodyA === this.body || bodyB === this.body) {
        const other = bodyA === this.body ? bodyB : bodyA;
        // Only count as ground if the other body's centre is below the player's centre
        if (other.position.y >= this.body.position.y) {
          const wasAirborne = !this.onGround;
          this.onGround      = true;
          this.lastGroundTime = this.scene.time.now;
          if (wasAirborne) this.scene.events.emit('player:land', { player: this });
        }
      }
    }
  }

  private handleCollisionEnd(event: Phaser.Physics.Matter.Events.CollisionEndEvent): void {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      if (bodyA === this.body || bodyB === this.body) {
        const other = bodyA === this.body ? bodyB : bodyA;
        // Only clear onGround when the floor contact ends — ignore wall contacts
        if (other.position.y >= this.body.position.y) {
          this.onGround      = false;
          this.lastGroundTime = this.scene.time.now; // start coyote window
        }
      }
    }
  }
}
