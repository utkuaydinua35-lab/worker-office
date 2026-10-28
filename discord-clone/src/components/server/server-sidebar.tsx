import type { MemberRole } from '@prisma/client';

import { NowPlayingPanel } from '@/components/music/now-playing-panel';
import { ServerChannelList } from '@/components/server/server-channel-list';
import { ServerHeader } from '@/components/server/server-header';
import { ServerRealtime } from '@/components/server/server-realtime';
import { UserPanel } from '@/components/server/user-panel';
import { db } from '@/lib/db';
import { canManageChannels } from '@/lib/membership';
import { getServerVoiceState } from '@/lib/voice-presence/store';

interface ServerSidebarProps {
  serverId: string;
  userId: string;
  role: MemberRole;
}

/** Second column: server header menu, channel list by type, and the current user's panel. */
export async function ServerSidebar({ serverId, userId, role }: ServerSidebarProps) {
  const server = await db.server.findUniqueOrThrow({
    where: { id: serverId },
    include: { channels: { orderBy: { createdAt: 'asc' } } },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, avatarUrl: true, status: true, customStatus: true },
  });

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[#2b2d31]">
      <ServerRealtime serverId={server.id} />
      <ServerHeader
        server={{ id: server.id, name: server.name, iconUrl: server.iconUrl, inviteCode: server.inviteCode }}
        role={role}
        isOwner={server.ownerId === userId}
      />

      <ServerChannelList
        serverId={server.id}
        channels={server.channels.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        canManage={canManageChannels(role)}
        initialVoice={getServerVoiceState(server.id)}
        viewer={{ id: userId, role, isOwner: server.ownerId === userId }}
      />

      <NowPlayingPanel serverId={server.id} />
      <UserPanel user={user} />
    </aside>
  );
}
