// Shared between the Socket.io server (server.ts) and the browser client.
// Type-only imports keep this module free of runtime dependencies.
import type { ChatKind } from '@/lib/chat-target';
import type { MessageDTO } from '@/lib/messages';
import type { UserStatusValue } from '@/lib/validators';

export const SOCKET_PATH = '/api/socket';

/** Rooms a client may ask to join; each is authorized on join. */
export type RoomKind = ChatKind | 'server';

export interface TypingPayload {
  kind: ChatKind;
  roomId: string;
  userId: string;
  username: string;
  typing: boolean;
}

export interface PresencePayload {
  userId: string;
  status: UserStatusValue; // already effective: OFFLINE when disconnected or invisible
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  /** Edits and (soft) deletes — the DTO carries `deleted`. */
  'message:update': (message: MessageDTO) => void;
  typing: (payload: TypingPayload) => void;
  /** Channels, name, icon or membership changed: re-fetch the server view. */
  'server:updated': (payload: { serverId: string }) => void;
  /** A user connected, disconnected or changed status. */
  presence: (payload: PresencePayload) => void;
  /** A DM arrived in a conversation (sent to both participants' user rooms). */
  'conversation:activity': (payload: { conversationId: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (kind: RoomKind, id: string, ack: (ok: boolean) => void) => void;
  'room:leave': (kind: RoomKind, id: string) => void;
  typing: (payload: { kind: ChatKind; roomId: string; typing: boolean }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
}

export const roomName = (kind: RoomKind, id: string) => `${kind}:${id}`;
export const channelRoom = (channelId: string) => roomName('channel', channelId);
export const serverRoom = (serverId: string) => roomName('server', serverId);
export const userRoom = (userId: string) => `user:${userId}`;
