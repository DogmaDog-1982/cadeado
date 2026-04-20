// Lightweight sound effects using Web Audio API (no assets needed).
let ctx: AudioContext | null = null;
let muted = false;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15, when = 0) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function slide(from: number, to: number, duration: number, type: OscillatorType = "sawtooth", gain = 0.12) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  setMuted(v: boolean) {
    muted = v;
  },
  isMuted() {
    return muted;
  },
  click() {
    tone(520, 0.06, "square", 0.08);
  },
  miss() {
    slide(220, 110, 0.25, "sawtooth", 0.18);
  },
  hintHigher() {
    tone(440, 0.08, "triangle", 0.14);
    tone(660, 0.12, "triangle", 0.14, 0.08);
  },
  hintLower() {
    tone(440, 0.08, "triangle", 0.14);
    tone(280, 0.14, "triangle", 0.14, 0.08);
  },
  correct() {
    tone(660, 0.08, "sine", 0.16);
    tone(880, 0.12, "sine", 0.16, 0.07);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.18, i * 0.12));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.16, i * 0.15));
  },
};

const KEY = "cadeado-muted";
if (typeof window !== "undefined") {
  muted = localStorage.getItem(KEY) === "1";
}
export function toggleMute() {
  muted = !muted;
  if (typeof window !== "undefined") localStorage.setItem(KEY, muted ? "1" : "0");
  return muted;
}
