import { NextResponse } from 'next/server';
import { z } from 'zod';

import { forbidden, invalid, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeFromVoiceRooms } from '@/lib/livekit';
import { canChangeRole, canKick } from '@/lib/roles';
import { emitServerUpdated, revokeUserServerAccess } from '@/lib/socket/emit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ serverId: string; userId: string }> };

const roleSchema = z.object({ role: z.enum(['ADMIN', 'MODERATOR', 'GUEST']) });

// Both members plus the server's owner and channels, or null if any is missing.
async function loadPair(serverId: string, actorId: string, targetId: string) {
  const server = await db.server.findUnique({
    where: { id: serverId },
    select: { id: true, ownerId: true, channels: { select: { id: true, type: true } } },
  });
  if (!server) return null;
  const members = await db.member.findMany({
    where: { serverId, userId: { in: [actorId, targetId] } },
  });
  const actor = members.find((m) => m.userId === actorId);
  const target = members.find((m) => m.userId === targetId);
  if (!actor || !target) return null;
  return {
    server,
    actor: { ...actor, isOwner: server.ownerId === actorId },
    target: { ...target, isOwner: server.ownerId === targetId },
  };
}

/** JSON { role }. ADMIN or owner, over members they outrank, and only to roles below their own. */
export async function PATCH(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const actorId = await getCurrentUserId();
  if (!actorId) return unauthorized();

  const pair = await loadPair(params.serverId, actorId, params.userId);
  if (!pair) return notFound('Üye');

  const parsed = roleSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  if (!canChangeRole(pair.actor, pair.target, parsed.data.role)) return forbidden();

  const member = await db.member.update({
    where: { id: pair.target.id },
    data: { role: parsed.data.role },
    select: { userId: true, role: true },
  });
  emitServerUpdated(params.serverId);
  return NextResponse.json(member);
}

/** Kick. MODERATOR or above, over members they outrank. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const actorId = await getCurrentUserId();
  if (!actorId) return unauthorized();

  const pair = await loadPair(params.serverId, actorId, params.userId);
  if (!pair) return notFound('Üye');
  if (!canKick(pair.actor, pair.target)) return forbidden();

  await db.member.delete({ where: { id: pair.target.id } });
  revokeUserServerAccess(params.userId, params.serverId, pair.server.channels.map((c) => c.id));
  emitServerUpdated(params.serverId);

  // Drop them from any of the server's voice rooms they're in right now.
  await removeFromVoiceRooms(
    params.userId,
    pair.server.channels.filter((c) => c.type === 'VOICE').map((c) => c.id),
  );

  return new NextResponse(null, { status: 204 });
}
