import { Hash } from 'lucide-react';
import { redirect } from 'next/navigation';

import { ChatHeader } from '@/components/chat/chat-header';
import { ChatRoom } from '@/components/chat/chat-room';
import { MemberSidebar } from '@/components/members/member-sidebar';
import { VoiceChannelView } from '@/components/voice/voice-channel-view';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { canModerateMessages, getChannelAccess } from '@/lib/membership';

export default async function ChannelPage(props: {
  params: Promise<{ serverId: string; channelId: string }>;
}) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const access = await getChannelAccess(userId, params.channelId);
  // Deleted channel, or one from another server in the URL.
  if (!access || access.channel.serverId !== params.serverId) redirect(`/servers/${params.serverId}`);
  const { channel, member } = access;
  const currentUser = { id: userId, role: member.role, isOwner: channel.server.ownerId === userId };

  if (channel.type === 'VOICE') {
    return (
      <>
        <ChatHeader name={channel.name} type="VOICE" />
        <VoiceChannelView
          key={channel.id}
          channel={{ id: channel.id, name: channel.name }}
          server={{ id: channel.server.id, name: channel.server.name }}
          currentUser={currentUser}
        />
      </>
    );
  }

  const members = await db.member.findMany({
    where: { serverId: params.serverId, userId: { not: userId } },
    select: { user: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { user: { username: 'asc' } },
  });
  const target = { kind: 'channel' as const, id: channel.id };

  return (
    <>
      <ChatHeader
        name={channel.name}
        type="TEXT"
        pins={{ target, canUnpin: currentUser.isOwner || canModerateMessages(member.role) }}
      />
      <div className="flex min-h-0 flex-1">
        <ChatRoom
          key={channel.id}
          target={target}
          mentionables={members.map((m) => m.user)}
          placeholder={`#${channel.name} kanalına mesaj gönder`}
          intro={
            <>
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <Hash className="h-9 w-9" />
              </div>
              <h2 className="text-3xl font-bold">#{channel.name} kanalına hoş geldin!</h2>
              <p className="text-muted-foreground">Bu, #{channel.name} kanalının başlangıcı.</p>
            </>
          }
          currentUser={currentUser}
        />
        <MemberSidebar serverId={params.serverId} currentUser={currentUser} />
      </div>
    </>
  );
}
