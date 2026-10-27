import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { UserStatusValue } from '@/lib/validators';

const STATUS_DOT: Record<UserStatusValue, string> = {
  ONLINE: 'bg-status-online',
  IDLE: 'bg-status-idle',
  DND: 'bg-status-dnd',
  OFFLINE: 'bg-status-offline',
};

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  status?: UserStatusValue;
  className?: string;
}

export function UserAvatar({ username, avatarUrl, status, className }: UserAvatarProps) {
  return (
    <div className="relative inline-block">
      <Avatar className={cn('h-10 w-10', className)}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
        <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-card',
            STATUS_DOT[status],
          )}
          aria-label={status}
        />
      )}
    </div>
  );
}
