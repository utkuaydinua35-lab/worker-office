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
import type { MusicState, MusicTrack } from '@/lib/music/types';

const FRAME_MS = 10;
const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1000) * FRAME_MS;
const FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2; // s16le
// Small output buffer so pause and skip take effect almost immediately.
const SOURCE_QUEUE_MS = 200;

export interface QueuedTrack {
  track: MusicTrack;
  media: ResolvedMedia;
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
      .on(RoomEvent.Disconnected, () => {
        if (!this.closed) this.emit('disconnected');
      });
    // The bot never listens, so don't pull anyone's audio.
    await this.room.connect(url, token, { autoSubscribe: false, dynacast: false });
    const track = LocalAudioTrack.createAudioTrack('music', this.source);
    await this.room.localParticipant!.publishTrack(
      track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE, dtx: false }),
    );
  }

  get isIdle() {
    return !this.current && this.queue.length === 0;
  }

  /** Returns the track's position counting the one playing (1 = starts now). */
  enqueue(item: QueuedTrack): number {
    this.queue.push(item);
    const position = this.queue.length + (this.current ? 1 : 0);
    this.emit('change');
    if (!this.running) void this.run();
    return position;
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
      this.elapsedMs = 0;
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

  private async play(item: QueuedTrack) {
    const pcm = spawnPcm(item.media.pageUrl);
    let aborted = false;
    this.abortCurrent = () => {
      aborted = true;
      this.source.clearQueue();
      pcm.kill();
      // Wake a paused loop so it notices the abort.
      this.resumeWaiter?.();
    };

    try {
      let pending = Buffer.alloc(0);
      for await (const chunk of pcm.stdout as AsyncIterable<Buffer>) {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        let offset = 0;
        while (pending.length - offset >= FRAME_BYTES) {
          while (this.paused && !aborted) {
            // Not reading stdout while paused lets backpressure stall ffmpeg and yt-dlp.
            await new Promise<void>((resolve) => (this.resumeWaiter = resolve));
          }
          if (aborted) return;
          // Copy into an aligned buffer; a Buffer slice can start at an odd offset.
          const bytes = pending.subarray(offset, offset + FRAME_BYTES);
          const samples = new Int16Array(SAMPLES_PER_FRAME * CHANNELS);
          new Uint8Array(samples.buffer).set(bytes);
          await this.source.captureFrame(new AudioFrame(samples, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME));
          this.elapsedMs += FRAME_MS;
          offset += FRAME_BYTES;
        }
        pending = pending.subarray(offset);
        if (aborted) return;
      }
      const error = await pcm.finished;
      if (!aborted && error) throw new Error(error);
      if (!aborted) await this.source.waitForPlayout();
    } finally {
      this.abortCurrent = null;
      pcm.kill(); // no-op once both have exited
    }
  }
}
