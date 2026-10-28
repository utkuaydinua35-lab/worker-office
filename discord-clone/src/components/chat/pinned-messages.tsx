'use client';

import { Loader2, Pin, PinOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { jumpToMessage } from '@/components/chat/chat-item';
import { useSocket } from '@/components/providers/socket-provider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/user/user-avatar';
import { messageUrl, type ChatTarget } from '@/lib/chat-target';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { MessageDTO } from '@/lib/messages';

const time = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

const pinsUrl = ({ kind, id }: ChatTarget) =>
  kind === 'channel' ? `/api/channels/${id}/pins` : `/api/conversations/${id}/pins`;

/** The header's pin button: the room's pinned messages, newest first. */
export function PinnedMessages({ target, canUnpin }: { target: ChatTarget; canUnpin: boolean }) {
  const { socket } = useSocket();
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<MessageDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    apiFetch<MessageDTO[]>(pinsUrl(target))
      .then((list) => !cancelled && setPins(list))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, target]);

  // Keep an open list current as messages get pinned, unpinned or deleted.
  useEffect(() => {
    if (!socket || !open) return;
    const onUpdate = (m: MessageDTO) => {
      if (m.roomId !== target.id) return;
      setPins((list) => {
        if (!list) return list;
        const rest = list.filter((p) => p.id !== m.id);
        return m.pinned && !m.deleted ? [...rest, m].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : rest;
      });
    };
    socket.on('message:update', onUpdate);
    return () => {
      socket.off('message:update', onUpdate);
    };
  }, [socket, open, target.id]);

  async function unpin(id: string) {
    try {
      await apiFetch(`${messageUrl(target.kind, id)}/pin`, { method: 'POST', body: JSON.stringify({ pinned: false }) });
      setPins((list) => list?.filter((p) => p.id !== id) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Sabitlenmiş mesajlar"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pin className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0" aria-label="Sabitlenmiş mesajlar">
        <p className="border-b border-border px-4 py-3 font-semibold">Sabitlenmiş Mesajlar</p>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {error && <p className="p-2 text-sm text-destructive">{error}</p>}
          {!pins && !error && (
            <div className="flex justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {pins?.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Henüz sabitlenmiş mesaj yok.</p>
          )}
          {pins?.map((m) => (
            <div key={m.id} className="group relative rounded-md border border-border bg-[#2b2d31] p-3 text-sm">
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => {
                  if (jumpToMessage(m.id)) setOpen(false);
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <UserAvatar username={m.user.username} avatarUrl={m.user.avatarUrl} className="h-6 w-6 text-[10px]" />
                  <span className="font-semibold">{m.user.username}</span>
                  <span className="text-xs text-muted-foreground">{time.format(new Date(m.createdAt))}</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap break-words">{m.content || (m.fileUrl ? 'Ek' : '')}</p>
              </button>
              {canUnpin && (
                <button
                  type="button"
                  title="Sabitlemeyi kaldır"
                  onClick={() => void unpin(m.id)}
                  className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground group-hover:block"
                >
                  <PinOff className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
