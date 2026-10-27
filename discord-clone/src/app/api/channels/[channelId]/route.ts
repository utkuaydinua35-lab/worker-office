import { NextResponse } from 'next/server';

import { forbidden, invalid, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { canManageChannels, getChannelAccess } from '@/lib/membership';
import { closeChannelRoom, emitServerUpdated } from '@/lib/socket/emit';
import { deleteUpload } from '@/lib/storage';
import { updateChannelSchema } from '@/lib/validators';

export const runtime = 'nodejs';

type Ctx = { params: { channelId: string } };

/** JSON { name }. ADMIN or MODERATOR. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const access = await getChannelAccess(userId, params.channelId);
  if (!access) return notFound('Kanal');
  if (!canManageChannels(access.member.role)) return forbidden();

  const parsed = updateChannelSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);

  const channel = await db.channel.update({ where: { id: params.channelId }, data: parsed.data });
  emitServerUpdated(channel.serverId);
  return NextResponse.json(channel);
}

/** ADMIN or MODERATOR. Cascades to the channel's messages. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const access = await getChannelAccess(userId, params.channelId);
  if (!access) return notFound('Kanal');
  if (!canManageChannels(access.member.role)) return forbidden();

  const attachments = await db.message.findMany({
    where: { channelId: params.channelId, fileUrl: { not: null } },
    select: { fileUrl: true },
  });
  await db.channel.delete({ where: { id: params.channelId } });
  closeChannelRoom(access.channel.serverId, params.channelId);

  await Promise.all(attachments.map((a) => deleteUpload(a.fileUrl)));
  return new NextResponse(null, { status: 204 });
}
