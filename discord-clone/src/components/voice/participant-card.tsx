'use client';

import {
  useIsMuted,
  useIsSpeaking,
  useParticipantAttributes,
  useParticipantInfo,
  useParticipantTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { MemberRole } from '@prisma/client';
import { Track, type Participant } from 'livekit-client';
import { MicOff, MoreVertical, Music, VolumeX } from 'lucide-react';
import { useState } from 'react';

import { ParticipantMenu } from '@/components/voice/participant-menu';
import { UserAvatar } from '@/components/user/user-avatar';
import { useLocalAudioPrefs } from '@/hooks/use-local-audio-prefs';
import { canServerMute } from '@/lib/roles';
import { cn } from '@/lib/utils';
import {
  BOT_ATTRIBUTE,
  OWNER_ATTRIBUTE,
  ROLE_ATTRIBUTE,
  SERVER_MUTED_ATTRIBUTE,
} from '@/lib/voice-attributes';

const ROLES: readonly MemberRole[] = ['ADMIN', 'MODERATOR', 'GUEST'];

function parseAvatarUrl(metadata: string | undefined) {
  try {
    const value = JSON.parse(metadata ?? '{}').avatarUrl;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

interface ParticipantCardProps {
  participant: Participant;
  serverId: string;
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
  compact: boolean;
}

export function ParticipantCard({ participant, serverId, currentUser, compact }: ParticipantCardProps) {
  const { name, metadata } = useParticipantInfo({ participant });
  const { attributes } = useParticipantAttributes({ participant });
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const [camera] = useParticipantTracks([Track.Source.Camera], participant.identity);
  const audio = useLocalAudioPrefs(participant);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = name || participant.identity;
  const serverMuted = attributes?.[SERVER_MUTED_ATTRIBUTE] === '1';
  const targetRole = ROLES.find((r) => r === attributes?.[ROLE_ATTRIBUTE]) ?? 'GUEST';
  const target = { role: targetRole, isOwner: attributes?.[OWNER_ATTRIBUTE] === '1' };
  // The music bot isn't a member: no server mute, but local volume works on it like on anyone.
  const isBot = attributes?.[BOT_ATTRIBUTE] === '1';
  const showCamera = camera && !camera.publication.isMuted;

  return (
    <div
      data-participant={displayName}
      data-speaking={speaking}
      onContextMenu={(e) => {
        if (participant.isLocal) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
      className={cn(
        'group relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#232428] transition-shadow',
        compact ? 'h-24 w-40' : 'aspect-video w-full max-w-[360px] sm:w-[calc(50%-0.75rem)]',
        // Discord's active-speaker ring.
        speaking && 'ring-[3px] ring-status-online',
      )}
    >
      {showCamera ? (
        <VideoTrack
          trackRef={camera}
          className={cn('h-full w-full object-cover', participant.isLocal && '-scale-x-100')}
        />
      ) : isBot ? (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-status-online text-white',
            compact ? 'h-12 w-12' : 'h-20 w-20',
          )}
        >
          <Music className={compact ? 'h-6 w-6' : 'h-10 w-10'} />
        </span>
      ) : (
        <UserAvatar
          username={displayName}
          avatarUrl={parseAvatarUrl(metadata)}
          className={compact ? 'h-12 w-12' : 'h-20 w-20 text-2xl'}
        />
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-xs">
        <span className="truncate">{displayName}</span>
        {serverMuted ? (
          <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Sunucuda susturuldu" />
        ) : (
          micMuted && <MicOff className="h-3.5 w-3.5 shrink-0" aria-label="Mikrofon kapalı" />
        )}
        {audio.prefs.muted && <VolumeX className="h-3.5 w-3.5 shrink-0" aria-label="Yerel olarak susturuldu" />}
      </div>

      {!participant.isLocal && (
        <ParticipantMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          displayName={displayName}
          prefs={audio.prefs}
          onPrefsChange={audio.update}
          serverMute={
            !isBot && canServerMute(currentUser, target)
              ? { serverId, userId: participant.identity, muted: serverMuted }
              : null
          }
          disconnect={
            isBot
              ? { serverId, userId: participant.identity, label: 'Botu Kanaldan Çıkar' }
              : canServerMute(currentUser, target)
                ? { serverId, userId: participant.identity, label: 'Bağlantıyı Kes' }
                : null
          }
        >
          <button
            type="button"
            title="Kullanıcı ayarları"
            className={cn(
              'absolute right-2 top-2 rounded bg-black/60 p-1 transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
            )}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </ParticipantMenu>
      )}
    </div>
  );
}
