import type { MemberRole } from '@prisma/client';

import { db } from '@/lib/db';

export function getMembership(userId: string, serverId: string) {
  return db.member.findUnique({ where: { userId_serverId: { userId, serverId } } });
}

/** The channel plus the caller's membership in its server, or null if either is missing. */
export async function getChannelAccess(userId: string, channelId: string) {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    include: { server: { select: { id: true, ownerId: true } } },
  });
  if (!channel) return null;
  const member = await getMembership(userId, channel.serverId);
  if (!member) return null;
  return { channel, member };
}

export const canManageServer = (role: MemberRole) => role === 'ADMIN';
export const canManageChannels = (role: MemberRole) => role === 'ADMIN' || role === 'MODERATOR';
export const canModerateMessages = (role: MemberRole) => role === 'ADMIN' || role === 'MODERATOR';
