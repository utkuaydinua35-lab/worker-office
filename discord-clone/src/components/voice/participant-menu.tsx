'use client';

import { HeadphoneOff, Loader2, MicOff, PhoneOff } from 'lucide-react';
import { useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { VOLUME_MAX, VOLUME_MIN, type LocalAudioPrefs } from '@/hooks/use-local-audio-prefs';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { voiceControl } from '@/lib/voice-control';

interface ParticipantMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  prefs: LocalAudioPrefs;
  onPrefsChange: (patch: Partial<LocalAudioPrefs>) => void;
  /** Present only when the current user may server-mute this participant. */
  serverMute: { serverId: string; userId: string; muted: boolean } | null;
  /** Present when the current user may server-deafen this participant. */
  serverDeafen: { serverId: string; userId: string; deafened: boolean } | null;
  /** Present when the current user may disconnect this participant (or stop the bot). */
  disconnect: { serverId: string; userId: string; label: string } | null;
  children: React.ReactNode;
}

/** Discord's per-user menu: local volume 0–200%, local mute, and server mute for moderators. */
export function ParticipantMenu({
  open,
  onOpenChange,
  displayName,
  prefs,
  onPrefsChange,
  serverMute,
  serverDeafen,
  disconnect,
  children,
}: ParticipantMenuProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleServerMute() {
    if (!serverMute) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/servers/${serverMute.serverId}/voice-mute`, {
        method: 'POST',
        body: JSON.stringify({ userId: serverMute.userId, muted: !serverMute.muted }),
      });
      // The icon updates from the participant attribute LiveKit pushes back.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleServerDeafen() {
    if (!serverDeafen) return;
    setBusy(true);
    setError(null);
    try {
      await voiceControl(serverDeafen.serverId, {
        action: 'deafen',
        userId: serverDeafen.userId,
        deafened: !serverDeafen.deafened,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runDisconnect() {
    if (!disconnect) return;
    setBusy(true);
    setError(null);
    try {
      await voiceControl(disconnect.serverId, { action: 'disconnect', userId: disconnect.userId });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3 p-3 text-sm" aria-label={`${displayName} ses ayarları`}>
        <p className="truncate font-semibold">{displayName}</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
            <label htmlFor={`volume-${displayName}`}>Kullanıcı Ses Seviyesi</label>
            <span>%{prefs.volume}</span>
          </div>
          <input
            id={`volume-${displayName}`}
            type="range"
            min={VOLUME_MIN}
            max={VOLUME_MAX}
            step={1}
            value={prefs.volume}
            disabled={prefs.muted}
            onChange={(e) => onPrefsChange({ volume: Number(e.target.value) })}
            className="w-full accent-primary disabled:opacity-40"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 hover:bg-secondary">
          Yerel olarak sustur
          <input
            type="checkbox"
            checked={prefs.muted}
            onChange={(e) => onPrefsChange({ muted: e.target.checked })}
            className="h-4 w-4 accent-destructive"
          />
        </label>

        {(serverMute || disconnect) && <div className="h-px bg-border" />}
        {serverMute && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleServerMute()}
            className="flex w-full items-center justify-between rounded px-1 py-1 text-destructive hover:bg-secondary disabled:opacity-50"
          >
            {serverMute.muted ? 'Sunucu susturmasını kaldır' : 'Sunucuda sustur'}
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicOff className="h-4 w-4" />}
          </button>
        )}
        {serverDeafen && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleServerDeafen()}
            className="flex w-full items-center justify-between rounded px-1 py-1 text-destructive hover:bg-secondary disabled:opacity-50"
          >
            {serverDeafen.deafened ? 'Sağırlaştırmayı kaldır' : 'Sunucuda sağırlaştır'}
            <HeadphoneOff className="h-4 w-4" />
          </button>
        )}
        {disconnect && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDisconnect()}
            className="flex w-full items-center justify-between rounded px-1 py-1 text-destructive hover:bg-secondary disabled:opacity-50"
          >
            {disconnect.label}
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
          </button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
