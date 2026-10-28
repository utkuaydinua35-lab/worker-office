import { unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { toggleReaction } from '@/lib/message-features';

export const runtime = 'nodejs';

/** JSON { emoji }: toggles the caller's reaction. */
export async function POST(req: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return toggleReaction('conversation', userId, messageId, req);
}
