import { MessageSquare } from 'lucide-react';
import { redirect } from 'next/navigation';

import { InitialSetup } from '@/components/server/initial-setup';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function DirectMessagesHome() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const [user, memberships] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } }),
    db.member.count({ where: { userId } }),
  ]);
  // First visit: nothing to DM about yet, so offer the way in.
  if (memberships === 0) return <InitialSetup username={user.username} />;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      <MessageSquare className="h-12 w-12" />
      <p>Soldan bir konuşma seç ya da bir sunucudaki üyenin profilinden “Mesaj Gönder”e tıkla.</p>
    </div>
  );
}
