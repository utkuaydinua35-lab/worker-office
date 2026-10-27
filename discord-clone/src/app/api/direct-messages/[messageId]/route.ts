import { NextResponse } from 'next/server';

import { forbidden, invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { getConversationAccess } from '@/lib/conversation';
import { db } from '@/lib/db';
import { directMessageSelect, toDirectMessageDTO } from '@/lib/messages';
import { emitMessage } from '@/lib/socket/emit';
import { deleteUpload } from '@/lib/storage';
import { updateMessageSchema } from '@/lib/validators';

export const runtime = 'nodejs';

type Ctx = { params: { messageId: string } };

// DMs have no moderators: only the author may edit or delete.
async function loadOwnMessage(userId: string, messageId: string) {
  const message = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!message || message.deleted) return { error: notFound('Mesaj') };
  if (!(await getConversationAccess(userId, message.conversationId))) return { error: notFound('Mesaj') };
  if (message.userId !== userId) return { error: forbidden() };
  return { message };
}

/** JSON { content }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const found = await loadOwnMessage(userId, params.messageId);
  if (found.error) return found.error;

  const parsed = updateMessageSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  if (!parsed.data.content && !found.message.fileUrl) return jsonError(400, 'Mesaj boş olamaz');

  const row = await db.directMessage.update({
    where: { id: params.messageId },
    data: { content: parsed.data.content },
    select: directMessageSelect,
  });
  const message = toDirectMessageDTO(row);
  emitMessage('conversation', 'message:update', message);
  return NextResponse.json(message);
}

/** Soft delete, like channel messages. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const found = await loadOwnMessage(userId, params.messageId);
  if (found.error) return found.error;

  const row = await db.directMessage.update({
    where: { id: params.messageId },
    data: { deleted: true, content: '', fileUrl: null },
    select: directMessageSelect,
  });
  await deleteUpload(found.message.fileUrl);

  const message = toDirectMessageDTO(row);
  emitMessage('conversation', 'message:update', message);
  return NextResponse.json(message);
}
