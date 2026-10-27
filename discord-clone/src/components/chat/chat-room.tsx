'use client';

import type { MemberRole } from '@prisma/client';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useChannelMessages } from '@/hooks/use-channel-messages';

interface ChatRoomProps {
  channel: { id: string; name: string };
  currentUser: { id: string; role: MemberRole };
}

/** Owns the channel's message state; ChatMessages renders it, ChatInput feeds it. */
export function ChatRoom({ channel, currentUser }: ChatRoomProps) {
  const chat = useChannelMessages(channel.id, currentUser.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-live={chat.live}>
      <ChatMessages channelName={channel.name} currentUser={currentUser} chat={chat} />
      <ChatInput channel={channel} onSent={chat.upsert} typingUsers={chat.typingUsers} />
    </div>
  );
}
