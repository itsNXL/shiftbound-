import Phaser from 'phaser';
import type { Form } from './FormManager';
import type { Player } from '../entities/Player';
import { getMatter } from '../utils/MatterUtils';

// Force needed to cancel + reverse world gravity per frame.
// World gravity config is y:2, Matter gravity.scale default = 0.001.
// Effective gravity force per step ≈ mass * 2 * 0.001 = 0.002 * mass.
// For density 0.002, body 24×44 → mass ≈ 2.112 → gravity ≈ 0.00422/step.
// To flip: apply -2× that = -0.00845. Add headroom → -0.012.
const FLIP_FORCE      = 0.012;
const MAX_FLIP_SPEED  = 8;    // clamp upward speed same as jump impulse
const GRAVITY_DRAIN   = 22;   // stamina/second drained while gravity is flipped

export class GravityForm implements Form {
  private player: Player;
  private gfx:    Phaser.GameObjects.Graphics;
  private lastFloatSound = 0; // throttle float sound (ms)

  constructor(player: Player) {
    this.player = player;
    this.gfx    = player.scene.add.graphics();
  }

  activate(): void { this.gfx.setVisible(true); }

  deactivate(): void {
    // Reset gravity on deactivate
    if (this.player.gravityFlipped) this.player.flipGravity();
    this.gfx.setVisible(false);
    this.gfx.clear();
  }

  // G key — toggle gravity flip
  primaryAction(): void {
    this.player.flipGravity();
    this.player.scene.events.emit('gravity:flip', { on: this.player.gravityFlipped });
  }

  secondaryAction(): void {}
  interactAction(): void {}

  update(delta: number): void {
    this.gfx.clear();

    if (this.player.gravityFlipped) {
      // Drain stamina while floating — can't hold indefinitely
      this.player.stamina = Math.max(0, this.player.stamina - (GRAVITY_DRAIN * delta) / 1000);
      if (this.player.stamina <= 0) {
        this.player.flipGravity();  // auto-cancel when stamina runs out
        this.player.scene.events.emit('gravity:flip', { on: false });
        return;
      }

      // Float shimmer sound (throttled)
      const nowF = this.player.scene.time.now;
      if (nowF - this.lastFloatSound > 800) {
        this.lastFloatSound = nowF;
        this.player.scene.events.emit('gravity:float');
      }

      // Apply upward force each frame to counteract + reverse gravity
      getMatter().Body.applyForce(this.player.body, this.player.body.position,
        { x: 0, y: -FLIP_FORCE });

      // Clamp upward velocity
      if (this.player.body.velocity.y < -MAX_FLIP_SPEED) {
        getMatter().Body.setVelocity(this.player.body, {
          x: this.player.body.velocity.x,
          y: -MAX_FLIP_SPEED,
        });
      }
    }

    this.drawEffects(delta);
  }

  private drawEffects(_delta: number): void {
    const g  = this.gfx;
    const t  = this.player.scene.time.now;
    const { x, y } = this.player;

    if (this.player.gravityFlipped) {
      // Rising particles
      const count = 5;
      for (let i = 0; i < count; i++) {
        const phase  = (i / count) * Math.PI * 2;
        const life   = ((t / 300 + phase) % 1);          // 0→1 cycle
        const py2    = y + 22 - life * 60;               // rise 60px above body
        const px2    = x + Math.sin(phase + t / 400) * 14;
        const alpha  = (1 - life) * 0.8;
        const radius = (1 - life) * 3 + 0.5;
        g.fillStyle(0xff8833, alpha);
        g.fillCircle(px2, py2, radius);
      }

      // Upward arrow indicator above head
      const headY  = y - 22 - 9 - 6;
      const arrowY = headY - 18 + Math.sin(t / 250) * 3;
      g.fillStyle(0xff8833, 0.9);
      g.fillTriangle(
        x,      arrowY - 8,
        x - 6,  arrowY,
        x + 6,  arrowY,
      );
      g.fillStyle(0xff8833, 0.6);
      g.fillRect(x - 2, arrowY, 4, 8);
    } else {
      // Subtle downward particle when normal
      const pulse = (Math.sin(t / 500) + 1) / 2 * 0.3;
      g.lineStyle(1, 0xff8833, pulse);
      g.strokeCircle(x, y, 28);
    }
  }
}
