// Discord-style voice cues, synthesized with Web Audio (no sound files to ship
// or load). Joins rise, leaves fall; mute and deafen get a short blip.

export type VoiceSound = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen';

const ENABLED_KEY = 'discord-clone:voice-sounds';
const CHANGE_EVENT = 'discord-clone:voice-sounds-change';
const VOLUME = 0.12;

// [frequency Hz, start s, duration s]
const NOTES: Record<VoiceSound, [number, number, number][]> = {
  join: [
    [523.25, 0, 0.09],
    [783.99, 0.08, 0.14],
  ],
  leave: [
    [783.99, 0, 0.09],
    [523.25, 0.08, 0.14],
  ],
  mute: [
    [440, 0, 0.08],
    [329.63, 0.07, 0.1],
  ],
  unmute: [
    [329.63, 0, 0.08],
    [440, 0.07, 0.1],
  ],
  deafen: [
    [392, 0, 0.08],
    [261.63, 0.07, 0.12],
  ],
  undeafen: [
    [261.63, 0, 0.08],
    [392, 0.07, 0.12],
  ],
};

let ctx: AudioContext | null = null;

export function voiceSoundsEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVoiceSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable; the choice just won't persist
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onVoiceSoundsChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function playVoiceSound(sound: VoiceSound) {
  if (typeof window === 'undefined' || !voiceSoundsEnabled()) return;
  try {
    ctx ??= new AudioContext();
    // Joining is a click, so the context may start; a later resume is harmless.
    void ctx.resume();
    const now = ctx.currentTime;
    for (const [freq, start, duration] of NOTES[sound]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      // Short attack and release so the tones don't click.
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(VOLUME, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    }
  } catch {
    // No Web Audio (very old browser): stay silent.
  }
}
