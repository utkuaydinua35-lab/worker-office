import type { Prisma } from '@prisma/client';

export const MESSAGES_PAGE_SIZE = 50;

const author = { select: { id: true, username: true, avatarUrl: true } } as const;

export const messageSelect = {
  id: true,
  content: true,
  fileUrl: true,
  deleted: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  user: author,
} satisfies Prisma.MessageSelect;

export const directMessageSelect = {
  id: true,
  content: true,
  fileUrl: true,
  deleted: true,
  conversationId: true,
  createdAt: true,
  updatedAt: true,
  user: author,
} satisfies Prisma.DirectMessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type DirectMessageRow = Prisma.DirectMessageGetPayload<{ select: typeof directMessageSelect }>;

/**
 * A channel message or a direct message as it crosses the wire (REST and
 * Socket.io). `roomId` is the channel id or the conversation id.
 */
export interface MessageDTO {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  roomId: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string; avatarUrl: string | null };
}

export function toMessageDTO({ channelId, ...row }: MessageRow): MessageDTO {
  return {
    ...row,
    roomId: channelId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDirectMessageDTO({ conversationId, ...row }: DirectMessageRow): MessageDTO {
  return {
    ...row,
    roomId: conversationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface MessagePage {
  items: MessageDTO[]; // newest first
  nextCursor: string | null;
}
