import { Hash } from 'lucide-react';
import { redirect } from 'next/navigation';

import { ChatHeader } from '@/components/chat/chat-header';
import { ChatRoom } from '@/components/chat/chat-room';
import { MemberSidebar } from '@/components/members/member-sidebar';
import { VoiceChannelView } from '@/components/voice/voice-channel-view';
import { getCurrentUserId } from '@/lib/auth';
import { getChannelAccess } from '@/lib/membership';

export default async function ChannelPage({
  params,
}: {
  params: { serverId: string; channelId: string };
}) {
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

  return (
    <>
      <ChatHeader name={channel.name} type="TEXT" />
      <div className="flex min-h-0 flex-1">
        <ChatRoom
          key={channel.id}
          target={{ kind: 'channel', id: channel.id }}
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
