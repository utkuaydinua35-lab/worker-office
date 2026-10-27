import type { MemberRole } from '@prisma/client';

import type { UserStatusValue } from '@/lib/validators';

/** A server member as the member list, profile card and context menu need it. */
export interface MemberDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  customStatus: string | null;
  /** Effective: OFFLINE when not connected or invisible. */
  status: UserStatusValue;
  role: MemberRole;
  isOwner: boolean;
  serverMuted: boolean;
  joinedServerAt: string;
  accountCreatedAt: string;
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  ADMIN: 'Yönetici',
  MODERATOR: 'Moderatör',
  GUEST: 'Üye',
};
