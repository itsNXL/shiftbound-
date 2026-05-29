// SoundSystem — all sounds synthesized via the W3C Web Audio API.
// No audio files required; every effect is generated from oscillators and noise.

export class SoundSystem {
  private ctx:    AudioContext;
  private master: GainNode;
  private alarmHandle: ReturnType<typeof setInterval> | null = null;

  // SFX volume cycling: loud → quiet → mute → loud
  private sfxIdx = 0;
  private readonly SFX_VOLS = [0.55, 0.20, 0] as const;

  constructor() {
    this.ctx = new (
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.SFX_VOLS[0];
    this.master.connect(this.ctx.destination);
  }

  sfxCycleVolume(): void {
    this.resume();
    this.sfxIdx = (this.sfxIdx + 1) % 3;
    this.master.gain.linearRampToValueAtTime(this.SFX_VOLS[this.sfxIdx], this.ctx.currentTime + 0.2);
  }

  sfxGetState(): 'loud' | 'quiet' | 'mute' {
    return (['loud', 'quiet', 'mute'] as const)[this.sfxIdx];
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Resume the context on first interaction (browser autoplay policy). */
  private resume(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * Schedule a single oscillator tone with a linear frequency sweep and
   * a simple attack / sustain / release gain envelope.
   */
  private tone(
    freq:     number,
    type:     OscillatorType,
    gainPeak: number,
    attack:   number,   // seconds
    sustain:  number,   // seconds
    release:  number,   // seconds
    freqEnd?: number,   // if provided, sweep to this frequency
    startAt?: number,   // AudioContext time offset (default: now)
  ): void {
    this.resume();
    const now  = this.ctx.currentTime + (startAt ?? 0);
    const end  = now + attack + sustain + release;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, now + attack + sustain);
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + attack);
    gain.gain.setValueAtTime(gainPeak, now + attack + sustain);
    gain.gain.linearRampToValueAtTime(0, end);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(end + 0.01);
  }

  /** One-shot white-noise burst with an optional lowpass filter. */
  private noise(
    gainPeak: number,
    attack:   number,
    release:  number,
    lpFreq?:  number,   // lowpass cutoff (Hz); omit for full-band
    startAt?: number,
  ): void {
    this.resume();
    const now     = this.ctx.currentTime + (startAt ?? 0);
    const dur     = attack + release + 0.05;
    const buf     = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src  = this.ctx.createBufferSource();
    src.buffer = buf;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + attack);
    gain.gain.linearRampToValueAtTime(0, now + attack + release);

    if (lpFreq !== undefined) {
      const flt          = this.ctx.createBiquadFilter();
      flt.type           = 'lowpass';
      flt.frequency.value = lpFreq;
      src.connect(flt);
      flt.connect(gain);
    } else {
      src.connect(gain);
    }

    gain.connect(this.master);
    src.start(now);
  }

  // ── Public sound effects ───────────────────────────────────────────────────

  /** Short rising blip — player leaves ground. */
  jump(): void {
    this.tone(200, 'square', 0.14, 0.004, 0.015, 0.06, 380);
  }

  /** Soft filtered thud — player touches ground. */
  land(): void {
    this.noise(0.18, 0.003, 0.07, 280);
    this.tone(90, 'sine', 0.12, 0.004, 0.02, 0.06);
  }

  /** Grab tether snap. */
  grab(): void {
    this.tone(700, 'square', 0.13, 0.003, 0.008, 0.05, 450);
    this.noise(0.08, 0.002, 0.04, 1800);
  }

  /** Tether release pop. */
  release(): void {
    this.tone(350, 'square', 0.10, 0.003, 0.008, 0.04, 200);
  }

  /** Descending sawtooth crash + noise burst — player dies. */
  die(): void {
    this.tone(440, 'sawtooth', 0.28, 0.008, 0.06, 0.35, 55);
    this.noise(0.22, 0.008, 0.28, 1400);
  }

  /** Short ascending chirp — player respawns. */
  respawn(): void {
    this.tone(320, 'square', 0.14, 0.005, 0.03, 0.06, 640);
  }

  /** Three-note ascending arpeggio — key picked up. */
  keyPickup(): void {
    // C5 → E5 → G5
    const notes = [523, 659, 784];
    notes.forEach((f, i) => {
      this.tone(f, 'square', 0.22, 0.005, 0.055, 0.13, undefined, i * 0.085);
    });
  }

  /** Low mechanical whoosh — any door or gate opens. */
  doorOpen(): void {
    this.tone(75, 'sawtooth', 0.28, 0.018, 0.12, 0.22, 150);
    this.noise(0.10, 0.010, 0.20, 550);
  }

  /**
   * Start the alarm loop (alternating beeps).
   * Safe to call multiple times — only one loop runs.
   */
  alarmStart(): void {
    if (this.alarmHandle !== null) return;
    let phase = 0;
    const beep = () => {
      this.tone(phase % 2 === 0 ? 900 : 680, 'square', 0.17, 0.005, 0.055, 0.04);
      phase++;
    };
    beep();
    this.alarmHandle = setInterval(beep, 360);
  }

  alarmStop(): void {
    if (this.alarmHandle !== null) {
      clearInterval(this.alarmHandle);
      this.alarmHandle = null;
    }
  }

  /** Short static crackle — standing in a radiation zone (throttle externally). */
  radiationTick(): void {
    this.noise(0.10, 0.004, 0.09, 900);
    this.tone(55, 'sawtooth', 0.07, 0.004, 0.025, 0.07);
  }

  /** Bright sparkle chime — core charge picked up. */
  chargePickup(): void {
    this.tone(1046, 'sine', 0.18, 0.004, 0.04, 0.18);
    this.tone(1568, 'sine', 0.10, 0.016, 0.025, 0.14);
  }

  /** Deep impact + rising tone — core charge inserted. */
  chargeInsert(): void {
    this.noise(0.18, 0.006, 0.14, 400);
    this.tone(200, 'sawtooth', 0.22, 0.008, 0.07, 0.22, 340);
  }

  /** Rising five-note sweep — all charges inserted. */
  allInserted(): void {
    // C4 E4 G4 C5 E5
    const notes = [262, 330, 392, 523, 659];
    notes.forEach((f, i) => {
      this.tone(f, 'sine', 0.20, 0.008, 0.14, 0.38, undefined, i * 0.065);
    });
  }

  /** Metallic ping + noise burst — arrow target hit. */
  arrowHit(): void {
    this.tone(1400, 'sine', 0.24, 0.002, 0.015, 0.32, 700);
    this.noise(0.07, 0.002, 0.12, 2200);
  }

  /** Descending four-note fanfare — game over. */
  gameOver(): void {
    this.alarmStop();
    const notes = [392, 349, 294, 196];
    notes.forEach((f, i) => {
      this.tone(f, 'sawtooth', 0.28, 0.010, 0.14, 0.38, undefined, i * 0.17);
    });
  }

  /** Ascending four-note fanfare — victory. */
  gameWin(): void {
    this.alarmStop();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this.tone(f, 'sine', 0.24, 0.008, 0.17, 0.42, undefined, i * 0.13);
    });
    this.noise(0.06, 0.01, 0.55, 3000, 0);
  }

  // ── Power / form sounds ────────────────────────────────────────────────────

  /** Quick arrow whoosh — archer fires. */
  archerFire(): void {
    this.tone(1200, 'sawtooth', 0.09, 0.002, 0.004, 0.055, 400);
    this.noise(0.05, 0.002, 0.04, 2400);
  }

  /** Thud + ring — arrow sticks to a surface. */
  arrowStick(): void {
    this.noise(0.12, 0.002, 0.07, 600);
    this.tone(520, 'sine', 0.08, 0.003, 0.01, 0.08, 420);
  }

  /** Short click / blip — archer switches between arrow and zipline mode. */
  archerModeSwitch(): void {
    this.tone(440, 'square', 0.08, 0.003, 0.008, 0.035, 560);
  }

  /** Snap + slide hum — player attaches to a zipline. */
  ziplineAttach(): void {
    this.tone(280, 'sawtooth', 0.11, 0.005, 0.025, 0.09, 180);
    this.noise(0.06, 0.003, 0.05, 800);
  }

  /** Soft whomp — portal placed (color tints A/B via pitch). */
  portalPlace(isA: boolean): void {
    this.tone(isA ? 520 : 380, 'sine', 0.14, 0.005, 0.03, 0.12, isA ? 360 : 260);
    this.noise(0.06, 0.004, 0.07, 600);
  }

  /** Spatial warp flash — player teleports through portal. */
  portalTeleport(): void {
    this.tone(880, 'sine', 0.18, 0.003, 0.01, 0.10, 1760, 0);
    this.tone(1760, 'sine', 0.12, 0.003, 0.01, 0.10, 880, 0.02);
    this.noise(0.10, 0.003, 0.07, 1800);
  }

  /** Soft pop — portals cleared. */
  portalClear(): void {
    this.tone(300, 'sine', 0.09, 0.003, 0.01, 0.07, 180);
  }

  /** Low magnetic burst — magnet repel pulse. */
  magnetRepel(): void {
    this.tone(80, 'sawtooth', 0.20, 0.005, 0.04, 0.14, 55);
    this.noise(0.12, 0.005, 0.10, 700);
  }

  /** Subtle hum — magnet passively pulling (throttle externally). */
  magnetPull(): void {
    this.tone(110, 'sine', 0.05, 0.010, 0.04, 0.08);
  }

  /** Rising / falling swoosh — gravity flipped on or off. */
  gravityFlip(on: boolean): void {
    if (on) {
      this.tone(180, 'sawtooth', 0.16, 0.006, 0.03, 0.18, 380);
      this.noise(0.08, 0.005, 0.12, 500);
    } else {
      this.tone(380, 'sawtooth', 0.14, 0.005, 0.02, 0.15, 180);
      this.noise(0.07, 0.004, 0.10, 400);
    }
  }

  /** Gentle shimmer — player is floating with flipped gravity (throttle externally). */
  gravityFloat(): void {
    this.tone(660, 'sine', 0.04, 0.010, 0.03, 0.12);
    this.tone(880, 'sine', 0.02, 0.020, 0.02, 0.10);
  }

  destroy(): void {
    this.alarmStop();
    this.ctx.close();
  }
}
