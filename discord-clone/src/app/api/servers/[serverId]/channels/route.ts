import { NextResponse } from 'next/server';

import { forbidden, invalid, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { canManageChannels, getMembership } from '@/lib/membership';
import { emitServerUpdated } from '@/lib/socket/emit';
import { createChannelSchema } from '@/lib/validators';

/** JSON { name, type: TEXT | VOICE }. ADMIN or MODERATOR. */
export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.serverId);
  if (!member) return notFound('Sunucu');
  if (!canManageChannels(member.role)) return forbidden();

  const parsed = createChannelSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);

  const channel = await db.channel.create({
    data: { ...parsed.data, serverId: params.serverId },
  });
  emitServerUpdated(params.serverId);
  return NextResponse.json(channel, { status: 201 });
}
