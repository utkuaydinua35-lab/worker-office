import type { Server } from 'socket.io';

import type { MessageDTO } from '@/lib/messages';
import {
  channelRoom,
  serverRoom,
  userRoom,
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

// server.ts creates the Socket.io server; Route Handlers run in the same Node
// process, so they reach it through globalThis (module instances differ
// between the custom server and Next's bundles, globalThis does not).
const holder = globalThis as unknown as { __discordCloneIO?: TypedIO };

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

export function emitMessage(event: 'message:new' | 'message:update', message: MessageDTO) {
  getIO()?.to(channelRoom(message.channelId)).emit(event, message);
}

export function emitServerUpdated(serverId: string) {
  getIO()?.to(serverRoom(serverId)).emit('server:updated', { serverId });
}

const roomsOf = (serverId: string, channelIds: string[]) => [
  serverRoom(serverId),
  ...channelIds.map(channelRoom),
];

/** A user left: pull their sockets out of the server's rooms so nothing more reaches them. */
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
