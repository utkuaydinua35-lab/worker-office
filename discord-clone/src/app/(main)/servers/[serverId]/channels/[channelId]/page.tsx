import { redirect } from 'next/navigation';

import { ChatHeader } from '@/components/chat/chat-header';
import { ChatRoom } from '@/components/chat/chat-room';
import { VoiceRoomLoader } from '@/components/voice/voice-room-loader';
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

  return (
    <>
      <ChatHeader name={channel.name} type={channel.type} />
      {channel.type === 'TEXT' ? (
        <ChatRoom
          key={channel.id}
          channel={{ id: channel.id, name: channel.name }}
          currentUser={{ id: userId, role: member.role }}
        />
      ) : (
        <VoiceRoomLoader
          key={channel.id}
          channel={{ id: channel.id, name: channel.name }}
          serverId={params.serverId}
          currentUser={{ id: userId, role: member.role, isOwner: channel.server.ownerId === userId }}
        />
      )}
    </>
  );
}
