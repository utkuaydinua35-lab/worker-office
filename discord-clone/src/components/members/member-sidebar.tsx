import type { MemberRole } from '@prisma/client';

import { MemberList } from '@/components/members/member-list';
import { db } from '@/lib/db';
import type { MemberDTO } from '@/lib/member-dto';
import { effectiveStatus } from '@/lib/presence';
import { isOnline } from '@/lib/socket/emit';

interface MemberSidebarProps {
  serverId: string;
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/** Right column: the server's members with live presence. Hidden below the lg breakpoint. */
export async function MemberSidebar({ serverId, currentUser }: MemberSidebarProps) {
  const [server, members] = await Promise.all([
    db.server.findUniqueOrThrow({ where: { id: serverId }, select: { ownerId: true } }),
    db.member.findMany({
      where: { serverId },
      select: {
        role: true,
        serverMuted: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            bio: true,
            customStatus: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const dtos: MemberDTO[] = members.map((m) => ({
    userId: m.user.id,
    username: m.user.username,
    avatarUrl: m.user.avatarUrl,
    bio: m.user.bio,
    customStatus: m.user.customStatus,
    status: effectiveStatus(m.user.status, isOnline(m.user.id)),
    role: m.role,
    isOwner: m.user.id === server.ownerId,
    serverMuted: m.serverMuted,
    joinedServerAt: m.createdAt.toISOString(),
    accountCreatedAt: m.user.createdAt.toISOString(),
  }));

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-[#2b2d31] px-2 py-4 lg:flex">
      <MemberList serverId={serverId} members={dtos} currentUser={currentUser} />
    </aside>
  );
}
