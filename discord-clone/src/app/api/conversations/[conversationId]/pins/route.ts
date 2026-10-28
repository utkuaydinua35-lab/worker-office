import { NextResponse } from 'next/server';

import { notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { getConversationAccess } from '@/lib/conversation';
import { listPins } from '@/lib/message-features';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getConversationAccess(userId, conversationId))) return notFound('Konuşma');
  return NextResponse.json(await listPins('conversation', conversationId));
}
