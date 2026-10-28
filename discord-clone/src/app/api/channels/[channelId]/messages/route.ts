import { NextResponse } from 'next/server';

import { invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getChannelAccess } from '@/lib/membership';
import { mentionedUsernames, messageSelect, MESSAGES_PAGE_SIZE, toMessageDTO, type MessagePage } from '@/lib/messages';
import { getMusicService, looksLikeCommand } from '@/lib/music/bridge';
import { emitChannelActivity, emitMessage } from '@/lib/socket/emit';
import { isOwnUploadUrl } from '@/lib/storage';
import { createMessageSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ channelId: string }> };

/** Newest first, MESSAGES_PAGE_SIZE per page. `?cursor=<messageId>` continues with older ones. */
export async function GET(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  if (!(await getChannelAccess(userId, params.channelId))) return notFound('Kanal');

  const cursor = new URL(req.url).searchParams.get('cursor');
  const rows = await db.message.findMany({
    where: { channelId: params.channelId },
    // id breaks ties between messages created in the same millisecond.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MESSAGES_PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const page: MessagePage = {
    items: rows.map(toMessageDTO),
    nextCursor: rows.length === MESSAGES_PAGE_SIZE ? rows[rows.length - 1].id : null,
  };
  return NextResponse.json(page);
}

/** JSON { content, fileUrl? } — fileUrl must come from POST /api/uploads. */
export async function POST(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const access = await getChannelAccess(userId, params.channelId);
  if (!access) return notFound('Kanal');
  if (access.channel.type !== 'TEXT') return jsonError(400, 'Ses kanalına mesaj gönderilemez');

  const parsed = createMessageSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);

  const { content, fileUrl, replyToId } = parsed.data;
  if (fileUrl && !isOwnUploadUrl(fileUrl, 'attachments')) return jsonError(400, 'Geçersiz dosya');
  if (replyToId) {
    const target = await db.message.findUnique({ where: { id: replyToId }, select: { channelId: true } });
    if (target?.channelId !== params.channelId) return jsonError(400, 'Yanıtlanan mesaj bulunamadı');
  }

  // @name → the server's members by that name (case-insensitive), never yourself.
  const names = mentionedUsernames(content);
  const mentioned = names.length
    ? await db.member.findMany({
        where: {
          serverId: access.channel.serverId,
          userId: { not: userId },
          user: { OR: names.map((n) => ({ username: { equals: n, mode: 'insensitive' as const } })) },
        },
        select: { userId: true },
      })
    : [];
  // A reply pings the author it answers, as Discord does by default.
  const replyAuthor = replyToId
    ? (await db.message.findUnique({ where: { id: replyToId }, select: { userId: true } }))?.userId
    : undefined;
  const mentions = [
    ...new Set([...mentioned.map((m) => m.userId), ...(replyAuthor && replyAuthor !== userId ? [replyAuthor] : [])]),
  ];

  const row = await db.message.create({
    data: {
      content,
      fileUrl: fileUrl ?? null,
      userId,
      channelId: params.channelId,
      replyToId: replyToId ?? null,
      mentions,
    },
    select: messageSelect,
  });
  const message = toMessageDTO(row);
  emitMessage('channel', 'message:new', message);
  void emitChannelActivity(access.channel.serverId, {
    serverId: access.channel.serverId,
    channelId: access.channel.id,
    channelName: access.channel.name,
    messageId: message.id,
    authorId: userId,
    authorName: row.user.username,
    preview: content.slice(0, 120),
    mentions,
  });

  // Bot commands ("!play ...") stay ordinary messages; the bot replies on its own time.
  if (looksLikeCommand(content)) {
    getMusicService()
      ?.handleCommand({
        serverId: access.channel.serverId,
        textChannelId: access.channel.id,
        userId,
        username: row.user.username,
        role: access.member.role,
        isOwner: access.channel.server.ownerId === userId,
        content,
      })
      .catch((err) => console.error('[music] command failed', err));
  }
  return NextResponse.json(message, { status: 201 });
}
