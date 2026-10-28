'use client';

import { FileText, Loader2, PlusCircle, SendHorizontal, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EmojiPicker } from '@/components/chat/emoji-picker';
import { UserAvatar } from '@/components/user/user-avatar';
import { useSocket } from '@/components/providers/socket-provider';
import type { TypingUser } from '@/hooks/use-chat-messages';
import { messagesUrl, type ChatTarget } from '@/lib/chat-target';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { MessageDTO } from '@/lib/messages';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES, MESSAGE_MAX_LENGTH, USERNAME_CHARS } from '@/lib/validators';

// Re-announce "typing" at most this often, and announce "stopped" after this much quiet.
const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 3000;
const MAX_TEXTAREA_PX = 200;

interface Attachment {
  url: string;
  kind: 'image' | 'pdf';
  name: string;
}

const MAX_SUGGESTIONS = 8;

export interface Mentionable {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface ChatInputProps {
  target: ChatTarget;
  placeholder: string;
  onSent: (message: MessageDTO) => void;
  typingUsers: TypingUser[];
  replyTo: MessageDTO | null;
  onCancelReply: () => void;
  mentionables: Mentionable[];
}

const MENTION_QUERY = new RegExp(`(?:^|[^${USERNAME_CHARS}])@([${USERNAME_CHARS}]{0,32})$`);

/** The `@partial` being typed right before the caret, if any. */
function mentionQuery(text: string, caret: number) {
  const m = MENTION_QUERY.exec(text.slice(0, caret));
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
}

function typingLabel(users: TypingUser[]) {
  if (users.length === 0) return null;
  if (users.length === 1)
    return (
      <>
        <b>{users[0].username}</b> yazıyor...
      </>
    );
  if (users.length === 2)
    return (
      <>
        <b>{users[0].username}</b> ve <b>{users[1].username}</b> yazıyor...
      </>
    );
  return <>Birkaç kişi yazıyor...</>;
}

export function ChatInput({
  target,
  placeholder,
  onSent,
  typingUsers,
  replyTo,
  onCancelReply,
  mentionables,
}: ChatInputProps) {
  const { socket } = useSocket();
  const [content, setContent] = useState('');
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const mention = mentionables.length ? mentionQuery(content, caret) : null;
  const suggestions = mention
    ? mentionables
        .filter((m) => m.username.toLocaleLowerCase('tr-TR').startsWith(mention.query.toLocaleLowerCase('tr-TR')))
        .slice(0, MAX_SUGGESTIONS)
    : [];
  useEffect(() => setHighlight(0), [mention?.query]);

  // Replying focuses the box, as in Discord.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  function completeMention(username: string) {
    if (!mention) return;
    const before = content.slice(0, mention.start);
    const after = content.slice(caret);
    const inserted = `@${username} `;
    setContent(before + inserted + after);
    const pos = before.length + inserted.length;
    setCaret(pos);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function stopTyping() {
    clearTimeout(idleTimer.current);
    if (lastTypingSent.current) {
      socket?.emit('typing', { kind: target.kind, roomId: target.id, typing: false });
      lastTypingSent.current = 0;
    }
  }

  function announceTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      socket?.emit('typing', { kind: target.kind, roomId: target.id, typing: true });
      lastTypingSent.current = now;
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  // Leaving the chat (or unmounting) ends the typing state.
  useEffect(() => stopTyping, [target.kind, target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grow with the content up to a cap, like Discord.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [content]);

  async function uploadFile(file: File) {
    if (file.size > ATTACHMENT_MAX_BYTES) return setError('Dosya en fazla 8 MB olabilir');
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch<{ url: string; kind: 'image' | 'pdf' }>('/api/uploads', {
        method: 'POST',
        body: form,
      });
      setAttachment({ ...res, name: file.name });
      textareaRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const text = content.trim();
    if ((!text && !attachment) || sending || uploading) return;
    setSending(true);
    setError(null);
    try {
      const message = await apiFetch<MessageDTO>(messagesUrl(target), {
        method: 'POST',
        body: JSON.stringify({ content: text, fileUrl: attachment?.url ?? null, replyToId: replyTo?.id ?? null }),
      });
      onSent(message);
      setContent('');
      setAttachment(null);
      onCancelReply();
      stopTyping();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    setContent(content.slice(0, start) + emoji + content.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const topRounded = !!(attachment || replyTo);

  return (
    <div className="relative px-4 pb-1">
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Üye önerileri"
          className="absolute bottom-full left-4 right-4 mb-1 overflow-hidden rounded-md border border-border bg-[#2b2d31] py-1 shadow-lg"
        >
          <li className="px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">Üyeler</li>
          {suggestions.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                // mousedown, not click: keep the textarea focused.
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeMention(m.username);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === highlight ? 'bg-secondary' : ''}`}
              >
                <UserAvatar username={m.username} avatarUrl={m.avatarUrl} className="h-6 w-6 text-[10px]" />
                {m.username}
              </button>
            </li>
          ))}
        </ul>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 rounded-t-lg bg-[#2b2d31] px-4 py-2 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            <b className="text-foreground">@{replyTo.user.username}</b> kullanıcısına yanıt veriliyor
          </span>
          <button type="button" title="Yanıtı iptal et" onClick={onCancelReply} className="hover:text-foreground">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
      {attachment && (
        <div className={`mb-0 flex items-center gap-3 bg-[#383a40] p-3 ${replyTo ? '' : 'rounded-t-lg'}`}>
          {attachment.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.url} alt="" className="h-20 w-20 rounded object-cover" />
          ) : (
            <FileText className="h-10 w-10 text-[#00a8fc]" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
          <button
            type="button"
            title="Eki kaldır"
            className="rounded p-1 text-destructive hover:bg-secondary"
            onClick={() => setAttachment(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        className={
          topRounded
            ? 'flex items-start gap-3 rounded-b-lg border-t border-border bg-[#383a40] px-4 py-2.5'
            : 'flex items-start gap-3 rounded-lg bg-[#383a40] px-4 py-2.5'
        }
      >
        <button
          type="button"
          title="Dosya yükle"
          disabled={uploading || !!attachment}
          className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <PlusCircle className="h-6 w-6" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={Object.keys(ATTACHMENT_MIME_TYPES).join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
            e.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={placeholder}
          aria-label="Mesaj"
          onChange={(e) => {
            setContent(e.target.value);
            setCaret(e.target.selectionStart);
            if (e.target.value) announceTyping();
            else stopTyping();
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                completeMention(suggestions[highlight].username);
                return;
              }
            }
            if (e.key === 'Escape' && replyTo) {
              onCancelReply();
              return;
            }
            // Enter sends; Shift+Enter is a newline; never send mid-IME composition.
            // Phone keyboards' Enter is a newline, as in Discord's app: they get a send button.
            const touch = window.matchMedia('(hover: none)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-0.5 text-[15px] placeholder:text-muted-foreground focus:outline-none"
        />

        <div className="mt-0.5 max-sm:hidden">
          <EmojiPicker onSelect={insertEmoji} />
        </div>
        <button
          type="button"
          title="Gönder"
          aria-label="Gönder"
          disabled={sending || uploading || (!content.trim() && !attachment)}
          // mousedown keeps the keyboard open on phones.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void send()}
          className="mt-0.5 hidden text-primary disabled:text-muted-foreground [@media(hover:none)]:block"
        >
          <SendHorizontal className="h-6 w-6" />
        </button>
      </div>

      <div className="flex h-6 items-center justify-between text-xs">
        <span className="truncate text-muted-foreground">{typingLabel(typingUsers)}</span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}
