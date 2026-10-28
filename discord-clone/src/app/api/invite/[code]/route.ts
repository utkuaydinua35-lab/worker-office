import { NextResponse } from 'next/server';

import { notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { emitServerUpdated } from '@/lib/socket/emit';

/** Joins the server behind an invite code. Idempotent for existing members. */
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const server = await db.server.findUnique({
    where: { inviteCode: params.code },
    select: { id: true },
  });
  if (!server) return notFound('Davet');

  const existing = await db.member.findUnique({
    where: { userId_serverId: { userId, serverId: server.id } },
  });
  if (!existing) {
    // upsert, not create: two clicks in flight must not 500 on the unique key.
    await db.member.upsert({
      where: { userId_serverId: { userId, serverId: server.id } },
      update: {},
      create: { userId, serverId: server.id, role: 'GUEST' },
    });
    emitServerUpdated(server.id);
  }

  return NextResponse.json({ serverId: server.id, alreadyMember: !!existing });
}
