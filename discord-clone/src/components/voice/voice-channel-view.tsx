'use client';

import type { MemberRole } from '@prisma/client';
import { Loader2, Volume2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useVoice } from '@/components/providers/voice-provider';
import { Button } from '@/components/ui/button';
import { VoiceControls } from '@/components/voice/voice-controls';
import { VoiceStage } from '@/components/voice/voice-stage';

interface VoiceChannelViewProps {
  channel: { id: string; name: string };
  server: { id: string; name: string };
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/**
 * Opening a voice channel joins it once (like clicking it in Discord). After
 * disconnecting, the page offers a join button instead of re-joining by itself.
 */
export function VoiceChannelView({ channel, server, currentUser }: VoiceChannelViewProps) {
  const voice = useVoice();
  const here = voice.channel?.id === channel.id;
  const ref = { id: channel.id, name: channel.name, serverId: server.id, serverName: server.name };
  const autoJoined = useRef(false);

  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    if (!here) void voice.join(ref);
    // Only on first open of this channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (here && voice.status === 'connected') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-voice-connected="true">
        <VoiceStage serverId={server.id} currentUser={currentUser} />
        <div className="flex flex-col items-center gap-2 pb-4">
          {voice.mediaError && <p className="text-sm text-destructive">{voice.mediaError}</p>}
          <VoiceControls />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
        <Volume2 className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold">{channel.name}</h2>
      {here ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ses kanalına bağlanılıyor...
        </p>
      ) : (
        <>
          {voice.error && <p className="text-sm text-destructive">{voice.error}</p>}
          {voice.channel && (
            <p className="text-sm text-muted-foreground">
              Şu an <b>{voice.channel.name}</b> kanalındasın; katılırsan oradan ayrılırsın.
            </p>
          )}
          <Button onClick={() => void voice.join(ref)}>Ses Kanalına Katıl</Button>
        </>
      )}
    </div>
  );
}
