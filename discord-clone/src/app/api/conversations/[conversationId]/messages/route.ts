import { NextResponse } from 'next/server';

import { invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { getConversationAccess } from '@/lib/conversation';
import { db } from '@/lib/db';
import {
  directMessageSelect,
  MESSAGES_PAGE_SIZE,
  toDirectMessageDTO,
  type MessagePage,
} from '@/lib/messages';
import { emitConversationActivity, emitMessage } from '@/lib/socket/emit';
import { isOwnUploadUrl } from '@/lib/storage';
import { createMessageSchema } from '@/lib/validators';

type Ctx = { params: { conversationId: string } };

/** Newest first, MESSAGES_PAGE_SIZE per page. `?cursor=<messageId>` continues with older ones. */
export async function GET(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getConversationAccess(userId, params.conversationId))) return notFound('Konuşma');

  const cursor = new URL(req.url).searchParams.get('cursor');
  const rows = await db.directMessage.findMany({
    where: { conversationId: params.conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MESSAGES_PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: directMessageSelect,
  });

  const page: MessagePage = {
    items: rows.map(toDirectMessageDTO),
    nextCursor: rows.length === MESSAGES_PAGE_SIZE ? rows[rows.length - 1].id : null,
  };
  return NextResponse.json(page);
}

/** JSON { content, fileUrl? } — fileUrl must come from POST /api/uploads. */
export async function POST(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const access = await getConversationAccess(userId, params.conversationId);
  if (!access) return notFound('Konuşma');

  const parsed = createMessageSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { content, fileUrl } = parsed.data;
  if (fileUrl && !isOwnUploadUrl(fileUrl, 'attachments')) return jsonError(400, 'Geçersiz dosya');

  const row = await db.directMessage.create({
    data: { content, fileUrl: fileUrl ?? null, userId, conversationId: params.conversationId },
    select: directMessageSelect,
  });
  const message = toDirectMessageDTO(row);
  emitMessage('conversation', 'message:new', message);
  emitConversationActivity(params.conversationId, [userId, access.otherUserId]);
  return NextResponse.json(message, { status: 201 });
}
