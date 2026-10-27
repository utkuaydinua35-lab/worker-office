import { NextResponse } from 'next/server';
import { z } from 'zod';

import { forbidden, invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { getOrCreateConversation, shareAServer } from '@/lib/conversation';
import { db } from '@/lib/db';

const bodySchema = z.object({ userId: z.string().uuid() });

/** JSON { userId } → { id }: opens (or reuses) the DM conversation with that user. */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const otherId = parsed.data.userId;
  if (otherId === userId) return jsonError(400, 'Kendine mesaj gönderemezsin');

  if (!(await db.user.findUnique({ where: { id: otherId }, select: { id: true } }))) {
    return notFound('Kullanıcı');
  }
  if (!(await shareAServer(userId, otherId))) return forbidden();

  const conversation = await getOrCreateConversation(userId, otherId);
  return NextResponse.json({ id: conversation.id });
}
