// How Route Handlers reach the music bot. The bot lives in the custom server
// process (src/bot, started by server.ts) and registers itself on globalThis;
// this module only holds types, so Next never bundles the bot's native
// LiveKit dependency.
import type { MemberRole } from '@prisma/client';

import type { MusicAction, MusicState } from '@/lib/music/types';

export interface MusicCaller {
  serverId: string;
  userId: string;
  username: string;
  role: MemberRole;
  isOwner: boolean;
}

export interface MusicService {
  /** A message starting with "!" in a server text channel. Replies are posted by the bot. */
  handleCommand(caller: MusicCaller & { textChannelId: string; content: string }): Promise<void>;
  /** The now-playing panel's buttons. */
  control(caller: MusicCaller, action: MusicAction): Promise<{ ok: true } | { ok: false; error: string }>;
  getState(serverId: string): MusicState | null;
}

const holder = globalThis as unknown as { __discordCloneMusic?: MusicService };

export function setMusicService(service: MusicService) {
  holder.__discordCloneMusic = service;
}

export function getMusicService(): MusicService | null {
  return holder.__discordCloneMusic ?? null;
}

/** Cheap pre-check so ordinary messages never reach the bot. */
export const looksLikeCommand = (content: string) => /^![\p{L}]/u.test(content);
