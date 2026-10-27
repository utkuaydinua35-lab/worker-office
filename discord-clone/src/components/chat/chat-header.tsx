'use client';

import { Hash, Volume2 } from 'lucide-react';

import { useSocket } from '@/components/providers/socket-provider';
import { cn } from '@/lib/utils';

export function ChatHeader({ name, type }: { name: string; type: 'TEXT' | 'VOICE' }) {
  const { connected } = useSocket();
  const Icon = type === 'VOICE' ? Volume2 : Hash;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <h1 className="font-semibold">{name}</h1>
      <span
        className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
        title={connected ? 'Gerçek zamanlı bağlantı açık' : 'Yeniden bağlanılıyor...'}
      >
        <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-status-online' : 'bg-status-idle')} />
        {connected ? 'Canlı' : 'Bağlanıyor'}
      </span>
    </header>
  );
}
