'use client';

import { useEffect, useRef, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { apiFetch } from '@/lib/client-api';
import type { MusicState } from '@/lib/music/types';

/** The music bot's live state for a server: fetched once, then pushed over Socket.io. */
export function useMusicState(serverId: string) {
  const { socket } = useSocket();
  const [state, setState] = useState<MusicState | null>(null);
  // Once a push arrived, a slower initial fetch must not overwrite it.
  const pushed = useRef(false);

  useEffect(() => {
    pushed.current = false;
    setState(null);
    apiFetch<{ state: MusicState | null }>(`/api/servers/${serverId}/music`)
      .then((res) => {
        if (!pushed.current) setState(res.state);
      })
      .catch(() => {});
  }, [serverId]);

  useEffect(() => {
    if (!socket) return;
    const onState = (p: { serverId: string; state: MusicState | null }) => {
      if (p.serverId !== serverId) return;
      pushed.current = true;
      setState(p.state);
    };
    socket.on('music:state', onState);
    return () => {
      socket.off('music:state', onState);
    };
  }, [socket, serverId]);

  return state;
}

/** Current position in ms, ticking locally between pushes. */
export function useElapsed(state: MusicState | null) {
  const [now, setNow] = useState(() => Date.now());
  const playing = !!state?.nowPlaying && !state.paused;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playing]);

  if (!state?.nowPlaying) return 0;
  return state.elapsedMs + (state.paused ? 0 : Math.max(0, now - state.emittedAt));
}
