// MusicSystem — procedural background music via Web Audio API.
// All sounds synthesized from oscillators and noise — no audio files needed.
//
// Track: dark cyberpunk ambient in C minor pentatonic, BPM 90.
// Structure: 16-step 8th-note loop (~5.3 s) with bass drone, arp, kick/snare.

const BPM    = 90;
const STEP_S = 60 / BPM / 2;   // 8th-note duration in seconds (~0.333 s)
const STEPS  = 16;

// C minor pentatonic — two octaves
const SCALE = [
  130.8, 155.6, 174.6, 196.0, 233.1,   // C3 Eb3 F3 G3 Bb3
  261.6, 311.1, 349.2, 392.0, 466.2,   // C4 Eb4 F4 G4 Bb4
];

// 16-step arpeggio pattern (indices into SCALE)
const ARP: number[] = [0, 4, 2, 6, 1, 5, 3, 7,  2, 4, 0, 5,  3, 8, 1, 4];

// Bass root notes per beat (4 beats × 4 steps each), one octave below SCALE
const BASS: number[] = [0, 7, 4, 5];   // C G Eb F — common Cm progression

// Volume levels for the three cycle states
const VOLS = [0.42, 0.16, 0] as const;

export type MusicState = 'loud' | 'quiet' | 'mute';

export class MusicSystem {
  private ctx:       AudioContext;
  private master:    GainNode;
  private stateIdx   = 0;          // 0=loud, 1=quiet, 2=mute
  private step       = 0;
  private seqHandle: ReturnType<typeof setInterval> | null = null;
  private started    = false;

  constructor() {
    this.ctx    = new (
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    this.master = this.ctx.createGain();
    this.master.gain.value = VOLS[0];
    this.master.connect(this.ctx.destination);
  }

  /** Call once on the first user interaction to begin playback. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.buildDrone();
    this.step = 0;
    this.fireStep();
    this.seqHandle = setInterval(() => {
      this.step = (this.step + 1) % STEPS;
      this.fireStep();
    }, STEP_S * 1000);
  }

  /**
   * Cycle through loud → quiet → mute → loud.
   * Each player's music key calls this — shared result for everyone.
   */
  cycleVolume(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stateIdx = (this.stateIdx + 1) % 3;
    this.master.gain.linearRampToValueAtTime(
      VOLS[this.stateIdx],
      this.ctx.currentTime + 0.3,
    );
  }

  getState(): MusicState {
    return (['loud', 'quiet', 'mute'] as const)[this.stateIdx];
  }

  destroy(): void {
    if (this.seqHandle) { clearInterval(this.seqHandle); this.seqHandle = null; }
    this.ctx.close();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private resume(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Schedule a short oscillator tone relative to ctx.currentTime. */
  private tone(
    freq:    number,
    type:    OscillatorType,
    peak:    number,
    attack:  number,
    sustain: number,
    release: number,
    at = 0,
  ): void {
    const now  = this.ctx.currentTime + at;
    const end  = now + attack + sustain + release;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.setValueAtTime(peak, now + attack + sustain);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(end + 0.01);
  }

  /** Short filtered noise burst. */
  private noise(peak: number, attack: number, release: number, lpHz?: number, at = 0): void {
    const now = this.ctx.currentTime + at;
    const dur = attack + release + 0.05;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.linearRampToValueAtTime(0, now + attack + release);
    if (lpHz !== undefined) {
      const f          = this.ctx.createBiquadFilter();
      f.type           = 'lowpass';
      f.frequency.value = lpHz;
      src.connect(f);
      f.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(this.master);
    src.start(now);
  }

  /**
   * Lay down the continuous background drone layers.
   * Oscillators are scheduled for 600 s (10 min) — enough for any session.
   */
  private buildDrone(): void {
    const now = this.ctx.currentTime;
    const DUR = 600;

    // Sub-bass (C2) + bass (G2) fundamentals
    const droneFreqs: [number, number][] = [
      [65.4,  0.28],   // C2
      [98.0,  0.18],   // G2
      [130.8, 0.10],   // C3
    ];
    for (const [freq, peak] of droneFreqs) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      // LFO tremolo
      const lfo  = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value  = 0.25 + freq * 0.0003;
      lfoG.gain.value      = peak * 0.25;
      lfo.connect(lfoG);
      lfoG.connect(gain.gain);

      osc.type            = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 3.0);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);  osc.stop(now + DUR);
      lfo.start(now);  lfo.stop(now + DUR);
    }

    // Cm chord pad: C3 Eb3 G3 (triangle, very soft)
    for (const [freq, peak] of [[130.8, 0.06], [155.6, 0.05], [196.0, 0.04]] as const) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type            = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 4.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + DUR);
    }
  }

  /** Fire one sequencer step. */
  private fireStep(): void {
    this.resume();

    const arpFreq = SCALE[ARP[this.step]!]! * 2;   // two octaves up from SCALE

    // ── Arpeggio note (square wave, short) ───────────────────────────────────
    this.tone(arpFreq, 'square', 0.052, 0.006, STEP_S * 0.28, STEP_S * 0.55);

    // ── Kick on beat 1 (step 0) and beat 3 (step 8) ──────────────────────────
    if (this.step === 0 || this.step === 8) {
      this.noise(0.60, 0.002, 0.18, 160);          // kick boom
      this.tone(75, 'sine', 0.45, 0.002, 0.035, 0.13);  // kick punch
    }

    // ── Snare on beat 2 (step 4) and beat 4 (step 12) ────────────────────────
    if (this.step === 4 || this.step === 12) {
      this.noise(0.40, 0.002, 0.11, 3500);          // snare rattle
      this.tone(185, 'sine', 0.20, 0.002, 0.018, 0.09);  // snare crack
    }

    // ── Hi-hat every step (very short, high filtered noise) ──────────────────
    const hatVol = (this.step % 2 === 0) ? 0.08 : 0.04;  // accent on 8ths
    this.noise(hatVol, 0.001, 0.035, 9000);

    // ── Bass note on every beat (every 4 steps) ───────────────────────────────
    if (this.step % 4 === 0) {
      const beatIdx   = Math.floor(this.step / 4) % 4;
      const bassFreq  = SCALE[BASS[beatIdx]!]! / 2;   // one octave below SCALE
      this.tone(bassFreq, 'sawtooth', 0.32, 0.008, STEP_S * 1.6, STEP_S * 0.7);
    }

    // ── Occasional accent note (every 8 steps, offset by 2) ─────────────────
    if (this.step === 2 || this.step === 10) {
      const accentFreq = SCALE[ARP[(this.step + 3) % STEPS]!]! * 4;  // even higher
      this.tone(accentFreq, 'triangle', 0.035, 0.004, STEP_S * 0.15, STEP_S * 0.6);
    }
  }
}
