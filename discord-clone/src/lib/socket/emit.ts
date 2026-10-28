import type { Server } from 'socket.io';

import type { ChatKind } from '@/lib/chat-target';
import { db } from '@/lib/db';
import type { MessageDTO } from '@/lib/messages';
import type { MusicState } from '@/lib/music/types';
import type { VoiceChannelsState } from '@/lib/voice-presence/store';
import { effectiveStatus } from '@/lib/presence';
import {
  channelRoom,
  roomName,
  serverRoom,
  userRoom,
  type ChannelActivityPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@/lib/socket/events';

export type TypedIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// server.ts creates the Socket.io server; Route Handlers and Server Components
// run in the same Node process and reach it (and the presence table) through
// globalThis — module instances differ between the custom server and Next's
// bundles, globalThis does not.
const holder = globalThis as unknown as {
  __discordCloneIO?: TypedIO;
  __discordClonePresence?: Map<string, number>; // userId → open socket count
};

export function setIO(io: TypedIO) {
  holder.__discordCloneIO = io;
}

function getIO(): TypedIO | null {
  const io = holder.__discordCloneIO ?? null;
  if (!io && process.env.NODE_ENV !== 'test') {
    console.warn('[socket] No Socket.io server — start the app with `npm run dev`, not `next dev`');
  }
  return io;
}

// ─── Presence ───────────────────────────────────────────────────────────

const presence = () => (holder.__discordClonePresence ??= new Map());

export const isOnline = (userId: string) => (presence().get(userId) ?? 0) > 0;

/** Counts a socket in or out; returns true when the user's online state flipped. */
export function trackSocket(userId: string, delta: 1 | -1): boolean {
  const table = presence();
  const before = table.get(userId) ?? 0;
  const after = Math.max(0, before + delta);
  if (after === 0) table.delete(userId);
  else table.set(userId, after);
  return (before === 0) !== (after === 0);
}

/**
 * Tells everyone who can see this user — co-members of their servers and DM
 * partners — their current effective status.
 */
export async function broadcastPresence(userId: string) {
  const io = getIO();
  if (!io) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      memberships: { select: { serverId: true } },
      conversationsInitiated: { select: { userTwoId: true } },
      conversationsReceived: { select: { userOneId: true } },
    },
  });
  if (!user) return;

  const rooms = [
    ...user.memberships.map((m) => serverRoom(m.serverId)),
    ...user.conversationsInitiated.map((c) => userRoom(c.userTwoId)),
    ...user.conversationsReceived.map((c) => userRoom(c.userOneId)),
    userRoom(userId), // their own other tabs
  ];
  if (rooms.length === 0) return;
  io.to(rooms).emit('presence', { userId, status: effectiveStatus(user.status, isOnline(userId)) });
}

// ─── Chat ───────────────────────────────────────────────────────────────

export function emitMessage(kind: ChatKind, event: 'message:new' | 'message:update', message: MessageDTO) {
  getIO()?.to(roomName(kind, message.roomId)).emit(event, message);
}

/** Lets both participants' DM lists pick up a conversation that just got a message. */
export function emitConversationActivity(
  conversationId: string,
  userIds: string[],
  from?: { authorId: string; authorName: string; preview: string },
) {
  getIO()?.to(userIds.map(userRoom)).emit('conversation:activity', { conversationId, ...from });
}

// ─── Music ──────────────────────────────────────────────────────────────

export function emitMusicState(serverId: string, state: MusicState | null) {
  getIO()?.to(serverRoom(serverId)).emit('music:state', { serverId, state });
}

export function emitVoiceState(serverId: string, channels: VoiceChannelsState) {
  getIO()?.to(serverRoom(serverId)).emit('voice:state', { serverId, channels });
}

/**
 * A new channel message, for unread markers and mention notifications. Goes to
 * every member's own room, so servers that aren't open in a tab hear it too.
 */
export async function emitChannelActivity(serverId: string, payload: ChannelActivityPayload) {
  const io = getIO();
  if (!io) return;
  const members = await db.member.findMany({ where: { serverId }, select: { userId: true } });
  io.to(members.map((m) => userRoom(m.userId))).emit('channel:activity', payload);
}

/** Tells every tab of `userId` to switch voice channels. */
export function emitVoiceMove(userId: string, payload: { serverId: string; channelId: string; channelName: string }) {
  getIO()?.to(userRoom(userId)).emit('voice:move', payload);
}

// ─── Servers ────────────────────────────────────────────────────────────

export function emitServerUpdated(serverId: string) {
  getIO()?.to(serverRoom(serverId)).emit('server:updated', { serverId });
}

/** A profile changed (name, avatar): refresh every server view that lists this user. */
export async function emitUserProfileChanged(userId: string) {
  const io = getIO();
  if (!io) return;
  const memberships = await db.member.findMany({ where: { userId }, select: { serverId: true } });
  for (const { serverId } of memberships) io.to(serverRoom(serverId)).emit('server:updated', { serverId });
}

const roomsOf = (serverId: string, channelIds: string[]) => [
  serverRoom(serverId),
  ...channelIds.map(channelRoom),
];

/** A user left or was kicked: pull their sockets out of the server's rooms so nothing more reaches them. */
export function revokeUserServerAccess(userId: string, serverId: string, channelIds: string[]) {
  const io = getIO();
  if (!io) return;
  io.to(userRoom(userId)).emit('server:updated', { serverId });
  io.in(userRoom(userId)).socketsLeave(roomsOf(serverId, channelIds));
}

/** The server is gone: tell every member to refresh, then empty its rooms. */
export function closeServerRooms(serverId: string, channelIds: string[]) {
  const io = getIO();
  if (!io) return;
  io.to(serverRoom(serverId)).emit('server:updated', { serverId });
  io.in(serverRoom(serverId)).socketsLeave(roomsOf(serverId, channelIds));
}

/** A channel is gone: viewers refresh via server:updated; drop the room itself. */
export function closeChannelRoom(serverId: string, channelId: string) {
  const io = getIO();
  if (!io) return;
  io.to(serverRoom(serverId)).emit('server:updated', { serverId });
  io.in(channelRoom(channelId)).socketsLeave(channelRoom(channelId));
}
