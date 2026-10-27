'use client';

import type { Participant, RemoteParticipant } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 200; // percent; above 100 needs Room({ webAudioMix: true })
export const VOLUME_DEFAULT = 100;

export interface LocalAudioPrefs {
  volume: number; // percent
  muted: boolean; // muted on this device only
}

const DEFAULT_PREFS: LocalAudioPrefs = { volume: VOLUME_DEFAULT, muted: false };
const storageKey = (userId: string) => `discord-clone:voice-prefs:${userId}`;
// Same-tab change notification; the `storage` event only fires in other tabs.
const CHANGE_EVENT = 'discord-clone:voice-prefs-change';

// Per-browser, like Discord's per-user volume. Storage can be unavailable
// (private mode, blocked site data); the prefs then just don't persist.
function readPrefs(userId: string): LocalAudioPrefs {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<LocalAudioPrefs>;
    const volume = Number(parsed.volume);
    return {
      volume: Number.isFinite(volume) ? Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, volume)) : VOLUME_DEFAULT,
      muted: parsed.muted === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(userId: string, prefs: LocalAudioPrefs) {
  try {
    if (prefs.volume === VOLUME_DEFAULT && !prefs.muted) localStorage.removeItem(storageKey(userId));
    else localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId, prefs } }));
}

/**
 * This device's volume and mute for another user. Every component editing the
 * same user (member list menu, voice card menu) stays in sync.
 */
export function useAudioPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<LocalAudioPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!userId) return;
    setPrefs(readPrefs(userId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string; prefs: LocalAudioPrefs }>).detail;
      if (detail.userId === userId) setPrefs(detail.prefs);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) setPrefs(readPrefs(userId));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<LocalAudioPrefs>) => {
      if (!userId) return;
      writePrefs(userId, { ...readPrefs(userId), ...patch });
    },
    [userId],
  );

  return { prefs, update };
}

function applyVolume(participant: RemoteParticipant, prefs: LocalAudioPrefs) {
  const gain = prefs.muted ? 0 : prefs.volume / 100;
  try {
    participant.setVolume(gain);
  } catch {
    // Without a Web Audio gain node the <audio> element caps volume at 1.
    console.warn('[voice] Web Audio unavailable; volume capped at 100%');
    participant.setVolume(Math.min(gain, 1));
  }
}

/**
 * useAudioPrefs for a voice participant, applied to them (LiveKit carries it
 * over to tracks they publish later). No-op for the local participant.
 */
export function useLocalAudioPrefs(participant: Participant) {
  const remote = participant.isLocal ? null : (participant as RemoteParticipant);
  const audio = useAudioPrefs(remote?.identity ?? null);

  useEffect(() => {
    if (remote) applyVolume(remote, audio.prefs);
  }, [remote, audio.prefs]);

  return audio;
}
