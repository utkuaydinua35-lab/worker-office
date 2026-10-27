import { NextResponse } from 'next/server';

import { jsonError, notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMembership } from '@/lib/membership';
import { emitServerUpdated, revokeUserServerAccess } from '@/lib/socket/emit';

export async function POST(_req: Request, { params }: { params: { serverId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const server = await db.server.findUnique({
    where: { id: params.serverId },
    include: { channels: { select: { id: true } } },
  });
  const member = server && (await getMembership(userId, server.id));
  if (!server || !member) return notFound('Sunucu');
  // The owner would leave the server ownerless; they delete it instead.
  if (server.ownerId === userId) return jsonError(400, 'Sunucu sahibi ayrılamaz; sunucuyu silebilirsin');

  await db.member.delete({ where: { id: member.id } });
  revokeUserServerAccess(userId, server.id, server.channels.map((c) => c.id));
  emitServerUpdated(server.id);

  return new NextResponse(null, { status: 204 });
}
