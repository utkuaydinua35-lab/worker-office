'use client';

import type { MemberRole } from '@prisma/client';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useChatMessages } from '@/hooks/use-chat-messages';
import type { ChatTarget } from '@/lib/chat-target';

interface ChatRoomProps {
  target: ChatTarget;
  /** e.g. "#genel kanalına mesaj gönder". */
  placeholder: string;
  /** Shown above the first message once the whole history is loaded. */
  intro: React.ReactNode;
  /** In DMs there are no moderators; pass GUEST. */
  currentUser: { id: string; role: MemberRole };
}

/** Owns the chat's message state; ChatMessages renders it, ChatInput feeds it. */
export function ChatRoom({ target, placeholder, intro, currentUser }: ChatRoomProps) {
  const chat = useChatMessages(target, currentUser.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-live={chat.live}>
      <ChatMessages kind={target.kind} intro={intro} currentUser={currentUser} chat={chat} />
      <ChatInput target={target} placeholder={placeholder} onSent={chat.upsert} typingUsers={chat.typingUsers} />
    </div>
  );
}
