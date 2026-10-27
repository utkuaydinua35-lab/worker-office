import { redirect } from 'next/navigation';

import { InitialSetup } from '@/components/server/initial-setup';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';

/** Lands on the first server the user joined; with none, offers to create or join one. */
export default async function HomePage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const first = await db.member.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { serverId: true },
  });
  if (first) redirect(`/servers/${first.serverId}`);

  const user = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) redirect('/login');

  return <InitialSetup username={user.username} />;
}
