'use client';

import { useSpeakingParticipants } from '@livekit/components-react';
import type { MemberRole } from '@prisma/client';
import { MicOff, Music } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { useVoice } from '@/components/providers/voice-provider';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { UserAvatar } from '@/components/user/user-avatar';
import { errorMessage } from '@/lib/client-api';
import { canServerMute } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { voiceControl } from '@/lib/voice-control';
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
export interface VoiceViewer {
  id: string;
  role: MemberRole;
  isOwner: boolean;
}

interface VoiceChannelMembersProps {
  serverId: string;
  channelId: string;
  members: VoiceMember[];
  /** The server's voice channels, for "Taşı". */
  voiceChannels: { id: string; name: string }[];
  viewer: VoiceViewer;
}

export function VoiceChannelMembers({ serverId, channelId, members, voiceChannels, viewer }: VoiceChannelMembersProps) {
  const voice = useVoice();
  const speakers = useSpeakingParticipants();
  const [error, setError] = useState<string | null>(null);
  const inThisChannel = voice.status === 'connected' && voice.channel?.id === channelId;
  const speaking = new Set(inThisChannel ? speakers.map((p) => p.identity) : []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  if (members.length === 0) return null;

  const run = (body: Parameters<typeof voiceControl>[1]) => {
    setError(null);
    voiceControl(serverId, body).catch((err) => setError(errorMessage(err)));
  };

  return (
    <>
      <ul className="mb-1 ml-6 space-y-0.5" aria-label="Kanaldakiler">
        {members.map((m) => {
          // The server re-checks all of this; here it only decides what to offer.
          const canModerate =
            !m.isBot && m.id !== viewer.id && canServerMute(viewer, { role: m.role, isOwner: m.isOwner });
          const moveTargets = voiceChannels.filter((c) => c.id !== channelId);
          const row = (
            <li
              key={m.id}
              data-voice-member={m.name}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-secondary/50"
            >
              <span
                className={cn(
                  'rounded-full ring-2 ring-transparent transition-shadow',
                  speaking.has(m.id) && 'ring-status-online',
                )}
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
          );
          if (!m.isBot && !canModerate) return row;

          return (
            <ContextMenu key={m.id} modal={false}>
              <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
              <ContextMenuContent className="w-52" aria-label={`${m.name} menüsü`}>
                {m.isBot ? (
                  <ContextMenuItem
                    className="text-destructive"
                    onSelect={() => run({ action: 'disconnect', userId: m.id })}
                  >
                    Botu Kanaldan Çıkar
                  </ContextMenuItem>
                ) : (
                  <>
                    {moveTargets.length > 0 && (
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>Taşı</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          {moveTargets.map((c) => (
                            <ContextMenuItem
                              key={c.id}
                              onSelect={() => run({ action: 'move', userId: m.id, channelId: c.id })}
                            >
                              {c.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    )}
                    <ContextMenuItem
                      className="text-destructive"
                      onSelect={() => run({ action: 'disconnect', userId: m.id })}
                    >
                      Bağlantıyı Kes
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ul>
      {error && <p className="mb-1 ml-8 text-xs text-destructive">{error}</p>}
    </>
  );
}
