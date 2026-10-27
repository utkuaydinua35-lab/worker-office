'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { cn } from '@/lib/utils';

export function NavigationItem({ id, name, iconUrl }: { id: string; name: string; iconUrl: string | null }) {
  const params = useParams<{ serverId?: string }>();
  const active = params.serverId === id;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <Link href={`/servers/${id}`} title={name} className="group relative flex w-full justify-center">
      {/* Discord's left "pill": tall when active, short on hover. */}
      <span
        className={cn(
          'absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-foreground transition-all',
          active ? 'h-10' : 'h-0 group-hover:h-5',
        )}
      />
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center overflow-hidden bg-[#313338] text-sm font-semibold transition-all',
          active
            ? 'rounded-2xl bg-primary text-primary-foreground'
            : 'rounded-3xl group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground',
        )}
      >
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </span>
    </Link>
  );
}
