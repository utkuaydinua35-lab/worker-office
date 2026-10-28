'use client';

import type { MemberRole } from '@prisma/client';
import { Edit, FileText, Music, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ConfirmModal } from '@/components/modals/confirm-modal';
import { UserAvatar } from '@/components/user/user-avatar';
import { messageUrl, type ChatKind } from '@/lib/chat-target';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { MessageDTO } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { MESSAGE_MAX_LENGTH } from '@/lib/validators';

// Prisma stamps createdAt and updatedAt separately on insert, so they can
// differ by a few ms on an unedited message.
const EDITED_THRESHOLD_MS = 1000;

const fullTime = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const shortTime = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' });

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url);

interface ChatItemProps {
  kind: ChatKind;
  message: MessageDTO;
  currentUser: { id: string; role: MemberRole };
  /** Same author within a few minutes: render without avatar and name. */
  continuation: boolean;
  onChanged: (message: MessageDTO) => void;
}

export function ChatItem({ kind, message, currentUser, continuation, onChanged }: ChatItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isOwn = message.user.id === currentUser.id;
  const isModerator = currentUser.role === 'ADMIN' || currentUser.role === 'MODERATOR';
  const canEdit = isOwn && !message.deleted;
  const canDelete = (isOwn || isModerator) && !message.deleted;
  const edited =
    !message.deleted &&
    Date.parse(message.updatedAt) - Date.parse(message.createdAt) > EDITED_THRESHOLD_MS;
  const created = new Date(message.createdAt);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  function startEdit() {
    setDraft(message.content);
    setError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (draft.trim() === message.content) return setEditing(false);
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<MessageDTO>(messageUrl(kind, message.id), {
        method: 'PATCH',
        body: JSON.stringify({ content: draft }),
      });
      onChanged(updated);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        'group relative flex gap-4 px-4 hover:bg-black/5',
        continuation ? 'py-0.5' : 'mt-3 py-0.5',
      )}
    >
      <div className="w-10 shrink-0">
        {continuation ? (
          <span className="invisible block pt-1 text-right text-[10px] text-muted-foreground group-hover:visible">
            {shortTime.format(created)}
          </span>
        ) : (
          message.user.isBot ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-online text-white">
              <Music className="h-5 w-5" />
            </span>
          ) : (
            <UserAvatar username={message.user.username} avatarUrl={message.user.avatarUrl} />
          )
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!continuation && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{message.user.username}</span>
            {message.user.isBot && (
              <span className="rounded bg-primary px-1 py-px text-[10px] font-semibold leading-none text-primary-foreground">
                BOT
              </span>
            )}
            <time className="text-xs text-muted-foreground" dateTime={message.createdAt}>
              {fullTime.format(created)}
            </time>
          </div>
        )}

        {message.deleted ? (
          <p className="text-sm italic text-muted-foreground">Bu mesaj silindi.</p>
        ) : editing ? (
          <div className="py-1">
            <textarea
              ref={inputRef}
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              rows={Math.min(8, draft.split('\n').length)}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                }
              }}
              className="w-full resize-none rounded-md bg-[#383a40] px-3 py-2 text-sm focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">
              iptal için <kbd>Esc</kbd> • kaydetmek için <kbd>Enter</kbd>
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          message.content && (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {message.content}
              {edited && <span className="ml-1 text-[10px] text-muted-foreground">(düzenlendi)</span>}
            </p>
          )
        )}

        {!message.deleted && message.fileUrl && (
          <div className="mt-1">
            {isImage(message.fileUrl) ? (
              <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.fileUrl}
                  alt="Ek"
                  className="max-h-72 max-w-sm rounded-md border border-border object-contain"
                />
              </a>
            ) : (
              <a
                href={message.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-[#00a8fc] hover:underline"
              >
                <FileText className="h-5 w-5" />
                PDF dosyası
              </a>
            )}
          </div>
        )}
      </div>

      {(canEdit || canDelete) && !editing && (
        <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-card shadow group-hover:flex">
          {canEdit && (
            <button type="button" title="Düzenle" className="p-1.5 hover:bg-secondary" onClick={startEdit}>
              <Edit className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              title="Sil"
              className="p-1.5 text-destructive hover:bg-secondary"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Mesajı Sil"
        description="Bu mesajı silmek istediğine emin misin?"
        confirmLabel="Sil"
        onConfirm={async () => {
          const updated = await apiFetch<MessageDTO>(messageUrl(kind, message.id), { method: 'DELETE' });
          onChanged(updated);
        }}
      />
    </div>
  );
}
