import type { Player } from '../entities/Player';

export interface GlobalHUDData {
  tokens:        number;
  floodMs:       number | null;
  escapeMs:      number | null;
  carrier:       Player | null;
  keyX:          number | null;
  coreInserted?: number;
  coreNeeded?:   number;
}

const FORM_COLORS: Record<string, string> = {
  archer:  '#55ccff',
  portal:  '#bb88ff',
  magnet:  '#ffdd33',
  gravity: '#ff7733',
  none:    '#334455',
};

const PLAYER_COLORS = ['#4488ff', '#ff8844', '#44dd66', '#ff4444', '#aa44ff', '#44ffdd', '#ffaa22', '#ff44aa'];

// Stamina thresholds
const SEG_HIGH   = '#22cc66';
const SEG_MID    = '#ddaa00';
const SEG_LOW    = '#ff3322';

const SEGMENTS = 10;

export class HUD {
  private panels: HTMLElement[] = [];
  private statusBar!: HTMLElement;

  constructor(numPlayers: number) {
    const hud = document.getElementById('hud')!;

    for (let i = 0; i < numPlayers; i++) {
      const panel = this.buildPanel(i);
      hud.appendChild(panel);
      this.panels.push(panel);
    }

    this.statusBar = this.buildStatusBar();
    hud.appendChild(this.statusBar);
  }

  update(players: Player[], global: GlobalHUDData): void {
    players.forEach((p, i) => {
      const panel = this.panels[i];
      if (!panel) return;
      this.updatePanel(panel, p, i);
    });
    this.updateStatusBar(global);
  }

  destroy(): void {
    for (const p of this.panels) p.remove();
    this.statusBar?.remove();
    this.panels = [];
  }

  // ── Build ────────────────────────────────────────────────────────────────

  private buildPanel(index: number): HTMLElement {
    const accent = PLAYER_COLORS[index] ?? '#888888';

    const panel = document.createElement('div');
    panel.className = 'player-panel';
    panel.dataset.player = String(index);
    panel.style.borderColor = `${accent}22`;
    panel.style.setProperty('--accent', accent);

    // Pseudo-element colors via inline style workaround — use real els instead
    const sideBar = document.createElement('div');
    sideBar.style.cssText = `
      position:absolute; top:0; left:0;
      width:3px; height:100%;
      background:${accent};
      border-radius:4px 0 0 4px;
      opacity:0.8;
    `;
    panel.appendChild(sideBar);

    const topBar = document.createElement('div');
    topBar.style.cssText = `
      position:absolute; top:0; left:0; right:0;
      height:2px;
      border-radius:4px 4px 0 0;
      opacity:0.6;
    `;
    topBar.dataset.role = 'topbar';
    panel.appendChild(topBar);

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';

    const num = document.createElement('div');
    num.className = 'player-num';
    num.textContent = `P${index + 1}`;
    num.style.color = accent;
    num.dataset.role = 'num';

    const form = document.createElement('div');
    form.className = 'form-name';
    form.textContent = '------';
    form.dataset.role = 'form';

    header.appendChild(num);
    header.appendChild(form);
    panel.appendChild(header);

    // Stamina label
    const staminaLabel = document.createElement('div');
    staminaLabel.className = 'stamina-label';
    staminaLabel.textContent = 'STAMINA';
    panel.appendChild(staminaLabel);

    // Stamina bar
    const bar = document.createElement('div');
    bar.className = 'stamina-bar';
    bar.dataset.role = 'bar';
    for (let s = 0; s < SEGMENTS; s++) {
      const seg = document.createElement('div');
      seg.className = 'stamina-seg';
      bar.appendChild(seg);
    }
    panel.appendChild(bar);

    // Health bar (compact — only visible in Level 2)
    const healthWrap = document.createElement('div');
    healthWrap.dataset.role = 'health-wrap';
    healthWrap.style.cssText = `
      display:none; height:5px; background:rgba(255,255,255,0.06);
      border-radius:2px; margin:2px 4px 4px;
      overflow:hidden; position:relative;
    `;
    const healthFill = document.createElement('div');
    healthFill.dataset.role = 'health-fill';
    healthFill.style.cssText = `
      height:100%; width:100%; background:#22cc66;
      border-radius:2px; transition:width 0.12s, background 0.25s;
    `;
    healthWrap.appendChild(healthFill);
    panel.appendChild(healthWrap);

    // Archer sub-mode row (hidden unless in archer form)
    const submode = document.createElement('div');
    submode.dataset.role = 'submode';
    submode.style.cssText = `
      display: none;
      gap: 4px;
      margin-bottom: 6px;
      padding-left: 4px;
    `;
    for (const id of ['arrow', 'zipline'] as const) {
      const btn = document.createElement('div');
      btn.dataset.submode = id;
      btn.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 1.5px;
        padding: 2px 6px;
        border-radius: 2px;
        border: 1px solid rgba(85,221,255,0.2);
        color: rgba(85,221,255,0.35);
        background: rgba(85,221,255,0.04);
        transition: all 0.1s;
      `;
      btn.textContent = id === 'arrow' ? '→ ARROW' : '≋ ZIPLINE';
      submode.appendChild(btn);
    }
    panel.appendChild(submode);

    // Badges
    const badges = document.createElement('div');
    badges.className = 'badges';
    badges.dataset.role = 'badges';
    panel.appendChild(badges);

    return panel;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  private updatePanel(panel: HTMLElement, player: Player, _index: number): void {
    const formColor = FORM_COLORS[player.currentForm] ?? FORM_COLORS.none;

    // Top bar color
    const topBar = panel.querySelector<HTMLElement>('[data-role="topbar"]');
    if (topBar) topBar.style.background = formColor;

    // Form name
    const formEl = panel.querySelector<HTMLElement>('[data-role="form"]');
    if (formEl) {
      formEl.textContent = player.currentForm.toUpperCase();
      formEl.style.color = formColor;
      formEl.style.textShadow = `0 0 8px ${formColor}88`;
    }

    // Stamina bar
    const bar = panel.querySelector<HTMLElement>('[data-role="bar"]');
    if (bar) {
      const ratio = player.stamina / 100;
      const filled = Math.ceil(ratio * SEGMENTS);
      const critical = ratio < 0.25;

      bar.classList.toggle('stamina-critical', critical);

      const segs = bar.querySelectorAll<HTMLElement>('.stamina-seg');
      segs.forEach((seg, s) => {
        if (s >= filled) {
          seg.classList.add('empty');
          seg.style.background = '';
          seg.style.boxShadow = '';
        } else {
          seg.classList.remove('empty');
          let color: string;
          if (ratio > 0.5)       color = SEG_HIGH;
          else if (ratio > 0.25) color = SEG_MID;
          else                   color = SEG_LOW;
          seg.style.background = color;
          seg.style.boxShadow  = `0 0 4px ${color}88`;
        }
      });
    }

    // Archer sub-mode row
    const submodeEl = panel.querySelector<HTMLElement>('[data-role="submode"]');
    if (submodeEl) {
      const isArcher = player.currentForm === 'archer';
      submodeEl.style.display = isArcher ? 'flex' : 'none';
      if (isArcher) {
        const active = player.archerSubMode;
        submodeEl.querySelectorAll<HTMLElement>('[data-submode]').forEach(btn => {
          const isActive = btn.dataset.submode === active;
          btn.style.color      = isActive ? '#55ddff' : 'rgba(85,221,255,0.35)';
          btn.style.background = isActive ? 'rgba(85,221,255,0.18)' : 'rgba(85,221,255,0.04)';
          btn.style.borderColor = isActive ? 'rgba(85,221,255,0.6)' : 'rgba(85,221,255,0.2)';
          btn.style.textShadow  = isActive ? '0 0 6px #55ddff' : 'none';
        });
      }
    }

    // Health bar (Level 2)
    const healthWrap = panel.querySelector<HTMLElement>('[data-role="health-wrap"]');
    const healthFill = panel.querySelector<HTMLElement>('[data-role="health-fill"]');
    if (healthWrap && healthFill) {
      const showHealth = player.health < 100 || player.incapacitated;
      healthWrap.style.display = showHealth ? '' : 'none';
      if (showHealth) {
        const hp    = Math.max(0, Math.min(100, player.health));
        const color = hp > 60 ? '#22cc66' : hp > 30 ? '#ddaa00' : '#ff3322';
        healthFill.style.width      = `${hp}%`;
        healthFill.style.background = color;
      }
    }

    // Badges
    const badgesEl = panel.querySelector<HTMLElement>('[data-role="badges"]');
    if (badgesEl) {
      badgesEl.innerHTML = '';
      if (player.incapacitated) this.addBadge(badgesEl, 'INCAP', '#ff3333');
      if (player.isCoreCarrier) this.addBadge(badgesEl, 'CORE',  '#ff6600');
      if (player.isGrabbing)    this.addBadge(badgesEl, 'GRAB',  '#ffdd44');
      if (!player.onGround && !player.incapacitated) this.addBadge(badgesEl, 'AIR', '#8899cc');
    }
  }

  private addBadge(container: HTMLElement, label: string, color: string): void {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = label;
    b.style.color = color;
    b.style.borderColor = `${color}55`;
    b.style.background = `${color}18`;
    container.appendChild(b);
  }

  // ── Global status bar ────────────────────────────────────────────────────

  private buildStatusBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = 'hud-status';

    const tokens = document.createElement('div');
    tokens.dataset.role = 'tokens';
    tokens.className = 'status-chip';

    const flood = document.createElement('div');
    flood.dataset.role = 'flood';
    flood.className = 'status-chip';
    flood.style.display = 'none';

    const escape = document.createElement('div');
    escape.dataset.role = 'escape';
    escape.className = 'status-chip';
    escape.style.display = 'none';

    const key = document.createElement('div');
    key.dataset.role = 'key';
    key.className = 'status-chip';
    key.style.display = 'none';

    const charges = document.createElement('div');
    charges.dataset.role = 'charges';
    charges.className = 'status-chip';
    charges.style.display = 'none';

    bar.appendChild(tokens);
    bar.appendChild(charges);
    bar.appendChild(flood);
    bar.appendChild(escape);
    bar.appendChild(key);

    return bar;
  }

  private updateStatusBar(g: GlobalHUDData): void {
    const bar = this.statusBar;

    // Tokens — 0 means instant-death mode
    const tokensEl = bar.querySelector<HTMLElement>('[data-role="tokens"]')!;
    if (g.tokens <= 0) {
      tokensEl.textContent = 'NO RESPAWNS';
      tokensEl.style.color = 'rgba(255,255,255,0.22)';
      tokensEl.style.textShadow = 'none';
    } else {
      const stars = '★'.repeat(g.tokens) + '☆'.repeat(Math.max(0, 4 - g.tokens));
      tokensEl.textContent = stars;
      tokensEl.style.color = g.tokens > 2 ? '#44cc88' : '#ddaa00';
      tokensEl.style.textShadow = `0 0 6px ${tokensEl.style.color}`;
    }

    // Flood timer
    const floodEl = bar.querySelector<HTMLElement>('[data-role="flood"]')!;
    if (g.floodMs !== null) {
      floodEl.style.display = '';
      const secs = (g.floodMs / 1000).toFixed(1);
      floodEl.textContent = `FLOOD ${secs}s`;
      const urgent = g.floodMs < 20000;
      floodEl.style.color = urgent ? '#ff3322' : '#ff8844';
      floodEl.style.textShadow = `0 0 8px ${floodEl.style.color}`;
    } else {
      floodEl.style.display = 'none';
    }

    // Escape timer
    const escapeEl = bar.querySelector<HTMLElement>('[data-role="escape"]')!;
    if (g.escapeMs !== null) {
      escapeEl.style.display = '';
      const secs = (g.escapeMs / 1000).toFixed(1);
      escapeEl.textContent = `ESCAPE ${secs}s`;
      const urgent = g.escapeMs < 15000;
      escapeEl.style.color = urgent ? '#ff3322' : '#00ffaa';
      escapeEl.style.textShadow = `0 0 8px ${escapeEl.style.color}`;
    } else {
      escapeEl.style.display = 'none';
    }

    // Core charges
    const chargesEl = bar.querySelector<HTMLElement>('[data-role="charges"]')!;
    if (g.coreInserted !== undefined && g.coreNeeded !== undefined) {
      chargesEl.style.display = '';
      const done = g.coreInserted >= g.coreNeeded;
      chargesEl.textContent  = `CORES ${g.coreInserted}/${g.coreNeeded}`;
      chargesEl.style.color  = done ? '#00ff88' : '#ff6600';
      chargesEl.style.textShadow = `0 0 6px ${chargesEl.style.color}`;
    } else {
      chargesEl.style.display = 'none';
    }

    // Key status
    const keyEl = bar.querySelector<HTMLElement>('[data-role="key"]')!;
    if (g.carrier) {
      keyEl.style.display = '';
      keyEl.textContent = `KEY: P${g.carrier.index + 1}`;
      keyEl.style.color = PLAYER_COLORS[g.carrier.index] ?? '#ffdd44';
      keyEl.style.textShadow = `0 0 6px ${keyEl.style.color}`;
    } else if (g.keyX !== null) {
      keyEl.style.display = '';
      keyEl.textContent = `KEY: x=${g.keyX}`;
      keyEl.style.color = '#ffdd44';
      keyEl.style.textShadow = '0 0 6px #ffdd44';
    } else {
      keyEl.style.display = 'none';
    }
  }
}
