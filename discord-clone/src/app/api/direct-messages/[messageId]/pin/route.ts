import { unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { setPinned } from '@/lib/message-features';

export const runtime = 'nodejs';

/** JSON { pinned }. */
export async function POST(req: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await ctx.params;
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  return setPinned('conversation', userId, messageId, req);
}
