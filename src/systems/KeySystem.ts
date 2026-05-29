import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { KeyDef, ExitZoneDef } from '../levels/LevelLoader';
import { getMatter } from '../utils/MatterUtils';

const KEY_W = 40, KEY_H = 40;
const PICKUP_RADIUS = 26; // px, player center to key center

export class KeySystem {
  private scene:    Phaser.Scene;
  private players:  Player[];
  private exitZone: ExitZoneDef | undefined;

  private keyGfx:   Phaser.GameObjects.Graphics;
  private keyBody:  any | null = null;  // Matter.js body (dynamic)
  private carrier:  Player | null = null;
  private keyX      = 0;
  private keyY      = 0;

  /** true from the moment the key is first picked up */
  grabbed   = false;
  inExitZone = false;

  constructor(scene: Phaser.Scene, players: Player[], exitZone?: ExitZoneDef) {
    this.scene    = scene;
    this.players  = players;
    this.exitZone = exitZone;
    this.keyGfx   = scene.add.graphics();

    scene.events.on('key:drop', (data: { player: Player }) => {
      if (data.player === this.carrier) this.dropKey();
    });
  }

  spawnKey(def: KeyDef): void {
    this.keyX = def.x;
    this.keyY = def.y;
    this.keyBody = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).add.rectangle(
      def.x, def.y, KEY_W, KEY_H,
      { isStatic: false, label: 'key', friction: 0.4, restitution: 0.2, density: 0.006 }
    );
    getMatter().Body.setInertia(this.keyBody, Infinity);
  }

  getCarrier(): Player | null { return this.carrier; }
  getKeyX(): number { return this.keyX; }
  getKeyY(): number { return this.keyY; }

  update(_delta: number): void {
    this.keyGfx.clear();

    if (this.carrier) {
      // Sync key position to carrier
      this.keyX = this.carrier.x + 20;
      this.keyY = this.carrier.y - 26;
      if (this.keyBody) {
        getMatter().Body.setPosition(this.keyBody, { x: this.keyX, y: this.keyY });
        getMatter().Body.setVelocity(this.keyBody, { x: 0, y: 0 });
      }
    } else if (this.keyBody) {
      // Track physics position
      this.keyX = this.keyBody.position.x;
      this.keyY = this.keyBody.position.y;

      // Check for player pickup
      for (const player of this.players) {
        const dx = player.x - this.keyX;
        const dy = player.y - this.keyY;
        if (Math.sqrt(dx * dx + dy * dy) < PICKUP_RADIUS) {
          this.pickupKey(player);
          break;
        }
      }
    }

    // Exit zone detection
    if (this.exitZone) {
      const ez = this.exitZone;
      this.inExitZone = this.keyX >= ez.x && this.keyX <= ez.x + ez.w &&
                        this.keyY >= ez.y && this.keyY <= ez.y + ez.h;
    }

    this.drawKey();
  }

  private pickupKey(player: Player): void {
    if (this.carrier) return;
    this.carrier = player;
    this.grabbed = true;

    // Lock form and apply penalties
    player.canSwitchForm       = false;
    player.speedMultiplier     = 0.8;
    player.staminaDrainMultiplier = 1.3;
    player.isKeyCarrier        = true;

    // Remove physics body (carried manually)
    if (this.keyBody) {
      (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).world.remove(this.keyBody);
      this.keyBody = null;
    }

    this.scene.events.emit('key:pickedUp', { player });
  }

  dropKey(): void {
    if (!this.carrier) return;
    const carrier = this.carrier;

    // Restore carrier
    carrier.canSwitchForm          = true;
    carrier.speedMultiplier        = 1.0;
    carrier.staminaDrainMultiplier = 1.0;
    carrier.isKeyCarrier           = false;

    this.carrier = null;

    // Re-spawn key body at drop position
    const dropX = this.keyX;
    const dropY = this.keyY + 10;
    this.keyBody = (this.scene.matter as Phaser.Physics.Matter.MatterPhysics).add.rectangle(
      dropX, dropY, KEY_W, KEY_H,
      { isStatic: false, label: 'key', friction: 0.4, restitution: 0.2, density: 0.006 }
    );
    getMatter().Body.setInertia(this.keyBody, Infinity);
    getMatter().Body.setVelocity(this.keyBody, { x: 0, y: 2 });

    this.scene.events.emit('key:dropped', { x: dropX, y: dropY });
  }

  private drawKey(): void {
    const g  = this.keyGfx;
    const t  = this.scene.time.now;
    const kx = this.keyX;
    const ky = this.keyY;

    if (!this.grabbed && !this.carrier) return; // no key yet
    if (this.keyBody === null && this.carrier === null) return; // destroyed

    const pulse = 0.7 + Math.sin(t / 150) * 0.3;

    // Outer glow
    g.lineStyle(10, 0xffdd44, 0.08 * pulse);
    g.strokeRect(kx - KEY_W / 2 - 5, ky - KEY_H / 2 - 5, KEY_W + 10, KEY_H + 10);
    g.lineStyle(4, 0xffdd44, 0.18 * pulse);
    g.strokeRect(kx - KEY_W / 2 - 2, ky - KEY_H / 2 - 2, KEY_W + 4, KEY_H + 4);

    // Key body
    g.fillStyle(0x111100, 0.9);
    g.fillRect(kx - KEY_W / 2, ky - KEY_H / 2, KEY_W, KEY_H);
    g.fillStyle(0xffdd44, 0.9);
    g.fillRect(kx - KEY_W / 2 + 2, ky - KEY_H / 2 + 2, KEY_W - 4, KEY_H - 4);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeRect(kx - KEY_W / 2 + 2, ky - KEY_H / 2 + 2, KEY_W - 4, KEY_H - 4);

    // Key symbol — simple key shape
    g.fillStyle(0x221100, 1);
    // Handle circle
    g.fillCircle(kx - 5, ky, 8);
    g.fillStyle(0xffdd44, 1);
    g.fillCircle(kx - 5, ky, 5);
    g.fillStyle(0x221100, 1);
    g.fillCircle(kx - 5, ky, 3);
    // Shaft
    g.fillStyle(0x221100, 1);
    g.fillRect(kx - 2, ky - 2, 16, 5);
    // Teeth
    g.fillRect(kx + 8, ky + 3, 4, 4);
    g.fillRect(kx + 4, ky + 3, 4, 3);

    // "F TO DROP" hint when carried and not in exit zone
    if (this.carrier) {
      const hx = kx, hy = ky - 22;
      const fade = 0.5 + Math.sin(t / 300) * 0.4;
      g.fillStyle(0xffdd44, fade * 0.7);
      g.fillRect(hx - 12, hy - 5, 24, 10);
      // F shape
      g.lineStyle(1.5, 0x221100, 1);
      g.beginPath(); g.moveTo(hx - 8, hy - 3); g.lineTo(hx - 8, hy + 3); g.strokePath();
      g.beginPath(); g.moveTo(hx - 8, hy - 3); g.lineTo(hx - 2, hy - 3); g.strokePath();
      g.beginPath(); g.moveTo(hx - 8, hy);     g.lineTo(hx - 3, hy);     g.strokePath();
    }
  }
}
