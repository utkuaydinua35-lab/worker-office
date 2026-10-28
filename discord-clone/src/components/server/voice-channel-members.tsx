'use client';

import { useRoomContext, useSpeakingParticipants } from '@livekit/components-react';
import type { MemberRole } from '@prisma/client';
import { HeadphoneOff, MicOff, Music } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import { canManageChannels, canServerMute } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { voiceControl } from '@/lib/voice-control';
import type { VoiceChannelsState, VoiceMember } from '@/lib/voice-presence/store';

function avatarFromMetadata(metadata: string | undefined) {
  try {
    const value = JSON.parse(metadata ?? '{}').avatarUrl;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The server's live voice-channel occupancy: server-rendered first, then
 * pushed. Your own seat comes from the local connection, so joining shows up
 * at once instead of after LiveKit's next listing (as in Discord).
 */
export function useVoicePresence(serverId: string, initial: VoiceChannelsState, viewer: VoiceViewer) {
  const listed = useListedVoicePresence(serverId, initial);
  const voice = useVoice();
  const room = useRoomContext();
  const here = voice.status === 'connected' && voice.channel?.serverId === serverId ? voice.channel.id : null;
  const micMuted =
    voice.selfMuted || voice.deafened || voice.serverMuted || (voice.pushToTalk.enabled && !voice.talking);
  const name = room.localParticipant.name;
  const metadata = room.localParticipant.metadata;

  return useMemo(() => {
    if (!here) return listed;
    const me: VoiceMember = {
      id: viewer.id,
      name: name || 'Sen',
      avatarUrl: avatarFromMetadata(metadata),
      isBot: false,
      micMuted,
      serverMuted: voice.serverMuted,
      serverDeafened: voice.serverDeafened,
      role: viewer.role,
      isOwner: viewer.isOwner,
    };
    const next: VoiceChannelsState = {};
    for (const [channelId, members] of Object.entries(listed)) {
      // LiveKit's listing lags a move: we're only where our connection is.
      const others = members.filter((m) => m.id !== viewer.id);
      if (others.length) next[channelId] = others;
    }
    const mine = listed[here]?.find((m) => m.id === viewer.id) ?? me;
    next[here] = [...(next[here] ?? []), { ...mine, micMuted, serverMuted: voice.serverMuted }].sort(
      (a, b) => Number(a.isBot) - Number(b.isBot) || a.name.localeCompare(b.name, 'tr'),
    );
    return next;
  }, [listed, here, viewer, name, metadata, micMuted, voice.serverMuted, voice.serverDeafened]);
}

function useListedVoicePresence(serverId: string, initial: VoiceChannelsState) {
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
          const canMoveBot = viewer.isOwner || canManageChannels(viewer.role);
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
              {m.serverDeafened && (
                <HeadphoneOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Sunucuda sağırlaştırıldı" />
              )}
            </li>
          );
          if (!m.isBot && !canModerate) return row;
          const moveMenu = moveTargets.length > 0 && (m.isBot ? canMoveBot : true) && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Taşı</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {moveTargets.map((c) => (
                  <ContextMenuItem key={c.id} onSelect={() => run({ action: 'move', userId: m.id, channelId: c.id })}>
                    {c.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          );

          return (
            <ContextMenu key={m.id} modal={false}>
              <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
              <ContextMenuContent className="w-52" aria-label={`${m.name} menüsü`}>
                {moveMenu}
                {!m.isBot && (
                  <ContextMenuItem
                    onSelect={() => run({ action: 'deafen', userId: m.id, deafened: !m.serverDeafened })}
                  >
                    {m.serverDeafened ? 'Sağırlaştırmayı Kaldır' : 'Sunucuda Sağırlaştır'}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  className="text-destructive"
                  onSelect={() => run({ action: 'disconnect', userId: m.id })}
                >
                  {m.isBot ? 'Botu Kanaldan Çıkar' : 'Bağlantıyı Kes'}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ul>
      {error && <p className="mb-1 ml-8 text-xs text-destructive">{error}</p>}
    </>
  );
}
