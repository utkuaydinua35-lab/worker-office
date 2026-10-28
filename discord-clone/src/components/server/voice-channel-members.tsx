'use client';

import { useSpeakingParticipants } from '@livekit/components-react';
import { MicOff, Music } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { useVoice } from '@/components/providers/voice-provider';
import { UserAvatar } from '@/components/user/user-avatar';
import { cn } from '@/lib/utils';
import type { VoiceChannelsState, VoiceMember } from '@/lib/voice-presence/store';

/** The server's live voice-channel occupancy: server-rendered first, then pushed. */
export function useVoicePresence(serverId: string, initial: VoiceChannelsState) {
  const { socket } = useSocket();
  const [channels, setChannels] = useState(initial);
  useEffect(() => setChannels(initial), [initial]);

  useEffect(() => {
    if (!socket) return;
    const onState = (p: { serverId: string; channels: VoiceChannelsState }) => {
      if (p.serverId === serverId) setChannels(p.channels);
    };
    socket.on('voice:state', onState);
    return () => {
      socket.off('voice:state', onState);
    };
  }, [socket, serverId]);

  return channels;
}

/**
 * Discord's list under a voice channel. Speaking rings need the live room, so
 * they show only for the channel you're in yourself.
 */
export function VoiceChannelMembers({ channelId, members }: { channelId: string; members: VoiceMember[] }) {
  const voice = useVoice();
  const speakers = useSpeakingParticipants();
  const inThisChannel = voice.status === 'connected' && voice.channel?.id === channelId;
  const speaking = new Set(inThisChannel ? speakers.map((p) => p.identity) : []);

  if (members.length === 0) return null;

  return (
    <ul className="mb-1 ml-6 space-y-0.5" aria-label="Kanaldakiler">
      {members.map((m) => (
        <li
          key={m.id}
          data-voice-member={m.name}
          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground"
        >
          <span
            className={cn('rounded-full ring-2 ring-transparent transition-shadow', speaking.has(m.id) && 'ring-status-online')}
            data-speaking={speaking.has(m.id)}
          >
            {m.isBot ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-online text-white">
                <Music className="h-3.5 w-3.5" />
              </span>
            ) : (
              <UserAvatar username={m.name} avatarUrl={m.avatarUrl} className="h-6 w-6 text-[10px]" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{m.name}</span>
          {m.serverMuted ? (
            <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Sunucuda susturuldu" />
          ) : (
            m.micMuted && !m.isBot && <MicOff className="h-3.5 w-3.5 shrink-0" aria-label="Mikrofon kapalı" />
          )}
        </li>
      ))}
    </ul>
  );
}
