'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSocket, useSocketRoom } from '@/components/providers/socket-provider';

/** Re-renders the server view when channels, settings or membership change elsewhere. */
export function ServerRealtime({ serverId }: { serverId: string }) {
  const router = useRouter();
  const { socket } = useSocket();
  useSocketRoom('server', serverId);

  useEffect(() => {
    if (!socket) return;
    const onUpdated = ({ serverId: id }: { serverId: string }) => {
      // Also arrives on the personal room after leaving, for a server we're no longer viewing.
      if (id === serverId) router.refresh();
    };
    socket.on('server:updated', onUpdated);
    return () => {
      socket.off('server:updated', onUpdated);
    };
  }, [socket, serverId, router]);

  return null;
}
