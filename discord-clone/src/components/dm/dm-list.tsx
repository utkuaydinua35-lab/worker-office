'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import { useUnread } from '@/components/providers/unread-provider';
import { UserAvatar } from '@/components/user/user-avatar';
import type { PresencePayload } from '@/lib/socket/events';
import { cn } from '@/lib/utils';
import type { UserStatusValue } from '@/lib/validators';

export interface DmListEntry {
  conversationId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: UserStatusValue;
  lastMessageAt: string;
}

/** Conversations with live presence; a DM arriving anywhere re-renders the list (new entry, new order). */
export function DmList({ entries }: { entries: DmListEntry[] }) {
  const router = useRouter();
  const { socket } = useSocket();
  const params = useParams<{ conversationId?: string }>();
  const unread = useUnread();
  const [overrides, setOverrides] = useState<Map<string, UserStatusValue>>(new Map());
  useEffect(() => setOverrides(new Map()), [entries]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = ({ userId, status }: PresencePayload) =>
      setOverrides((prev) => new Map(prev).set(userId, status));
    const onActivity = () => router.refresh();
    socket.on('presence', onPresence);
    socket.on('conversation:activity', onActivity);
    return () => {
      socket.off('presence', onPresence);
      socket.off('conversation:activity', onActivity);
    };
  }, [socket, router]);

  if (entries.length === 0) {
    return (
      <p className="px-2 text-sm text-muted-foreground">
        Henüz direkt mesajın yok. Bir sunucuda üyeye tıklayıp “Mesaj Gönder” ile başlayabilirsin.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {entries.map((e) => (
        <Link
          key={e.conversationId}
          href={`/me/${e.conversationId}`}
          className={cn(
            'flex items-center gap-3 rounded px-2 py-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            params.conversationId === e.conversationId && 'bg-secondary text-foreground',
          )}
        >
          <UserAvatar
            username={e.username}
            avatarUrl={e.avatarUrl}
            status={overrides.get(e.userId) ?? e.status}
            className="h-8 w-8 text-xs"
          />
          <span
            className={cn(
              'truncate text-sm',
              unread.conversationUnread(e.conversationId) ? 'font-bold text-foreground' : 'font-medium',
            )}
          >
            {e.username}
          </span>
        </Link>
      ))}
    </div>
  );
}
