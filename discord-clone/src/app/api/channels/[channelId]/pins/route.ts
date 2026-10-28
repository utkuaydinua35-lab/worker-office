import { NextResponse } from 'next/server';

import { notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { getChannelAccess } from '@/lib/membership';
import { listPins } from '@/lib/message-features';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getChannelAccess(userId, channelId))) return notFound('Kanal');
  return NextResponse.json(await listPins('channel', channelId));
}
