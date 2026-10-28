// Who is in which voice channel, as last seen by the presence poller
// (src/services/voice-presence.ts, running in the custom server process).
// Server Components read it through globalThis, like the Socket.io server.

import type { MemberRole } from '@prisma/client';

export interface VoiceMember {
  id: string; // user id, or the bot's identity
  name: string;
  avatarUrl: string | null;
  isBot: boolean;
  micMuted: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  /** From the token's attributes; only decides which menu items to show. */
  role: MemberRole;
  isOwner: boolean;
}

/** channelId → members, for one server. Channels nobody is in are absent. */
export type VoiceChannelsState = Record<string, VoiceMember[]>;

const holder = globalThis as unknown as { __discordCloneVoice?: Map<string, VoiceChannelsState> };

export const voiceStateStore = () => (holder.__discordCloneVoice ??= new Map());

export function getServerVoiceState(serverId: string): VoiceChannelsState {
  return voiceStateStore().get(serverId) ?? {};
}
