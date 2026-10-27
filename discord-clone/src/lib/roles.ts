// Pure role rules — no database access, so client components can use them too.
import type { MemberRole } from '@prisma/client';

const ROLE_RANK: Record<MemberRole, number> = { GUEST: 0, MODERATOR: 1, ADMIN: 2 };

export interface RoleHolder {
  role: MemberRole;
  isOwner: boolean;
}

export const canManageServer = (role: MemberRole) => role === 'ADMIN';
export const canManageChannels = (role: MemberRole) => role === 'ADMIN' || role === 'MODERATOR';
export const canModerateMessages = (role: MemberRole) => role === 'ADMIN' || role === 'MODERATOR';

/**
 * Whether `actor` may moderate `target` (server mute; kick in stage 4): the
 * owner outranks everyone, otherwise the actor's role must be strictly higher.
 */
export function outranks(actor: RoleHolder, target: RoleHolder) {
  if (target.isOwner) return false;
  if (actor.isOwner) return true;
  return ROLE_RANK[actor.role] > ROLE_RANK[target.role];
}

/** Server mute: MODERATOR or above, and only members the actor outranks. */
export const canServerMute = (actor: RoleHolder, target: RoleHolder) =>
  (actor.isOwner || actor.role !== 'GUEST') && outranks(actor, target);
