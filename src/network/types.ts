// Shared network types used by NetworkManager, InputSystem, and GameScene.

/** Keyboard input state snapshot sent every frame by the local client. */
export interface InputSnapshot {
  left:        boolean;
  right:       boolean;
  jumpJD:      boolean;  // just-down
  grabJD:      boolean;
  grabJU:      boolean;  // just-up
  cycleJD:     boolean;
  interactJD:  boolean;
  secondaryJD: boolean;
  fireJD:      boolean;
  aimX:        number;
  aimY:        number;
}

/** Player state sent at ~20 Hz for position correction. */
export interface PlayerNetState {
  x:             number;
  y:             number;
  vx:            number;
  vy:            number;
  stamina:       number;
  health:        number;
  form:          string;
  gravityFlipped: boolean;
  incapacitated: boolean;
}
