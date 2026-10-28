import type { MemberRole } from '@prisma/client';

import { MemberList } from '@/components/members/member-list';
import { db } from '@/lib/db';
import type { MemberDTO } from '@/lib/member-dto';
import { effectiveStatus } from '@/lib/presence';
import { isOnline } from '@/lib/socket/emit';
import { cn } from '@/lib/utils';

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
    <aside
      className={cn(
        'flex w-60 shrink-0 flex-col overflow-y-auto bg-[#2b2d31] px-2 py-4',
        // Narrower screens: a drawer from the right (header's members button).
        'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:translate-x-full max-lg:transition-transform max-lg:duration-200 max-lg:group-data-[panel=members]/app:translate-x-0',
      )}
    >
      <MemberList serverId={serverId} members={dtos} currentUser={currentUser} />
    </aside>
  );
}
