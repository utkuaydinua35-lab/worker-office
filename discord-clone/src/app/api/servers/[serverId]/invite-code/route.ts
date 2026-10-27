import { NextResponse } from 'next/server';

import { forbidden, notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateInviteCode } from '@/lib/invite';
import { canManageServer, getMembership } from '@/lib/membership';

/** Replaces the invite code; the old link stops working. ADMIN only. */
export async function POST(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.serverId);
  if (!member) return notFound('Sunucu');
  if (!canManageServer(member.role)) return forbidden();

  const server = await db.server.update({
    where: { id: params.serverId },
    data: { inviteCode: generateInviteCode() },
    select: { inviteCode: true },
  });
  return NextResponse.json(server);
}
