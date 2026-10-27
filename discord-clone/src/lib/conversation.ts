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
