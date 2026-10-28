import { MessageSquare } from 'lucide-react';
import { redirect } from 'next/navigation';

import { MobileNavButton } from '@/components/providers/mobile-nav';
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
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4 md:hidden">
        <MobileNavButton />
        <h1 className="font-semibold">Direkt Mesajlar</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <p>
          <span className="max-md:hidden">Soldan</span>
          <span className="md:hidden">☰ menüsünden</span> bir konuşma seç ya da bir sunucudaki üyenin profilinden
          “Mesaj Gönder”e tıkla.
        </p>
      </div>
    </>
  );
}
