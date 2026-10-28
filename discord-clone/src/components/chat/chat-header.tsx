'use client';

import { Hash, Volume2 } from 'lucide-react';

import { PinnedMessages } from '@/components/chat/pinned-messages';
import { MobileMembersButton, MobileNavButton } from '@/components/providers/mobile-nav';
import { useSocket } from '@/components/providers/socket-provider';
import type { ChatTarget } from '@/lib/chat-target';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  name: string;
  type: 'TEXT' | 'VOICE';
  /** Text channels: show the pinned-messages button. */
  pins?: { target: ChatTarget; canUnpin: boolean };
  /** The page has a member list (drawer on narrow screens). */
  members?: boolean;
}

export function ChatHeader({ name, type, pins, members }: ChatHeaderProps) {
  const { connected } = useSocket();
  const Icon = type === 'VOICE' ? Volume2 : Hash;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4">
      <MobileNavButton />
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <h1 className="truncate font-semibold">{name}</h1>
      <div className="ml-auto flex items-center gap-4">
        {pins && <PinnedMessages target={pins.target} canUnpin={pins.canUnpin} />}
        {members && <MobileMembersButton />}
        <span
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={connected ? 'Gerçek zamanlı bağlantı açık' : 'Yeniden bağlanılıyor...'}
        >
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-status-online' : 'bg-status-idle')} />
          <span className="max-sm:hidden">{connected ? 'Canlı' : 'Bağlanıyor'}</span>
        </span>
      </div>
    </header>
  );
}
