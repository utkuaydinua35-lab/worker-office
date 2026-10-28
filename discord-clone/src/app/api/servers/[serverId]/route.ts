import { NextResponse } from 'next/server';

import { forbidden, invalid, jsonError, notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { closeVoiceRooms } from '@/lib/livekit';
import { canManageServer, getMembership } from '@/lib/membership';
import { readServerIcon } from '@/lib/server-icon';
import { closeServerRooms, emitServerUpdated } from '@/lib/socket/emit';
import { deleteUpload } from '@/lib/storage';
import { serverNameSchema } from '@/lib/validators';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ serverId: string }> };

/** multipart/form-data: name?, icon?, removeIcon? ("1"). ADMIN only. */
export async function PATCH(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const member = await getMembership(userId, params.serverId);
  if (!member) return notFound('Sunucu');
  if (!canManageServer(member.role)) return forbidden();

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, 'Geçersiz form');

  const data: { name?: string; iconUrl?: string | null } = {};
  const rawName = form.get('name');
  if (rawName !== null) {
    const name = serverNameSchema.safeParse(rawName);
    if (!name.success) return invalid(name.error);
    data.name = name.data;
  }

  const icon = await readServerIcon(form.get('icon'));
  if (icon.error) return icon.error;
  if (icon.url) data.iconUrl = icon.url;
  else if (form.get('removeIcon') === '1') data.iconUrl = null;

  const previous = await db.server.findUnique({
    where: { id: params.serverId },
    select: { iconUrl: true },
  });
  const server = await db.server.update({ where: { id: params.serverId }, data });
  if ('iconUrl' in data && previous?.iconUrl !== server.iconUrl) await deleteUpload(previous?.iconUrl);

  emitServerUpdated(server.id);
  return NextResponse.json(server);
}

/** Owner only. Cascades to members, channels and messages. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const server = await db.server.findUnique({
    where: { id: params.serverId },
    include: { channels: { select: { id: true, type: true } } },
  });
  if (!server || !(await getMembership(userId, server.id))) return notFound('Sunucu');
  if (server.ownerId !== userId) return forbidden();

  // Collect stored files before the cascade removes the rows pointing at them.
  const attachments = await db.message.findMany({
    where: { channel: { serverId: server.id }, fileUrl: { not: null } },
    select: { fileUrl: true },
  });

  await db.server.delete({ where: { id: server.id } });
  closeServerRooms(server.id, server.channels.map((c) => c.id));
  await closeVoiceRooms(server.channels.filter((c) => c.type === 'VOICE').map((c) => c.id));

  await Promise.all([server.iconUrl, ...attachments.map((a) => a.fileUrl)].map(deleteUpload));
  return new NextResponse(null, { status: 204 });
}
