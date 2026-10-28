'use client';

import { ListMusic, Loader2, Music, Pause, Play, SkipForward, Square } from 'lucide-react';
import { useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useElapsed, useMusicState } from '@/hooks/use-music-state';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { formatDuration, type MusicAction } from '@/lib/music/types';

/** Above the user panel while the bot plays in this server: track, progress, controls and the queue. */
export function NowPlayingPanel({ serverId }: { serverId: string }) {
  const state = useMusicState(serverId);
  const elapsedMs = useElapsed(state);
  const [pending, setPending] = useState<MusicAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state?.nowPlaying) return null;
  const track = state.nowPlaying;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const progress = track.durationSec ? Math.min(100, (elapsedSec / track.durationSec) * 100) : 0;

  async function control(action: MusicAction) {
    setPending(action);
    setError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/music`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="border-t border-black/30 bg-[#232428] px-2 pb-2 pt-2" data-now-playing={track.title}>
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary">
          {track.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <a
            href={track.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-semibold hover:underline"
            title={track.title}
          >
            {track.title}
          </a>
          <p className="truncate text-xs text-muted-foreground">
            {state.paused ? 'Duraklatıldı' : '🔊 ' + state.voiceChannelName} · {track.requestedBy.username}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <div className="h-1 overflow-hidden rounded bg-secondary">
          <div className="h-full bg-status-online transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatDuration(elapsedSec)}</span>
          <span>{formatDuration(track.durationSec)}</span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1">
        <IconButton
          label={state.paused ? 'Devam et' : 'Duraklat'}
          busy={pending === 'pause' || pending === 'resume'}
          onClick={() => void control(state.paused ? 'resume' : 'pause')}
        >
          {state.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </IconButton>
        <IconButton label="Geç" busy={pending === 'skip'} onClick={() => void control('skip')}>
          <SkipForward className="h-4 w-4" />
        </IconButton>
        <IconButton label="Durdur" busy={pending === 'stop'} onClick={() => void control('stop')}>
          <Square className="h-4 w-4" />
        </IconButton>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Sıra"
              aria-label="Sırayı göster"
              className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ListMusic className="h-4 w-4" />
              {state.queue.length}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-3 text-sm" aria-label="Müzik sırası">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Sıradakiler</p>
            {state.queue.length === 0 ? (
              <p className="text-muted-foreground">Sırada şarkı yok. !play ile ekle.</p>
            ) : (
              <ol className="max-h-64 space-y-1.5 overflow-y-auto">
                {state.queue.map((t, i) => (
                  <li key={`${t.id}-${i}`} className="flex gap-2">
                    <span className="w-5 shrink-0 text-right text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(t.durationSec)} · {t.requestedBy.username}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function IconButton({
  label,
  busy,
  onClick,
  children,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
