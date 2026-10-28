// Reactions and pins, shared by the channel-message and direct-message routes.
import { NextResponse } from 'next/server';

import { forbidden, invalid, jsonError, notFound, readJson } from '@/lib/api';
import type { ChatKind } from '@/lib/chat-target';
import { getConversationAccess } from '@/lib/conversation';
import { db } from '@/lib/db';
import { canModerateMessages, getChannelAccess } from '@/lib/membership';
import {
  directMessageSelect,
  MAX_REACTIONS_PER_MESSAGE,
  messageSelect,
  toDirectMessageDTO,
  toMessageDTO,
  type MessageDTO,
} from '@/lib/messages';
import { emitMessage } from '@/lib/socket/emit';
import { pinSchema, reactionSchema } from '@/lib/validators';

/** Pins per channel or conversation, as in Discord. */
export const MAX_PINS = 50;

interface LoadedMessage {
  roomId: string;
  deleted: boolean;
  updatedAt: Date;
  /** Whether the caller may pin and unpin here. */
  canPin: boolean;
}

// The message if the caller can see it: a member of its server, or a participant of its DM.
async function loadMessage(kind: ChatKind, userId: string, messageId: string): Promise<LoadedMessage | null> {
  if (kind === 'channel') {
    const message = await db.message.findUnique({ where: { id: messageId } });
    if (!message) return null;
    const access = await getChannelAccess(userId, message.channelId);
    if (!access) return null;
    return {
      roomId: message.channelId,
      deleted: message.deleted,
      updatedAt: message.updatedAt,
      canPin: canModerateMessages(access.member.role),
    };
  }
  const message = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!message || !(await getConversationAccess(userId, message.conversationId))) return null;
  // DMs have no moderators: either participant may pin.
  return { roomId: message.conversationId, deleted: message.deleted, updatedAt: message.updatedAt, canPin: true };
}

async function readDTO(kind: ChatKind, messageId: string): Promise<MessageDTO> {
  return kind === 'channel'
    ? toMessageDTO(await db.message.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect }))
    : toDirectMessageDTO(
        await db.directMessage.findUniqueOrThrow({ where: { id: messageId }, select: directMessageSelect }),
      );
}

function broadcast(kind: ChatKind, message: MessageDTO) {
  emitMessage(kind, 'message:update', message);
  return NextResponse.json(message);
}

/** JSON { emoji }: adds the caller's reaction, or removes it if it's already there. */
export async function toggleReaction(kind: ChatKind, userId: string, messageId: string, req: Request) {
  const parsed = reactionSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { emoji } = parsed.data;

  const found = await loadMessage(kind, userId, messageId);
  if (!found || found.deleted) return notFound('Mesaj');

  if (kind === 'channel') {
    const key = { messageId_userId_emoji: { messageId, userId, emoji } };
    if (await db.reaction.findUnique({ where: key })) {
      await db.reaction.delete({ where: key });
    } else {
      const distinct = await db.reaction.findMany({
        where: { messageId },
        distinct: ['emoji'],
        select: { emoji: true },
      });
      if (distinct.length >= MAX_REACTIONS_PER_MESSAGE && !distinct.some((r) => r.emoji === emoji)) {
        return jsonError(409, `Bir mesaja en fazla ${MAX_REACTIONS_PER_MESSAGE} farklı tepki eklenebilir`);
      }
      // A double click races the check above; the unique key settles it.
      await db.reaction.create({ data: { messageId, userId, emoji } }).catch(() => {});
    }
  } else {
    const key = { directMessageId_userId_emoji: { directMessageId: messageId, userId, emoji } };
    if (await db.directReaction.findUnique({ where: key })) {
      await db.directReaction.delete({ where: key });
    } else {
      const distinct = await db.directReaction.findMany({
        where: { directMessageId: messageId },
        distinct: ['emoji'],
        select: { emoji: true },
      });
      if (distinct.length >= MAX_REACTIONS_PER_MESSAGE && !distinct.some((r) => r.emoji === emoji)) {
        return jsonError(409, `Bir mesaja en fazla ${MAX_REACTIONS_PER_MESSAGE} farklı tepki eklenebilir`);
      }
      await db.directReaction.create({ data: { directMessageId: messageId, userId, emoji } }).catch(() => {});
    }
  }
  return broadcast(kind, await readDTO(kind, messageId));
}

/** JSON { pinned }. Channels: moderators; DMs: either participant. */
export async function setPinned(kind: ChatKind, userId: string, messageId: string, req: Request) {
  const parsed = pinSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { pinned } = parsed.data;

  const found = await loadMessage(kind, userId, messageId);
  if (!found || found.deleted) return notFound('Mesaj');
  if (!found.canPin) return forbidden();

  if (pinned) {
    const count =
      kind === 'channel'
        ? await db.message.count({ where: { channelId: found.roomId, pinned: true } })
        : await db.directMessage.count({ where: { conversationId: found.roomId, pinned: true } });
    if (count >= MAX_PINS) return jsonError(409, `En fazla ${MAX_PINS} mesaj sabitlenebilir`);
  }
  // Keep updatedAt: pinning isn't an edit, and the UI shows "(düzenlendi)" off it.
  const data = { pinned, updatedAt: found.updatedAt };
  if (kind === 'channel') await db.message.update({ where: { id: messageId }, data });
  else await db.directMessage.update({ where: { id: messageId }, data });
  return broadcast(kind, await readDTO(kind, messageId));
}

/** Pinned messages of a room, newest pin target first. Access is checked by the caller. */
export async function listPins(kind: ChatKind, roomId: string): Promise<MessageDTO[]> {
  if (kind === 'channel') {
    const rows = await db.message.findMany({
      where: { channelId: roomId, pinned: true, deleted: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_PINS,
      select: messageSelect,
    });
    return rows.map(toMessageDTO);
  }
  const rows = await db.directMessage.findMany({
    where: { conversationId: roomId, pinned: true, deleted: false },
    orderBy: { createdAt: 'desc' },
    take: MAX_PINS,
    select: directMessageSelect,
  });
  return rows.map(toDirectMessageDTO);
}
