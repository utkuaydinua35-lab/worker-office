'use client';

import { FileText, Loader2, PlusCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EmojiPicker } from '@/components/chat/emoji-picker';
import { useSocket } from '@/components/providers/socket-provider';
import type { TypingUser } from '@/hooks/use-channel-messages';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { MessageDTO } from '@/lib/messages';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES, MESSAGE_MAX_LENGTH } from '@/lib/validators';

// Re-announce "typing" at most this often, and announce "stopped" after this much quiet.
const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 3000;
const MAX_TEXTAREA_PX = 200;

interface Attachment {
  url: string;
  kind: 'image' | 'pdf';
  name: string;
}

interface ChatInputProps {
  channel: { id: string; name: string };
  onSent: (message: MessageDTO) => void;
  typingUsers: TypingUser[];
}

function typingLabel(users: TypingUser[]) {
  if (users.length === 0) return null;
  if (users.length === 1) return <><b>{users[0].username}</b> yazıyor...</>;
  if (users.length === 2) return <><b>{users[0].username}</b> ve <b>{users[1].username}</b> yazıyor...</>;
  return <>Birkaç kişi yazıyor...</>;
}

export function ChatInput({ channel, onSent, typingUsers }: ChatInputProps) {
  const { socket } = useSocket();
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  function stopTyping() {
    clearTimeout(idleTimer.current);
    if (lastTypingSent.current) {
      socket?.emit('typing', { channelId: channel.id, typing: false });
      lastTypingSent.current = 0;
    }
  }

  function announceTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      socket?.emit('typing', { channelId: channel.id, typing: true });
      lastTypingSent.current = now;
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  // Leaving the channel (or unmounting) ends the typing state.
  useEffect(() => stopTyping, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const message = await apiFetch<MessageDTO>(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text, fileUrl: attachment?.url ?? null }),
      });
      onSent(message);
      setContent('');
      setAttachment(null);
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

  return (
    <div className="px-4 pb-1">
      {attachment && (
        <div className="mb-0 flex items-center gap-3 rounded-t-lg bg-[#383a40] p-3">
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
          attachment
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
          placeholder={`#${channel.name} kanalına mesaj gönder`}
          aria-label="Mesaj"
          onChange={(e) => {
            setContent(e.target.value);
            if (e.target.value) announceTyping();
            else stopTyping();
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline; never send mid-IME composition.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-0.5 text-[15px] placeholder:text-muted-foreground focus:outline-none"
        />

        <div className="mt-0.5">
          <EmojiPicker onSelect={insertEmoji} />
        </div>
      </div>

      <div className="flex h-6 items-center justify-between text-xs">
        <span className="truncate text-muted-foreground">{typingLabel(typingUsers)}</span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}
