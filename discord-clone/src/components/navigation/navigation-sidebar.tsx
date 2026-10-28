import { NavigationActions } from '@/components/navigation/navigation-actions';
import { NavigationDmButton } from '@/components/navigation/navigation-dm-button';
import { NavigationItem } from '@/components/navigation/navigation-item';
import { LEFT_DRAWER } from '@/lib/mobile-layout';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

/** Far-left column: DM home, one icon per server the user belongs to, plus create/join. */
export async function NavigationSidebar({ userId }: { userId: string }) {
  const memberships = await db.member.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { server: { select: { id: true, name: true, iconUrl: true } } },
  });

  return (
    <nav
      className={cn(
        'flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1e1f22] py-3',
        LEFT_DRAWER,
        'max-md:left-0 max-md:-translate-x-full',
      )}
    >
      <NavigationDmButton />
      <div className="mx-auto h-0.5 w-8 rounded bg-border" />
      {memberships.map(({ server }) => (
        <NavigationItem key={server.id} {...server} />
      ))}
      {memberships.length > 0 && <div className="mx-auto h-0.5 w-8 rounded bg-border" />}
      <NavigationActions />
    </nav>
  );
}
