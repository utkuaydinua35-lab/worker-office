import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';

/**
 * yt-dlp finds the track and downloads its audio; ffmpeg decodes that to raw
 * PCM for LiveKit. Both are external programs (`brew install yt-dlp ffmpeg`;
 * yt-dlp also wants a JS runtime such as deno for YouTube); YTDLP_PATH /
 * FFMPEG_PATH override the binaries.
 */

export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const RESOLVE_TIMEOUT_MS = 30_000;
const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com', 'www.youtube.com'];

export interface ResolvedMedia {
  id: string;
  title: string;
  /** What playback hands back to yt-dlp (the watch URL for YouTube). */
  pageUrl: string;
  durationSec: number | null;
  thumbnail: string | null;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

let toolsCheck: Promise<string | null> | null = null;

/** null when both tools run; otherwise a message saying which one is missing. Cached. */
export function checkTools(): Promise<string | null> {
  toolsCheck ??= (async () => {
    const missing: string[] = [];
    for (const [name, cmd, arg] of [
      ['yt-dlp', YTDLP, '--version'],
      ['ffmpeg', FFMPEG, '-version'],
    ] as const) {
      try {
        const { code } = await run(cmd, [arg], 10_000);
        if (code !== 0) missing.push(name);
      } catch {
        missing.push(name);
      }
    }
    return missing.length ? `Sunucuda ${missing.join(' ve ')} kurulu değil.` : null;
  })();
  return toolsCheck;
}

/**
 * Which hosts !play accepts links from. yt-dlp fetches whatever it's given,
 * from the server, so an open URL would let anyone make the server request
 * internal addresses. MUSIC_EXTRA_URL_HOSTS (comma-separated) adds more.
 */
function allowedHosts() {
  const extra = (process.env.MUSIC_EXTRA_URL_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...YOUTUBE_HOSTS, ...extra];
}

export interface YtDlpTarget {
  target: string;
  /** A playlist link (`list=` in the URL): queue every entry. */
  playlist: boolean;
  /** For `watch?v=X&list=Y`: start the playlist at X, as YouTube does. */
  startId: string | null;
}

/** The argument to hand yt-dlp for a user query, or an error message. */
export function toYtDlpTarget(query: string): YtDlpTarget | { error: string } {
  if (!/^https?:\/\//i.test(query)) return { target: `ytsearch1:${query}`, playlist: false, startId: null };
  let url: URL;
  try {
    url = new URL(query);
  } catch {
    return { error: 'Geçersiz bağlantı.' };
  }
  const host = url.hostname.toLowerCase();
  const ok = allowedHosts().some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) return { error: 'Yalnızca YouTube bağlantıları ya da arama destekleniyor.' };
  return {
    target: query,
    playlist: !!url.searchParams.get('list'),
    startId: url.searchParams.get('v'),
  };
}

const ytDlpError = (stderr: string) =>
  stderr
    .split('\n')
    .find((l) => l.startsWith('ERROR:'))
    ?.replace(/^ERROR:\s*/, '');

export interface ResolvedPlaylist {
  title: string;
  entries: ResolvedMedia[];
  /** Private, deleted or otherwise unplayable entries left out. */
  skipped: number;
}

const PLAYLIST_TIMEOUT_MS = 60_000;
const UNAVAILABLE_TITLE = /^\[(private|deleted|unavailable)[^\]]*\]$/i;

/**
 * Lists a playlist's entries without opening each video (`--flat-playlist`),
 * so even long lists come back in a couple of seconds. Each entry is resolved
 * properly when its turn comes.
 */
export async function resolvePlaylist(target: string): Promise<ResolvedPlaylist> {
  const { code, stdout, stderr } = await run(
    YTDLP,
    ['--yes-playlist', '--flat-playlist', '--dump-single-json', '--no-warnings', '--', target],
    PLAYLIST_TIMEOUT_MS,
  );
  if (code !== 0) throw new Error(ytDlpError(stderr) ?? 'yt-dlp başarısız oldu');

  const info = JSON.parse(stdout) as Record<string, unknown>;
  const raw = Array.isArray(info.entries) ? (info.entries as Record<string, unknown>[]) : [];
  const entries: ResolvedMedia[] = [];
  for (const e of raw) {
    const id = typeof e.id === 'string' ? e.id : null;
    const title = typeof e.title === 'string' ? e.title : null;
    if (!id || !title || UNAVAILABLE_TITLE.test(title)) continue;
    const thumbnails = Array.isArray(e.thumbnails) ? (e.thumbnails as { url?: unknown }[]) : [];
    const thumbnail = thumbnails.at(-1)?.url;
    entries.push({
      id,
      title,
      pageUrl:
        typeof e.url === 'string' && /^https?:\/\//.test(e.url) ? e.url : `https://www.youtube.com/watch?v=${id}`,
      durationSec: typeof e.duration === 'number' ? e.duration : null,
      thumbnail: typeof thumbnail === 'string' ? thumbnail : null,
    });
  }
  if (entries.length === 0) throw new Error('Çalma listesinde çalınabilir şarkı yok');
  return { title: String(info.title ?? 'Çalma listesi'), entries, skipped: raw.length - entries.length };
}

/** Looks the track up (title, length, thumbnail). Nothing is downloaded yet. */
export async function resolveMedia(target: string): Promise<ResolvedMedia> {
  const { code, stdout, stderr } = await run(
    YTDLP,
    // `--` ends option parsing, so a query starting with "-" can't become a flag.
    ['--no-playlist', '--dump-single-json', '--no-warnings', '--', target],
    RESOLVE_TIMEOUT_MS,
  );
  if (code !== 0) throw new Error(ytDlpError(stderr) ?? 'yt-dlp başarısız oldu');

  let info = JSON.parse(stdout) as Record<string, unknown>;
  // Searches come back as a one-entry playlist.
  if (Array.isArray(info.entries)) {
    if (info.entries.length === 0) throw new Error('Sonuç bulunamadı');
    info = info.entries[0] as Record<string, unknown>;
  }
  const pageUrl = String(info.webpage_url ?? info.original_url ?? '');
  if (!pageUrl) throw new Error('Çalınabilir ses bulunamadı');

  return {
    id: String(info.id ?? pageUrl),
    title: String(info.title ?? 'Bilinmeyen parça'),
    pageUrl,
    durationSec: typeof info.duration === 'number' ? info.duration : null,
    thumbnail: typeof info.thumbnail === 'string' ? info.thumbnail : null,
  };
}

export interface PcmPipeline {
  /** s16le, 48 kHz, stereo. */
  stdout: Readable;
  kill(): void;
  /** Resolves with null on a clean finish, or the most useful error line. */
  finished: Promise<string | null>;
}

const exitCode = (child: ChildProcess) =>
  new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('close', resolve);
  });

/**
 * yt-dlp → ffmpeg → PCM. yt-dlp does the download itself: YouTube answers
 * 403 when anything else fetches the media URL it resolved (the request has
 * to come in yt-dlp's own chunked, signed form).
 */
export function spawnPcm(pageUrl: string, startMs = 0): PcmPipeline {
  const ytdlp = spawn(
    YTDLP,
    ['-f', 'bestaudio/best', '--no-playlist', '--quiet', '--no-warnings', '-o', '-', '--', pageUrl],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const ffmpeg = spawn(
    FFMPEG,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      // A pipe can't seek: ffmpeg decodes up to here and drops it (resuming after a move).
      ...(startMs > 0 ? ['-ss', (startMs / 1000).toFixed(2)] : []),
      '-vn',
      '-f',
      's16le',
      '-ac',
      String(CHANNELS),
      '-ar',
      String(SAMPLE_RATE),
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  ytdlp.stdout.pipe(ffmpeg.stdin);
  // Killing one end mid-stream breaks the pipe; that's expected on skip/stop.
  ffmpeg.stdin.on('error', () => {});
  ytdlp.stdout.on('error', () => {});

  let ytErr = '';
  let ffErr = '';
  ytdlp.stderr.on('data', (d) => (ytErr += d));
  ffmpeg.stderr.on('data', (d) => (ffErr += d));

  const finished = Promise.all([exitCode(ytdlp), exitCode(ffmpeg)]).then(([y, f]) => {
    if (y === 0 && f === 0) return null;
    return ytDlpError(ytErr) ?? (ffErr.trim().split('\n').pop() || `yt-dlp ${y}, ffmpeg ${f}`);
  });

  return {
    stdout: ffmpeg.stdout,
    kill: () => {
      ytdlp.kill('SIGKILL');
      ffmpeg.kill('SIGKILL');
    },
    finished,
  };
}
