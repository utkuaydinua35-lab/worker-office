import { redirect } from 'next/navigation';

import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';

/** Lands on the first server the user joined; with none, on the DM home (which offers create/join). */
export default async function HomePage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const first = await db.member.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { serverId: true },
  });
  redirect(first ? `/servers/${first.serverId}` : '/me');
}
