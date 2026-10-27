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

/** Kick: same rule as server mute. */
export const canKick = canServerMute;

/**
 * Role change: ADMIN (or the owner) over a member they outrank, and never to a
 * role at or above their own — only the owner can make admins.
 */
export const canChangeRole = (actor: RoleHolder, target: RoleHolder, newRole?: MemberRole) =>
  (actor.isOwner || actor.role === 'ADMIN') &&
  outranks(actor, target) &&
  (newRole === undefined || actor.isOwner || ROLE_RANK[newRole] < ROLE_RANK[actor.role]);

/** Roles `actor` may hand out, highest first. */
export const assignableRoles = (actor: RoleHolder): MemberRole[] =>
  (['ADMIN', 'MODERATOR', 'GUEST'] as const).filter(
    (r) => actor.isOwner || ROLE_RANK[r] < ROLE_RANK[actor.role],
  );
