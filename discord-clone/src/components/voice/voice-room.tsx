'use client';

import { LiveKitRoom, RoomAudioRenderer, StartAudio } from '@livekit/components-react';
import type { MemberRole } from '@prisma/client';
import { DisconnectReason, type RoomOptions } from 'livekit-client';
import { Loader2, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { VoiceControls } from '@/components/voice/voice-controls';
import { VoiceStage } from '@/components/voice/voice-stage';
import { apiFetch, errorMessage } from '@/lib/client-api';

// webAudioMix routes remote audio through a GainNode, which is what lets the
// per-user volume go above 100% (an <audio> element tops out at 1.0).
const ROOM_OPTIONS: RoomOptions = { webAudioMix: true, adaptiveStream: true, dynacast: true };

interface Connection {
  token: string;
  url: string;
  serverMuted: boolean;
}

const DISCONNECT_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Bu kanala başka bir sekmeden ya da cihazdan bağlandın.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Ses kanalından çıkarıldın.',
  [DisconnectReason.ROOM_DELETED]: 'Ses kanalı kapatıldı.',
};

interface VoiceRoomProps {
  channel: { id: string; name: string };
  serverId: string;
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/**
 * Opening a voice channel joins its LiveKit room (mic on, camera off, like
 * Discord); navigating away unmounts LiveKitRoom, which leaves it.
 */
export function VoiceRoom({ channel, serverId, currentUser }: VoiceRoomProps) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const join = useCallback(async () => {
    setError(null);
    setConnection(null);
    try {
      setConnection(
        await apiFetch<Connection>(`/api/livekit/token?channelId=${encodeURIComponent(channel.id)}`),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [channel.id]);

  useEffect(() => {
    void join();
  }, [join]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <PhoneOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="secondary" onClick={() => void join()}>
          Tekrar Bağlan
        </Button>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Ses kanalına bağlanılıyor...
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      connect
      // A server-muted member may not publish a microphone; don't even try.
      audio={!connection.serverMuted}
      video={false}
      options={ROOM_OPTIONS}
      onDisconnected={(reason) => {
        // CLIENT_INITIATED is us leaving (unmount or the leave button).
        if (reason === undefined || reason === DisconnectReason.CLIENT_INITIATED) return;
        setError(DISCONNECT_MESSAGES[reason] ?? 'Ses bağlantısı koptu.');
      }}
      onError={(err) => setError(err.message)}
      onMediaDeviceFailure={() =>
        setMediaError('Mikrofona ya da kameraya erişilemedi. Tarayıcı izinlerini kontrol et.')
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <VoiceStage serverId={serverId} currentUser={currentUser} />
      <RoomAudioRenderer />
      <div className="flex flex-col items-center gap-2 pb-4">
        {/* Browsers block audio until a user gesture; this appears only when needed. */}
        <StartAudio
          label="Sesi duymak için tıkla"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        />
        {mediaError && <p className="text-sm text-destructive">{mediaError}</p>}
        <VoiceControls serverId={serverId} onDeviceError={setMediaError} />
      </div>
    </LiveKitRoom>
  );
}
