'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSocket, useSocketRoom } from '@/components/providers/socket-provider';
import { messagesUrl, type ChatTarget } from '@/lib/chat-target';
import { apiFetch } from '@/lib/client-api';
import type { MessageDTO, MessagePage } from '@/lib/messages';
import type { TypingPayload } from '@/lib/socket/events';

const TYPING_TTL_MS = 6000;

const byTime = (a: MessageDTO, b: MessageDTO) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

/**
 * Upserts by id. The same message can arrive from the POST response, the
 * socket echo and a re-fetch, in any order; the latest updatedAt wins.
 */
function merge(current: MessageDTO[], incoming: MessageDTO[]) {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    const existing = map.get(m.id);
    if (!existing || existing.updatedAt <= m.updatedAt) map.set(m.id, m);
  }
  return Array.from(map.values()).sort(byTime);
}

export interface TypingUser {
  userId: string;
  username: string;
}

/**
 * Messages of one chat — a channel or a DM conversation — oldest → newest,
 * live via Socket.io, older pages on demand.
 */
export function useChatMessages(target: ChatTarget, currentUserId: string) {
  const { kind, id } = target;
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<Map<string, TypingUser>>(new Map());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const olderLoaded = useRef(false);

  const upsert = useCallback((...incoming: MessageDTO[]) => {
    setMessages((current) => merge(current, incoming));
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const page = await apiFetch<MessagePage>(messagesUrl({ kind, id }));
      setMessages((current) => merge(current, page.items));
      // Once older pages are loaded, the cursor points further back; keep it.
      if (!olderLoaded.current) setNextCursor(page.nextCursor);
      setStatus('ready');
    } catch {
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }
  }, [kind, id]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await apiFetch<MessagePage>(
        `${messagesUrl({ kind, id })}?cursor=${encodeURIComponent(nextCursor)}`,
      );
      olderLoaded.current = true;
      setMessages((current) => merge(current, page.items));
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }, [kind, id, nextCursor, loadingOlder]);

  // Reset when switching chats.
  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    setStatus('loading');
    setTyping(new Map());
    olderLoaded.current = false;
    void loadLatest();
  }, [loadLatest]);

  // Every (re)join re-fetches the newest page: covers messages sent between the
  // first fetch and the join, and anything missed while disconnected.
  const live = useSocketRoom(kind, id, () => void loadLatest());

  useEffect(() => {
    if (!socket) return;
    const timers = typingTimers.current;

    const clearTyping = (userId: string) => {
      clearTimeout(timers.get(userId));
      timers.delete(userId);
      setTyping((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    const onMessage = (m: MessageDTO) => {
      if (m.roomId !== id) return;
      upsert(m);
      clearTyping(m.user.id); // they just sent it
    };
    const onTyping = (p: TypingPayload) => {
      if (p.kind !== kind || p.roomId !== id || p.userId === currentUserId) return;
      if (!p.typing) return clearTyping(p.userId);
      setTyping((prev) => new Map(prev).set(p.userId, { userId: p.userId, username: p.username }));
      clearTimeout(timers.get(p.userId));
      // A crashed tab never sends typing:false; expire on our own.
      timers.set(p.userId, setTimeout(() => clearTyping(p.userId), TYPING_TTL_MS));
    };

    socket.on('message:new', onMessage);
    socket.on('message:update', onMessage);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:update', onMessage);
      socket.off('typing', onTyping);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [socket, kind, id, currentUserId, upsert]);

  return {
    messages,
    status,
    live,
    hasMore: nextCursor !== null,
    loadingOlder,
    loadOlder,
    upsert,
    typingUsers: Array.from(typing.values()),
    retry: loadLatest,
  };
}
