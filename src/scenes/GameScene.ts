import Phaser from 'phaser';
import { InputSystem } from '../systems/InputSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { TeamSystem } from '../systems/TeamSystem';
import { LevelLoader } from '../levels/LevelLoader';
import { Player } from '../entities/Player';
import { LEVEL_1 } from '../levels/Level1';
import { LEVEL_2 } from '../levels/Level2';
import { HUD } from '../hud/HUD';
import { HazardSystem } from '../systems/HazardSystem';
import { KeySystem } from '../systems/KeySystem';
import { DoorSystem } from '../systems/DoorSystem';
import { CheckpointSystem } from '../systems/CheckpointSystem';
import { RadiationSystem } from '../systems/RadiationSystem';
import { CoreChargeSystem } from '../systems/CoreChargeSystem';
import { ArrowTargetSystem } from '../systems/ArrowTargetSystem';
import { ScalingSystem } from '../systems/ScalingSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { MusicSystem } from '../systems/MusicSystem';
import { NetworkManager } from '../network/NetworkManager';
import type { FormId } from '../entities/Player';

const VIEW_W = 1280;
const VIEW_H = 720;

export class GameScene extends Phaser.Scene {
  inputSystem!:      InputSystem;
  physicsSystem!:    PhysicsSystem;
  teamSystem!:       TeamSystem;
  levelLoader!:      LevelLoader;
  players:           Player[] = [];
  private hud!:      HUD;

  private hazardSystem!:     HazardSystem;
  private keySystem!:        KeySystem;
  private doorSystem!:       DoorSystem;
  private checkpointSystem!: CheckpointSystem;

  // Level 2 systems (null when not in L2)
  private radiationSystem:   RadiationSystem   | null = null;
  private coreChargeSystem:  CoreChargeSystem  | null = null;
  private arrowTargetSystem: ArrowTargetSystem | null = null;

  private floodActive   = false;
  private floodEndTime  = 0;
  private escapeActive  = false;
  private escapeEndTime = 0;

  private gameOver   = false;
  private gameWon    = false;
  private numPlayers = 2;
  private levelId    = 1;

  private sfx!:   SoundSystem;
  private music!: MusicSystem;
  /** Tracks last radiation-tick sound time per player to avoid spam. */
  private radTickLast = new Map<number, number>();
  // Music control keys (one per player slot)
  private musicKeys: Phaser.Input.Keyboard.Key[] = [];
  private musicLabel!: Phaser.GameObjects.Text;
  // SFX control keys
  private sfxKeys: Phaser.Input.Keyboard.Key[] = [];
  private sfxLabel!: Phaser.GameObjects.Text;

  // Level-specific data
  private worldW = 8200;
  private worldH = 900;
  private escapeXThreshold = 7100; // x > this triggers escape timer

  // Online co-op
  private isOnline    = false;
  private localSlot   = 0;
  private netStateTimer = 0;   // ms since last p:state broadcast
  /** True while applying a received remote event — prevents re-broadcasting it. */
  private processingRemoteEvent = false;

  constructor() { super({ key: 'GameScene' }); }

  create(data?: { numPlayers?: number; levelId?: number; localSlot?: number; isOnline?: boolean }): void {
    this.numPlayers = Math.max(2, Math.min(8, data?.numPlayers ?? 2));
    this.levelId    = data?.levelId ?? 1;
    this.isOnline   = data?.isOnline ?? false;
    this.localSlot  = data?.localSlot ?? 0;
    this.netStateTimer = 0;
    this.processingRemoteEvent = false;

    const numPlayers = this.numPlayers;
    const difficulty = 1 + (numPlayers - 2) * 0.2;
    const scaling    = ScalingSystem.getConfig(numPlayers);

    const levelData = this.levelId === 2 ? LEVEL_2 : LEVEL_1;

    this.worldW = levelData.width;
    this.worldH = levelData.height;

    // Reset all mutable state (critical: players array must be cleared on restart)
    this.players       = [];
    this.floodActive   = false;
    this.escapeActive  = false;
    this.gameOver      = false;
    this.gameWon       = false;
    this.radiationSystem   = null;
    this.coreChargeSystem  = null;
    this.arrowTargetSystem = null;

    // Remove any leftover overlay from a previous run
    document.getElementById('game-overlay')?.remove();

    this.matter.world.setBounds(0, 0, this.worldW, this.worldH);
    this.drawBackground(this.worldW, this.worldH);

    this.levelLoader = new LevelLoader(this);
    this.levelLoader.load(levelData);

    for (let i = 0; i < numPlayers; i++) {
      const pos = levelData.playerStarts[i] ?? { x: 160 + i * 60, y: this.worldH - 100 };
      this.players.push(new Player(this, i, pos.x, pos.y));
    }

    const deathY = levelData.deathY ?? 890;
    this.inputSystem   = new InputSystem(this, this.players);
    this.physicsSystem = new PhysicsSystem(this, this.players, deathY);
    this.teamSystem    = new TeamSystem(this, this.players);

    const initialSpawn = levelData.playerStarts[0] ?? { x: 160, y: this.worldH - 100 };

    if (this.levelId === 2) {
      // Level 2: respawn tokens from scaling; no key flood mechanic
      this.checkpointSystem = new CheckpointSystem(
        this, this.players, initialSpawn, scaling.respawnTokens,
      );
      if (levelData.checkpoints) this.checkpointSystem.addCheckpoints(levelData.checkpoints);

      this.hazardSystem = new HazardSystem(this, this.players, this.levelLoader);
      this.hazardSystem.difficulty = difficulty;

      this.radiationSystem  = new RadiationSystem(this, this.players);
      this.arrowTargetSystem = new ArrowTargetSystem(this, this.players);

      // Core charges
      const needed = scaling.coreChargesNeeded;
      this.coreChargeSystem = new CoreChargeSystem(this, this.players, needed);
      if (levelData.coreCharges)    this.coreChargeSystem.spawnCharges(levelData.coreCharges);
      if (levelData.insertionSlots) this.coreChargeSystem.addSlots(levelData.insertionSlots);

      // No key/door system for L2 (weight plates / doors come from scalingGroups only)
      this.keySystem  = new KeySystem(this, this.players, undefined);
      this.doorSystem = new DoorSystem(this, this.players, this.levelLoader);

      // ── Scaling-aware hazard / radiation / arrow-target / door loading ────
      let hazardDefs = (levelData.hazards        ?? []).filter(h => !h.minPlayers || numPlayers >= h.minPlayers);
      let radDefs    = [...(levelData.radiationZones ?? [])];
      let arrowDefs  = [...(levelData.arrowTargets   ?? [])];
      let wpDefs     = [...(levelData.weightPlates   ?? [])];
      const doorDefs = [...(levelData.doors          ?? [])];

      if (levelData.scalingGroups) {
        for (const group of levelData.scalingGroups) {
          if (numPlayers < group.minPlayers) continue;
          if (group.hazards)        hazardDefs = hazardDefs.concat(group.hazards.filter(h => !h.minPlayers || numPlayers >= h.minPlayers));
          if (group.radiationZones) radDefs    = radDefs.concat(group.radiationZones);
          if (group.arrowTargets)   arrowDefs  = arrowDefs.concat(group.arrowTargets);
          if (group.weightPlates) {
            for (const wp of group.weightPlates) this.levelLoader.addScalingWeightPlate(wp);
            wpDefs = wpDefs.concat(group.weightPlates);
          }
          if (group.doors) {
            for (const d of group.doors) this.levelLoader.addScalingDoor(d);
            doorDefs.push(...group.doors);
          }
        }
      }

      this.hazardSystem.addHazards(hazardDefs);
      this.radiationSystem.addZones(radDefs);
      this.arrowTargetSystem.addTargets(arrowDefs);
      this.doorSystem.addWeightPlates(wpDefs);
      this.doorSystem.addDoors(doorDefs);
      // ─────────────────────────────────────────────────────────────────────

      this.escapeXThreshold = 7000;
    } else {
      // Level 1: instant death on any fall, key/flood/door mechanics
      this.checkpointSystem = new CheckpointSystem(
        this, this.players, initialSpawn, 0,
      );
      if (levelData.checkpoints) this.checkpointSystem.addCheckpoints(levelData.checkpoints);

      this.hazardSystem = new HazardSystem(this, this.players, this.levelLoader);
      this.hazardSystem.difficulty = difficulty;

      this.keySystem = new KeySystem(this, this.players, levelData.exitZone);
      if (levelData.key) this.keySystem.spawnKey(levelData.key);

      this.doorSystem = new DoorSystem(this, this.players, this.levelLoader);

      // ── Scaling-aware hazard / plate / door loading ──────────────────
      // 1. Build hazard list — filter base hazards by minPlayers, then append
      //    any scaling-group hazards whose minPlayers threshold is met.
      let hazardDefs = (levelData.hazards ?? []).filter(
        h => !h.minPlayers || numPlayers >= h.minPlayers,
      );

      // 2. Start with base weight plates; collect mass overrides from every
      //    active scaling group, then append extra plates.
      let wpDefs = [...(levelData.weightPlates ?? [])];

      // 3. Collect base doors; scaling groups will append to both loader and system.
      const doorDefs = [...(levelData.doors ?? [])];

      if (levelData.scalingGroups) {
        for (const group of levelData.scalingGroups) {
          if (numPlayers < group.minPlayers) continue;

          // Apply plate mass overrides (modify in-place copies)
          if (group.plateMassOverrides) {
            for (const ov of group.plateMassOverrides) {
              const idx = wpDefs.findIndex(p => p.id === ov.id);
              if (idx !== -1) wpDefs[idx] = { ...wpDefs[idx]!, requiredMass: ov.requiredMass };
            }
          }
          // Extra weight plates — draw visual + register with door system
          if (group.weightPlates) {
            for (const wp of group.weightPlates) this.levelLoader.addScalingWeightPlate(wp);
            wpDefs = wpDefs.concat(group.weightPlates);
          }
          // Extra doors — spawn physics body + register with door system
          if (group.doors) {
            for (const d of group.doors) this.levelLoader.addScalingDoor(d);
            doorDefs.push(...group.doors);
          }
          // Extra hazards
          if (group.hazards) {
            hazardDefs = hazardDefs.concat(
              group.hazards.filter(h => !h.minPlayers || numPlayers >= h.minPlayers),
            );
          }
        }
      }

      this.hazardSystem.addHazards(hazardDefs);
      this.doorSystem.addWeightPlates(wpDefs);
      this.doorSystem.addDoors(doorDefs);
      // ────────────────────────────────────────────────────────────────

      this.escapeXThreshold = 7100;
    }

    this.sfx = new SoundSystem();
    this.radTickLast.clear();
    this.events.once('shutdown', () => {
      this.sfx.destroy();
      // Clear game callbacks so lobby callbacks can be re-registered next time
      if (this.isOnline) NetworkManager.get().callbacks = {};
    });

    // ── Music ──────────────────────────────────────────────────────────────
    this.music = new MusicSystem();
    this.events.once('shutdown', () => { this.music.destroy(); });

    // Music keys: P1=Z  P2=PERIOD  P3=V  P4=NUMPAD_5
    const kb = this.input.keyboard!;
    const K  = Phaser.Input.Keyboard.KeyCodes;
    this.musicKeys = [
      kb.addKey(K.Z),
      kb.addKey(K.PERIOD),
      kb.addKey(K.V),
      kb.addKey(K.NUMPAD_FIVE),
    ];

    // Fixed music state indicator — top-right corner
    this.musicLabel = this.add
      .text(VIEW_W - 12, 10, '', {
        fontSize:   '9px',
        fontFamily: 'Space Mono, monospace',
        color:      '#88aabb',
        align:      'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(200)
      .setAlpha(0.7);
    this.updateMusicLabel();

    // SFX keys: P1=C  P2=SLASH  P3=COMMA  P4=NUMPAD_6
    this.sfxKeys = [
      kb.addKey(K.C),
      kb.addKey(K.FORWARD_SLASH),
      kb.addKey(K.COMMA),
      kb.addKey(K.NUMPAD_SIX),
    ];

    // Fixed SFX state indicator — top-right corner, below music label
    this.sfxLabel = this.add
      .text(VIEW_W - 12, 24, '', {
        fontSize:   '9px',
        fontFamily: 'Space Mono, monospace',
        color:      '#88aabb',
        align:      'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(200)
      .setAlpha(0.7);
    this.updateSfxLabel();
    // ───────────────────────────────────────────────────────────────────────

    this.hud = new HUD(numPlayers);
    this.events.once('shutdown', () => { this.hud.destroy(); });

    // ── Event listeners ────────────────────────────────────────────────────

    // ── Sound hooks ────────────────────────────────────────────────────────
    this.events.on('player:jump',          () => this.sfx.jump());
    this.events.on('player:land',          () => this.sfx.land());
    this.events.on('player:grabbed',       () => this.sfx.grab());
    this.events.on('player:released',      () => this.sfx.release());
    this.events.on('player:died',          () => this.sfx.die());
    this.events.on('player:hazardDied',    () => this.sfx.die());
    this.events.on('player:incapacitated', () => this.sfx.die());
    this.events.on('player:respawned',     () => this.sfx.respawn());
    this.events.on('player:revived',       () => this.sfx.respawn());
    this.events.on('arrowTarget:hit',      () => this.sfx.arrowHit());
    this.events.on('door:opened',          () => this.sfx.doorOpen());
    this.events.on('charge:pickedUp',      () => this.sfx.chargePickup());
    this.events.on('charge:inserted',      () => this.sfx.chargeInsert());
    this.events.on('charges:allInserted',  () => this.sfx.allInserted());
    this.events.on('game:over',  () => this.sfx.gameOver());
    this.events.on('game:won',   () => this.sfx.gameWin());

    // ── Power / form sound hooks ────────────────────────────────────────────
    this.events.on('archer:fire',         () => this.sfx.archerFire());
    this.events.on('archer:arrowStick',   () => this.sfx.arrowStick());
    this.events.on('archer:modeSwitch',   () => this.sfx.archerModeSwitch());
    this.events.on('archer:ziplineAttach',() => this.sfx.ziplineAttach());
    // When any player presses F, also check every other player's portal form —
    // this lets players use portals placed by teammates regardless of their own form.
    this.events.on('player:interact', ({ player }: { player: import('../entities/Player').Player }) => {
      for (const p of this.players) {
        if (p !== player) p.formManager.getPortalForm()?.interactAction();
      }
    });

    this.events.on('portal:place',    (data: { isA: boolean }) => this.sfx.portalPlace(data?.isA ?? true));
    this.events.on('portal:teleport', () => this.sfx.portalTeleport());
    this.events.on('portal:clear',    () => this.sfx.portalClear());
    this.events.on('magnet:repel',        () => this.sfx.magnetRepel());
    this.events.on('magnet:pull',         () => this.sfx.magnetPull());
    this.events.on('gravity:flip',  (data: { on: boolean }) => this.sfx.gravityFlip(data?.on ?? true));
    this.events.on('gravity:float',       () => this.sfx.gravityFloat());
    // ───────────────────────────────────────────────────────────────────────

    // Level 1: key pickup triggers flood
    this.events.on('key:pickedUp', () => {
      this.sfx.keyPickup();
      this.sfx.alarmStart();
      this.hazardSystem.alarmActive = true;
      if (!this.floodActive && levelData.floodDuration) {
        this.floodActive  = true;
        this.floodEndTime = this.time.now + levelData.floodDuration / difficulty;
        this.hazardSystem.startFlood();
      }
    });

    // Arrow targets → seal radiation zones
    this.events.on('arrowTarget:hit', (ev: { effect: string; effectTarget: string; durationMs: number }) => {
      if (ev.effect === 'sealZone' && this.radiationSystem) {
        this.radiationSystem.sealZone(ev.effectTarget, ev.durationMs);
      }
    });

    // Player interact → try revive nearby incapacitated teammate
    this.events.on('player:interact', (ev: { player: Player }) => {
      if (this.radiationSystem) this.radiationSystem.tryRevive(ev.player);
    });

    // Core charges all inserted → alarm, allow win
    this.events.on('charges:allInserted', () => {
      this.hazardSystem.alarmActive = true;
    });

    this.events.on('game:over', () => {
      if (!this.gameOver && !this.gameWon) {
        this.gameOver = true;
        this.showOverlay('GAME OVER', '#ff3322');
      }
    });

    // ── Online co-op network wiring ────────────────────────────────────────
    if (this.isOnline) {
      const net = NetworkManager.get();

      // Configure InputSystem for online mode
      this.inputSystem.onlineMode = true;
      this.inputSystem.localSlot  = this.localSlot;
      this.inputSystem.onLocalInput = (snap) => net.sendInput(snap);

      // Apply remote player inputs locally
      net.callbacks.onRemoteInput = (slot, snap) => {
        this.inputSystem.applyRemoteSnapshot(slot, snap);
      };

      // Receive and apply position corrections for remote players
      net.callbacks.onRemoteState = (slot, state) => {
        const p = this.players[slot];
        if (!p || slot === this.localSlot) return;
        const dx = Math.abs(p.x - state.x);
        const dy = Math.abs(p.y - state.y);
        if (dx > 80 || dy > 80) {
          p.setPosition(state.x, state.y);
          p.setVelocity(state.vx, state.vy);
        }
        p.stamina        = state.stamina;
        p.health         = state.health;
        p.gravityFlipped = state.gravityFlipped;
        if (state.form !== 'none' && p.currentForm !== state.form) {
          p.switchForm(state.form as FormId);
        }
      };

      // Apply game events received from other clients
      net.callbacks.onGameEvent = (_slot, type, data) => {
        this.processingRemoteEvent = true;
        this.events.emit(type, data);
        this.processingRemoteEvent = false;
      };

      // Mark disconnected player as incapacitated
      net.callbacks.onPlayerLeft = (slot) => {
        const p = this.players[slot];
        if (p) { p.incapacitated = true; p.health = 0; }
      };

      // Broadcast game events to all other clients
      const syncEvents = [
        'key:pickedUp', 'key:dropped',
        'charge:pickedUp', 'charge:dropped', 'charge:inserted', 'charges:allInserted',
        'door:opened',
        'arrowTarget:hit',
        // game:over must be synced so both machines freeze together
        'game:over',
        // NOTE: player:hazardDied / player:died / player:respawned are intentionally
        // NOT synced — both machines run identical physics and detect deaths locally.
        // Broadcasting them causes double handleDeath calls → double token decrement → premature freeze.
      ] as const;
      for (const evType of syncEvents) {
        this.events.on(evType, (evData: unknown) => {
          if (!this.processingRemoteEvent) net.sendGameEvent(evType, evData);
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    // Camera vignette (WebGL only)
    try {
      const cam = this.cameras.main;
      (cam.postFX as unknown as { addVignette: (x:number,y:number,r:number,s:number) => void })
        .addVignette(0.5, 0.5, 0.85, 0.4);
    } catch { /* canvas renderer */ }
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.gameWon) return;

    // Start music on first frame (user has already interacted to reach this scene)
    this.music.start();

    // Music volume cycle — any player's key
    const JD = Phaser.Input.Keyboard.JustDown;
    for (const key of this.musicKeys) {
      if (JD(key)) { this.music.cycleVolume(); this.updateMusicLabel(); break; }
    }

    // SFX volume cycle — any player's key
    for (const key of this.sfxKeys) {
      if (JD(key)) { this.sfx.sfxCycleVolume(); this.updateSfxLabel(); break; }
    }

    // Online: broadcast local player state at 20 Hz
    if (this.isOnline) {
      this.netStateTimer += delta;
      if (this.netStateTimer >= 50) {
        this.netStateTimer = 0;
        const p = this.players[this.localSlot];
        if (p) {
          NetworkManager.get().sendPlayerState({
            x: p.x, y: p.y,
            vx: p.body.velocity.x as number, vy: p.body.velocity.y as number,
            stamina: p.stamina, health: p.health,
            form: p.currentForm, gravityFlipped: p.gravityFlipped,
            incapacitated: p.incapacitated,
          });
        }
      }
    }

    this.inputSystem.update(delta);
    this.physicsSystem.update(delta);
    this.teamSystem.update(delta);
    for (const p of this.players) p.update(delta);

    this.hazardSystem.update(delta);
    this.keySystem.update(delta);
    this.doorSystem.update(delta);
    this.checkpointSystem.update(delta);

    this.radiationSystem?.update(delta);
    this.coreChargeSystem?.update(delta);
    this.arrowTargetSystem?.update(delta);

    // Radiation tick sounds — one crackle per player per 600 ms while in a zone
    if (this.radiationSystem) {
      const now = this.time.now;
      for (const p of this.players) {
        if (this.radiationSystem.isPlayerInZone(p)) {
          const last = this.radTickLast.get(p.index) ?? 0;
          if (now - last >= 600) {
            this.radTickLast.set(p.index, now);
            this.sfx.radiationTick();
          }
        }
      }
    }

    this.checkEscapeEntry();
    this.checkWin();

    const now      = this.time.now;
    const floodMs  = this.floodActive  ? Math.max(0, this.floodEndTime  - now) : null;
    const escapeMs = this.escapeActive ? Math.max(0, this.escapeEndTime - now) : null;

    if (this.escapeActive && escapeMs !== null && escapeMs <= 0) {
      this.events.emit('game:over');
    }

    const carrier = this.keySystem.getCarrier();
    const ccs     = this.coreChargeSystem;
    this.hud.update(this.players, {
      tokens:       this.checkpointSystem.getTokens(),
      floodMs,
      escapeMs,
      carrier,
      keyX:         !carrier && this.keySystem.grabbed
                    ? Math.round(this.keySystem.getKeyX()) : null,
      coreInserted: ccs?.getInsertedCount(),
      coreNeeded:   ccs ? ScalingSystem.getConfig(this.numPlayers).coreChargesNeeded : undefined,
    });

    this.updateCamera();
  }

  private checkEscapeEntry(): void {
    if (this.escapeActive) return;
    const levelData = this.levelId === 2 ? LEVEL_2 : LEVEL_1;
    if (!levelData.escapeTimerDuration) return;
    const difficulty = 1 + (this.numPlayers - 2) * 0.2;
    if (this.players.some(p => p.x > this.escapeXThreshold)) {
      this.escapeActive  = true;
      this.escapeEndTime = this.time.now + levelData.escapeTimerDuration / difficulty;
    }
  }

  private checkWin(): void {
    if (this.levelId === 2) {
      this.checkWinL2();
    } else {
      this.checkWinL1();
    }
  }

  private checkWinL1(): void {
    if (!this.keySystem.inExitZone) return;
    const ez = LEVEL_1.exitZone;
    if (!ez) return;
    const allIn = this.players.every(
      p => p.x >= ez.x && p.x <= ez.x + ez.w &&
           p.y >= ez.y && p.y <= ez.y + ez.h,
    );
    if (allIn) { this.gameWon = true; this.events.emit('game:won'); this.showOverlay('YOU ESCAPED', '#00ffaa'); }
  }

  private checkWinL2(): void {
    if (!this.coreChargeSystem?.allInserted()) return;
    const ez = LEVEL_2.exitZone;
    if (!ez) return;
    const anyIn = this.players.some(
      p => !p.incapacitated &&
           p.x >= ez.x && p.x <= ez.x + ez.w &&
           p.y >= ez.y && p.y <= ez.y + ez.h,
    );
    if (anyIn) { this.gameWon = true; this.events.emit('game:won'); this.showOverlay('REACTOR CONTAINED', '#00ffaa'); }
  }

  private showOverlay(text: string, color: string): void {
    const el = document.createElement('div');
    el.id = 'game-overlay';
    el.style.cssText = `
      position:absolute;inset:0;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:32px;
      background:rgba(0,0,0,0.82);
      font-family:'Orbitron',sans-serif;
      z-index:100;pointer-events:auto;
    `;

    const heading = document.createElement('div');
    heading.style.cssText = `font-size:52px;font-weight:900;letter-spacing:8px;color:${color};text-shadow:0 0 40px ${color};`;
    heading.textContent = text;
    el.appendChild(heading);

    const won = this.gameWon;
    const isL1Win = won && this.levelId === 1;

    const makePrimaryBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `
        padding:14px 52px;
        font-family:'Orbitron',sans-serif;font-size:13px;font-weight:900;letter-spacing:6px;
        border:2px solid rgba(255,255,255,0.35);border-radius:4px;
        background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);
        cursor:pointer;transition:all 0.15s;pointer-events:auto;
      `;
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,0.16)'; b.style.borderColor = '#fff'; b.style.color = '#fff'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'rgba(255,255,255,0.07)'; b.style.borderColor = 'rgba(255,255,255,0.35)'; b.style.color = 'rgba(255,255,255,0.8)'; });
      b.addEventListener('click', onClick);
      return b;
    };

    if (isL1Win) {
      // Level 1 cleared — offer progression to Level 2
      const nextBtn = makePrimaryBtn('LEVEL 2  →', () => {
        el.remove();
        this.scene.start('GameScene', { numPlayers: this.numPlayers, levelId: 2, localSlot: this.localSlot, isOnline: this.isOnline });
      });
      nextBtn.style.borderColor = '#00ffaa';
      nextBtn.style.color       = '#00ffaa';
      nextBtn.addEventListener('mouseenter', () => { nextBtn.style.background = 'rgba(0,255,170,0.15)'; nextBtn.style.borderColor = '#00ffaa'; nextBtn.style.color = '#00ffaa'; });
      nextBtn.addEventListener('mouseleave', () => { nextBtn.style.background = 'rgba(255,255,255,0.07)'; nextBtn.style.borderColor = '#00ffaa'; nextBtn.style.color = '#00ffaa'; });
      el.appendChild(nextBtn);

      const sub = document.createElement('div');
      sub.style.cssText = `font-family:'Space Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,0.25);`;
      sub.textContent = 'THE REACTOR AWAITS';
      el.appendChild(sub);
    } else {
      const restartBtn = makePrimaryBtn('RESTART', () => {
        el.remove();
        this.scene.start('GameScene', { numPlayers: this.numPlayers, levelId: this.levelId, localSlot: this.localSlot, isOnline: this.isOnline });
      });
      el.appendChild(restartBtn);
    }

    const lobbyLink = document.createElement('div');
    lobbyLink.textContent = 'BACK TO LOBBY';
    lobbyLink.style.cssText = `font-family:'Space Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,0.22);cursor:pointer;pointer-events:auto;transition:color 0.1s;`;
    lobbyLink.addEventListener('mouseenter', () => { lobbyLink.style.color = 'rgba(255,255,255,0.55)'; });
    lobbyLink.addEventListener('mouseleave', () => { lobbyLink.style.color = 'rgba(255,255,255,0.22)'; });
    lobbyLink.addEventListener('click', () => { el.remove(); this.scene.start('LobbyScene'); });
    el.appendChild(lobbyLink);

    document.getElementById('game-wrapper')?.appendChild(el);
  }

  // ── Background ──────────────────────────────────────────────────────────

  private drawBackground(W: number, H: number): void {
    const g = this.add.graphics();

    g.fillStyle(0x070b12, 1);
    g.fillRect(0, 0, W, H);

    g.lineStyle(1, 0x0d1622, 1);
    for (let x = 0; x <= W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath(); }
    for (let y = 0; y <= H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath(); }

    g.lineStyle(1, 0x0a1018, 1);
    for (let x = 0; x <= W; x += 20) {
      if (x % 80 === 0) continue;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath();
    }
    for (let y = 0; y <= H; y += 20) {
      if (y % 80 === 0) continue;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath();
    }

    g.fillStyle(0x1a2d44, 0.6);
    for (let x = 0; x <= W; x += 80) {
      for (let y = 0; y <= H; y += 80) { g.fillRect(x - 1, y - 1, 2, 2); }
    }

    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, W, H * 0.3);

    const rng = new Phaser.Math.RandomDataGenerator(['sb']);
    for (let i = 0; i < 400; i++) {
      const sx = rng.integerInRange(0, W);
      const sy = rng.integerInRange(0, H * 0.6);
      const a  = rng.realInRange(0.04, 0.25);
      g.fillStyle(0xaabbdd, a);
      g.fillCircle(sx, sy, rng.realInRange(0.4, 1.2));
    }

    // Level 2: add reactor ambience (subtle red glow panels)
    if (this.levelId === 2) {
      g.fillStyle(0xff2200, 0.025);
      for (let x = 0; x <= W; x += 1400) {
        g.fillRect(x, 0, 700, H);
      }
    }
  }

  private updateMusicLabel(): void {
    const icons: Record<string, string> = { loud: '♪♪', quiet: '♪', mute: '♪✕' };
    const state = this.music.getState();
    this.musicLabel.setText(`${icons[state] ?? '♪'}  Z / . / V`);
  }

  private updateSfxLabel(): void {
    const icons: Record<string, string> = { loud: '◉◉', quiet: '◉', mute: '◉✕' };
    const state = this.sfx.sfxGetState();
    this.sfxLabel.setText(`${icons[state] ?? '◉'}  C / /`);
  }

  private updateCamera(): void {
    if (!this.players.length) return;
    let cx = 0, cy = 0;
    for (const p of this.players) { cx += p.x; cy += p.y; }
    cx /= this.players.length;
    cy /= this.players.length;
    this.cameras.main.centerOn(
      Phaser.Math.Clamp(cx, VIEW_W / 2, this.worldW - VIEW_W / 2),
      Phaser.Math.Clamp(cy, VIEW_H / 2, this.worldH - VIEW_H / 2),
    );
  }
}
