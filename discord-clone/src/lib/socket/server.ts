import type { IncomingMessage, Server as HttpServer } from 'node:http';

import { decode } from 'next-auth/jwt';
import { Server } from 'socket.io';

import { getChannelAccess, getMembership } from '@/lib/membership';
import {
  channelRoom,
  serverRoom,
  SOCKET_PATH,
  userRoom,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@/lib/socket/events';
import { setIO, type TypedIO } from '@/lib/socket/emit';

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
function isSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client; it still needs a valid session cookie
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
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
    // Personal room: lets the server pull this user out of rooms they lose
    // access to (leaving a server, server deletion).
    void socket.join(userRoom(userId));

    socket.on('channel:join', async (channelId, ack) => {
      const ok = typeof channelId === 'string' && !!(await getChannelAccess(userId, channelId));
      if (ok) await socket.join(channelRoom(channelId));
      if (typeof ack === 'function') ack(ok);
    });

    socket.on('channel:leave', (channelId) => {
      if (typeof channelId === 'string') void socket.leave(channelRoom(channelId));
    });

    socket.on('server:join', async (serverId, ack) => {
      const ok = typeof serverId === 'string' && !!(await getMembership(userId, serverId));
      if (ok) await socket.join(serverRoom(serverId));
      if (typeof ack === 'function') ack(ok);
    });

    socket.on('server:leave', (serverId) => {
      if (typeof serverId === 'string') void socket.leave(serverRoom(serverId));
    });

    socket.on('typing', (payload) => {
      const channelId = payload?.channelId;
      // Only rooms the membership check let us into.
      if (typeof channelId !== 'string' || !socket.rooms.has(channelRoom(channelId))) return;
      socket.to(channelRoom(channelId)).emit('typing', {
        channelId,
        userId,
        username: socket.data.username,
        typing: payload.typing === true,
      });
    });

    // Clear this user's typing indicator everywhere when the tab goes away.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (!room.startsWith('channel:')) continue;
        const channelId = room.slice('channel:'.length);
        socket.to(room).emit('typing', {
          channelId,
          userId,
          username: socket.data.username,
          typing: false,
        });
      }
    });
  });

  setIO(io);
  return io;
}
