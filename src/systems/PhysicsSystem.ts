import Phaser from 'phaser';
import type { Player } from '../entities/Player';

export class PhysicsSystem {
  // Tracks which players have already had a death emitted this session
  private deathEmitted = new Set<number>();

  constructor(
    private scene: Phaser.Scene,
    private players: Player[],
    private deathY: number = 890,
  ) {}

  update(_delta: number): void {
    for (const player of this.players) {
      const { x, y } = player;

      // Keep within world X bounds
      if (x < 14)   this.teleport(player, 14, y);
      if (x > 8186) this.teleport(player, 8186, y);

      // Fallen out of world — emit death once per fall
      if (y > this.deathY) {
        if (!this.deathEmitted.has(player.index)) {
          this.deathEmitted.add(player.index);
          player.setVelocity(0, 0);
          player.stamina = 100;
          this.scene.events.emit('player:died', { player });
        }
      } else if (y < this.deathY - 20) {
        // Back in bounds — reset so they can die again if they fall again
        this.deathEmitted.delete(player.index);
      }
    }
  }

  private teleport(player: Player, x: number, y: number): void {
    player.setPosition(x, y);
  }
}
