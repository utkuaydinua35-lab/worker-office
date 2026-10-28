import type { MemberRole } from '@prisma/client';

import { NowPlayingPanel } from '@/components/music/now-playing-panel';
import { ServerChannel } from '@/components/server/server-channel';
import { ServerHeader } from '@/components/server/server-header';
import { ServerRealtime } from '@/components/server/server-realtime';
import { ServerSection } from '@/components/server/server-section';
import { UserPanel } from '@/components/server/user-panel';
import { db } from '@/lib/db';
import { canManageChannels } from '@/lib/membership';

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

  const textChannels = server.channels.filter((c) => c.type === 'TEXT');
  const voiceChannels = server.channels.filter((c) => c.type === 'VOICE');
  const manage = canManageChannels(role);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[#2b2d31]">
      <ServerRealtime serverId={server.id} />
      <ServerHeader
        server={{ id: server.id, name: server.name, iconUrl: server.iconUrl, inviteCode: server.inviteCode }}
        role={role}
        isOwner={server.ownerId === userId}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {[
          { type: 'TEXT' as const, label: 'Metin Kanalları', channels: textChannels },
          { type: 'VOICE' as const, label: 'Ses Kanalları', channels: voiceChannels },
        ].map((section) => (
          <div key={section.type}>
            <ServerSection
              label={section.label}
              serverId={server.id}
              channelType={section.type}
              canCreate={manage}
            />
            <div className="space-y-0.5">
              {section.channels.map((channel) => (
                <ServerChannel
                  key={channel.id}
                  serverId={server.id}
                  channel={{ id: channel.id, name: channel.name, type: channel.type }}
                  canManage={manage}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <NowPlayingPanel serverId={server.id} />
      <UserPanel user={user} />
    </aside>
  );
}
