import type { LevelData } from './LevelLoader';

// ── THE FACILITY ─────────────────────────────────────────────────────────────
// 8200 x 900 world. Floor at y=860.
// S1 Grinder → S2 Pressure Crossing → S3 Vault Floor → KEY
// → S4 The Shaft → S5 Carrier Gauntlet → S6 Escape Run → EXIT

export const LEVEL_1: LevelData = {
  name: 'The Facility',
  width:  8200,
  height:  900,

  playerStarts: [
    { x: 100, y: 800 },
    { x: 160, y: 800 },
    { x: 220, y: 800 },
    { x: 280, y: 800 },
    { x: 340, y: 800 },
    { x: 400, y: 800 },
    { x: 460, y: 800 },
    { x: 520, y: 800 },
  ],

  respawnTokens: 1,

  // ── PLATFORMS ──────────────────────────────────────────────────────────────
  platforms: [
    // ── World boundaries ───────────────────────────────────────────────
    { x: 0,    y: 0,   w: 20,   h: 900,  wall: true },  // left wall
    { x: 8180, y: 0,   w: 20,   h: 900,  wall: true },  // right wall
    { x: 0,    y: 0,   w: 8200, h: 20,   wall: true },  // ceiling

    // ── S1: THE GRINDER (x=0–1640) ────────────────────────────────────
    // Floor split around saw-pit (x=580–1060)
    { x: 0,    y: 860, w: 580,  h: 40 },
    { x: 1060, y: 860, w: 600,  h: 40 },
    // Catwalk sections — solid A, two collapse pockets, solid B
    { x: 100,  y: 660, w: 580,  h: 18, type: 'catwalk' },
    { x: 680,  y: 660, w: 120,  h: 18, type: 'collapse', id: 'catA' },
    { x: 800,  y: 660, w: 80,   h: 18, type: 'catwalk'  },
    { x: 880,  y: 660, w: 120,  h: 18, type: 'collapse', id: 'catB' },
    { x: 1000, y: 660, w: 60,   h: 18, type: 'catwalk'  },

    // ── S2: PRESSURE CROSSING (x=1640–3220) ───────────────────────────
    // Entry steps up to top path (y=678)
    { x: 1604, y: 800, w: 60,   h: 15 },
    { x: 1622, y: 740, w: 70,   h: 15 },
    // Top path floor + ceiling
    { x: 1640, y: 678, w: 1460, h: 18, type: 'catwalk' },
    { x: 1620, y: 540, w: 1600, h: 20, wall: true },
    // Bottom path (collapse gap at x=2200–2500)
    { x: 1640, y: 860, w: 560,  h: 40 },
    { x: 2200, y: 860, w: 300,  h: 40, type: 'collapse', id: 's2Floor' },
    { x: 2500, y: 860, w: 720,  h: 40 },
    // Merge platform (all-player weight plate sits here visually)
    { x: 3100, y: 820, w: 140,  h: 20 },
    // Transition bridge to S3
    { x: 3220, y: 860, w: 80,   h: 40 },

    // ── S3: THE VAULT FLOOR (x=3200–5000) ─────────────────────────────
    // Floor sections (pits at x=3700–3900 and x=4300–4500)
    { x: 3200, y: 860, w: 500,  h: 40 },
    { x: 3900, y: 860, w: 400,  h: 40 },
    { x: 4500, y: 860, w: 480,  h: 40 },
    // Step-ups to weight plate level (y=740)
    { x: 3510, y: 810, w: 80,   h: 15 },
    { x: 3540, y: 768, w: 80,   h: 15 },
    { x: 3840, y: 810, w: 80,   h: 15 },
    { x: 3870, y: 768, w: 80,   h: 15 },
    { x: 4200, y: 810, w: 80,   h: 15 },
    { x: 4230, y: 768, w: 80,   h: 15 },
    // Vault outer area
    { x: 4980, y: 860, w: 100,  h: 40 },
    // Vault chamber walls / ceiling (entrance gap 80px at x=5000–5080)
    { x: 4980, y: 660, w: 20,   h: 200, wall: true },
    { x: 5080, y: 660, w: 220,  h: 200, wall: true },
    { x: 4980, y: 660, w: 320,  h: 20,  wall: true },
    { x: 4980, y: 860, w: 320,  h: 40  },
    // Key pedestal
    { x: 5070, y: 800, w: 130,  h: 20,  type: 'pedestal' },

    // ── S4: THE SHAFT (x=5300–5660) ───────────────────────────────────
    { x: 5300, y: 860, w: 360,  h: 40  },              // shaft floor
    { x: 5300, y: 140, w: 20,   h: 720, wall: true },  // shaft left wall
    { x: 5640, y: 140, w: 20,   h: 720, wall: true },  // shaft right wall
    // Level A (y=760)
    { x: 5320, y: 760, w: 100,  h: 15  },
    { x: 5540, y: 760, w: 100,  h: 15  },
    // Level B safety ledge
    { x: 5320, y: 640, w: 60,   h: 15  },
    // Level C (y=480)
    { x: 5320, y: 480, w: 100,  h: 15  },
    { x: 5520, y: 480, w: 100,  h: 15  },
    // Level D — crumbling (alternating sides, handled by collapse hazard)
    { x: 5320, y: 340, w: 80,   h: 15, type: 'collapse', id: 'shaftD1' },
    { x: 5560, y: 280, w: 80,   h: 15, type: 'collapse', id: 'shaftD2' },
    // Level E — exit platform
    { x: 5320, y: 160, w: 340,  h: 15  },

    // ── Post-shaft descent (x=5660–5820) ──────────────────────────────
    { x: 5660, y: 380, w: 100,  h: 15  },
    { x: 5700, y: 620, w: 100,  h: 15  },

    // ── S5: CARRIER GAUNTLET (x=5800–7100) ────────────────────────────
    { x: 5800, y: 860, w: 400,  h: 40  },              // x=5800–6200
    { x: 6200, y: 860, w: 300,  h: 40,  type: 'collapse', id: 's5Bridge' },
    { x: 6500, y: 860, w: 600,  h: 40  },              // x=6500–7100

    // ── S6: ESCAPE RUN (x=7100–8200) ──────────────────────────────────
    { x: 7100, y: 860, w: 700,  h: 40  },              // x=7100–7800
    { x: 7800, y: 860, w: 200,  h: 40,  type: 'collapse', id: 's6Pit' },
    { x: 8000, y: 860, w: 180,  h: 40  },              // exit approach
    { x: 8000, y: 820, w: 180,  h: 20,  goal: true },  // exit goal platform
  ],

  // ── HAZARDS ────────────────────────────────────────────────────────────────
  hazards: [
    // ── S1: THE GRINDER ────────────────────────────────────────────────
    // 3 crushers — faster timing, staggered so there's never a safe pause
    { type: 'crusher',        x: 360,  y: 0, w: 140, h: 60, downT: 0.7, upT: 1.0, phase: 0,    floorY: 842 },
    { type: 'crusher',        x: 760,  y: 0, w: 140, h: 60, downT: 0.5, upT: 0.9, phase: 0.9,  floorY: 642 },
    { type: 'crusher',        x: 1160, y: 0, w: 140, h: 60, downT: 0.7, upT: 1.0, phase: 0.45, floorY: 842 },
    // Saw pit
    { type: 'saw_pit',        x: 594,  y: 724, w: 452, h: 130 },
    // Pendulum swinging across the pit — crossing now requires timing, not just jumping
    { type: 'saw_pendulum',   x: 820,  y: 860, radius: 36, pendulumAnchorY: 660, period: 1.8, phase: 0.3 },
    // Floor sweep saw — faster
    { type: 'saw_sweep',      x: 1280, y: 840, radius: 18, sweepLeft: 1075, sweepRight: 1490, sweepSpeed: 145 },
    // Laser at catwalk height — players must watch the crusher AND the laser simultaneously
    { type: 'laser',          x: 100,  y: 644, w: 960,  h: 4, onT: 1.0, offT: 0.7, phase: 0.3 },
    // Catwalk collapse — 0.2 s: barely any reaction time
    { type: 'collapse_floor', x: 680,  y: 660, w: 120,  h: 18, triggerDelay: 0.2, id: 'catA' },
    { type: 'collapse_floor', x: 880,  y: 660, w: 120,  h: 18, triggerDelay: 0.2, id: 'catB' },

    // ── S2: PRESSURE CROSSING ───────────────────────────────────────────
    // Brutal downward wind — jumping is laborious, gravity flip is fighting it
    { type: 'wind',           x: 1620, y: 0,   w: 1600, h: 900, forceY: 200 },
    // 5 staggered lasers, evenly phased — one is always on, no safe instant
    { type: 'laser',          x: 1740, y: 616, w: 1320, h: 4, onT: 1.5, offT: 1.5, phase: 0.0 },
    { type: 'laser',          x: 1740, y: 596, w: 1320, h: 4, onT: 1.5, offT: 1.5, phase: 0.5 },
    { type: 'laser',          x: 1740, y: 576, w: 1320, h: 4, onT: 1.5, offT: 1.5, phase: 1.0 },
    { type: 'laser',          x: 1740, y: 556, w: 1320, h: 4, onT: 1.5, offT: 1.5, phase: 1.5 },
    { type: 'laser',          x: 1740, y: 536, w: 1320, h: 4, onT: 1.5, offT: 1.5, phase: 2.0 },
    // 3 pendulums — desynced periods: rhythm is never learnable
    { type: 'saw_pendulum',   x: 2060, y: 860, radius: 42, pendulumAnchorY: 680, period: 2.0, phase: 0.0 },
    { type: 'saw_pendulum',   x: 2720, y: 860, radius: 42, pendulumAnchorY: 680, period: 3.7, phase: 1.5 },
    { type: 'saw_pendulum',   x: 2920, y: 860, radius: 36, pendulumAnchorY: 680, period: 1.6, phase: 0.8 },
    // Sweep saw — faster, collapse trigger tighter
    { type: 'saw_sweep',      x: 2350, y: 840, radius: 24, sweepLeft: 2190, sweepRight: 2510, sweepSpeed: 165 },
    { type: 'collapse_floor', x: 2200, y: 860, w: 300,  h: 40, triggerDelay: 0.3, id: 's2Floor' },
    // Ceiling-mounted saws at the S2 low ceiling (y=540): kills gravity-flip walkers
    // that float up — the S2 ceiling is only 22 px above where a flipped player rests
    { type: 'saw_pit',        x: 1640, y: 540, w: 1600, h: 32 },

    // ── S3: THE VAULT FLOOR ─────────────────────────────────────────────
    // 5 turrets with overlapping sweep zones — no column is unguarded
    { type: 'turret', x: 3450, y: 30, sweepZoneLeft: 3200, sweepZoneRight: 3600, beamW: 28 },
    { type: 'turret', x: 3700, y: 30, sweepZoneLeft: 3550, sweepZoneRight: 3850, beamW: 28 },
    { type: 'turret', x: 4000, y: 30, sweepZoneLeft: 3800, sweepZoneRight: 4200, beamW: 28 },
    { type: 'turret', x: 4250, y: 30, sweepZoneLeft: 4100, sweepZoneRight: 4450, beamW: 28 },
    { type: 'turret', x: 4500, y: 30, sweepZoneLeft: 4300, sweepZoneRight: 4700, beamW: 28 },
    // Pendulums inside the floor pits — can't just jump across, must time the swing
    { type: 'saw_pendulum',   x: 3800, y: 860, radius: 36, pendulumAnchorY: 680, period: 2.0, phase: 0.0 },
    { type: 'saw_pendulum',   x: 4400, y: 860, radius: 36, pendulumAnchorY: 680, period: 2.4, phase: 0.5 },
    // Sweep saw — faster
    { type: 'saw_sweep', x: 4750, y: 840, radius: 22, sweepLeft: 4560, sweepRight: 4960, sweepSpeed: 175 },
    // Vault crusher — blink-and-die timing
    { type: 'crusher', x: 5000, y: 660, w: 160, h: 50, downT: 0.4, upT: 0.35, phase: 0, floorY: 782, id: 'vaultCrusher' },

    // ── S4: THE SHAFT ────────────────────────────────────────────────────
    // Very strong wind — gravity form can barely float upward
    { type: 'wind',           x: 5300, y: 0,   w: 360,  h: 900, forceY: 175 },
    // Floor sweep saw
    { type: 'saw_sweep',      x: 5470, y: 840, radius: 16, sweepLeft: 5340, sweepRight: 5600, sweepSpeed: 130 },
    // Spinning saws at Level A gap
    { type: 'saw_pit',        x: 5434, y: 715, w: 92,   h: 50 },
    // Crushers at Level C — faster
    { type: 'crusher',        x: 5350, y: 0,   w: 80,   h: 40, downT: 0.6, upT: 1.0, phase: 0,   floorY: 462 },
    { type: 'crusher',        x: 5490, y: 0,   w: 80,   h: 40, downT: 0.6, upT: 1.0, phase: 0.5, floorY: 462 },
    // Lasers at Level B and Level A — every jump between levels requires timing a laser
    { type: 'laser',          x: 5322, y: 621, w: 316,  h: 4, onT: 0.8, offT: 0.6, phase: 0.0 },
    { type: 'laser',          x: 5322, y: 741, w: 316,  h: 4, onT: 0.7, offT: 0.5, phase: 0.5 },
    // Pendulum near the top — denies camping on upper ledges
    { type: 'saw_pendulum',   x: 5480, y: 340, radius: 28, pendulumAnchorY: 180, period: 1.4, phase: 0 },
    // Level D collapse — tight
    { type: 'collapse_floor', x: 5320, y: 340, w: 80,   h: 15, triggerDelay: 0.8, id: 'shaftD1' },
    { type: 'collapse_floor', x: 5560, y: 280, w: 80,   h: 15, triggerDelay: 0.8, id: 'shaftD2' },

    // ── S5: CARRIER GAUNTLET ─────────────────────────────────────────────
    // 4 crushers — continuous threat, safe windows are tiny and desync over time
    { type: 'crusher',        x: 5900, y: 0,   w: 140, h: 60, downT: 1.0, upT: 1.5, phase: 0,   floorY: 842 },
    { type: 'crusher',        x: 6300, y: 0,   w: 140, h: 60, downT: 0.8, upT: 1.0, phase: 0.3, floorY: 842 },
    { type: 'crusher',        x: 6640, y: 0,   w: 140, h: 60, downT: 0.9, upT: 1.2, phase: 0.4, floorY: 842 },
    { type: 'crusher',        x: 7000, y: 0,   w: 100, h: 60, downT: 0.8, upT: 0.9, phase: 0.7, floorY: 842 },
    // Collapsing bridge + dual lasers: both paths dangerous simultaneously
    { type: 'collapse_floor', x: 6200, y: 860, w: 300,  h: 40, triggerDelay: 0.5, id: 's5Bridge' },
    { type: 'laser',          x: 5820, y: 828, w: 330,  h: 4, onT: 1.5, offT: 1.2, phase: 0.8 },
    { type: 'laser',          x: 6150, y: 828, w: 350,  h: 4, onT: 1.8, offT: 1.6, phase: 0.0 },
    // 2 turrets covering the whole gauntlet — sweep beams catch anyone standing still
    { type: 'turret',         x: 6000, y: 30,  sweepZoneLeft: 5800, sweepZoneRight: 6200, beamW: 24 },
    { type: 'turret',         x: 6900, y: 30,  sweepZoneLeft: 6700, sweepZoneRight: 7100, beamW: 24 },
    // Stronger leftward wind — key carrier is shoved back constantly
    { type: 'wind',           x: 6520, y: 0,   w: 500,  h: 900, forceX: -220 },
    // Very fast sweep saw
    { type: 'saw_sweep',      x: 6910, y: 840, radius: 30, sweepLeft: 6820, sweepRight: 7060, sweepSpeed: 265 },

    // ── S6: ESCAPE RUN ───────────────────────────────────────────────────
    // 3 staggered crushers — each with a different phase so they never all retract together
    { type: 'crusher',        x: 7160, y: 0,   w: 140, h: 60, downT: 0.9, upT: 1.4, phase: 0,   floorY: 842 },
    { type: 'crusher',        x: 7380, y: 0,   w: 140, h: 60, downT: 0.9, upT: 1.4, phase: 0.8, floorY: 842 },
    { type: 'crusher',        x: 7580, y: 0,   w: 80,  h: 60, downT: 0.7, upT: 0.8, phase: 0.4, floorY: 842 },
    // Turret covering mid-S6 floor — no standing still
    { type: 'turret',         x: 7250, y: 30,  sweepZoneLeft: 7100, sweepZoneRight: 7450, beamW: 24 },
    // Very fast sweep saw
    { type: 'saw_sweep',      x: 7610, y: 838, radius: 35, sweepLeft: 7530, sweepRight: 7790, sweepSpeed: 290 },
    // Laser almost always ON — the off-window is the sprint window
    { type: 'laser',          x: 7500, y: 820, w: 380,  h: 4, onT: 3.0, offT: 0.5, phase: 0 },
    // Collapse pit (zip-line or carry needed)
    { type: 'collapse_floor', x: 7800, y: 860, w: 200,  h: 40, triggerDelay: 0.4, id: 's6Pit' },
    // Rightward wind — helps, but also pushes players into traps
    { type: 'wind',           x: 7100, y: 0,   w: 900,  h: 900, forceX: 140 },

    // ── CEILING SAW ZONES (kills gravity-flip ceiling walking) ──────────
    // S1: fills every crusher gap — no safe ceiling corridor
    { type: 'saw_pit', x: 505,  y: 0, w: 250, h: 52 },
    { type: 'saw_pit', x: 905,  y: 0, w: 250, h: 52 },
    { type: 'saw_pit', x: 1305, y: 0, w: 330, h: 52 },
    // S3: two wide ceiling zones — turret beams barely clip ceiling level, saws seal it
    { type: 'saw_pit', x: 3220, y: 0, w: 880, h: 52 },
    { type: 'saw_pit', x: 4100, y: 0, w: 880, h: 52 },
    // S4: critical — blocks floating completely above the shaft
    { type: 'saw_pit', x: 5300, y: 0, w: 360, h: 55 },
    // S5: fills the four crusher gaps
    { type: 'saw_pit', x: 6040, y: 0, w: 260, h: 52 },
    { type: 'saw_pit', x: 6440, y: 0, w: 200, h: 52 },
    { type: 'saw_pit', x: 6780, y: 0, w: 220, h: 52 },
    { type: 'saw_pit', x: 7100, y: 0, w: 60,  h: 52 },
    // S6: ceiling between and after crushers
    { type: 'saw_pit', x: 7300, y: 0, w: 80,  h: 52 },
    { type: 'saw_pit', x: 7520, y: 0, w: 60,  h: 52 },
    { type: 'saw_pit', x: 7660, y: 0, w: 340, h: 52 },

    // Flood (activated when key is grabbed, handled by HazardSystem/GameScene)
  ],

  // ── DOORS ──────────────────────────────────────────────────────────────────
  doors: [
    // S1 blast door — 2 players on pressure plate keep it open
    { x: 1638, y: 778, w: 22, h: 82, id: 'blastDoor', trigger: 'ppS1',    closeOnRelease: true  },
    // S2 merge door — all players on merge platform, 3 s window
    { x: 3218, y: 778, w: 22, h: 82, id: 'mergeDoor', trigger: 'merge',   openWindow: 600       },
    // S3 vault door — both weight plates active simultaneously
    { x: 5000, y: 720, w: 22, h: 140, id: 'vaultDoor', trigger: 'allPlates', closeOnRelease: true },
  ],

  // ── WEIGHT PLATES ──────────────────────────────────────────────────────────
  weightPlates: [
    // S1 pressure plate (2 players hold blast door open)
    { x: 1460, y: 840, w: 120, h: 20, id: 'ppS1',  requiredMass: 2 },
    // S2 merge plate (all players must gather)
    { x: 3100, y: 820, w: 140, h: 20, id: 'merge', requiredMass: 2 },
    // S3 vault plates — all must be active at once
    { x: 3650, y: 740, w: 200, h: 20, id: 'plateA', requiredMass: 1 },
    { x: 4050, y: 740, w: 150, h: 20, id: 'plateB', requiredMass: 1 },
    // plateC requires BOTH players — the co-op challenge of S3
    { x: 4350, y: 740, w: 300, h: 20, id: 'plateC', requiredMass: 2 },
  ],

  // ── CHECKPOINTS ────────────────────────────────────────────────────────────
  checkpoints: [
    {
      id: 'cp1',
      x: 3200, y: 810, w: 280, h: 50,
      spawnX: 3320, spawnY: 800,
    },
    {
      id: 'cp2',
      x: 5660, y: 120, w: 280, h: 42,
      spawnX: 5730, spawnY: 120,
    },
  ],

  // ── KEY ────────────────────────────────────────────────────────────────────
  // Sits on the pedestal inside the vault chamber
  key: { x: 5130, y: 775 },

  // ── EXIT ZONE ──────────────────────────────────────────────────────────────
  exitZone: { x: 8000, y: 760, w: 180, h: 100 },

  // ── TIMERS ─────────────────────────────────────────────────────────────────
  floodDuration:        40_000,  // 40 s after key grab → flood starts
  escapeTimerDuration:  16_000,  // 16 s after S6 entry → death

  // ── DYNAMIC SCALING GROUPS ──────────────────────────────────────────────────
  // Each group activates only when numPlayers >= minPlayers.
  // More players = more simultaneous tasks, higher plate requirements, more hazards.
  // The goal: every player always has a responsibility, never a spectator.
  scalingGroups: [

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 2 — 3 players: "The team starts to matter"
    // All three must gather at the merge plate (tight 600 ms window).
    // Blast door now needs three players holding — one must sprint ahead first.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 3,
      plateMassOverrides: [
        { id: 'ppS1',  requiredMass: 3 },   // all 3 on blast-door plate
        { id: 'merge', requiredMass: 3 },   // all 3 must gather before merge door opens
      ],
      hazards: [
        // Extra sweep saw in S2 bottom path — bottom route is now contested
        { type: 'saw_sweep', x: 1800, y: 840, radius: 20,
          sweepLeft: 1640, sweepRight: 2000, sweepSpeed: 155 },
        // Tight laser just outside vault entrance — must time carefully
        { type: 'laser', x: 4980, y: 730, w: 160, h: 4,
          onT: 0.9, offT: 0.6, phase: 0.4 },
        // Third crusher in S6 (was two)
        { type: 'crusher', x: 7680, y: 0, w: 100, h: 60,
          downT: 0.8, upT: 1.0, phase: 0.5, floorY: 842 },
        // Ceiling gap coverage for extra S6 crusher
        { type: 'saw_pit', x: 7660, y: 0, w: 20, h: 52 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 3 — 4 players: "Splitting up required"
    //
    // NEW mechanic — S5 SPRINT GATE:
    //   Two players must hold the s5Hold plate (x≈5970) to open a gate
    //   at the entrance to the S5 collapse bridge. The gate opens for 6 s —
    //   all four players must sprint through against the leftward wind before
    //   it slams shut. Key carrier is slowest: the team must coordinate who
    //   holds, who carries, who clears the path.
    //
    // Vault plates A and B now each require 2 players — six players total
    // needed across the three vault plates. With only four players that means
    // A(2) + B(2) = 4 on plates, leaving nobody to guard plateC... so the
    // remaining two must also reach plateC. All four are on vault plates
    // simultaneously, nobody watching for turrets. Brutal.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 4,
      plateMassOverrides: [
        { id: 'merge',  requiredMass: 4 },   // ALL four at merge — no stragglers
        { id: 'plateA', requiredMass: 2 },   // 2 players on vault plate A
        { id: 'plateB', requiredMass: 2 },   // 2 players on vault plate B
        // plateC stays at 2: 2+2+2=6 needed, all 4 players max → tight
      ],
      weightPlates: [
        // S5 hold plate — 2 players must stand here to open the sprint gate
        { id: 's5Hold', x: 5970, y: 840, w: 120, h: 20, requiredMass: 2 },
      ],
      doors: [
        // S5 sprint gate — 6 s window, everyone must dash through against the wind
        { id: 's5Gate', x: 6098, y: 778, w: 22, h: 82,
          trigger: 's5Hold', openWindow: 6000 },
      ],
      hazards: [
        // Extra turret covering S5 entry — you can't just stand at the hold plate
        { type: 'turret', x: 5860, y: 30,
          sweepZoneLeft: 5800, sweepZoneRight: 6100, beamW: 24 },
        // Mid-shaft laser between Level B and Level C — timing every vertical jump
        { type: 'laser', x: 5322, y: 521, w: 316, h: 4,
          onT: 0.7, offT: 0.5, phase: 0.2 },
        // Extra pendulum in S2 — four people need to cross; collisions are deadly
        { type: 'saw_pendulum', x: 1900, y: 860, radius: 32,
          pendulumAnchorY: 680, period: 1.4, phase: 0.6 },
        // Extra S3 ceiling gap coverage (turrets now overlap near vault)
        { type: 'saw_pit', x: 4980, y: 0, w: 320, h: 52 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 4 — 6 players: "Full coordination or total failure"
    //
    // NEW mechanic — SHAFT TOP SPRINT GATE:
    //   One player reaches Level E (shaft top) first and steps on shaftHold
    //   plate. The gate at the shaft exit opens for 6 s. All remaining players
    //   must scramble out against the brutal downward wind in that window.
    //   The holder goes last — they must release the plate and sprint through
    //   before the gate slams shut. Whoever holds is committing to being last
    //   out: calls for a rescue plan.
    //
    // Vault plates now require 2+2+2=6 players total — ALL six must stand on
    // vault plates at once. Zero cover from turrets. Everyone is exposed.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 6,
      plateMassOverrides: [
        { id: 'ppS1',  requiredMass: 4 },   // 4 on blast-door plate, 2 sprint ahead
        { id: 'merge', requiredMass: 5 },   // 5 must gather; only 1 can be advance scout
        { id: 'plateA', requiredMass: 2 },
        { id: 'plateB', requiredMass: 2 },
        { id: 'plateC', requiredMass: 2 },  // 2+2+2 = 6 total on vault floor simultaneously
      ],
      weightPlates: [
        // Shaft top hold plate — stand here to keep the exit gate open
        { id: 'shaftHold', x: 5340, y: 145, w: 120, h: 15, requiredMass: 1 },
      ],
      doors: [
        // Shaft exit sprint gate — 6 s window, holder goes last
        { id: 'shaftExitGate', x: 5662, y: 135, w: 22, h: 55,
          trigger: 'shaftHold', openWindow: 6000 },
      ],
      hazards: [
        // Turret at S2 entry — 6 people can't all run at once without getting hit
        { type: 'turret', x: 1800, y: 30,
          sweepZoneLeft: 1640, sweepZoneRight: 2100, beamW: 24 },
        // Extra crusher deep in S5 — four crushers was for 4-player; now five
        { type: 'crusher', x: 5810, y: 0, w: 100, h: 60,
          downT: 0.7, upT: 0.8, phase: 0.6, floorY: 842 },
        // Full-width laser across S6 floor — only a 0.7 s gap
        { type: 'laser', x: 7100, y: 820, w: 900, h: 4,
          onT: 2.5, offT: 0.7, phase: 0.3 },
        // Ceiling coverage for new S5 crusher
        { type: 'saw_pit', x: 5710, y: 0, w: 100, h: 52 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 5 — 8 players: "Total chaos — perfect coordination or death"
    //
    // NEW mechanic — EXIT SPRINT GATE:
    //   Three players must hold the exitHold plate (x≈7450, on the S6 floor)
    //   to open the final gate just before the exit zone. Gate is open for 8 s.
    //   All eight must get through before it closes. Key carrier is last — the
    //   three holders sprint to catch up after releasing. The flood is rising.
    //
    // Merge plate requires 7 — essentially everyone must stand there together
    // while ONE advance scout holds position ahead.
    // Vault requires 2+3+3 = 8 total across A/B/C.
    // ══════════════════════════════════════════════════════════════════════════
    {
      minPlayers: 8,
      plateMassOverrides: [
        { id: 'ppS1',  requiredMass: 5 },   // 5 holding blast door
        { id: 'merge', requiredMass: 7 },   // 7 at merge — everyone but the key scout
        { id: 'plateA', requiredMass: 2 },
        { id: 'plateB', requiredMass: 3 },  // 2+3+3 = 8 total on vault floor
        { id: 'plateC', requiredMass: 3 },
      ],
      weightPlates: [
        // Exit hold plate — 3 players hold while rest dash to exit
        { id: 'exitHold', x: 7450, y: 840, w: 160, h: 20, requiredMass: 3 },
      ],
      doors: [
        // Final sprint gate — 8 s window, flood is probably lapping at their heels
        { id: 'exitGate', x: 7625, y: 778, w: 22, h: 82,
          trigger: 'exitHold', openWindow: 8000 },
      ],
      hazards: [
        // S1 early crusher — hits players immediately after spawn zone
        { type: 'crusher', x: 220, y: 0, w: 100, h: 60,
          downT: 0.8, upT: 1.1, phase: 0.7, floorY: 842 },
        // S1 floor sweep on LEFT section — nowhere is safe from the start
        { type: 'saw_sweep', x: 300, y: 840, radius: 24,
          sweepLeft: 100, sweepRight: 560, sweepSpeed: 180 },
        // S3 extra laser — crossing vault approach requires precise timing
        { type: 'laser', x: 3220, y: 820, w: 1780, h: 4,
          onT: 2.0, offT: 0.8, phase: 0.6 },
        // S3 vault approach turret
        { type: 'turret', x: 4800, y: 30,
          sweepZoneLeft: 4700, sweepZoneRight: 5000, beamW: 24 },
        // Ceiling gap for new S1 crusher
        { type: 'saw_pit', x: 100, y: 0, w: 120, h: 52 },
        // Ceiling gap between spawn and crusher at x=220
        { type: 'saw_pit', x: 320, y: 0, w: 40, h: 52 },
      ],
    },
  ],
};
