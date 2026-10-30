import { EventEmitter } from 'node:events';

import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';

import { CHANNELS, SAMPLE_RATE, spawnPcm, type ResolvedMedia } from '@/bot/media';
import { ReadAhead } from '@/bot/read-ahead';
import type { MusicState, MusicTrack } from '@/lib/music/types';

// Opus' own frame length: half the per-frame overhead of 10 ms frames.
const FRAME_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1000) * FRAME_MS;
const FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2; // s16le
const BYTES_PER_MS = FRAME_BYTES / FRAME_MS;
/**
 * Audio queued in LiveKit ahead of playout. This process also serves the
 * website, so a busy moment (a page render, a big query, garbage collection)
 * can hold up the feeding loop; with only 200 ms queued that ran the queue dry
 * and the gaps crackled. Pause and skip clear the queue, so a deep one costs
 * no responsiveness.
 */
const SOURCE_QUEUE_MS = 1000;
/** PCM read ahead from yt-dlp/ffmpeg, for download hiccups (~5.8 MB). */
const READ_AHEAD_MS = 30_000;
/** Buffered before a track starts, so it doesn't begin with a stutter. */
const PREBUFFER_MS = 1500;
/** Music, not speech: Opus at its default ~32–48 kbps smears and crackles. */
const MUSIC_BITRATE = BigInt(128_000);

export interface QueuedTrack {
  track: MusicTrack;
  media: ResolvedMedia;
  /** Start this far in (a track carried over by a move). */
  startMs?: number;
}

interface PlayerEvents {
  trackStart: [MusicTrack];
  trackError: [MusicTrack, Error];
  /** Queue ran dry. */
  idle: [];
  /**
   * Someone may have joined or left. A hint only: rtc-node 0.13 sometimes
   * drops participant events, so the service re-checks with the server API.
   */
  audience: [];
  /** Anything in getState() changed. */
  change: [];
  /** The bot lost the room (kicked, room deleted, network). */
  disconnected: [];
}

/**
 * One bot connection to one voice channel: a queue, and a loop that feeds
 * ffmpeg's PCM into a LiveKit audio track 10 ms at a time. captureFrame()
 * resolves only once the frame fits in the source's small buffer, which is
 * what paces playback in real time.
 */
export class MusicPlayer extends EventEmitter<PlayerEvents> {
  readonly room = new Room();
  private readonly source = new AudioSource(SAMPLE_RATE, CHANNELS, SOURCE_QUEUE_MS);
  private queue: QueuedTrack[] = [];
  private current: QueuedTrack | null = null;
  private paused = false;
  private resumeWaiter: (() => void) | null = null;
  private abortCurrent: (() => void) | null = null;
  private elapsedMs = 0;
  private running = false;
  private closed = false;

  constructor(
    readonly serverId: string,
    readonly voiceChannel: { id: string; name: string },
    /** Where the bot posts replies; follows the last command. */
    public textChannelId: string,
  ) {
    super();
  }

  async connect(url: string, token: string) {
    this.room
      .on(RoomEvent.ParticipantConnected, () => this.emit('audience'))
      .on(RoomEvent.ParticipantDisconnected, () => this.emit('audience'))
      .on(RoomEvent.Reconnecting, () => console.warn('[music] LiveKit connection lost, reconnecting', this.serverId))
      .on(RoomEvent.Reconnected, () => console.info('[music] LiveKit reconnected', this.serverId))
      .on(RoomEvent.Disconnected, () => {
        if (!this.closed) this.emit('disconnected');
      });
    // The bot never listens, so don't pull anyone's audio.
    await this.room.connect(url, token, { autoSubscribe: false, dynacast: false });
    const track = LocalAudioTrack.createAudioTrack('music', this.source);
    await this.room.localParticipant!.publishTrack(
      track,
      new TrackPublishOptions({
        source: TrackSource.SOURCE_MICROPHONE,
        dtx: false,
        // RED duplicates every packet for loss recovery: worth it for voice, not at music bitrates.
        red: false,
        audioEncoding: { maxBitrate: MUSIC_BITRATE },
      }),
    );
  }

  get isIdle() {
    return !this.current && this.queue.length === 0;
  }

  /**
   * Appends tracks; returns the first one's position counting the one playing
   * (1 = starts now). One `change` for the batch, not one per track.
   */
  enqueue(...items: QueuedTrack[]): number {
    const position = this.queue.length + (this.current ? 1 : 0) + 1;
    this.queue.push(...items);
    this.emit('change');
    if (!this.running) void this.run();
    return position;
  }

  /** The playing track (with where it got to) and the queue, for carrying over to a new player. */
  snapshot(): QueuedTrack[] {
    const current = this.current ? [{ ...this.current, startMs: this.elapsedMs }] : [];
    return [...current, ...this.queue];
  }

  /** Tracks waiting plus the one playing. */
  get size() {
    return this.queue.length + (this.current ? 1 : 0);
  }

  pause() {
    if (!this.current || this.paused) return false;
    this.paused = true;
    this.source.clearQueue();
    this.emit('change');
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.paused = false;
    this.resumeWaiter?.();
    this.resumeWaiter = null;
    this.emit('change');
    return true;
  }

  skip() {
    if (!this.current) return false;
    this.abortCurrent?.();
    return true;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    this.abortCurrent?.();
    this.resume();
    await this.source.close().catch(() => {});
    await this.room.disconnect().catch(() => {});
  }

  getState(): MusicState {
    return {
      serverId: this.serverId,
      voiceChannelId: this.voiceChannel.id,
      voiceChannelName: this.voiceChannel.name,
      nowPlaying: this.current?.track ?? null,
      paused: this.paused,
      elapsedMs: this.elapsedMs,
      emittedAt: Date.now(),
      queue: this.queue.map((q) => q.track),
    };
  }

  private async run() {
    this.running = true;
    while (!this.closed && this.queue.length > 0) {
      this.current = this.queue.shift()!;
      this.elapsedMs = this.current.startMs ?? 0;
      this.paused = false;
      this.emit('change');
      this.emit('trackStart', this.current.track);
      try {
        await this.play(this.current);
      } catch (err) {
        if (!this.closed) this.emit('trackError', this.current.track, err as Error);
      }
    }
    this.current = null;
    this.running = false;
    if (!this.closed) {
      this.emit('change');
      this.emit('idle');
    }
  }

  private async play(item: QueuedTrack): Promise<void> {
    const pcm = await spawnPcm(item.media, item.startMs);
    const ahead = new ReadAhead(pcm.stdout, READ_AHEAD_MS * BYTES_PER_MS);
    const startedAt = this.elapsedMs;
    let aborted = false;
    this.abortCurrent = () => {
      aborted = true;
      this.source.clearQueue();
      pcm.kill();
      // Wake a paused loop so it notices the abort.
      this.resumeWaiter?.();
    };

    // Underrun bookkeeping: when LiveKit's queue ran dry before the next frame,
    // and whether the download (nothing buffered) or this process (busy) was late.
    let queuedUntil = 0;
    const gaps = { download: 0, busy: 0, ms: 0 };

    try {
      await ahead.fill(PREBUFFER_MS * BYTES_PER_MS);
      for (;;) {
        if (this.paused && !aborted) {
          while (this.paused && !aborted) {
            await new Promise<void>((resolve) => (this.resumeWaiter = resolve));
          }
          queuedUntil = 0; // the queue was cleared on purpose
        }
        if (aborted) return;
        const bytes = await ahead.read(FRAME_BYTES);
        if (!bytes || aborted) break;

        const now = performance.now();
        if (queuedUntil && now > queuedUntil + FRAME_MS) {
          gaps.ms += now - queuedUntil;
          if (ahead.buffered < FRAME_BYTES) gaps.download++;
          else gaps.busy++;
        }
        queuedUntil = Math.max(now, queuedUntil) + FRAME_MS;

        // Copy into an aligned buffer; a Buffer can start at an odd offset.
        const samples = new Int16Array(SAMPLES_PER_FRAME * CHANNELS);
        new Uint8Array(samples.buffer).set(bytes);
        await this.source.captureFrame(new AudioFrame(samples, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME));
        this.elapsedMs += FRAME_MS;
      }
      const error = await pcm.finished;
      if (!aborted && error && item.media.info && this.elapsedMs === startedAt) {
        // The saved lookup didn't work (expired or changed URLs): look it up again.
        console.warn('[music] saved info failed, retrying with a fresh lookup:', error);
        item.media.info = undefined;
        this.abortCurrent = null;
        pcm.kill();
        return this.play(item);
      }
      if (!aborted && error) throw new Error(error);
      if (!aborted) await this.source.waitForPlayout();
    } finally {
      this.abortCurrent = null;
      pcm.kill(); // no-op once both have exited
      if (gaps.download + gaps.busy > 0) {
        console.warn(
          `[music] "${item.track.title}": ses ${gaps.download + gaps.busy} kez kesildi (toplam ${Math.round(gaps.ms)} ms; ` +
            `indirme yetişmedi: ${gaps.download}, sunucu meşguldü: ${gaps.busy})`,
        );
      }
    }
  }
}
