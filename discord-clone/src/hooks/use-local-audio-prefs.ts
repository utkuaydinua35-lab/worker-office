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
 * This device's volume and mute for one remote participant, persisted per
 * user and re-applied to the participant (LiveKit carries it over to tracks
 * they publish later). No-op for the local participant.
 */
export function useLocalAudioPrefs(participant: Participant) {
  const remote = participant.isLocal ? null : (participant as RemoteParticipant);
  const [prefs, setPrefs] = useState<LocalAudioPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (remote) setPrefs(readPrefs(remote.identity));
  }, [remote]);

  useEffect(() => {
    if (remote) applyVolume(remote, prefs);
  }, [remote, prefs]);

  const update = useCallback(
    (patch: Partial<LocalAudioPrefs>) => {
      if (!remote) return;
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        writePrefs(remote.identity, next);
        return next;
      });
    },
    [remote],
  );

  return { prefs, update };
}
