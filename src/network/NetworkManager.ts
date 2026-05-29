import { io, Socket } from 'socket.io-client';
import type { InputSnapshot, PlayerNetState } from './types';

// ── Callback signatures ───────────────────────────────────────────────────

export interface NetCallbacks {
  onPlayerJoined?:   (slot: number, total: number) => void;
  onPlayerLeft?:     (slot: number) => void;
  onRoomStarted?:    (numPlayers: number, levelId: number) => void;
  onLevelChanged?:   (levelId: number) => void;
  onRemoteInput?:    (slot: number, snap: InputSnapshot) => void;
  onRemoteState?:    (slot: number, state: PlayerNetState) => void;
  onGameEvent?:      (slot: number, type: string, data: unknown) => void;
}

// ── Singleton NetworkManager ──────────────────────────────────────────────

export class NetworkManager {
  private static _inst: NetworkManager | null = null;

  static get(): NetworkManager {
    if (!NetworkManager._inst) NetworkManager._inst = new NetworkManager();
    return NetworkManager._inst;
  }

  static reset(): void {
    NetworkManager._inst?.disconnect();
    NetworkManager._inst = null;
  }

  // ── State ────────────────────────────────────────────────────────────────

  mySlot    = -1;
  roomCode  = '';
  isHost    = false;
  isOnline  = false;

  /** Set by GameScene once created; cleared between rounds. */
  callbacks: NetCallbacks = {};

  private sock: Socket | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Open the WebSocket connection (idempotent). */
  connect(): void {
    if (this.sock?.connected) return;
    this.sock = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    this.sock.on('connect', () => console.log('[net] connected', this.sock!.id));
    this.sock.on('disconnect', () => console.log('[net] disconnected'));

    // ── Lobby events ─────────────────────────────────────────────────────
    this.sock.on('player:joined', (d: { slot: number; total: number }) =>
      this.callbacks.onPlayerJoined?.(d.slot, d.total));

    this.sock.on('player:left', (d: { slot: number }) =>
      this.callbacks.onPlayerLeft?.(d.slot));

    this.sock.on('room:started', (d: { numPlayers: number; levelId: number }) =>
      this.callbacks.onRoomStarted?.(d.numPlayers, d.levelId));

    this.sock.on('room:levelChanged', (d: { levelId: number }) =>
      this.callbacks.onLevelChanged?.(d.levelId));

    // ── In-game events ────────────────────────────────────────────────────
    this.sock.on('p:input', (d: { slot: number } & InputSnapshot) => {
      const { slot, ...snap } = d;
      this.callbacks.onRemoteInput?.(slot, snap as InputSnapshot);
    });

    this.sock.on('p:state', (d: { slot: number } & PlayerNetState) => {
      const { slot, ...state } = d;
      this.callbacks.onRemoteState?.(slot, state as PlayerNetState);
    });

    this.sock.on('game:ev', (d: { slot: number; type: string; data: unknown }) =>
      this.callbacks.onGameEvent?.(d.slot, d.type, d.data));
  }

  disconnect(): void {
    this.sock?.disconnect();
    this.sock      = null;
    this.isOnline  = false;
    this.mySlot    = -1;
    this.roomCode  = '';
    this.isHost    = false;
    this.callbacks = {};
  }

  // ── Room management ───────────────────────────────────────────────────────

  createRoom(levelId: number): Promise<{ code: string; slot: number }> {
    return new Promise((resolve, reject) => {
      if (!this.sock) { reject(new Error('Not connected')); return; }
      this.sock.emit('room:create', { levelId },
        (r: { code: string; slot: number }) => {
          this.roomCode = r.code;
          this.mySlot   = r.slot;
          this.isHost   = true;
          this.isOnline = true;
          resolve(r);
        },
      );
    });
  }

  joinRoom(code: string): Promise<{ ok: boolean; slot?: number; players?: { slot: number }[]; levelId?: number; msg?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.sock) { reject(new Error('Not connected')); return; }
      this.sock.emit('room:join', { code },
        (r: { ok: boolean; slot?: number; players?: { slot: number }[]; levelId?: number; msg?: string }) => {
          if (r.ok) {
            this.roomCode = code.toUpperCase();
            this.mySlot   = r.slot!;
            this.isHost   = false;
            this.isOnline = true;
          }
          resolve(r);
        },
      );
    });
  }

  setLevel(levelId: number): void {
    this.sock?.emit('room:setLevel', { levelId });
  }

  startGame(): void {
    this.sock?.emit('room:start');
  }

  // ── In-game messaging ─────────────────────────────────────────────────────

  sendInput(snap: InputSnapshot): void {
    this.sock?.emit('p:input', snap);
  }

  sendPlayerState(state: PlayerNetState): void {
    this.sock?.emit('p:state', state);
  }

  sendGameEvent(type: string, data: unknown = {}): void {
    this.sock?.emit('game:ev', { type, data });
  }
}
