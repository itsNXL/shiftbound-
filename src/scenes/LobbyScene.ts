import Phaser from 'phaser';
import { NetworkManager } from '../network/NetworkManager';

// ── Shared style helpers ──────────────────────────────────────────────────────

const BTN = `
  font-family:'Orbitron',sans-serif;font-size:13px;font-weight:900;letter-spacing:4px;
  border:2px solid rgba(255,255,255,0.2);border-radius:4px;
  background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);
  cursor:pointer;transition:all 0.12s;pointer-events:auto;padding:12px 28px;
`;
const BTN_PRI = `
  font-family:'Orbitron',sans-serif;font-size:13px;font-weight:900;letter-spacing:5px;
  border:2px solid #0099ff;border-radius:4px;
  background:rgba(0,120,255,0.15);color:#0099ff;
  cursor:pointer;transition:all 0.15s;pointer-events:auto;padding:13px 38px;
  text-shadow:0 0 12px rgba(0,150,255,0.5);
`;
const BASE = `
  position:absolute;inset:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:22px;
  background:#070b12;
  font-family:'Orbitron',sans-serif;
  z-index:200;pointer-events:auto;
`;

function btn(label: string, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent  = label;
  b.style.cssText = primary ? BTN_PRI : BTN;
  if (!primary) {
    b.addEventListener('mouseenter', () => { b.style.borderColor = 'rgba(255,255,255,0.5)'; b.style.color = '#fff'; });
    b.addEventListener('mouseleave', () => { b.style.borderColor = 'rgba(255,255,255,0.2)'; b.style.color = 'rgba(255,255,255,0.55)'; });
  } else {
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(0,120,255,0.3)'; b.style.boxShadow = '0 0 20px rgba(0,150,255,0.4)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(0,120,255,0.15)'; b.style.boxShadow = 'none'; });
  }
  return b;
}

function label(text: string, fs = '9px', color = 'rgba(255,255,255,0.25)', ls = '4px'): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = `font-family:'Space Mono',monospace;font-size:${fs};letter-spacing:${ls};color:${color};`;
  d.textContent   = text;
  return d;
}

function title(): HTMLDivElement {
  const t = document.createElement('div');
  t.style.cssText = `font-size:44px;font-weight:900;letter-spacing:10px;color:#fff;text-shadow:0 0 40px rgba(0,150,255,0.5);`;
  t.textContent   = 'SHIFTBOUND';
  return t;
}

// ── LobbyScene ────────────────────────────────────────────────────────────────

export class LobbyScene extends Phaser.Scene {
  constructor() { super({ key: 'LobbyScene' }); }

  create(): void {
    document.getElementById('lobby-overlay')?.remove();
    this.showMain();
  }

  // ── Screen 1: Main ─────────────────────────────────────────────────────────

  private showMain(): void {
    const root = this.makeRoot();

    root.appendChild(title());
    root.appendChild(label('ONLINE CO-OP ARENA'));

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;margin-top:12px;';

    const createBtn = btn('CREATE ROOM', true);
    const joinBtn   = btn('JOIN ROOM');

    createBtn.addEventListener('click', () => { root.remove(); this.showCreate(); });
    joinBtn.addEventListener('click',   () => { root.remove(); this.showJoin(); });

    row.appendChild(createBtn);
    row.appendChild(joinBtn);
    root.appendChild(row);

    root.appendChild(label('2 – 8 PLAYERS  ·  ONLINE MULTIPLAYER', '8px', 'rgba(255,255,255,0.16)'));

    document.getElementById('game-wrapper')?.appendChild(root);
  }

  // ── Screen 2: Create room ─────────────────────────────────────────────────

  private showCreate(): void {
    const root    = this.makeRoot();
    const levelId = 1;

    root.appendChild(title());
    root.appendChild(label('L1  ·  THE FACILITY', '10px', 'rgba(0,200,255,0.6)', '6px'));

    const statusEl = label('Connecting...', '9px', '#aabbcc');
    root.appendChild(statusEl);

    const createBtn = btn('CREATE ROOM', true);
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      createBtn.style.opacity = '0.5';
      statusEl.textContent    = 'Creating room…';
      try {
        const net = NetworkManager.get();
        net.connect();
        await new Promise<void>(r => setTimeout(r, 600)); // wait for ws
        const { code } = await net.createRoom(levelId);
        root.remove();
        this.showLobby(code, 1);
      } catch (e) {
        statusEl.textContent = `Error: ${String(e)}`;
        createBtn.disabled    = false;
        createBtn.style.opacity = '1';
      }
    });

    const backBtn = btn('BACK');
    backBtn.addEventListener('click', () => { root.remove(); this.showMain(); });

    root.appendChild(createBtn);
    root.appendChild(backBtn);

    document.getElementById('game-wrapper')?.appendChild(root);
  }

  // ── Screen 3: Join room ───────────────────────────────────────────────────

  private showJoin(): void {
    const root = this.makeRoot();

    root.appendChild(title());
    root.appendChild(label('ENTER ROOM CODE'));

    const input = document.createElement('input');
    input.maxLength   = 4;
    input.placeholder = 'ABCD';
    input.style.cssText = `
      font-family:'Orbitron',sans-serif;font-size:28px;font-weight:900;letter-spacing:14px;
      text-align:center;text-transform:uppercase;
      background:rgba(255,255,255,0.06);
      border:2px solid rgba(255,255,255,0.2);border-radius:4px;
      color:#fff;outline:none;padding:10px 22px;width:180px;
      pointer-events:auto;
    `;
    input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
    root.appendChild(input);

    const statusEl = label('', '9px', '#ff5533');
    root.appendChild(statusEl);

    const joinBtn = btn('JOIN', true);
    joinBtn.addEventListener('click', async () => {
      const code = input.value.trim().toUpperCase();
      if (code.length !== 4) { statusEl.textContent = 'Enter a 4-letter code'; return; }
      joinBtn.disabled    = true;
      joinBtn.style.opacity = '0.5';
      statusEl.textContent  = 'Connecting…';
      statusEl.style.color  = '#aabbcc';
      try {
        const net = NetworkManager.get();
        net.connect();
        await new Promise<void>(r => setTimeout(r, 600));
        const result = await net.joinRoom(code);
        if (!result.ok) {
          statusEl.textContent = result.msg ?? 'Failed to join';
          statusEl.style.color = '#ff5533';
          joinBtn.disabled     = false;
          joinBtn.style.opacity = '1';
          return;
        }
        root.remove();
        this.showLobby(code, result.players?.length ?? 1);
      } catch (e) {
        statusEl.textContent = `Error: ${String(e)}`;
        statusEl.style.color = '#ff5533';
        joinBtn.disabled     = false;
        joinBtn.style.opacity = '1';
      }
    });

    // Allow Enter key to trigger join
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

    const backBtn = btn('BACK');
    backBtn.addEventListener('click', () => {
      root.remove();
      NetworkManager.reset();
      this.showMain();
    });

    root.appendChild(joinBtn);
    root.appendChild(backBtn);

    document.getElementById('game-wrapper')?.appendChild(root);
  }

  // ── Screen 4: Waiting lobby ───────────────────────────────────────────────

  private showLobby(code: string, initialCount: number): void {
    const root      = this.makeRoot();
    const net       = NetworkManager.get();
    let playerCount = initialCount;

    root.appendChild(title());

    // Room code display
    const codeBox = document.createElement('div');
    codeBox.style.cssText = `
      font-family:'Orbitron',sans-serif;font-size:36px;font-weight:900;letter-spacing:20px;
      color:#00ccff;text-shadow:0 0 24px rgba(0,200,255,0.5);
      border:2px solid rgba(0,200,255,0.2);border-radius:6px;
      padding:10px 28px;background:rgba(0,200,255,0.05);
    `;
    codeBox.textContent = code;
    root.appendChild(codeBox);
    root.appendChild(label('SHARE THIS CODE WITH YOUR FRIENDS'));

    // Player slots display
    const slotsRow = document.createElement('div');
    slotsRow.style.cssText = 'display:flex;gap:8px;';
    const slotDots: HTMLDivElement[] = [];
    for (let i = 0; i < 8; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width:24px;height:24px;border-radius:50%;
        border:2px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.04);
        transition:all 0.2s;
      `;
      slotDots.push(dot);
      slotsRow.appendChild(dot);
    }
    root.appendChild(slotsRow);

    const countLabel = label(`${playerCount} / 8 PLAYERS CONNECTED`, '9px', '#aabbcc');
    root.appendChild(countLabel);

    const refreshDots = (): void => {
      for (let i = 0; i < 8; i++) {
        const d = slotDots[i]!;
        if (i < playerCount) {
          d.style.background  = i === net.mySlot ? '#0099ff' : 'rgba(0,200,100,0.8)';
          d.style.borderColor = i === net.mySlot ? '#0099ff' : 'rgba(0,200,100,0.5)';
          d.style.boxShadow   = i === net.mySlot ? '0 0 10px #0099ff' : 'none';
        } else {
          d.style.background  = 'rgba(255,255,255,0.04)';
          d.style.borderColor = 'rgba(255,255,255,0.15)';
          d.style.boxShadow   = 'none';
        }
      }
      countLabel.textContent = `${playerCount} / 8 PLAYERS CONNECTED`;
    };
    refreshDots();

    // Waiting / start status
    const waitLabel = label(
      net.isHost ? 'YOU ARE THE HOST — PRESS START WHEN READY' : 'WAITING FOR HOST TO START…',
      '9px', net.isHost ? '#ffcc44' : 'rgba(255,255,255,0.3)',
    );
    root.appendChild(waitLabel);

    // Host: start button (enabled when ≥2 players)
    let startBtn: HTMLButtonElement | null = null;
    if (net.isHost) {
      startBtn = btn('START GAME', true);
      startBtn.disabled     = playerCount < 2;
      startBtn.style.opacity = playerCount < 2 ? '0.4' : '1';
      startBtn.addEventListener('click', () => net.startGame());
      root.appendChild(startBtn);
    }

    // Network callbacks while in lobby
    net.callbacks.onPlayerJoined = (slot, total) => {
      playerCount = total;
      refreshDots();
      if (startBtn) {
        startBtn.disabled     = total < 2;
        startBtn.style.opacity = total < 2 ? '0.4' : '1';
      }
      console.log(`Player ${slot} joined (${total} total)`);
    };

    net.callbacks.onPlayerLeft = (slot) => {
      playerCount = Math.max(1, playerCount - 1);
      refreshDots();
      console.log(`Player ${slot} left`);
    };

    net.callbacks.onLevelChanged = (_levelId) => {
      // Level label update handled if we add it
    };

    net.callbacks.onRoomStarted = (numPlayers, levelId) => {
      root.remove();
      // Clear lobby callbacks before entering game
      net.callbacks = {};
      this.scene.start('GameScene', {
        numPlayers,
        levelId,
        localSlot: net.mySlot,
        isOnline:  true,
      });
    };

    const backBtn = btn('LEAVE ROOM');
    backBtn.addEventListener('click', () => {
      root.remove();
      NetworkManager.reset();
      this.showMain();
    });
    root.appendChild(backBtn);

    document.getElementById('game-wrapper')?.appendChild(root);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeRoot(): HTMLDivElement {
    const d = document.createElement('div');
    d.id            = 'lobby-overlay';
    d.style.cssText = BASE;
    return d;
  }
}
