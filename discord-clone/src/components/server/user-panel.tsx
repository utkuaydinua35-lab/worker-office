'use client';

import { StartAudio } from '@livekit/components-react';
import type { UserStatus } from '@prisma/client';
import { HeadphoneOff, Headphones, Loader2, Mic, MicOff, PhoneOff, Settings, Signal } from 'lucide-react';
import Link from 'next/link';

import { useVoice } from '@/components/providers/voice-provider';
import { UserAvatar } from '@/components/user/user-avatar';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: 'Çevrimiçi',
  IDLE: 'Boşta',
  DND: 'Rahatsız Etmeyin',
  OFFLINE: 'Görünmez',
};

interface UserPanelProps {
  user: { username: string; avatarUrl: string | null; status: UserStatus; customStatus: string | null };
}

/** Bottom of the channel / DM column: voice connection box, then avatar with mic, headphones and settings. */
export function UserPanel({ user }: UserPanelProps) {
  const voice = useVoice();
  const micOff = voice.selfMuted || voice.deafened || voice.serverMuted;

  return (
    <div className="bg-[#232428]">
      {voice.channel && (
        <div className="border-b border-black/30 px-2 py-2" data-voice-panel>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'flex items-center gap-1 text-sm font-semibold',
                  voice.status === 'connected' ? 'text-status-online' : 'text-status-idle',
                )}
              >
                {voice.status === 'connected' ? (
                  <Signal className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {voice.status === 'connected' ? 'Ses Bağlandı' : 'Bağlanıyor...'}
              </p>
              <Link
                href={`/servers/${voice.channel.serverId}/channels/${voice.channel.id}`}
                className="block truncate text-xs text-muted-foreground hover:underline"
              >
                {voice.channel.name} / {voice.channel.serverName}
              </Link>
            </div>
            <button
              type="button"
              title="Bağlantıyı kes"
              aria-label="Ses bağlantısını kes"
              onClick={voice.leave}
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
          {/* Browsers block audio until a user gesture; this shows only when that's the case. */}
          <StartAudio
            label="Sesi duymak için tıkla"
            className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
          />
        </div>
      )}
      {!voice.channel && voice.error && (
        <p className="border-b border-black/30 px-2 py-1.5 text-xs text-destructive">{voice.error}</p>
      )}

      <div className="flex items-center gap-1 px-2 py-2">
        <UserAvatar
          username={user.username}
          avatarUrl={user.avatarUrl}
          status={user.status}
          className="h-8 w-8 text-xs"
        />
        <div className="ml-1 min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{user.username}</p>
          <p className="truncate text-xs text-muted-foreground">{user.customStatus || STATUS_LABEL[user.status]}</p>
        </div>
        <PanelButton
          label={voice.serverMuted ? 'Sunucuda susturuldun' : micOff ? 'Sesi aç' : 'Sustur'}
          onClick={voice.toggleMute}
          disabled={voice.serverMuted}
          danger={micOff}
        >
          {micOff ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic
              className={cn(
                'h-4 w-4',
                voice.pushToTalk.enabled && voice.channel && voice.talking && 'text-status-online',
              )}
            />
          )}
        </PanelButton>
        <PanelButton
          label={
            voice.serverDeafened
              ? 'Sunucuda sağırlaştırıldın'
              : voice.deafened
                ? 'Sağırlaştırmayı kaldır'
                : 'Sağırlaştır'
          }
          onClick={voice.toggleDeafen}
          disabled={voice.serverDeafened}
          danger={voice.deafened || voice.serverDeafened}
        >
          {voice.deafened || voice.serverDeafened ? (
            <HeadphoneOff className="h-4 w-4" />
          ) : (
            <Headphones className="h-4 w-4" />
          )}
        </PanelButton>
        <Link
          href="/settings"
          title="Kullanıcı Ayarları"
          aria-label="Kullanıcı Ayarları"
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function PanelButton({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={danger}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded p-1.5 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60',
        danger ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
