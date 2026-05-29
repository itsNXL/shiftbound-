import type { LevelData } from './LevelLoader';

// ── THE REACTOR ──────────────────────────────────────────────────────────────
// World:  9000 × 1100
// Floor:  y = 1060  (top surface of ground platforms)
// DeathY: 1110
// Jump levels: 1060 → 965 → 875 → 785 → 695
// Win:    insert coreChargesNeeded charges, then reach exit zone
// ─────────────────────────────────────────────────────────────────────────────

export const LEVEL_2: LevelData = {
  name:  'THE REACTOR',
  width: 9000,
  height: 1100,
  deathY: 1110,
  coreChargesNeeded: 3,   // overridden by ScalingSystem in GameScene

  playerStarts: [
    { x:  80, y: 990 },
    { x: 135, y: 990 },
    { x: 190, y: 990 },
    { x: 245, y: 990 },
    { x: 300, y: 990 },
    { x: 355, y: 990 },
    { x: 410, y: 990 },
    { x: 465, y: 990 },
  ],

  platforms: [
    // ── Boundary walls / ceiling ──────────────────────────────────────────
    { x: 0,    y: 0, w: 20,   h: 1100, wall: true },
    { x: 8980, y: 0, w: 20,   h: 1100, wall: true },
    { x: 0,    y: 0, w: 9000, h: 20,   wall: true },

    // ── S1: Entry Corridor (x: 0–1400) ───────────────────────────────────
    // Start ledge + left floor section (radiation covers the floor here)
    { x:  20, y: 1010, w: 530, h: 20 },   // low start shelf (above radiation)
    { x:  20, y: 1060, w: 540, h: 40 },   // left floor (before radiation gap)
    { x: 680, y: 1060, w: 740, h: 40 },   // right floor of S1

    // Platform staircase bridging the radiation below
    { x: 120, y: 965, w: 160, h: 20 },
    { x: 360, y: 875, w: 160, h: 20 },
    { x: 580, y: 930, w: 160, h: 20 },    // arrow target platform (at1)
    { x: 760, y: 875, w: 160, h: 20 },
    { x: 960, y: 930, w: 180, h: 20 },
    { x:1180, y: 875, w: 200, h: 20 },    // core charge 1 sits here

    // ── S2: Turbine Hall (x: 1400–2800) ──────────────────────────────────
    { x: 1400, y: 1060, w: 1400, h: 40 },
    { x: 1500, y:  960, w: 160,  h: 20 },
    { x: 1720, y:  880, w: 180,  h: 20 },
    { x: 1960, y:  960, w: 160,  h: 20 },
    { x: 2200, y:  880, w: 180,  h: 20 },
    { x: 2440, y:  960, w: 160,  h: 20 },
    { x: 2640, y:  875, w: 180,  h: 20 },  // core charge 2 here

    // ── S3: Reactor Core (x: 2800–4200) ──────────────────────────────────
    { x: 2800, y: 1060, w: 1400, h: 40 },
    { x: 2900, y:  960, w: 160,  h: 20 },
    { x: 3100, y:  880, w: 180,  h: 20 },   // arrow target (at2) nearby
    { x: 3320, y:  800, w: 160,  h: 20, type: 'pedestal' },  // slot 1
    { x: 3540, y:  875, w: 180,  h: 20 },
    { x: 3760, y:  800, w: 160,  h: 20, type: 'pedestal' },  // slot 2 + arrow target (at3)
    { x: 3980, y:  875, w: 200,  h: 20 },
    { x: 4100, y:  960, w: 160,  h: 20 },

    // ── S4: Control Systems (x: 4200–5600) ───────────────────────────────
    { x: 4200, y: 1060, w: 1400, h: 40 },
    { x: 4310, y:  960, w: 160,  h: 20 },
    { x: 4530, y:  875, w: 180,  h: 20 },
    { x: 4770, y:  795, w: 200,  h: 20 },  // core charge 3 here
    { x: 5020, y:  875, w: 160,  h: 20 },
    { x: 5220, y:  960, w: 200,  h: 20 },  // slot 3
    { x: 5440, y:  875, w: 180,  h: 20 },

    // ── S5: Secondary Core (x: 5600–7000) ────────────────────────────────
    { x: 5600, y: 1060, w: 1400, h: 40 },
    { x: 5710, y:  960, w: 160,  h: 20 },
    { x: 5940, y:  880, w: 180,  h: 20 },
    { x: 6180, y:  800, w: 200,  h: 20 },  // core charge 4 + arrow target (at4)
    { x: 6440, y:  880, w: 160,  h: 20 },
    { x: 6660, y:  800, w: 180,  h: 20, type: 'pedestal' },  // slot 4
    { x: 6880, y:  880, w: 160,  h: 20 },

    // ── S6: Escape Tunnel (x: 7000–8200) ─────────────────────────────────
    { x: 7000, y: 1060, w: 1200, h: 40 },
    { x: 7110, y:  960, w: 160,  h: 20 },
    { x: 7350, y:  880, w: 180,  h: 20 },
    { x: 7590, y:  800, w: 180,  h: 20 },  // core charge 5 here
    { x: 7830, y:  880, w: 160,  h: 20 },
    { x: 8040, y:  960, w: 180,  h: 20 },
    { x: 8180, y:  800, w: 160,  h: 20, type: 'pedestal' },  // slot 5

    // ── S7: Exit Zone (x: 8200–9000) ─────────────────────────────────────
    { x: 8200, y: 1060, w: 780, h: 40 },
    { x: 8400, y:  900, w: 280, h: 20 },
    { x: 8700, y:  820, w: 260, h: 20, type: 'goal' },   // exit platform
  ],

  hazards: [
    // S2: Two crushers + sweep saw
    { type: 'crusher',     x: 1600, y: 880,  w: 80, h: 80, floorY: 1060, downT: 1.5, upT: 2.5, phase: 0.0 },
    { type: 'crusher',     x: 2140, y: 860,  w: 80, h: 80, floorY: 1060, downT: 1.2, upT: 2.2, phase: 0.5 },
    { type: 'saw_sweep',   x: 1850, y: 1040, radius: 18, sweepLeft: 1480, sweepRight: 2200, sweepSpeed: 70 },

    // S3: Pendulum saw
    { type: 'saw_pendulum', x: 3220, y: 760, radius: 18, pendulumAnchorY: 700, period: 2600 },

    // S4: Turrets + laser
    { type: 'turret', x: 4680, y: 1060, sweepZoneLeft: 4300, sweepZoneRight: 5050, beamW: 8 },
    { type: 'turret', x: 5380, y: 1060, sweepZoneLeft: 5100, sweepZoneRight: 5600, beamW: 8 },
    { type: 'laser',  x: 5000, y: 855,  w: 4, h: 205, onT: 1600, offT: 1400 },

    // S5: Sweep + pendulum
    { type: 'saw_sweep',    x: 6340, y: 1040, radius: 20, sweepLeft: 5900, sweepRight: 6680, sweepSpeed: 80 },
    { type: 'saw_pendulum', x: 6700, y: 760,  radius: 16, pendulumAnchorY: 700, period: 2200 },

    // S6: Laser + crusher + sweep
    { type: 'laser',   x: 7550, y: 780,  w: 4, h: 280, onT: 1400, offT: 1200 },
    { type: 'crusher', x: 7760, y: 860,  w: 80, h: 80,  floorY: 1060, downT: 1.0, upT: 1.8, phase: 0.3 },
    { type: 'saw_sweep', x: 7960, y: 1040, radius: 18, sweepLeft: 7780, sweepRight: 8140, sweepSpeed: 90 },
  ],

  radiationZones: [
    // S1: Floor radiation — forces platform traversal
    { id: 'rad1', x:  60, y: 1030, w: 1300, h: 30, drainRate: 25, sealable: true },
    // S3: Two radiation corridors on floor
    { id: 'rad2', x: 2860, y: 1030, w: 480,  h: 30, drainRate: 30, sealable: true },
    { id: 'rad3', x: 3580, y: 1030, w: 400,  h: 30, drainRate: 30, sealable: true },
    // S5: Secondary radiation
    { id: 'rad4', x: 5680, y: 1030, w: 700,  h: 30, drainRate: 28, sealable: true },
  ],

  arrowTargets: [
    // at1: rotating disc on S1 catwalk platform — seals rad1
    { id: 'at1', type: 'rotating_disc',
      x: 660, y: 905, radius: 22,
      effect: 'sealZone', effectTarget: 'rad1', effectDurationMs: 15000 },

    // at2: pendulum hanging in S3 — seals rad2
    { id: 'at2', type: 'pendulum',
      x: 2990, y: 840, pendulumLen: 55, pendulumPeriod: 2400,
      effect: 'sealZone', effectTarget: 'rad2', effectDurationMs: 12000 },

    // at3: sliding panel on S3 pedestal — seals rad3
    { id: 'at3', type: 'sliding_panel',
      x: 3840, y: 775, panelW: 54, panelH: 18, panelAmp: 55, panelPeriod: 3000,
      effect: 'sealZone', effectTarget: 'rad3', effectDurationMs: 12000 },

    // at4: orbital ring on S5 high platform — seals rad4
    { id: 'at4', type: 'orbital_ring',
      x: 6280, y: 775, orbitalRadius: 26, orbitalCount: 3,
      effect: 'sealZone', effectTarget: 'rad4', effectDurationMs: 12000 },
  ],

  coreCharges: [
    { id: 'cc1', x: 1260, y: 855 },  // S1 high platform
    { id: 'cc2', x: 2720, y: 855 },  // S2
    { id: 'cc3', x: 4850, y: 775 },  // S4
    { id: 'cc4', x: 6260, y: 780 },  // S5
    { id: 'cc5', x: 7670, y: 780 },  // S6
  ],

  // Slots: placed so center.y ≈ platform.y - 20, within INSERT_RANGE=55 of player
  insertionSlots: [
    { id: 'slot1', x: 3340, y: 760, w: 60, h: 60 },  // S3 left pedestal
    { id: 'slot2', x: 3780, y: 760, w: 60, h: 60 },  // S3 right pedestal
    { id: 'slot3', x: 5240, y: 920, w: 60, h: 60 },  // S4 platform
    { id: 'slot4', x: 6680, y: 760, w: 60, h: 60 },  // S5 pedestal
    { id: 'slot5', x: 8200, y: 760, w: 60, h: 60 },  // S6/S7 pedestal
  ],

  // Escape timer starts when any player passes x > 7000
  escapeTimerDuration: 60000,

  exitZone: { x: 8680, y: 640, w: 280, h: 200 },

  // ── DYNAMIC SCALING GROUPS ──────────────────────────────────────────────────
  // More players = more radiation to seal, more junction gates, more hazards.
  // Every player always has a job; nobody rides for free.
  scalingGroups: [

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 2 — 3 players: "Turbine Hall goes hot"
    //
    // S2 floor now radiates — nobody can sprint across on the floor anymore.
    // A rotating-disc target on the S2 high catwalk seals it; one player breaks
    // off from the main group to shoot the target while the other two cross.
    // Extra hazards tighten the S2 and S3 corridors.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 3,
      radiationZones: [
        // S2 full floor — forces platform route
        { id: 'rad5', x: 1420, y: 1030, w: 1350, h: 30, drainRate: 28, sealable: true },
      ],
      arrowTargets: [
        // Rotating disc on S2 high platform — one player shoots to seal rad5
        { id: 'at5', type: 'rotating_disc',
          x: 1810, y: 855, radius: 22,
          effect: 'sealZone', effectTarget: 'rad5', effectDurationMs: 12000 },
      ],
      hazards: [
        // Extra crusher in the S2 turbine corridor — no clear safe gap
        { type: 'crusher', x: 2500, y: 940, w: 80, h: 80,
          floorY: 1060, downT: 1.4, upT: 2.0, phase: 0.3 },
        // Sweep saw across S3 pedestal approach — timing required
        { type: 'saw_sweep', x: 3700, y: 1040, radius: 18,
          sweepLeft: 3500, sweepRight: 3950, sweepSpeed: 75 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 3 — 5 players: "Control zone lockdown"
    //
    // S4 floor radiates — the slot-3 insertion platform is now approached
    // from above only. A pendulum arrow target hangs in S4; one player must
    // time the shot while others collect and insert.
    //
    // NEW MECHANIC — S3/S4 JUNCTION GATE:
    //   One player stands on the hold plate (S3 side) to open the gate for
    //   7 s. All five must dash through; the holder sprints last.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 5,
      radiationZones: [
        // S4 control floor — insertion via platform route only
        { id: 'rad6', x: 4250, y: 1030, w: 1300, h: 30, drainRate: 30, sealable: true },
      ],
      arrowTargets: [
        // Pendulum hanging in S4 — seals rad6 when hit
        { id: 'at6', type: 'pendulum',
          x: 4660, y: 830, pendulumLen: 60, pendulumPeriod: 2800,
          effect: 'sealZone', effectTarget: 'rad6', effectDurationMs: 12000 },
      ],
      weightPlates: [
        // S3/S4 junction hold plate — 1 player steps here; gate opens for 7 s
        { id: 's34Hold', x: 4100, y: 1040, w: 100, h: 20, requiredMass: 1 },
      ],
      doors: [
        // Junction gate — 7 s sprint window
        { id: 's34Gate', x: 4195, y: 700, w: 20, h: 360,
          trigger: 's34Hold', openWindow: 7000 },
      ],
      hazards: [
        // Turret patrolling the S3 pedestal zone — can't linger near slots
        { type: 'turret', x: 3600, y: 1060,
          sweepZoneLeft: 3200, sweepZoneRight: 4100, beamW: 8 },
        // Extra pendulum in S5 entry — five players crowding the catwalk is risky
        { type: 'saw_pendulum', x: 5900, y: 840, radius: 16,
          pendulumAnchorY: 760, period: 2000 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 4 — 7 players: "Full reactor crisis — total coordination"
    //
    // S7 exit corridor irradiates — the escape dash becomes lethal without a
    // live seal. A sliding panel in S7 seals rad7; one player must shoot while
    // the rest sprint to the exit.
    //
    // NEW MECHANIC — S6/S7 EXIT GATE:
    //   Two players hold the exit plate (S6 side) to open the gate for 8 s.
    //   All seven must reach the exit zone before it slams shut and the
    //   unsealable radiation closes in. Holder pair goes last.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 7,
      radiationZones: [
        // S7 exit corridor — you cannot stroll out, you must run sealed
        { id: 'rad7', x: 8220, y: 1030, w: 750, h: 30, drainRate: 32, sealable: true },
      ],
      arrowTargets: [
        // Sliding panel in S7 — seals rad7 when hit
        { id: 'at7', type: 'sliding_panel',
          x: 8500, y: 875, panelW: 60, panelH: 18, panelAmp: 65, panelPeriod: 2600,
          effect: 'sealZone', effectTarget: 'rad7', effectDurationMs: 14000 },
      ],
      weightPlates: [
        // S6/S7 exit hold plate — 2 players hold while the group dashes through
        { id: 's67Hold', x: 8100, y: 1040, w: 120, h: 20, requiredMass: 2 },
      ],
      doors: [
        // Exit sprint gate — 8 s window; the escape timer is also ticking
        { id: 's67Gate', x: 8195, y: 700, w: 20, h: 360,
          trigger: 's67Hold', openWindow: 8000 },
      ],
      hazards: [
        // Extra crusher in the S6 escape tunnel — 7 people can't all wait
        { type: 'crusher', x: 7400, y: 860, w: 80, h: 80,
          floorY: 1060, downT: 0.9, upT: 1.6, phase: 0.4 },
        // Turret covering the S7 exit platform — last sprint is not safe
        { type: 'turret', x: 8600, y: 1060,
          sweepZoneLeft: 8300, sweepZoneRight: 8950, beamW: 8 },
      ],
    },
  ],
};
