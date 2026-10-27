import type { Prisma } from '@prisma/client';

export const MESSAGES_PAGE_SIZE = 50;

export const messageSelect = {
  id: true,
  content: true,
  fileUrl: true,
  deleted: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, username: true, avatarUrl: true } },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

/** A message as it crosses the wire (REST and Socket.io). */
export type MessageDTO = Omit<MessageRow, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export function toMessageDTO(row: MessageRow): MessageDTO {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export interface MessagePage {
  items: MessageDTO[]; // newest first
  nextCursor: string | null;
}
