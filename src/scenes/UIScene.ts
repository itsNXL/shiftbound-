import Phaser from 'phaser';
import { Player } from '../entities/Player';

const FORM_COLORS: Record<string, number> = {
  archer:  0x55ccff,
  portal:  0xbb88ff,
  magnet:  0xffdd33,
  gravity: 0xff7733,
  none:    0x445566,
};

const FORM_LABELS: Record<string, string> = {
  archer:  'ARCHER',
  portal:  'PORTAL',
  magnet:  'MAGNET',
  gravity: 'GRAVITY',
  none:    '------',
};

const PLAYER_ACCENTS = [0x4488ff, 0xff8844, 0x44dd66, 0xff4444];

// Panel dimensions
const PW = 200;  // panel width
const PH = 80;   // panel height
const PAD = 14;  // screen padding

export class UIScene extends Phaser.Scene {
  private players: Player[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor() { super({ key: 'UIScene' }); }

  init(data: { players: Player[] }): void {
    this.players = data.players;
  }

  create(): void {
    this.g = this.add.graphics();
  }

  update(): void {
    this.g.clear();
    for (const t of this.texts) t.destroy();
    this.texts = [];

    this.players.forEach((p, i) => this.drawPanel(p, i));

    // Center top: synced action hint
    this.drawCenterHint();
  }

  // ── Per-player panel ───────────────────────────────────────────────────────

  private drawPanel(player: Player, index: number): void {
    const SW = 1280;
    // P1 = bottom-left, P2 = bottom-right, P3 = bottom-left+1, P4 = bottom-right+1
    const side   = index % 2; // 0=left, 1=right
    const row    = Math.floor(index / 2);
    const px     = side === 0
      ? PAD + row * (PW + 8)
      : SW - PAD - PW - row * (PW + 8);
    const py     = 720 - PAD - PH;

    const accent    = PLAYER_ACCENTS[index] ?? 0x888888;
    const formColor = FORM_COLORS[player.currentForm] ?? FORM_COLORS.none;
    const formLabel = FORM_LABELS[player.currentForm] ?? '------';

    // ── Panel background ──
    this.g.fillStyle(0x050a14, 0.88);
    this.g.fillRect(px, py, PW, PH);

    // ── Accent border left ──
    this.g.fillStyle(accent, 1);
    this.g.fillRect(px, py, 3, PH);

    // ── Form color top bar ──
    this.g.fillStyle(formColor, 0.9);
    this.g.fillRect(px + 3, py, PW - 3, 3);

    // ── Outer border ──
    this.g.lineStyle(1, accent, 0.3);
    this.g.strokeRect(px, py, PW, PH);

    // ── Player number ──
    const numText = this.add.text(px + 14, py + 10, `P${index + 1}`, {
      fontSize:   '22px',
      color:      Phaser.Display.Color.IntegerToColor(accent).rgba,
      fontFamily: 'monospace',
      fontStyle:  'bold',
    });
    this.texts.push(numText);

    // ── Form name ──
    const fText = this.add.text(px + 50, py + 14, formLabel, {
      fontSize:   '13px',
      color:      Phaser.Display.Color.IntegerToColor(formColor).rgba,
      fontFamily: 'monospace',
      fontStyle:  'bold',
    });
    this.texts.push(fText);

    // ── Stamina bar ──
    const barX = px + 12;
    const barY = py + 46;
    const barW = PW - 24;
    const barH = 10;
    const segments = 10;
    const segW = (barW - segments + 1) / segments;
    const filled = Math.ceil((player.stamina / 100) * segments);

    // Bar label
    const sLabel = this.add.text(barX, barY - 12, 'STAMINA', {
      fontSize:   '9px',
      color:      '#445566',
      fontFamily: 'monospace',
    });
    this.texts.push(sLabel);

    // Segments
    for (let s = 0; s < segments; s++) {
      const sx = barX + s * (segW + 1);
      const isFilled = s < filled;
      const staminaRatio = player.stamina / 100;
      let segColor: number;
      if (!isFilled) {
        segColor = 0x111a26;
      } else if (staminaRatio > 0.5) {
        segColor = 0x22cc66;
      } else if (staminaRatio > 0.25) {
        segColor = 0xddaa00;
      } else {
        const pulse = (Math.sin(Date.now() / 120) + 1) / 2;
        segColor = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0xff0000),
          Phaser.Display.Color.ValueToColor(0xcc0000),
          1, pulse,
        ).color;
      }
      this.g.fillStyle(segColor, isFilled ? 1 : 0.4);
      this.g.fillRect(sx, barY, segW, barH);
      if (isFilled) {
        this.g.lineStyle(1, 0xffffff, 0.07);
        this.g.strokeRect(sx, barY, segW, barH);
      }
    }

    // ── Status badges ──
    let badgeX = px + 12;
    const badgeY = py + 62;

    if (player.isGrabbing) {
      badgeX = this.drawBadge('GRAB', badgeX, badgeY, 0xffdd44);
    }
    if (!player.onGround) {
      this.drawBadge('AIR', badgeX, badgeY, 0x8899bb);
    }
  }

  private drawBadge(label: string, x: number, y: number, color: number): number {
    const w = label.length * 7 + 10;
    this.g.fillStyle(color, 0.15);
    this.g.fillRect(x, y, w, 14);
    this.g.lineStyle(1, color, 0.5);
    this.g.strokeRect(x, y, w, 14);
    const t = this.add.text(x + 5, y + 2, label, {
      fontSize:   '9px',
      color:      Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: 'monospace',
    });
    this.texts.push(t);
    return x + w + 5;
  }

  // ── Center hint ───────────────────────────────────────────────────────────

  private drawCenterHint(): void {
    const t = this.add.text(640, 12, 'P1: WASD · 1-4 FORMS · Q/R ACT · E GRAB    P2: ARROWS · 7-0 FORMS · ,/. ACT · SHIFT GRAB', {
      fontSize:   '9px',
      color:      '#1e3050',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.texts.push(t);
  }
}
