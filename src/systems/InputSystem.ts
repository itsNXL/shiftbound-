import Phaser from 'phaser';
import type { Player, FormId } from '../entities/Player';
import type { InputSnapshot } from '../network/types';

/**
 * Two-player local keyboard layout.
 *
 * P1:
 *   Move:        A / D
 *   Jump:        SPACE
 *   Power:       LEFT CLICK — fires toward mouse cursor (all players)
 *   Cycle form:  R
 *   Grab:        E  (hold to maintain)
 *   Interact:    F
 *   Sub-mode:    X
 *
 * P2:
 *   Move:        LEFT / RIGHT
 *   Jump:        UP
 *   Cycle form:  K
 *   Grab:        SHIFT (hold to maintain)
 *   Interact:    N
 *   Sub-mode:    M
 */

const FORM_CYCLE: FormId[] = ['archer', 'portal', 'magnet', 'gravity'];

interface PlayerKeys {
  left:      Phaser.Input.Keyboard.Key;
  right:     Phaser.Input.Keyboard.Key;
  jump:      Phaser.Input.Keyboard.Key;
  grab:      Phaser.Input.Keyboard.Key;
  cycleFrm:  Phaser.Input.Keyboard.Key;
  interact:  Phaser.Input.Keyboard.Key;  // F / N
  secondary: Phaser.Input.Keyboard.Key;  // X / M — toggle archer sub-mode
}

export class InputSystem {
  private scene:            Phaser.Scene;
  private players:          Player[];
  private keys:             PlayerKeys[] = [];
  private prevMouseDown:    boolean = false;
  private prevRightDown:    boolean = false;
  // Tracks which gamepad buttons were pressed last frame (padIndex → Set<buttonIndex>)
  private prevPadButtons:   Map<number, Set<number>> = new Map();

  // ── Online mode ────────────────────────────────────────────────────────────
  /** When true, only the player at localSlot is controlled by this keyboard. */
  onlineMode  = false;
  localSlot   = 0;
  /** Called every frame with the local player's input snapshot (online mode only). */
  onLocalInput?: (snap: InputSnapshot) => void;

  constructor(scene: Phaser.Scene, players: Player[]) {
    this.scene   = scene;
    this.players = players;
    const kb = scene.input.keyboard!;
    const K  = Phaser.Input.Keyboard.KeyCodes;

    this.keys = [
      // P1: WASD-ish
      {
        left:      kb.addKey(K.A),
        right:     kb.addKey(K.D),
        jump:      kb.addKey(K.SPACE),
        grab:      kb.addKey(K.E),
        cycleFrm:  kb.addKey(K.R),
        interact:  kb.addKey(K.F),
        secondary: kb.addKey(K.X),
      },
      // P2: Arrow keys
      {
        left:      kb.addKey(K.LEFT),
        right:     kb.addKey(K.RIGHT),
        jump:      kb.addKey(K.UP),
        grab:      kb.addKey(K.SHIFT),
        cycleFrm:  kb.addKey(K.K),
        interact:  kb.addKey(K.N),
        secondary: kb.addKey(K.M),
      },
      // P3: J/L/I cluster
      {
        left:      kb.addKey(K.J),
        right:     kb.addKey(K.L),
        jump:      kb.addKey(K.I),
        grab:      kb.addKey(K.G),
        cycleFrm:  kb.addKey(K.U),
        interact:  kb.addKey(K.H),
        secondary: kb.addKey(K.B),
      },
      // P4: Numpad
      {
        left:      kb.addKey(K.NUMPAD_FOUR),
        right:     kb.addKey(K.NUMPAD_SIX),
        jump:      kb.addKey(K.NUMPAD_EIGHT),
        grab:      kb.addKey(K.NUMPAD_ZERO),
        cycleFrm:  kb.addKey(K.NUMPAD_ONE),
        interact:  kb.addKey(K.NUMPAD_TWO),
        secondary: kb.addKey(K.NUMPAD_THREE),
      },
    ];
  }

  update(_delta: number): void {
    const JD  = Phaser.Input.Keyboard.JustDown;
    const JU  = Phaser.Input.Keyboard.JustUp;
    const ptr = this.scene.input.activePointer;

    if (this.onlineMode) {
      // ── Online: only drive localSlot player with P1 key layout ─────────────
      const player = this.players[this.localSlot];
      const k      = this.keys[0];   // everyone uses P1 keys on their own machine
      if (player && k) {
        // Capture JustDown/JustUp once — Phaser clears the flag on first read
        const jumpJD      = JD(k.jump);
        const grabJD      = JD(k.grab);
        const grabJU      = JU(k.grab);
        const cycleJD     = JD(k.cycleFrm);
        const interactJD  = JD(k.interact);
        const secondaryJD = JD(k.secondary);
        const md          = ptr.leftButtonDown();
        const fireJD      = md && !this.prevMouseDown;

        if (k.left.isDown)  player.moveLeft();
        if (k.right.isDown) player.moveRight();
        if (jumpJD)         player.jump();
        if (cycleJD)        this.cycleForm(player);
        if (interactJD)     player.interactAction();
        if (secondaryJD)    player.secondaryAction();
        if (grabJD)         this.tryGrab(player, this.localSlot);
        if (grabJU)         player.releaseGrab();
        if (fireJD)         player.primaryAction({ x: ptr.worldX, y: ptr.worldY });
        this.prevMouseDown = md;

        // Build and broadcast input snapshot
        if (this.onLocalInput) {
          this.onLocalInput({
            left: k.left.isDown,
            right: k.right.isDown,
            jumpJD, grabJD, grabJU, cycleJD, interactJD, secondaryJD, fireJD,
            aimX: ptr.worldX,
            aimY: ptr.worldY,
          });
        }
      }
      this.saveGamepadState();
      return;
    }

    // ── Local co-op (original logic) ──────────────────────────────────────────
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player) continue;

      if (i < 4) {
        const k = this.keys[i];
        if (!k) continue;
        if (k.left.isDown)  player.moveLeft();
        if (k.right.isDown) player.moveRight();
        if (JD(k.jump))      player.jump();
        if (JD(k.cycleFrm))  this.cycleForm(player);
        if (JD(k.interact))  player.interactAction();
        if (JD(k.secondary)) player.secondaryAction();
        if (JD(k.grab))      this.tryGrab(player, i);
        if (JU(k.grab))      player.releaseGrab();
      } else {
        this.updateFromGamepad(player, i, i - 4);
      }
    }

    // Left click
    const mouseDown = ptr.leftButtonDown();
    if (mouseDown && !this.prevMouseDown) {
      const aim = { x: ptr.worldX, y: ptr.worldY };
      for (const player of this.players) player.primaryAction(aim);
    }
    this.prevMouseDown = mouseDown;

    // Right click
    const rightDown = ptr.rightButtonDown();
    if (rightDown && !this.prevRightDown) {
      for (const player of this.players) player.secondaryAction();
    }
    this.prevRightDown = rightDown;

    this.saveGamepadState();
  }

  /** Apply a received remote input snapshot to the player at the given slot. */
  applyRemoteSnapshot(slot: number, snap: InputSnapshot): void {
    const player = this.players[slot];
    if (!player) return;

    if (snap.left)        player.moveLeft();
    if (snap.right)       player.moveRight();
    if (snap.jumpJD)      player.jump();
    if (snap.cycleJD)     this.cycleForm(player);
    if (snap.interactJD)  player.interactAction();
    if (snap.secondaryJD) player.secondaryAction();
    if (snap.grabJD)      this.tryGrab(player, slot);
    if (snap.grabJU)      player.releaseGrab();
    if (snap.fireJD)      player.primaryAction({ x: snap.aimX, y: snap.aimY });
  }

  private updateFromGamepad(player: Player, playerIdx: number, padIdx: number): void {
    const pads = (this.scene.input as Phaser.Input.InputPlugin & {
      gamepad?: { gamepads: Phaser.Input.Gamepad.Gamepad[] };
    }).gamepad?.gamepads;
    if (!pads) return;
    const pad = pads[padIdx];
    if (!pad || !pad.connected) return;

    // Movement: left stick or D-pad
    const lx = pad.leftStick?.x ?? 0;
    if (lx < -0.3 || pad.left)  player.moveLeft();
    if (lx >  0.3 || pad.right) player.moveRight();

    const justDown = (btn: number): boolean => {
      const curr = pad.buttons[btn]?.pressed ?? false;
      const prev = this.prevPadButtons.get(padIdx)?.has(btn) ?? false;
      return curr && !prev;
    };
    const justUp = (btn: number): boolean => {
      const curr = pad.buttons[btn]?.pressed ?? false;
      const prev = this.prevPadButtons.get(padIdx)?.has(btn) ?? false;
      return !curr && prev;
    };

    // A(0)=jump  X(2)=cycleFrm  Y(3)=interact  RB(5)=secondary  B(1)=grab
    if (justDown(0)) player.jump();
    if (justDown(2)) this.cycleForm(player);
    if (justDown(3)) player.interactAction();
    if (justDown(5)) player.secondaryAction();
    if (justDown(1)) this.tryGrab(player, playerIdx);
    if (justUp(1))   player.releaseGrab();
  }

  private saveGamepadState(): void {
    const pads = (this.scene.input as Phaser.Input.InputPlugin & {
      gamepad?: { gamepads: Phaser.Input.Gamepad.Gamepad[] };
    }).gamepad?.gamepads;
    if (!pads) return;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const pressed = new Set<number>();
      for (let b = 0; b < pad.buttons.length; b++) {
        if (pad.buttons[b]?.pressed) pressed.add(b);
      }
      this.prevPadButtons.set(i, pressed);
    }
  }

  private cycleForm(player: Player): void {
    const cur  = player.currentForm as FormId;
    const idx  = FORM_CYCLE.indexOf(cur);
    const next = FORM_CYCLE[(idx + 1) % FORM_CYCLE.length]!;
    player.switchForm(next);
  }

  private tryGrab(grabber: Player, grabberIndex: number): void {
    let closest: Player | null = null;
    let closestDist = 80;
    for (let j = 0; j < this.players.length; j++) {
      if (j === grabberIndex) continue;
      const target = this.players[j];
      if (!target) continue;
      const dist = Phaser.Math.Distance.Between(grabber.x, grabber.y, target.x, target.y);
      if (dist < closestDist) { closestDist = dist; closest = target; }
    }
    if (closest) grabber.grab(closest);
  }
}
