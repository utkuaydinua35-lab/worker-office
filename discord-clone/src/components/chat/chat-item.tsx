'use client';

import type { MemberRole } from '@prisma/client';
import { CornerUpLeft, Edit, FileText, Music, Pin, PinOff, Reply, SmilePlus, Trash } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { EmojiPicker } from '@/components/chat/emoji-picker';
import { ConfirmModal } from '@/components/modals/confirm-modal';
import { UserAvatar } from '@/components/user/user-avatar';
import { messageUrl, type ChatKind } from '@/lib/chat-target';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { MENTION_PATTERN, type MessageDTO } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { MESSAGE_MAX_LENGTH } from '@/lib/validators';

// Prisma stamps createdAt and updatedAt separately on insert, so they can
// differ by a few ms on an unedited message.
const EDITED_THRESHOLD_MS = 1000;

const fullTime = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const shortTime = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' });

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url);

/** Scrolls to a loaded message and flashes it; false if it isn't loaded. */
export function jumpToMessage(messageId: string) {
  const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('bg-primary/20');
  setTimeout(() => el.classList.remove('bg-primary/20'), 1500);
  return true;
}

/** Message text with @mentions highlighted, as Discord does. */
function MessageText({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of content.matchAll(MENTION_PATTERN)) {
    const start = m.index!;
    // "@ali." at a sentence's end: the dot isn't part of the name.
    const token = m[0].replace(/\.+$/, '');
    if (token.length < 3) continue;
    parts.push(<Fragment key={last}>{content.slice(last, start)}</Fragment>);
    parts.push(
      <span key={start} className="rounded bg-primary/30 px-0.5 font-medium text-[#c9cdfb]">
        {token}
      </span>,
    );
    last = start + token.length;
  }
  parts.push(<Fragment key={last}>{content.slice(last)}</Fragment>);
  return <>{parts}</>;
}

interface ChatItemProps {
  kind: ChatKind;
  message: MessageDTO;
  currentUser: { id: string; role: MemberRole };
  /** Same author within a few minutes: render without avatar and name. */
  continuation: boolean;
  onChanged: (message: MessageDTO) => void;
  onReply: (message: MessageDTO) => void;
}

export function ChatItem({ kind, message, currentUser, continuation, onChanged, onReply }: ChatItemProps) {
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
  // DMs have no moderators: either side may pin.
  const canPin = !message.deleted && (kind === 'conversation' || isModerator);
  const mentionsMe = !message.deleted && message.mentions.includes(currentUser.id);
  const [actionError, setActionError] = useState<string | null>(null);
  // Touch screens have no hover: a tap on the message shows its toolbar, a tap elsewhere hides it.
  const [tapped, setTapped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tapped) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setTapped(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [tapped]);

  async function act(path: 'reactions' | 'pin', body: object) {
    setActionError(null);
    try {
      onChanged(
        await apiFetch<MessageDTO>(`${messageUrl(kind, message.id)}/${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }
  const react = (emoji: string) => void act('reactions', { emoji });
  const edited =
    !message.deleted && Date.parse(message.updatedAt) - Date.parse(message.createdAt) > EDITED_THRESHOLD_MS;
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
      data-message-id={message.id}
      ref={rootRef}
      onClick={(e) => {
        if (!window.matchMedia('(hover: none)').matches) return;
        if ((e.target as HTMLElement).closest('button, a, textarea, input')) return;
        setTapped(true);
      }}
      className={cn(
        'group relative flex flex-wrap gap-x-4 px-4 transition-colors hover:bg-black/5',
        continuation && !message.replyTo ? 'py-0.5' : 'mt-3 py-0.5',
        mentionsMe && 'border-l-2 border-status-idle bg-status-idle/10 hover:bg-status-idle/15',
      )}
    >
      {message.replyTo && (
        <button
          type="button"
          onClick={() => jumpToMessage(message.replyTo!.id)}
          className="mb-0.5 ml-5 flex w-full min-w-0 basis-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <CornerUpLeft className="h-3.5 w-3.5 shrink-0 -scale-x-100" />
          <span className="font-semibold">@{message.replyTo.user.username}</span>
          <span className="truncate">
            {message.replyTo.deleted
              ? 'Orijinal mesaj silindi.'
              : message.replyTo.content || (message.replyTo.hasFile ? 'Ek' : '')}
          </span>
        </button>
      )}
      <div className="w-10 shrink-0">
        {continuation ? (
          <span className="invisible block pt-1 text-right text-[10px] text-muted-foreground group-hover:visible">
            {shortTime.format(created)}
          </span>
        ) : message.user.isBot ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-online text-white">
            <Music className="h-5 w-5" />
          </span>
        ) : (
          <UserAvatar username={message.user.username} avatarUrl={message.user.avatarUrl} />
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
            {message.pinned && <Pin className="h-3 w-3 self-center text-muted-foreground" aria-label="Sabitlendi" />}
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
              <MessageText content={message.content} />
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

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(currentUser.id);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  data-reaction={r.emoji}
                  title={mine ? 'Tepkini kaldır' : 'Tepki ver'}
                  onClick={() => react(r.emoji)}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm',
                    mine ? 'border-primary bg-primary/20' : 'border-transparent bg-secondary hover:border-border',
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{r.userIds.length}</span>
                </button>
              );
            })}
            <EmojiPicker
              onSelect={react}
              side="bottom"
              closeOnSelect
              trigger={
                <button
                  type="button"
                  title="Tepki ekle"
                  className="flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <SmilePlus className="h-4 w-4" />
                </button>
              }
            />
          </div>
        )}
        {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      </div>

      {!message.deleted && !editing && (
        <div
          className={cn(
            'absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-card shadow group-hover:flex has-[[data-state=open]]:flex',
            tapped && 'flex',
          )}
        >
          <EmojiPicker
            onSelect={react}
            side="left"
            closeOnSelect
            trigger={
              <button type="button" title="Tepki ekle" className="p-1.5 hover:bg-secondary">
                <SmilePlus className="h-4 w-4" />
              </button>
            }
          />
          <button type="button" title="Yanıtla" className="p-1.5 hover:bg-secondary" onClick={() => onReply(message)}>
            <Reply className="h-4 w-4" />
          </button>
          {canPin && (
            <button
              type="button"
              title={message.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
              className="p-1.5 hover:bg-secondary"
              onClick={() => void act('pin', { pinned: !message.pinned })}
            >
              {message.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
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
