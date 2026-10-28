'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSocket } from '@/components/providers/socket-provider';
import type { ChannelActivityPayload, ConversationActivityPayload } from '@/lib/socket/events';
import type { UnreadChannels } from '@/lib/unread';

const NOTIFY_KEY = 'discord-clone:notifications';

interface UnreadContextValue {
  channel: (channelId: string) => { unread: boolean; mentions: number };
  server: (serverId: string) => { unread: boolean; mentions: number };
  conversationUnread: (conversationId: string) => boolean;
  dmUnreadCount: number;
  /** The open chat calls this while it's on screen. */
  markRead: (kind: 'channel' | 'conversation', id: string) => void;
  notifications: 'on' | 'off' | 'denied' | 'unsupported';
  setNotificationsEnabled: (on: boolean) => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue | null>(null);

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error('useUnread must be used inside <UnreadProvider>');
  return ctx;
}

const isVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';

/**
 * Unread channels, @mention badges, unread DMs and desktop notifications.
 * Seeded from the server on load, then kept current from socket events.
 */
export function UnreadProvider({
  userId,
  initial,
  children,
}: {
  userId: string;
  initial: UnreadChannels;
  children: React.ReactNode;
}) {
  const { socket } = useSocket();
  const router = useRouter();
  const pathname = usePathname();
  const [channels, setChannels] = useState<UnreadChannels>(initial);
  const [dms, setDms] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<UnreadContextValue['notifications']>('off');
  const view = useRef({ pathname, notifications });
  view.current = { pathname, notifications };

  useEffect(() => {
    if (typeof Notification === 'undefined') return setNotifications('unsupported');
    if (Notification.permission === 'denied') return setNotifications('denied');
    let wanted = false;
    try {
      wanted = localStorage.getItem(NOTIFY_KEY) === 'on';
    } catch {
      // storage unavailable
    }
    setNotifications(wanted && Notification.permission === 'granted' ? 'on' : 'off');
  }, []);

  const setNotificationsEnabled = useCallback(async (on: boolean) => {
    if (typeof Notification === 'undefined') return;
    let next: UnreadContextValue['notifications'] = 'off';
    if (on) {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      next = permission === 'granted' ? 'on' : permission === 'denied' ? 'denied' : 'off';
    }
    setNotifications(next);
    try {
      localStorage.setItem(NOTIFY_KEY, next === 'on' ? 'on' : 'off');
    } catch {
      // storage unavailable
    }
  }, []);

  const notify = useCallback(
    (title: string, body: string, url: string, tag: string) => {
      if (view.current.notifications !== 'on' || Notification.permission !== 'granted') return;
      const n = new Notification(title, { body, tag, icon: '/favicon.ico' });
      n.onclick = () => {
        window.focus();
        router.push(url);
        n.close();
      };
    },
    [router],
  );

  useEffect(() => {
    if (!socket) return;
    const onChannel = (p: ChannelActivityPayload) => {
      if (p.authorId === userId) return;
      const url = `/servers/${p.serverId}/channels/${p.channelId}`;
      const watching = view.current.pathname === url && isVisible();
      if (watching) return; // the open chat marks it read
      const mentioned = p.mentions.includes(userId);
      setChannels((prev) => ({
        ...prev,
        [p.channelId]: { serverId: p.serverId, mentions: (prev[p.channelId]?.mentions ?? 0) + (mentioned ? 1 : 0) },
      }));
      if (mentioned) notify(`${p.authorName} (#${p.channelName})`, p.preview || 'Senden bahsetti', url, p.channelId);
    };
    const onConversation = (p: ConversationActivityPayload) => {
      if (!p.authorId || p.authorId === userId) return;
      const url = `/me/${p.conversationId}`;
      if (view.current.pathname === url && isVisible()) return;
      setDms((prev) => new Set(prev).add(p.conversationId));
      notify(p.authorName ?? 'Yeni mesaj', p.preview || 'Bir ek gönderdi', url, p.conversationId);
    };
    socket.on('channel:activity', onChannel);
    socket.on('conversation:activity', onConversation);
    return () => {
      socket.off('channel:activity', onChannel);
      socket.off('conversation:activity', onConversation);
    };
  }, [socket, userId, notify]);

  const markRead = useCallback((kind: 'channel' | 'conversation', id: string) => {
    if (kind === 'conversation') {
      setDms((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setChannels((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void fetch(`/api/channels/${id}/read`, { method: 'POST' }).catch(() => {});
  }, []);

  // "(3) Hasbihal": mentions plus unread DMs in the tab title, like Discord.
  const badge = Object.values(channels).reduce((n, c) => n + c.mentions, 0) + dms.size;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = badge > 0 ? `(${badge}) ${base}` : base;
  }, [badge, pathname]);

  const value = useMemo<UnreadContextValue>(() => {
    const byServer = new Map<string, { unread: boolean; mentions: number }>();
    for (const c of Object.values(channels)) {
      const s = byServer.get(c.serverId) ?? { unread: false, mentions: 0 };
      byServer.set(c.serverId, { unread: true, mentions: s.mentions + c.mentions });
    }
    return {
      channel: (id) =>
        channels[id] ? { unread: true, mentions: channels[id].mentions } : { unread: false, mentions: 0 },
      server: (id) => byServer.get(id) ?? { unread: false, mentions: 0 },
      conversationUnread: (id) => dms.has(id),
      dmUnreadCount: dms.size,
      markRead,
      notifications,
      setNotificationsEnabled,
    };
  }, [channels, dms, markRead, notifications, setNotificationsEnabled]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

/** Keeps the chat on screen marked read: on open, on new messages, and when the tab comes back. */
export function useMarkReadWhileVisible(
  kind: 'channel' | 'conversation',
  id: string,
  lastMessageId: string | undefined,
) {
  const { markRead } = useUnread();
  useEffect(() => {
    if (isVisible()) markRead(kind, id);
    const onVisible = () => isVisible() && markRead(kind, id);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [kind, id, lastMessageId, markRead]);
}
