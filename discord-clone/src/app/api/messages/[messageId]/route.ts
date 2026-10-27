import { NextResponse } from 'next/server';

import { forbidden, invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { canModerateMessages, getChannelAccess } from '@/lib/membership';
import { messageSelect, toMessageDTO } from '@/lib/messages';
import { emitMessage } from '@/lib/socket/emit';
import { deleteUpload } from '@/lib/storage';
import { updateMessageSchema } from '@/lib/validators';

export const runtime = 'nodejs';

type Ctx = { params: { messageId: string } };

// The message plus the caller's access to its channel. Someone who has left
// the server can no longer edit or delete what they wrote there.
async function loadMessage(userId: string, messageId: string) {
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message) return null;
  const access = await getChannelAccess(userId, message.channelId);
  return access && { message, access };
}

/** JSON { content }. Author only. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const found = await loadMessage(userId, params.messageId);
  if (!found || found.message.deleted) return notFound('Mesaj');
  if (found.message.userId !== userId) return forbidden();

  const parsed = updateMessageSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  if (!parsed.data.content && !found.message.fileUrl) return jsonError(400, 'Mesaj boş olamaz');

  const row = await db.message.update({
    where: { id: params.messageId },
    data: { content: parsed.data.content },
    select: messageSelect,
  });
  const message = toMessageDTO(row);
  emitMessage('channel', 'message:update', message);
  return NextResponse.json(message);
}

/** Soft delete: the row stays so the chat shows "message deleted". Author, ADMIN or MODERATOR. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const found = await loadMessage(userId, params.messageId);
  if (!found || found.message.deleted) return notFound('Mesaj');
  const isAuthor = found.message.userId === userId;
  if (!isAuthor && !canModerateMessages(found.access.member.role)) return forbidden();

  const row = await db.message.update({
    where: { id: params.messageId },
    data: { deleted: true, content: '', fileUrl: null },
    select: messageSelect,
  });
  await deleteUpload(found.message.fileUrl);

  const message = toMessageDTO(row);
  emitMessage('channel', 'message:update', message);
  return NextResponse.json(message);
}
