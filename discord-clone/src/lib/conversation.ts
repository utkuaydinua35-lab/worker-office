import { db } from '@/lib/db';

/**
 * Returns the single Conversation between two users, creating it on first use.
 * Participants are stored in sorted order so (A, B) and (B, A) hit the same
 * unique key instead of producing two rows.
 */
export async function getOrCreateConversation(userAId: string, userBId: string) {
  if (userAId === userBId) throw new Error('Cannot open a conversation with yourself');
  const [userOneId, userTwoId] = [userAId, userBId].sort();

  return db.conversation.upsert({
    where: { userOneId_userTwoId: { userOneId, userTwoId } },
    update: {},
    create: { userOneId, userTwoId },
    include: { userOne: true, userTwo: true },
  });
}

/** The conversation if `userId` is one of its two participants, else null. */
export async function getConversationAccess(userId: string, conversationId: string) {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  if (conversation.userOneId !== userId && conversation.userTwoId !== userId) return null;
  const otherUserId =
    conversation.userOneId === userId ? conversation.userTwoId : conversation.userOneId;
  return { conversation, otherUserId };
}

export async function isConversationParticipant(userId: string, conversationId: string) {
  return !!(await getConversationAccess(userId, conversationId));
}

/** Discord only lets you DM people you share a server with (we have no friends list). */
export async function shareAServer(userAId: string, userBId: string) {
  const shared = await db.member.findFirst({
    where: { userId: userAId, server: { members: { some: { userId: userBId } } } },
    select: { id: true },
  });
  return !!shared;
}
