import type { Player } from '../entities/Player';

export class TeamSystem {
  constructor(
    private scene: Phaser.Scene,
    _players: Player[],
  ) {
    this.scene.events.on('player:grabbed', this.onGrabbed, this);
    this.scene.events.on('player:released', this.onReleased, this);
  }

  update(_delta: number): void {
    // Future: chain tension checks, weight distribution
  }

  private onGrabbed(_data: { grabber: Player; grabbed: Player }): void {}
  private onReleased(_data: { releaser: Player }): void {}
}
