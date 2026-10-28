import { AccessToken } from 'livekit-server-sdk';

import { BOT_USERNAME } from '@/bot/bot-user';
import { HELP_TEXT, parseCommand } from '@/bot/commands';
import { checkTools, resolveMedia, toYtDlpTarget } from '@/bot/media';
import { MusicPlayer } from '@/bot/player';
import { db } from '@/lib/db';
import { livekitConfig, roomService, voiceRoomName } from '@/lib/livekit';
import { messageSelect, toMessageDTO } from '@/lib/messages';
import type { MusicCaller, MusicService } from '@/lib/music/bridge';
import { formatDuration, type MusicAction, type MusicState, type MusicTrack } from '@/lib/music/types';
import { canManageChannels } from '@/lib/roles';
import { emitMessage, emitMusicState } from '@/lib/socket/emit';
import { BOT_ATTRIBUTE } from '@/lib/voice-attributes';

export const BOT_IDENTITY = 'music-bot';
const MAX_QUEUE = 50;
const IDLE_LEAVE_MS = 2 * 60 * 1000; // queue empty
const ALONE_LEAVE_MS = 30 * 1000; // nobody left listening
const AUDIENCE_POLL_MS = 5 * 1000;

type LeaveReason = 'idle' | 'alone';

type Reply = (text: string) => Promise<void>;
type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const done = (message: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

/**
 * One MusicPlayer per server (like one Discord bot per guild, in one voice
 * channel at a time). Commands arrive from the messages API through the
 * bridge; replies are ordinary messages authored by the bot user.
 */
export class DiscordCloneMusicService implements MusicService {
  private readonly players = new Map<string, MusicPlayer>();
  private readonly leaveTimers = new Map<string, { reason: LeaveReason; timer: ReturnType<typeof setTimeout> }>();
  private readonly audienceWatchers = new Map<string, ReturnType<typeof setInterval>>();
  // Serializes commands per server so two quick !play's can't create two players.
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly botUserId: string) {}

  getState(serverId: string): MusicState | null {
    return this.players.get(serverId)?.getState() ?? null;
  }

  async handleCommand(ctx: MusicCaller & { textChannelId: string; content: string }) {
    const command = parseCommand(ctx.content);
    if (!command) return;
    const reply: Reply = (text) => this.post(ctx.textChannelId, text);

    await this.withLock(ctx.serverId, async () => {
      switch (command.name) {
        case 'help':
          return reply(HELP_TEXT);
        case 'queue':
          return reply(this.describeQueue(ctx.serverId));
        case 'play':
          return this.play(ctx, command.query, reply);
        default: {
          const player = this.players.get(ctx.serverId);
          if (player) player.textChannelId = ctx.textChannelId;
          const result = await this.apply(ctx, command.name, player);
          return reply(result.ok ? result.message : `❌ ${result.error}`);
        }
      }
    });
  }

  async control(caller: MusicCaller, action: MusicAction) {
    return this.withLock(caller.serverId, async () => {
      const player = this.players.get(caller.serverId);
      const result = await this.apply(caller, action, player);
      if (!result.ok) return result;
      if (player) await this.post(player.textChannelId, `${result.message} (${caller.username})`);
      return { ok: true as const };
    });
  }

  async shutdown() {
    await Promise.all([...this.players.keys()].map((serverId) => this.destroy(serverId)));
  }

  // ─── Commands ──────────────────────────────────────────────────────────

  private async play(ctx: MusicCaller & { textChannelId: string }, query: string, reply: Reply) {
    if (!query) return reply('Kullanım: !play <YouTube linki veya arama>');
    const toolsError = await checkTools();
    if (toolsError) return reply(`❌ ${toolsError}`);
    if (!livekitConfig()) return reply('❌ Ses sunucusu yapılandırılmamış.');

    const target = toYtDlpTarget(query);
    if ('error' in target) return reply(`❌ ${target.error}`);

    const voiceChannel = await this.findUserVoiceChannel(ctx.serverId, ctx.userId);
    if (!voiceChannel) return reply('🔇 Önce bu sunucuda bir ses kanalına katılmalısın.');

    let player = this.players.get(ctx.serverId);
    if (player && player.voiceChannel.id !== voiceChannel.id) {
      return reply(`🎧 Şu an ${player.voiceChannel.name} kanalında çalıyorum; oraya katıl.`);
    }
    if (player && player.getState().queue.length >= MAX_QUEUE) {
      return reply(`❌ Sıra dolu (en fazla ${MAX_QUEUE} şarkı).`);
    }

    let media;
    try {
      media = await resolveMedia(target.target);
    } catch (err) {
      return reply(`❌ Bulunamadı: ${(err as Error).message}`);
    }

    if (!player) {
      try {
        player = await this.createPlayer(ctx.serverId, voiceChannel, ctx.textChannelId);
      } catch (err) {
        console.error('[music] connect failed', err);
        return reply('❌ Ses kanalına bağlanamadım.');
      }
    }
    player.textChannelId = ctx.textChannelId;
    this.cancelLeave(ctx.serverId);

    const track: MusicTrack = {
      id: media.id,
      title: media.title,
      pageUrl: media.pageUrl,
      durationSec: media.durationSec,
      thumbnail: media.thumbnail,
      requestedBy: { id: ctx.userId, username: ctx.username },
    };
    const position = player.enqueue({ track, media });
    // Position 1 starts right away; the trackStart handler announces it.
    if (position > 1) await reply(`➕ Sıraya eklendi (#${position - 1}): ${track.title} [${formatDuration(track.durationSec)}]`);
  }

  /** pause / resume / skip / stop, shared by commands and panel buttons. */
  private async apply(
    caller: MusicCaller,
    action: MusicAction,
    player: MusicPlayer | undefined,
  ): Promise<ActionResult> {
    if (!player || (player.isIdle && action !== 'stop')) return fail('Şu an bir şey çalmıyor.');

    // Discord-bot convention: control it from its channel, unless you moderate.
    const moderator = caller.isOwner || canManageChannels(caller.role);
    if (!moderator && !(await this.isInRoom(player.voiceChannel.id, caller.userId))) {
      return fail(`Bunun için ${player.voiceChannel.name} kanalında olmalısın.`);
    }

    switch (action) {
      case 'pause':
        return player.pause() ? done('⏸️ Duraklatıldı.') : fail('Zaten duraklatılmış.');
      case 'resume':
        return player.resume() ? done('▶️ Devam ediyor.') : fail('Duraklatılmış değil.');
      case 'skip':
        return player.skip() ? done('⏭️ Geçildi.') : fail('Geçilecek şarkı yok.');
      case 'stop':
        await this.destroy(caller.serverId);
        return done('⏹️ Durduruldu, kanaldan ayrıldım.');
    }
  }

  private describeQueue(serverId: string) {
    const state = this.getState(serverId);
    if (!state?.nowPlaying) return '📭 Sıra boş.';
    const lines = [`🎵 Şimdi: ${state.nowPlaying.title} [${formatDuration(state.nowPlaying.durationSec)}]${state.paused ? ' (duraklatıldı)' : ''}`];
    if (state.queue.length === 0) lines.push('Sırada başka şarkı yok.');
    state.queue.slice(0, 10).forEach((t, i) =>
      lines.push(`${i + 1}. ${t.title} [${formatDuration(t.durationSec)}] — ${t.requestedBy.username}`),
    );
    if (state.queue.length > 10) lines.push(`…ve ${state.queue.length - 10} şarkı daha`);
    return lines.join('\n');
  }

  // ─── Player lifecycle ──────────────────────────────────────────────────

  private async createPlayer(serverId: string, voiceChannel: { id: string; name: string }, textChannelId: string) {
    const cfg = livekitConfig()!;
    const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: BOT_IDENTITY,
      name: BOT_USERNAME,
      attributes: { [BOT_ATTRIBUTE]: '1' },
      ttl: '12h',
    });
    token.addGrant({
      roomJoin: true,
      room: voiceRoomName(voiceChannel.id),
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
    });

    const player = new MusicPlayer(serverId, voiceChannel, textChannelId);
    await player.connect(cfg.wsUrl, await token.toJwt());
    this.players.set(serverId, player);

    player.on('change', () => emitMusicState(serverId, player.getState()));
    player.on('trackStart', (t) =>
      void this.post(
        player.textChannelId,
        `🎵 Şimdi çalıyor: ${t.title} [${formatDuration(t.durationSec)}] — isteyen: ${t.requestedBy.username}\n${t.pageUrl}`,
      ),
    );
    player.on('trackError', (t, err) => {
      console.warn('[music] track failed', t.title, err.message);
      void this.post(player.textChannelId, `❌ Çalınamadı: ${t.title} (${err.message})`);
    });
    player.on('idle', () => this.scheduleLeave(serverId, 'idle'));
    player.on('audience', () => void this.checkAudience(serverId));
    player.on('disconnected', () => void this.destroy(serverId));
    this.audienceWatchers.set(serverId, setInterval(() => void this.checkAudience(serverId), AUDIENCE_POLL_MS));

    emitMusicState(serverId, player.getState());
    return player;
  }

  private scheduleLeave(serverId: string, reason: LeaveReason) {
    this.cancelLeave(serverId);
    const [ms, message] =
      reason === 'idle'
        ? [IDLE_LEAVE_MS, '👋 Sıra bitti, kanaldan ayrıldım.']
        : [ALONE_LEAVE_MS, '👋 Kanalda kimse kalmadı, ayrıldım.'];
    const timer = setTimeout(() => {
      const player = this.players.get(serverId);
      if (!player) return;
      void this.destroy(serverId).then(() => this.post(player.textChannelId, message));
    }, ms);
    this.leaveTimers.set(serverId, { reason, timer });
  }

  private cancelLeave(serverId: string) {
    clearTimeout(this.leaveTimers.get(serverId)?.timer);
    this.leaveTimers.delete(serverId);
  }

  /** Leave soon once nobody but the bot is in the room; stay if someone comes back. */
  private async checkAudience(serverId: string) {
    const player = this.players.get(serverId);
    const rooms = roomService();
    if (!player || !rooms) return;
    let listeners: number;
    try {
      const participants = await rooms.listParticipants(voiceRoomName(player.voiceChannel.id));
      listeners = participants.filter((p) => p.identity !== BOT_IDENTITY).length;
    } catch {
      return; // LiveKit unreachable for a moment; try again next tick
    }
    const pending = this.leaveTimers.get(serverId)?.reason;
    if (listeners === 0 && pending !== 'alone') this.scheduleLeave(serverId, 'alone');
    else if (listeners > 0 && pending === 'alone') {
      // Back to normal: idle-leave if the queue is empty, otherwise keep playing.
      if (player.isIdle) this.scheduleLeave(serverId, 'idle');
      else this.cancelLeave(serverId);
    }
  }

  private async destroy(serverId: string) {
    this.cancelLeave(serverId);
    clearInterval(this.audienceWatchers.get(serverId));
    this.audienceWatchers.delete(serverId);
    const player = this.players.get(serverId);
    if (!player) return;
    this.players.delete(serverId);
    await player.close();
    emitMusicState(serverId, null);
  }

  // ─── LiveKit lookups ───────────────────────────────────────────────────

  /** The server's voice channel the user is in right now, per LiveKit. */
  private async findUserVoiceChannel(serverId: string, userId: string) {
    const channels = await db.channel.findMany({
      where: { serverId, type: 'VOICE' },
      select: { id: true, name: true },
    });
    for (const channel of channels) {
      if (await this.isInRoom(channel.id, userId)) return channel;
    }
    return null;
  }

  private async isInRoom(voiceChannelId: string, userId: string) {
    const rooms = roomService();
    if (!rooms) return false;
    try {
      const participants = await rooms.listParticipants(voiceRoomName(voiceChannelId));
      return participants.some((p) => p.identity === userId);
    } catch {
      return false; // room doesn't exist yet
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async post(textChannelId: string, content: string) {
    try {
      const row = await db.message.create({
        data: { content, userId: this.botUserId, channelId: textChannelId },
        select: messageSelect,
      });
      emitMessage('channel', 'message:new', toMessageDTO(row));
    } catch (err) {
      // The channel may have been deleted meanwhile.
      console.warn('[music] reply failed', err);
    }
  }

  private withLock<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(serverId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(serverId, next);
    void next.finally(() => {
      if (this.locks.get(serverId) === next) this.locks.delete(serverId);
    });
    return next;
  }
}
