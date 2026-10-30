import type { Readable } from 'node:stream';

/**
 * Reads a PCM stream ahead of playback, so a slow patch in the download
 * (YouTube throttling, a network hiccup) is absorbed by what's already
 * buffered instead of becoming a gap in the audio. Stops reading — and lets
 * backpressure pause yt-dlp and ffmpeg — once `maxBytes` are waiting.
 */
export class ReadAhead {
  private chunks: Buffer[] = [];
  private size = 0;
  private ended = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly stream: Readable,
    private readonly maxBytes: number,
  ) {
    stream.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.size += chunk.length;
      if (this.size >= this.maxBytes) stream.pause();
      this.notify();
    });
    const end = () => {
      this.ended = true;
      this.notify();
    };
    stream.once('end', end);
    stream.once('close', end);
    stream.once('error', end);
  }

  get buffered() {
    return this.size;
  }

  /** Waits until `bytes` are buffered or the stream ended. */
  async fill(bytes: number) {
    while (this.size < bytes && !this.ended) await new Promise<void>((r) => (this.wake = r));
  }

  /** Exactly `bytes` bytes, or null at the end (a trailing partial frame is dropped). */
  async read(bytes: number): Promise<Buffer | null> {
    await this.fill(bytes);
    if (this.size < bytes) return null;
    const out = Buffer.allocUnsafe(bytes);
    let filled = 0;
    while (filled < bytes) {
      const head = this.chunks[0];
      const take = Math.min(head.length, bytes - filled);
      head.copy(out, filled, 0, take);
      filled += take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
    }
    this.size -= bytes;
    if (this.size < this.maxBytes / 2 && this.stream.isPaused() && !this.ended) this.stream.resume();
    return out;
  }

  private notify() {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}
