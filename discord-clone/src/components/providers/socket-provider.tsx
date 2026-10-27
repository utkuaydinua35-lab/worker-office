'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type RoomKind,
  type ServerToClientEvents,
} from '@/lib/socket/events';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SocketContext = createContext<{ socket: ClientSocket | null; connected: boolean }>({
  socket: null,
  connected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<ClientSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s: ClientSocket = io({ path: SOCKET_PATH });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, []);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/**
 * Keeps this client in a channel/conversation/server room for as long as the component is
 * mounted. Socket.io forgets rooms on reconnect, so it re-joins on every
 * `connect`; `onJoined` fires after each successful join so callers can
 * re-fetch whatever they missed while disconnected.
 */
export function useSocketRoom(kind: RoomKind, id: string, onJoined?: () => void) {
  const { socket } = useSocket();
  const [joined, setJoined] = useState(false);
  const onJoinedRef = useRef(onJoined);
  onJoinedRef.current = onJoined;

  useEffect(() => {
    if (!socket) return;
    const ack = (ok: boolean) => {
      setJoined(ok);
      if (ok) onJoinedRef.current?.();
    };
    const join = () => socket.emit('room:join', kind, id, ack);
    const onDisconnect = () => setJoined(false);

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      setJoined(false);
      socket.emit('room:leave', kind, id);
    };
  }, [socket, kind, id]);

  /** True while this client is in the room and receiving its events. */
  return joined;
}
