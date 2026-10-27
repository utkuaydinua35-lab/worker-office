// Shared between the Socket.io server (server.ts) and the browser client.
// Type-only imports keep this module free of runtime dependencies.
import type { MessageDTO } from '@/lib/messages';

export const SOCKET_PATH = '/api/socket';

export interface TypingPayload {
  channelId: string;
  userId: string;
  username: string;
  typing: boolean;
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  /** Edits and (soft) deletes — the DTO carries `deleted`. */
  'message:update': (message: MessageDTO) => void;
  typing: (payload: TypingPayload) => void;
  /** Channels, name, icon or membership changed: re-fetch the server view. */
  'server:updated': (payload: { serverId: string }) => void;
}

export interface ClientToServerEvents {
  'channel:join': (channelId: string, ack: (ok: boolean) => void) => void;
  'channel:leave': (channelId: string) => void;
  'server:join': (serverId: string, ack: (ok: boolean) => void) => void;
  'server:leave': (serverId: string) => void;
  typing: (payload: { channelId: string; typing: boolean }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
}

export const channelRoom = (channelId: string) => `channel:${channelId}`;
export const serverRoom = (serverId: string) => `server:${serverId}`;
export const userRoom = (userId: string) => `user:${userId}`;
