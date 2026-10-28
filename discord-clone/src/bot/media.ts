import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

/**
 * yt-dlp resolves a YouTube link or search to a direct audio URL; ffmpeg
 * decodes that to raw PCM for LiveKit. Both are external programs
 * (`brew install yt-dlp ffmpeg`); YTDLP_PATH / FFMPEG_PATH override the
 * binaries.
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
  pageUrl: string;
  durationSec: number | null;
  thumbnail: string | null;
  /** Direct media URL; googlevideo links expire after a few hours. */
  streamUrl: string;
  httpHeaders: Record<string, string>;
  resolvedAt: number;
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

/** The argument to hand yt-dlp for a user query, or an error message. */
export function toYtDlpTarget(query: string): { target: string } | { error: string } {
  if (!/^https?:\/\//i.test(query)) return { target: `ytsearch1:${query}` };
  let host: string;
  try {
    host = new URL(query).hostname.toLowerCase();
  } catch {
    return { error: 'Geçersiz bağlantı.' };
  }
  const ok = allowedHosts().some((h) => host === h || host.endsWith(`.${h}`));
  return ok ? { target: query } : { error: 'Yalnızca YouTube bağlantıları ya da arama destekleniyor.' };
}

/** Looks the track up and picks its best audio format. */
export async function resolveMedia(target: string): Promise<ResolvedMedia> {
  const { code, stdout, stderr } = await run(
    YTDLP,
    // `--` ends option parsing, so a query starting with "-" can't become a flag.
    ['-f', 'bestaudio/best', '--no-playlist', '--dump-single-json', '--no-warnings', '--', target],
    RESOLVE_TIMEOUT_MS,
  );
  if (code !== 0) {
    const reason = stderr.split('\n').find((l) => l.startsWith('ERROR:')) ?? 'yt-dlp başarısız oldu';
    throw new Error(reason.replace(/^ERROR:\s*/, ''));
  }

  let info = JSON.parse(stdout) as Record<string, unknown>;
  // Searches come back as a one-entry playlist.
  if (Array.isArray(info.entries)) {
    if (info.entries.length === 0) throw new Error('Sonuç bulunamadı');
    info = info.entries[0] as Record<string, unknown>;
  }
  const streamUrl = typeof info.url === 'string' ? info.url : null;
  if (!streamUrl) throw new Error('Çalınabilir ses bulunamadı');

  return {
    id: String(info.id ?? streamUrl),
    title: String(info.title ?? 'Bilinmeyen parça'),
    pageUrl: String(info.webpage_url ?? info.original_url ?? target),
    durationSec: typeof info.duration === 'number' ? info.duration : null,
    thumbnail: typeof info.thumbnail === 'string' ? info.thumbnail : null,
    streamUrl,
    httpHeaders: (info.http_headers as Record<string, string> | undefined) ?? {},
    resolvedAt: Date.now(),
  };
}

export type PcmProcess = ChildProcessByStdio<null, Readable, Readable>;

/** ffmpeg decoding the stream to s16le 48 kHz stereo on stdout. */
export function spawnPcm(media: ResolvedMedia): PcmProcess {
  const headers = Object.entries(media.httpHeaders)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('');
  return spawn(
    FFMPEG,
    [
      '-hide_banner',
      '-loglevel', 'error',
      // Long tracks and pauses outlive single HTTP connections; let ffmpeg resume.
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      ...(headers ? ['-headers', headers] : []),
      '-i', media.streamUrl,
      '-vn',
      '-f', 's16le',
      '-ac', String(CHANNELS),
      '-ar', String(SAMPLE_RATE),
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
