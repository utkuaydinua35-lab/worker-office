import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/membership';
import { getMusicService } from '@/lib/music/bridge';
import { MUSIC_ACTIONS } from '@/lib/music/types';

type Ctx = { params: Promise<{ serverId: string }> };

/** The music bot's current state for this server (null when it isn't playing anywhere). */
export async function GET(_req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getMembership(userId, params.serverId))) return notFound('Sunucu');
  return NextResponse.json({ state: getMusicService()?.getState(params.serverId) ?? null });
}

const actionSchema = z.object({ action: z.enum(MUSIC_ACTIONS) });

/** JSON { action: pause | resume | skip | stop } — the now-playing panel's buttons. */
export async function POST(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const [member, server, user] = await Promise.all([
    getMembership(userId, params.serverId),
    db.server.findUnique({ where: { id: params.serverId }, select: { ownerId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  if (!member || !server || !user) return notFound('Sunucu');

  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);

  const service = getMusicService();
  if (!service) return jsonError(503, 'Müzik botu çalışmıyor');

  const result = await service.control(
    {
      serverId: params.serverId,
      userId,
      username: user.username,
      role: member.role,
      isOwner: server.ownerId === userId,
    },
    parsed.data.action,
  );
  if (!result.ok) return jsonError(409, result.error);
  return NextResponse.json({ state: service.getState(params.serverId) });
}
