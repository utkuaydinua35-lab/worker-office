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
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { watchAudioPrefs } from '@/hooks/use-local-audio-prefs';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { SERVER_DEAFENED_ATTRIBUTE, SERVER_MUTED_ATTRIBUTE } from '@/lib/voice-attributes';
import { playVoiceSound } from '@/lib/voice-sounds';

// webAudioMix routes remote audio through a GainNode, which is what lets the
// per-user volume go above 100% (an <audio> element tops out at 1.0).
const ROOM_OPTIONS: RoomOptions = { webAudioMix: true, adaptiveStream: true, dynacast: true };
const SELF_PREFS_KEY = 'discord-clone:voice-self';
const PTT_KEY = 'discord-clone:push-to-talk';
const DEFAULT_PTT_KEY = 'KeyV';

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
  serverDeafened: boolean;
}

export interface PushToTalk {
  enabled: boolean;
  /** KeyboardEvent.code, e.g. "KeyV" or "Backquote". */
  key: string;
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
  serverDeafened: boolean;
  pushToTalk: PushToTalk;
  setPushToTalk: (ptt: PushToTalk) => void;
  /** Push-to-talk key held right now. */
  talking: boolean;
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

function readPushToTalk(): PushToTalk {
  try {
    const raw = JSON.parse(localStorage.getItem(PTT_KEY) ?? '{}');
    return { enabled: raw.enabled === true, key: typeof raw.key === 'string' && raw.key ? raw.key : DEFAULT_PTT_KEY };
  } catch {
    return { enabled: false, key: DEFAULT_PTT_KEY };
  }
}

/** Typing in a text field must never key the mic. */
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

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
  const [serverDeafened, setServerDeafened] = useState(false);
  const [pushToTalk, setPushToTalkState] = useState<PushToTalk>({ enabled: false, key: DEFAULT_PTT_KEY });
  const [talking, setTalking] = useState(false);
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

  // Saved per-user volumes apply from the moment someone joins, on any page.
  useEffect(() => watchAudioPrefs(room), [room]);

  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => {
      // CLIENT_INITIATED is us: leave(), or switching to another channel.
      if (reason === undefined || reason === DisconnectReason.CLIENT_INITIATED) return;
      playVoiceSound('leave'); // kicked, moved out by the server, or the network gave up
      setError(DISCONNECT_MESSAGES[reason] ?? 'Ses bağlantısı koptu.');
      setChannel(null);
      setStatus('idle');
      announce();
    };
    const onAttributes = (_changed: Record<string, string>, participant: Participant) => {
      if (!participant.isLocal) return;
      setServerMuted(participant.attributes[SERVER_MUTED_ATTRIBUTE] === '1');
      setServerDeafened(participant.attributes[SERVER_DEAFENED_ATTRIBUTE] === '1');
    };
    const onMediaError = (err: Error) => {
      const failure = MediaDeviceFailure.getFailure(err);
      setMediaError(
        failure === MediaDeviceFailure.PermissionDenied
          ? 'Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.'
          : 'Mikrofona ya da kameraya erişilemedi.',
      );
    };
    // Someone (the music bot too) joining or leaving the channel you're in.
    const onJoined = () => playVoiceSound('join');
    const onLeft = () => playVoiceSound('leave');
    room
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantAttributesChanged, onAttributes)
      .on(RoomEvent.MediaDevicesError, onMediaError)
      .on(RoomEvent.ParticipantConnected, onJoined)
      .on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      room
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.ParticipantAttributesChanged, onAttributes)
        .off(RoomEvent.MediaDevicesError, onMediaError)
        .off(RoomEvent.ParticipantConnected, onJoined)
        .off(RoomEvent.ParticipantDisconnected, onLeft);
      void room.disconnect();
    };
  }, [room, announce]);

  // Discord semantics: deafen implies mute; undeafen restores whatever mute
  // state you had. A server mute overrides both.
  useEffect(() => setPushToTalkState(readPushToTalk()), []);
  const setPushToTalk = useCallback((ptt: PushToTalk) => {
    setPushToTalkState(ptt);
    try {
      localStorage.setItem(PTT_KEY, JSON.stringify(ptt));
    } catch {
      // storage unavailable; the setting just won't persist
    }
  }, []);

  // Push-to-talk: the mic is live only while the key is held in this tab.
  // Browsers don't see keys pressed in other apps, so it releases on blur.
  useEffect(() => {
    if (!pushToTalk.enabled) return setTalking(false);
    const down = (e: KeyboardEvent) => {
      if (e.code !== pushToTalk.key || e.repeat || isTypingTarget(e.target)) return;
      setTalking(true);
    };
    const up = (e: KeyboardEvent) => e.code === pushToTalk.key && setTalking(false);
    const release = () => setTalking(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [pushToTalk]);

  const micOn = !selfMuted && !deafened && !serverMuted && (!pushToTalk.enabled || talking);
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
        const res = await apiFetch<TokenResponse>(`/api/livekit/token?channelId=${encodeURIComponent(target.id)}`);
        if (mine !== attempt.current) return;
        await room.disconnect(); // no-op when idle; leaves the previous channel otherwise
        setServerMuted(res.serverMuted);
        setServerDeafened(res.serverDeafened);
        await room.connect(res.url, res.token);
        if (mine !== attempt.current) return;
        setStatus('connected');
        playVoiceSound('join');
        announce(); // the mic may take a while (permission prompt); don't wait for it
      } catch (err) {
        if (mine !== attempt.current) return;
        setError(errorMessage(err));
        setChannel(null);
        setStatus('idle');
      }
    },
    [room, announce],
  );

  // A moderator moved us (Discord's "Move To"): rejoin there, and follow with
  // the view if we were looking at the old channel.
  const router = useRouter();
  const pathname = usePathname();
  const moveRef = useRef({ channel, pathname, join, router });
  moveRef.current = { channel, pathname, join, router };
  useEffect(() => {
    if (!socket) return;
    const onMove = (p: { serverId: string; channelId: string; channelName: string }) => {
      const { channel: current, pathname: path, join: rejoin, router: nav } = moveRef.current;
      if (!current || current.serverId !== p.serverId || current.id === p.channelId) return;
      const oldPath = `/servers/${p.serverId}/channels/${current.id}`;
      void rejoin({ ...current, id: p.channelId, name: p.channelName });
      if (path === oldPath) nav.push(`/servers/${p.serverId}/channels/${p.channelId}`);
    };
    socket.on('voice:move', onMove);
    return () => {
      socket.off('voice:move', onMove);
    };
  }, [socket]);

  const leave = useCallback(() => {
    attempt.current++;
    if (room.state !== 'disconnected') playVoiceSound('leave');
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
      serverDeafened,
      pushToTalk,
      setPushToTalk,
      talking,
      join,
      leave,
      toggleMute: () => {
        // Unmuting while deafened undeafens too, as in Discord.
        if (deafened) {
          setDeafened(false);
          setSelfMuted(false);
          playVoiceSound('unmute');
        } else {
          playVoiceSound(selfMuted ? 'unmute' : 'mute');
          setSelfMuted((m) => !m);
        }
      },
      toggleDeafen: () => {
        playVoiceSound(deafened ? 'undeafen' : 'deafen');
        setDeafened((d) => !d);
      },
      setMediaError,
    }),
    [
      channel,
      status,
      error,
      mediaError,
      selfMuted,
      deafened,
      serverMuted,
      serverDeafened,
      pushToTalk,
      setPushToTalk,
      talking,
      join,
      leave,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      <RoomContext.Provider value={room}>
        {children}
        {/* muted disables the remote tracks outright, which also works through Web Audio. */}
        <RoomAudioRenderer muted={deafened || serverDeafened} />
      </RoomContext.Provider>
    </VoiceContext.Provider>
  );
}
