// Synthesizes an original ambient bed for the launch video (no samples, no
// copyright): warm pad chords + soft plucked arpeggio + sine bass at 84 BPM,
// Am7 → Fmaj7 → Cmaj7 → G6. Writes 16-bit stereo WAV.
import { writeFileSync } from "node:fs";

const SR = 44100;
const DUR = 43.5;
const N = Math.round(SR * DUR);
const L = new Float64Array(N), R = new Float64Array(N);

const BPM = 84;
const BEAT = 60 / BPM;          // 0.714s
const BAR = BEAT * 4;           // 2.857s
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

// midi notes: [bass root, chord tones]
const PROG = [
  { root: 45, tones: [57, 60, 64, 67] }, // Am7  (A3 C4 E4 G4)
  { root: 41, tones: [53, 57, 60, 65] }, // Fmaj7 (F3 A3 C4 F4→E4? keep F)
  { root: 48, tones: [55, 60, 64, 67] }, // Cmaj  (G3 C4 E4 G4)
  { root: 43, tones: [55, 59, 62, 67] }  // G     (G3 B3 D4 G4)
];

const tri = (ph) => 2 * Math.abs(2 * (ph - Math.floor(ph + 0.5))) - 1;

function addTone(buf, t0, dur, freq, gain, attack, release, shape, detune = 0) {
  const s0 = Math.max(0, Math.round(t0 * SR));
  const s1 = Math.min(N, Math.round((t0 + dur) * SR));
  const fr = freq * (1 + detune);
  for (let s = s0; s < s1; s++) {
    const t = (s - s0) / SR;
    let env = 1;
    if (t < attack) env = t / attack;
    const tail = dur - t;
    if (tail < release) env = Math.min(env, tail / release);
    const ph = fr * (s / SR);
    const v = shape === "tri" ? tri(ph) : Math.sin(2 * Math.PI * ph);
    buf[s] += v * gain * env;
  }
}

// pluck: fast attack, exponential decay
function pluck(t0, freq, gain, pan) {
  const dur = 0.9;
  const s0 = Math.max(0, Math.round(t0 * SR));
  const s1 = Math.min(N, Math.round((t0 + dur) * SR));
  for (let s = s0; s < s1; s++) {
    const t = (s - s0) / SR;
    const env = Math.min(t / 0.008, 1) * Math.exp(-t * 6.5);
    const ph = freq * (s / SR);
    const v = (0.7 * Math.sin(2 * Math.PI * ph) + 0.3 * tri(ph * 2)) * gain * env;
    L[s] += v * (1 - pan);
    R[s] += v * pan;
  }
}

const bars = Math.ceil(DUR / BAR);
for (let b = 0; b < bars; b++) {
  const t0 = b * BAR;
  const ch = PROG[b % 4];

  // pad — both channels, slight detune spread for width
  for (const m of ch.tones) {
    addTone(L, t0, BAR + 0.3, f(m), 0.045, 1.1, 1.2, "sin", -0.0012);
    addTone(R, t0, BAR + 0.3, f(m), 0.045, 1.1, 1.2, "sin", +0.0012);
    addTone(L, t0, BAR + 0.3, f(m), 0.018, 1.3, 1.2, "tri", +0.0006);
    addTone(R, t0, BAR + 0.3, f(m), 0.018, 1.3, 1.2, "tri", -0.0006);
  }
  // bass — centered sine, gentle swell each bar
  addTone(L, t0, BAR, f(ch.root), 0.09, 0.06, 0.5, "sin");
  addTone(R, t0, BAR, f(ch.root), 0.09, 0.06, 0.5, "sin");

  // arpeggio — eighth-note plucks over chord tones (up-down), skip intro bar 0
  if (b >= 1) {
    const pat = [0, 1, 2, 3, 2, 1, 0, 2];
    for (let i = 0; i < 8; i++) {
      const tone = ch.tones[pat[i]] + 12;
      const jitter = (i % 3) * 0.004;   // deterministic humanize
      pluck(t0 + i * BEAT * 0.5 + jitter, f(tone), 0.05, i % 2 ? 0.62 : 0.38);
    }
  }
}

// simple echo (300ms, 30%) for space
const D = Math.round(0.3 * SR);
for (let s = N - 1; s >= D; s--) {
  L[s] += L[s - D] * 0.28;
  R[s] += R[s - D] * 0.28;
}

// normalize to a modest bed level, master fade in/out
let peak = 0;
for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
const g = 0.32 / peak;
const FADE_IN = 1.2 * SR, FADE_START = (DUR - 3) * SR;
for (let s = 0; s < N; s++) {
  let env = 1;
  if (s < FADE_IN) env = s / FADE_IN;
  if (s > FADE_START) env = Math.max(0, 1 - (s - FADE_START) / (3 * SR));
  L[s] *= g * env;
  R[s] *= g * env;
}

// write 16-bit stereo WAV
const data = Buffer.alloc(N * 4);
for (let s = 0; s < N; s++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[s] * 32767))), s * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[s] * 32767))), s * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8);
hdr.write("fmt ", 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28);
hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write("data", 36); hdr.writeUInt32LE(data.length, 40);
writeFileSync(new URL("./music.wav", import.meta.url).pathname, Buffer.concat([hdr, data]));
console.log(`music.wav written: ${DUR}s, ${((44 + data.length) / 1e6).toFixed(1)}MB`);
