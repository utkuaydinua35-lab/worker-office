import { DmList, type DmListEntry } from '@/components/dm/dm-list';
import { UserPanel } from '@/components/server/user-panel';
import { db } from '@/lib/db';
import { effectiveStatus } from '@/lib/presence';
import { isOnline } from '@/lib/socket/emit';
import { LEFT_DRAWER } from '@/lib/mobile-layout';
import { cn } from '@/lib/utils';

const partnerSelect = { select: { id: true, username: true, avatarUrl: true, status: true } } as const;

/** DM home column: conversations with at least one message, most recent first. */
export async function DmSidebar({ userId }: { userId: string }) {
  const [me, conversations] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, avatarUrl: true, status: true, customStatus: true },
    }),
    db.conversation.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        directMessages: { some: {} },
      },
      select: {
        id: true,
        userOne: partnerSelect,
        userTwo: partnerSelect,
        directMessages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  const entries: DmListEntry[] = conversations
    .map((c) => {
      const partner = c.userOne.id === userId ? c.userTwo : c.userOne;
      return {
        conversationId: c.id,
        userId: partner.id,
        username: partner.username,
        avatarUrl: partner.avatarUrl,
        status: effectiveStatus(partner.status, isOnline(partner.id)),
        lastMessageAt: c.directMessages[0]?.createdAt.toISOString() ?? '',
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  return (
    <aside
      className={cn(
        'flex h-full w-60 shrink-0 flex-col bg-[#2b2d31]',
        LEFT_DRAWER,
        'max-md:left-[72px] max-md:max-w-[calc(100vw-72px)] max-md:-translate-x-[calc(100%+72px)]',
      )}
    >
      <div className="flex h-12 items-center border-b border-black/30 px-4 font-semibold">Direkt Mesajlar</div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <DmList entries={entries} />
      </div>
      <UserPanel user={me} />
    </aside>
  );
}
