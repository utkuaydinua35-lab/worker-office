'use client';

import type { MemberRole } from '@prisma/client';

import { useMemo, useState } from 'react';

import { ChatInput, type Mentionable } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useMarkReadWhileVisible } from '@/components/providers/unread-provider';
import { useChatMessages } from '@/hooks/use-chat-messages';
import type { ChatTarget } from '@/lib/chat-target';
import type { MessageDTO } from '@/lib/messages';

interface ChatRoomProps {
  target: ChatTarget;
  /** e.g. "#genel kanalına mesaj gönder". */
  placeholder: string;
  /** Shown above the first message once the whole history is loaded. */
  intro: React.ReactNode;
  /** In DMs there are no moderators; pass GUEST. */
  currentUser: { id: string; role: MemberRole };
  /** The server's members (you included): @ autocomplete and highlighting. None in DMs. */
  mentionables?: Mentionable[];
}

/** Owns the chat's message state; ChatMessages renders it, ChatInput feeds it. */
export function ChatRoom({ target, placeholder, intro, currentUser, mentionables = [] }: ChatRoomProps) {
  const chat = useChatMessages(target, currentUser.id);
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const mentionNames = useMemo(() => mentionables.map((m) => m.username), [mentionables]);
  const suggestable = useMemo(
    () => mentionables.filter((m) => m.id !== currentUser.id),
    [mentionables, currentUser.id],
  );
  useMarkReadWhileVisible(target.kind, target.id, chat.messages[chat.messages.length - 1]?.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-live={chat.live}>
      <ChatMessages
        kind={target.kind}
        intro={intro}
        currentUser={currentUser}
        chat={chat}
        onReply={setReplyTo}
        mentionNames={mentionNames}
      />
      <ChatInput
        target={target}
        placeholder={placeholder}
        onSent={chat.upsert}
        typingUsers={chat.typingUsers}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        mentionables={suggestable}
      />
    </div>
  );
}
