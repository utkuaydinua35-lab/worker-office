import { NavigationActions } from '@/components/navigation/navigation-actions';
import { NavigationItem } from '@/components/navigation/navigation-item';
import { db } from '@/lib/db';

/** Far-left column: one icon per server the user belongs to, plus create/join. */
export async function NavigationSidebar({ userId }: { userId: string }) {
  const memberships = await db.member.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { server: { select: { id: true, name: true, iconUrl: true } } },
  });

  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1e1f22] py-3">
      {memberships.map(({ server }) => (
        <NavigationItem key={server.id} {...server} />
      ))}
      {memberships.length > 0 && <div className="mx-auto h-0.5 w-8 rounded bg-border" />}
      <NavigationActions />
    </nav>
  );
}
