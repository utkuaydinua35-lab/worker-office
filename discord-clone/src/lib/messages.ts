import type { Prisma } from '@prisma/client';

import { USERNAME_CHARS } from '@/lib/validators';

export const MESSAGES_PAGE_SIZE = 50;
/** Distinct emoji per message, like Discord's cap. */
export const MAX_REACTIONS_PER_MESSAGE = 20;
/** How much of a replied-to message the reply shows. */
const REPLY_PREVIEW_LENGTH = 120;

const author = { select: { id: true, username: true, avatarUrl: true, isBot: true } } as const;
const reactionRows = { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } } as const;
const replyPreview = {
  select: { id: true, content: true, deleted: true, fileUrl: true, user: { select: { id: true, username: true } } },
} as const;

export const messageSelect = {
  id: true,
  content: true,
  fileUrl: true,
  deleted: true,
  pinned: true,
  mentions: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  user: author,
  reactions: reactionRows,
  replyTo: replyPreview,
} satisfies Prisma.MessageSelect;

export const directMessageSelect = {
  id: true,
  content: true,
  fileUrl: true,
  deleted: true,
  pinned: true,
  conversationId: true,
  createdAt: true,
  updatedAt: true,
  user: author,
  reactions: reactionRows,
  replyTo: replyPreview,
} satisfies Prisma.DirectMessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type DirectMessageRow = Prisma.DirectMessageGetPayload<{ select: typeof directMessageSelect }>;

export interface ReactionDTO {
  emoji: string;
  /** Who reacted, in order; the count is its length. */
  userIds: string[];
}

export interface ReplyPreviewDTO {
  id: string;
  /** Truncated; empty for a deleted message or a bare attachment. */
  content: string;
  deleted: boolean;
  hasFile: boolean;
  user: { id: string; username: string };
}

/**
 * A channel message or a direct message as it crosses the wire (REST and
 * Socket.io). `roomId` is the channel id or the conversation id.
 */
export interface MessageDTO {
  id: string;
  content: string;
  fileUrl: string | null;
  deleted: boolean;
  pinned: boolean;
  /** User ids this message @mentions (always empty in DMs). */
  mentions: string[];
  roomId: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string; avatarUrl: string | null; isBot: boolean };
  reactions: ReactionDTO[];
  replyTo: ReplyPreviewDTO | null;
}

function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
  const byEmoji = new Map<string, string[]>();
  for (const { emoji, userId } of rows) byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), userId]);
  return Array.from(byEmoji, ([emoji, userIds]) => ({ emoji, userIds }));
}

function toReplyPreview(row: MessageRow['replyTo']): ReplyPreviewDTO | null {
  if (!row) return null;
  return {
    id: row.id,
    content: row.deleted ? '' : row.content.slice(0, REPLY_PREVIEW_LENGTH),
    deleted: row.deleted,
    hasFile: !row.deleted && !!row.fileUrl,
    user: row.user,
  };
}

export function toMessageDTO({ channelId, reactions, replyTo, ...row }: MessageRow): MessageDTO {
  return {
    ...row,
    roomId: channelId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reactions: row.deleted ? [] : groupReactions(reactions),
    replyTo: toReplyPreview(replyTo),
  };
}

export function toDirectMessageDTO({ conversationId, reactions, replyTo, ...row }: DirectMessageRow): MessageDTO {
  return {
    ...row,
    mentions: [],
    roomId: conversationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reactions: row.deleted ? [] : groupReactions(reactions),
    replyTo: toReplyPreview(replyTo),
  };
}

export interface MessagePage {
  items: MessageDTO[]; // newest first
  nextCursor: string | null;
}

/** Matches `@name` where name is a possible username (see USERNAME_CHARS). */
export const MENTION_PATTERN = new RegExp(`(?<![${USERNAME_CHARS}])@([${USERNAME_CHARS}]{2,32})`, 'g');

/** `@name` tokens in a message, without a sentence's trailing dot ("@ali."). */
export function mentionedUsernames(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(MENTION_PATTERN)) {
    const name = m[1].replace(/\.+$/, '');
    if (name.length >= 2) names.add(name);
  }
  return [...names];
}
