import type { IncomingMessage, Server as HttpServer } from 'node:http';

import { decode } from 'next-auth/jwt';
import { Server } from 'socket.io';

import { isChatKind } from '@/lib/chat-target';
import { isConversationParticipant } from '@/lib/conversation';
import { getChannelAccess, getMembership } from '@/lib/membership';
import { broadcastPresence, setIO, trackSocket, type TypedIO } from '@/lib/socket/emit';
import { pokeVoicePresence } from '@/services/voice-presence';
import {
  roomName,
  SOCKET_PATH,
  userRoom,
  type ClientToServerEvents,
  type RoomKind,
  type ServerToClientEvents,
  type SocketData,
} from '@/lib/socket/events';

const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

function parseCookies(header: string | undefined) {
  const jar = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    try {
      jar.set(part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1).trim()));
    } catch {
      // Malformed percent-encoding in someone else's cookie; skip it.
    }
  }
  return jar;
}

function readSessionToken(cookieHeader: string | undefined): string | null {
  const jar = parseCookies(cookieHeader);
  for (const name of SESSION_COOKIES) {
    const whole = jar.get(name);
    if (whole) return whole;
    // NextAuth splits an oversized JWT into name.0, name.1, ...
    const chunks: string[] = [];
    for (let i = 0; jar.has(`${name}.${i}`); i++) chunks.push(jar.get(`${name}.${i}`)!);
    if (chunks.length) return chunks.join('');
  }
  return null;
}

// The session cookie is SameSite=Lax, so a cross-site page can't ride it on a
// fetch — but browsers DO attach it to cross-site WebSocket handshakes. Refuse
// any browser handshake whose Origin isn't this host.
const siteOrigin = (() => {
  try {
    return new URL(process.env.NEXTAUTH_URL ?? '').origin;
  } catch {
    return null;
  }
})();

function isSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client; it still needs a valid session cookie
  try {
    const { host, origin: o } = new URL(origin);
    // NEXTAUTH_URL covers a proxy that rewrites Host (a tunnel to localhost:3000).
    return host === req.headers.host || o === siteOrigin;
  } catch {
    return false;
  }
}

const isRoomKind = (value: unknown): value is RoomKind => value === 'server' || isChatKind(value);

async function mayJoin(userId: string, kind: RoomKind, id: string) {
  if (kind === 'channel') return !!(await getChannelAccess(userId, id));
  if (kind === 'server') return !!(await getMembership(userId, id));
  return isConversationParticipant(userId, id);
}

export function attachSocketServer(httpServer: HttpServer): TypedIO {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for the Socket.io server');

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      path: SOCKET_PATH,
      // Next's dev server shares this http server for its HMR WebSocket;
      // without this, engine.io would kill every upgrade that isn't its own.
      destroyUpgrade: false,
      allowRequest: (req, cb) => cb(null, isSameOrigin(req)),
    },
  );

  io.use(async (socket, next) => {
    const token = readSessionToken(socket.request.headers.cookie);
    const jwt = token ? await decode({ token, secret }).catch(() => null) : null;
    if (!jwt?.id) return next(new Error('unauthorized'));
    socket.data.userId = jwt.id;
    socket.data.username = jwt.username;
    next();
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    // Personal room: DM notifications, presence of DM partners, and a handle to
    // pull this user out of rooms they lose access to.
    void socket.join(userRoom(userId));
    if (trackSocket(userId, 1)) void broadcastPresence(userId);

    socket.on('room:join', async (kind, id, ack) => {
      const ok = isRoomKind(kind) && typeof id === 'string' && (await mayJoin(userId, kind, id));
      if (ok) await socket.join(roomName(kind, id));
      if (typeof ack === 'function') ack(ok);
    });

    socket.on('room:leave', (kind, id) => {
      if (isRoomKind(kind) && typeof id === 'string') void socket.leave(roomName(kind, id));
    });

    socket.on('voice:changed', () => pokeVoicePresence());

    socket.on('typing', (payload) => {
      const { kind, roomId } = payload ?? {};
      if (!isChatKind(kind) || typeof roomId !== 'string') return;
      const room = roomName(kind, roomId);
      // Only rooms the membership check let us into.
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing', {
        kind,
        roomId,
        userId,
        username: socket.data.username,
        typing: payload.typing === true,
      });
    });

    // Clear this user's typing indicator everywhere when the tab goes away.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        const [kind, roomId] = room.split(':');
        if (!isChatKind(kind) || !roomId) continue;
        socket.to(room).emit('typing', { kind, roomId, userId, username: socket.data.username, typing: false });
      }
    });

    socket.on('disconnect', () => {
      if (trackSocket(userId, -1)) void broadcastPresence(userId);
    });
  });

  setIO(io);
  return io;
}
