import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { CheckpointDef } from '../levels/LevelLoader';

const PW = 24, PH = 44;

interface CPState {
  def:     CheckpointDef;
  saved:   boolean;
  gfx:     Phaser.GameObjects.Graphics;
  touched: Set<number>; // player indices who touched this checkpoint
}

export class CheckpointSystem {
  private scene:      Phaser.Scene;
  private players:    Player[];
  private respawnTokens: number;
  private checkpoints: CPState[] = [];

  // Active spawn point (starts at level start)
  private spawnX: number;
  private spawnY: number;

  constructor(
    scene: Phaser.Scene,
    players: Player[],
    initialSpawn: { x: number; y: number },
    respawnTokens: number,
  ) {
    this.scene         = scene;
    this.players       = players;
    this.spawnX        = initialSpawn.x;
    this.spawnY        = initialSpawn.y;
    this.respawnTokens = respawnTokens;

    scene.events.on('player:hazardDied', (data: { player: Player }) => {
      this.handleDeath(data.player);
    });
    scene.events.on('player:died', (data: { player: Player }) => {
      this.handleDeath(data.player);
    });
  }

  addCheckpoints(defs: CheckpointDef[]): void {
    for (const def of defs) {
      this.checkpoints.push({
        def, saved: false, touched: new Set(),
        gfx: this.scene.add.graphics(),
      });
    }
  }

  getTokens(): number { return this.respawnTokens; }

  update(_delta: number): void {
    const t = this.scene.time.now;

    for (const cp of this.checkpoints) {
      if (cp.saved) { this.drawSavedCheckpoint(cp, t); continue; }

      // Check which players are touching this checkpoint
      for (const player of this.players) {
        if (this.playerInZone(player, cp.def)) {
          cp.touched.add(player.index);
        }
      }

      // All players must touch to save
      const allTouched = this.players.every(p => cp.touched.has(p.index));
      if (allTouched && this.players.length > 0) {
        cp.saved = true;
        this.spawnX = cp.def.spawnX;
        this.spawnY = cp.def.spawnY;
        // Update player spawn points
        for (const player of this.players) {
          player.spawnX = cp.def.spawnX;
          player.spawnY = cp.def.spawnY;
        }
        this.scene.events.emit('checkpoint:saved', { id: cp.def.id });
      }

      this.drawActiveCheckpoint(cp, t);
    }
  }

  private handleDeath(player: Player): void {
    if (this.respawnTokens <= 0) {
      this.scene.events.emit('game:over');
      return;
    }
    this.respawnTokens--;
    // Respawn at current checkpoint
    player.setPosition(this.spawnX, this.spawnY - 20);
    player.setVelocity(0, 0);
    player.stamina       = 100;
    player.health        = 100;
    player.incapacitated = false;
    player.incapTimer    = 0;
    // Drop core charge if carrying one (let system clean up the carrier link)
    if (player.isCoreCarrier) {
      this.scene.events.emit('charge:forceDropFor', { player });
    }
    this.scene.events.emit('player:respawned', { player, tokensLeft: this.respawnTokens });

    if (this.respawnTokens <= 0) {
      this.scene.events.emit('game:over');
    }
  }

  private playerInZone(player: Player, cp: CheckpointDef): boolean {
    const pL = player.x - PW / 2, pR = player.x + PW / 2;
    const pT = player.y - PH / 2, pB = player.y + PH / 2;
    return pL < cp.x + cp.w && pR > cp.x && pT < cp.y + cp.h && pB > cp.y;
  }

  private drawActiveCheckpoint(cp: CPState, t: number): void {
    const g   = cp.gfx;
    const def = cp.def;
    g.clear();

    const pulse = 0.35 + Math.sin(t / 500) * 0.2;
    g.fillStyle(0x001133, 0.25); g.fillRect(def.x, def.y, def.w, def.h);

    // Show which players have touched (pips)
    for (let i = 0; i < this.players.length; i++) {
      const touched = cp.touched.has(i);
      const px = def.x + 10 + i * 18;
      const py = def.y + def.h / 2;
      g.fillStyle(touched ? 0x0088ff : 0x223344, touched ? 0.9 : 0.4);
      g.fillCircle(px, py, 5);
    }

    // Outer glow
    g.lineStyle(2, 0x0055cc, pulse); g.strokeRect(def.x, def.y, def.w, def.h);

    // Vertical beam from floor upward
    const beamAlpha = pulse * 0.35;
    g.lineStyle(2, 0x0066ff, beamAlpha);
    g.beginPath(); g.moveTo(def.x + def.w / 2, def.y); g.lineTo(def.x + def.w / 2, def.y - 300); g.strokePath();
  }

  private drawSavedCheckpoint(cp: CPState, t: number): void {
    const g   = cp.gfx;
    const def = cp.def;
    g.clear();

    const pulse = 0.55 + Math.sin(t / 350) * 0.3;
    g.fillStyle(0x001a44, 0.3); g.fillRect(def.x, def.y, def.w, def.h);
    g.lineStyle(3, 0x00aaff, pulse * 0.8); g.strokeRect(def.x, def.y, def.w, def.h);

    // Pulsing vertical beam (bright)
    g.lineStyle(3, 0x00aaff, pulse * 0.4);
    g.beginPath(); g.moveTo(def.x + def.w / 2, def.y); g.lineTo(def.x + def.w / 2, def.y - 400); g.strokePath();

    // ✓ indicator
    const cx2 = def.x + def.w / 2, cy2 = def.y + def.h / 2;
    g.lineStyle(3, 0x00ffaa, 0.9);
    g.beginPath(); g.moveTo(cx2 - 8, cy2); g.lineTo(cx2 - 2, cy2 + 6); g.strokePath();
    g.beginPath(); g.moveTo(cx2 - 2, cy2 + 6); g.lineTo(cx2 + 8, cy2 - 6); g.strokePath();
  }
}
