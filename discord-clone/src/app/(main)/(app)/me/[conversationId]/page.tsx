import { AtSign } from 'lucide-react';
import { redirect } from 'next/navigation';

import { ChatRoom } from '@/components/chat/chat-room';
import { PinnedMessages } from '@/components/chat/pinned-messages';
import { UserAvatar } from '@/components/user/user-avatar';
import { getCurrentUserId } from '@/lib/auth';
import { getConversationAccess } from '@/lib/conversation';
import { db } from '@/lib/db';

export default async function ConversationPage(props: { params: Promise<{ conversationId: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const access = await getConversationAccess(userId, params.conversationId);
  if (!access) redirect('/me');

  const partner = await db.user.findUniqueOrThrow({
    where: { id: access.otherUserId },
    select: { username: true, avatarUrl: true },
  });

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4">
        <AtSign className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-semibold">{partner.username}</h1>
        <div className="ml-auto">
          <PinnedMessages target={{ kind: 'conversation', id: params.conversationId }} canUnpin />
        </div>
      </header>
      <ChatRoom
        key={params.conversationId}
        target={{ kind: 'conversation', id: params.conversationId }}
        placeholder={`@${partner.username} kullanıcısına mesaj gönder`}
        intro={
          <>
            <UserAvatar username={partner.username} avatarUrl={partner.avatarUrl} className="mb-2 h-20 w-20 text-2xl" />
            <h2 className="text-3xl font-bold">{partner.username}</h2>
            <p className="text-muted-foreground">
              Bu, <b>@{partner.username}</b> ile direkt mesaj geçmişinin başlangıcı.
            </p>
          </>
        }
        // DMs have no moderators.
        currentUser={{ id: userId, role: 'GUEST' }}
      />
    </>
  );
}
