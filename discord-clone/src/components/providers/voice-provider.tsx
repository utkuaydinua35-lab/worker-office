'use client';

import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import {
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  type Participant,
  type RoomOptions,
} from 'livekit-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { SERVER_MUTED_ATTRIBUTE } from '@/lib/voice-attributes';

// webAudioMix routes remote audio through a GainNode, which is what lets the
// per-user volume go above 100% (an <audio> element tops out at 1.0).
const ROOM_OPTIONS: RoomOptions = { webAudioMix: true, adaptiveStream: true, dynacast: true };
const SELF_PREFS_KEY = 'discord-clone:voice-self';

const DISCONNECT_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Bu kanala başka bir sekmeden ya da cihazdan bağlandın.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Ses kanalından çıkarıldın.',
  [DisconnectReason.ROOM_DELETED]: 'Ses kanalı kapatıldı.',
};

export interface VoiceChannelRef {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
}

interface TokenResponse {
  token: string;
  url: string;
  serverMuted: boolean;
}

interface VoiceContextValue {
  /** The channel we're in or connecting to. */
  channel: VoiceChannelRef | null;
  status: 'idle' | 'connecting' | 'connected';
  error: string | null;
  mediaError: string | null;
  selfMuted: boolean;
  deafened: boolean;
  serverMuted: boolean;
  join: (channel: VoiceChannelRef) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setMediaError: (message: string | null) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}

function readSelfPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(SELF_PREFS_KEY) ?? '{}');
    return { selfMuted: raw.selfMuted === true, deafened: raw.deafened === true };
  } catch {
    return { selfMuted: false, deafened: false };
  }
}

/**
 * The voice connection lives here, above the page, so it survives navigating
 * between channels and servers (like Discord). The voice page renders the
 * stage from this room; the user panel drives mute/deafen/disconnect.
 */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [room] = useState(() => new Room(ROOM_OPTIONS));
  const [channel, setChannel] = useState<VoiceChannelRef | null>(null);
  const [status, setStatus] = useState<VoiceContextValue['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [serverMuted, setServerMuted] = useState(false);
  // Bumped by every join/leave so a slow token fetch can't resurrect a stale join.
  const attempt = useRef(0);
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
  // The sidebar's voice lists come from LiveKit; nudge the server to re-read it.
  const announce = useCallback(() => socketRef.current?.emit('voice:changed'), []);

  useEffect(() => {
    const prefs = readSelfPrefs();
    setSelfMuted(prefs.selfMuted);
    setDeafened(prefs.deafened);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SELF_PREFS_KEY, JSON.stringify({ selfMuted, deafened }));
    } catch {
      // storage unavailable; the preference just won't persist
    }
  }, [selfMuted, deafened]);

  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => {
      // CLIENT_INITIATED is us: leave(), or switching to another channel.
      if (reason === undefined || reason === DisconnectReason.CLIENT_INITIATED) return;
      setError(DISCONNECT_MESSAGES[reason] ?? 'Ses bağlantısı koptu.');
      setChannel(null);
      setStatus('idle');
      announce();
    };
    const onAttributes = (_changed: Record<string, string>, participant: Participant) => {
      if (participant.isLocal) setServerMuted(participant.attributes[SERVER_MUTED_ATTRIBUTE] === '1');
    };
    const onMediaError = (err: Error) => {
      const failure = MediaDeviceFailure.getFailure(err);
      setMediaError(
        failure === MediaDeviceFailure.PermissionDenied
          ? 'Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.'
          : 'Mikrofona ya da kameraya erişilemedi.',
      );
    };
    room
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantAttributesChanged, onAttributes)
      .on(RoomEvent.MediaDevicesError, onMediaError);
    return () => {
      room
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.ParticipantAttributesChanged, onAttributes)
        .off(RoomEvent.MediaDevicesError, onMediaError);
      void room.disconnect();
    };
  }, [room, announce]);

  // Discord semantics: deafen implies mute; undeafen restores whatever mute
  // state you had. A server mute overrides both.
  const micOn = !selfMuted && !deafened && !serverMuted;
  useEffect(() => {
    if (status !== 'connected') return;
    room.localParticipant
      .setMicrophoneEnabled(micOn)
      .catch((err) => {
        setMediaError(errorMessage(err));
        setSelfMuted(true);
      })
      .finally(announce);
  }, [room, status, micOn, announce]);

  const join = useCallback(
    async (target: VoiceChannelRef) => {
      const mine = ++attempt.current;
      setChannel(target);
      setStatus('connecting');
      setError(null);
      setMediaError(null);
      try {
        const res = await apiFetch<TokenResponse>(
          `/api/livekit/token?channelId=${encodeURIComponent(target.id)}`,
        );
        if (mine !== attempt.current) return;
        await room.disconnect(); // no-op when idle; leaves the previous channel otherwise
        setServerMuted(res.serverMuted);
        await room.connect(res.url, res.token);
        if (mine !== attempt.current) return;
        setStatus('connected');
      } catch (err) {
        if (mine !== attempt.current) return;
        setError(errorMessage(err));
        setChannel(null);
        setStatus('idle');
      }
    },
    [room],
  );

  const leave = useCallback(() => {
    attempt.current++;
    void room.disconnect().finally(announce);
    setChannel(null);
    setStatus('idle');
    setError(null);
  }, [room, announce]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      channel,
      status,
      error,
      mediaError,
      selfMuted,
      deafened,
      serverMuted,
      join,
      leave,
      toggleMute: () => {
        // Unmuting while deafened undeafens too, as in Discord.
        if (deafened) {
          setDeafened(false);
          setSelfMuted(false);
        } else {
          setSelfMuted((m) => !m);
        }
      },
      toggleDeafen: () => setDeafened((d) => !d),
      setMediaError,
    }),
    [channel, status, error, mediaError, selfMuted, deafened, serverMuted, join, leave],
  );

  return (
    <VoiceContext.Provider value={value}>
      <RoomContext.Provider value={room}>
        {children}
        {/* muted disables the remote tracks outright, which also works through Web Audio. */}
        <RoomAudioRenderer muted={deafened} />
      </RoomContext.Provider>
    </VoiceContext.Provider>
  );
}
