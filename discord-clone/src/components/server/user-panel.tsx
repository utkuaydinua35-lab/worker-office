import type { UserStatus } from '@prisma/client';
import { Settings } from 'lucide-react';
import Link from 'next/link';

import { UserAvatar } from '@/components/user/user-avatar';

const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: 'Çevrimiçi',
  IDLE: 'Boşta',
  DND: 'Rahatsız Etmeyin',
  OFFLINE: 'Görünmez',
};

interface UserPanelProps {
  user: { username: string; avatarUrl: string | null; status: UserStatus; customStatus: string | null };
}

/** Bottom of the channel column. Stage 4 adds the mic / headphone toggles. */
export function UserPanel({ user }: UserPanelProps) {
  return (
    <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
      <UserAvatar
        username={user.username}
        avatarUrl={user.avatarUrl}
        status={user.status}
        className="h-8 w-8 text-xs"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{user.username}</p>
        <p className="truncate text-xs text-muted-foreground">{user.customStatus || STATUS_LABEL[user.status]}</p>
      </div>
      <Link
        href="/settings"
        title="Kullanıcı Ayarları"
        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </div>
  );
}
