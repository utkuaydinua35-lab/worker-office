'use client';

import type { MemberRole } from '@prisma/client';
import { Hash, Loader2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { ChatItem } from '@/components/chat/chat-item';
import { Button } from '@/components/ui/button';
import type { useChannelMessages } from '@/hooks/use-channel-messages';

const NEAR_BOTTOM_PX = 150;
const LOAD_OLDER_AT_PX = 80;
// Discord folds consecutive messages from one author into a single block.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface ChatMessagesProps {
  channelName: string;
  currentUser: { id: string; role: MemberRole };
  chat: ReturnType<typeof useChannelMessages>;
}

export function ChatMessages({ channelName, currentUser, chat }: ChatMessagesProps) {
  const { messages, status, hasMore, loadingOlder, loadOlder, upsert, retry } = chat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Scroll height before an older page was prepended, to keep the view still.
  const heightBeforePrepend = useRef<number | null>(null);
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (heightBeforePrepend.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforePrepend.current;
      heightBeforePrepend.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [firstId, lastId, messages.length]);

  // Images load after layout; keep pinned to the bottom while they do.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollTop < LOAD_OLDER_AT_PX && hasMore && !loadingOlder) {
      heightBeforePrepend.current = el.scrollHeight;
      void loadOlder().catch(() => (heightBeforePrepend.current = null));
    }
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col justify-end pb-4">
        {status === 'loading' && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            Mesajlar yüklenemedi.
            <Button size="sm" variant="secondary" onClick={() => void retry()}>
              Tekrar dene
            </Button>
          </div>
        )}

        {status === 'ready' && !hasMore && (
          <div className="px-4 pb-4 pt-8">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Hash className="h-9 w-9" />
            </div>
            <h2 className="text-3xl font-bold">#{channelName} kanalına hoş geldin!</h2>
            <p className="text-muted-foreground">Bu, #{channelName} kanalının başlangıcı.</p>
          </div>
        )}
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {messages.map((message, i) => {
          const prev = messages[i - 1];
          const continuation =
            !!prev &&
            !prev.deleted &&
            prev.user.id === message.user.id &&
            Date.parse(message.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
          return (
            <ChatItem
              key={message.id}
              message={message}
              currentUser={currentUser}
              continuation={continuation}
              onChanged={upsert}
            />
          );
        })}
      </div>
    </div>
  );
}
