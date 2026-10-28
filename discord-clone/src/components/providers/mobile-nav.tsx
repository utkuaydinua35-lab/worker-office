'use client';

import { Menu, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Phones get Discord's mobile layout: the chat fills the screen, the server
 * rail + channel list slide in from the left (☰) and the member list from the
 * right. The sidebars style themselves off `data-panel` on this shell
 * (`group/app`), so they stay server components. From md / lg up nothing here
 * applies and the columns sit side by side as before.
 */
type Panel = 'none' | 'nav' | 'members';

const MobileNavContext = createContext<{ panel: Panel; setPanel: (p: Panel) => void } | null>(null);

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav must be used inside <AppShell>');
  return ctx;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [panel, setPanel] = useState<Panel>('none');
  // Navigating closes the drawers; the DM home has nothing to show without its list.
  useEffect(() => setPanel(pathname === '/me' ? 'nav' : 'none'), [pathname]);
  const value = useMemo(() => ({ panel, setPanel }), [panel]);

  return (
    <MobileNavContext.Provider value={value}>
      <div data-panel={panel} className="group/app relative flex h-dvh overflow-hidden">
        {children}
        {panel !== 'none' && (
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setPanel('none')}
            className={cn('fixed inset-0 z-30 bg-black/60', panel === 'nav' ? 'md:hidden' : 'lg:hidden')}
          />
        )}
      </div>
    </MobileNavContext.Provider>
  );
}

/** ☰ in a header: opens the server rail and channel list on phones. */
export function MobileNavButton({ className }: { className?: string }) {
  const { setPanel } = useMobileNav();
  return (
    <button
      type="button"
      aria-label="Kanallar"
      title="Kanallar"
      onClick={() => setPanel('nav')}
      className={cn('-ml-1 rounded p-1 text-muted-foreground hover:text-foreground md:hidden', className)}
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}

/** Opens the member list where it doesn't fit beside the chat. */
export function MobileMembersButton() {
  const { setPanel } = useMobileNav();
  return (
    <button
      type="button"
      aria-label="Üyeler"
      title="Üyeler"
      onClick={() => setPanel('members')}
      className="text-muted-foreground hover:text-foreground lg:hidden"
    >
      <Users className="h-5 w-5" />
    </button>
  );
}
