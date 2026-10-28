import { NextResponse } from 'next/server';

import { notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelAccess } from '@/lib/membership';

export const runtime = 'nodejs';

/** Marks the channel read up to now (clears its unread marker and mention badge). */
export async function POST(_req: Request, ctx: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getChannelAccess(userId, channelId))) return notFound('Kanal');

  const lastReadAt = new Date();
  await db.channelRead.upsert({
    where: { userId_channelId: { userId, channelId } },
    update: { lastReadAt },
    create: { userId, channelId, lastReadAt },
  });
  return new NextResponse(null, { status: 204 });
}
