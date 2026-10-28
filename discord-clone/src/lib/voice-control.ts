// Voice moderation from the sidebar and the voice stage (client-safe).
import { apiFetch } from '@/lib/client-api';

export type VoiceControlRequest =
  | { action: 'disconnect'; userId: string }
  | { action: 'move'; userId: string; channelId: string }
  | { action: 'deafen'; userId: string; deafened: boolean };

/** `userId` is the LiveKit identity: a user id, or the music bot's identity. */
export const voiceControl = (serverId: string, body: VoiceControlRequest) =>
  apiFetch(`/api/servers/${serverId}/voice-control`, { method: 'POST', body: JSON.stringify(body) });
