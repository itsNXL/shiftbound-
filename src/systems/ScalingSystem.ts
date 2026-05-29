export interface LevelScalingConfig {
  tier: 1 | 2 | 3 | 4;
  playerCount: number;
  /**
   * How many parallel tasks are simultaneously active at this player count.
   * Used by the HUD and GameScene to communicate urgency to players.
   */
  simultaneousTaskCount: number;
  respawnTokens: number;
  keyCount: number;
  coreChargesNeeded: number;
  hazardSpeedMult: number;
  crusherDownTime: number;
  turretSweepMult: number;
  activeRadiationZones: number;
  floodTimerMs: number;
  escapeTimerMs: number;
  exitDoorWindowMs: number;
  pendulumSawCount: number;
  turretCount: number;
  weightPlateBaseMass: number;
  extraCrushersInS6: number;
  s2WaterRiseRate: number;       // px/s
  arrowTargetSpinMult: number;
  arrowTargetWindowMs: number;
  orbitalRingCount: number;
  arrowReloadMs: number;
}

const T = (vals: number[], tier: number) => vals[tier]!;

export class ScalingSystem {
  static getConfig(playerCount: number): LevelScalingConfig {
    const tier = playerCount <= 2 ? 1 : playerCount <= 4 ? 2 : playerCount <= 6 ? 3 : 4;
    return {
      tier:                 tier as 1|2|3|4,
      playerCount,
      simultaneousTaskCount: T([0, 1, 2, 4, 7], tier),
      respawnTokens:        T([0,  3,  5,  7, 10], tier),
      keyCount:             T([0,  1,  1,  2,  3], tier),
      coreChargesNeeded:    T([0,  3,  3,  4,  5], tier),
      hazardSpeedMult:      T([0, .85, 1, 1.2, 1.4], tier),
      crusherDownTime:      T([0, 1.8, 1.5, 1.2, 1.0], tier),
      turretSweepMult:      T([0, .7, 1.0, 1.4, 1.8], tier),
      activeRadiationZones: T([0,  2,  3,  5,  7], tier),
      floodTimerMs:         T([0, 120, 100, 85, 70], tier) * 1000,
      escapeTimerMs:        T([0, 60, 50, 40, 35], tier) * 1000,
      exitDoorWindowMs:     T([0,  8,  6,  5,  4], tier) * 1000,
      pendulumSawCount:     T([0,  1,  2,  3,  4], tier),
      turretCount:          T([0,  2,  3,  4,  5], tier),
      weightPlateBaseMass:  T([0, .5, 1.0, 1.5, 2.0], tier),
      extraCrushersInS6:    T([0,  0,  0,  1,  2], tier),
      s2WaterRiseRate:      T([0, 10/8, 10/6, 10/4, 10/3], tier),
      arrowTargetSpinMult:  T([0, .5, 1.0, 1.6, 2.2], tier),
      arrowTargetWindowMs:  T([0, 1200, 800, 500, 300], tier),
      orbitalRingCount:     T([0,  0,  1,  2,  3], tier),
      arrowReloadMs:        T([0, 8000, 8000, 9000, 10000], tier),
    };
  }
}
