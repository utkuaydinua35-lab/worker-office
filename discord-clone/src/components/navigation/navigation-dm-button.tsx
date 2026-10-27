'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/** Top of the server rail: Discord's "Direct Messages" home. */
export function NavigationDmButton() {
  const active = usePathname().startsWith('/me');

  return (
    <Link href="/me" title="Direkt Mesajlar" aria-label="Direkt Mesajlar" className="group relative flex w-full justify-center">
      <span
        className={cn(
          'absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-foreground transition-all',
          active ? 'h-10' : 'h-0 group-hover:h-5',
        )}
      />
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center transition-all',
          active
            ? 'rounded-2xl bg-primary text-primary-foreground'
            : 'rounded-3xl bg-[#313338] group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground',
        )}
      >
        <MessageSquare className="h-6 w-6" />
      </span>
    </Link>
  );
}
