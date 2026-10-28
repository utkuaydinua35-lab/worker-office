// Music bot wire types, shared by the bot service, the API and the UI.

export interface MusicTrack {
  id: string;
  title: string;
  /** The page people can open (YouTube watch URL). */
  pageUrl: string;
  durationSec: number | null; // null when unknown (live streams, some direct links)
  thumbnail: string | null;
  requestedBy: { id: string; username: string };
}

export interface MusicState {
  serverId: string;
  voiceChannelId: string;
  voiceChannelName: string;
  nowPlaying: MusicTrack | null;
  paused: boolean;
  /** Position of nowPlaying when this state was emitted… */
  elapsedMs: number;
  /** …and when that was (epoch ms), so clients can run the clock locally. */
  emittedAt: number;
  queue: MusicTrack[];
}

export const MUSIC_ACTIONS = ['pause', 'resume', 'skip', 'stop'] as const;
export type MusicAction = (typeof MUSIC_ACTIONS)[number];

export function formatDuration(sec: number | null) {
  if (sec === null) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
