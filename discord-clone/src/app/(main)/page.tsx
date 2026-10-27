import { Settings } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user/user-avatar';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicProfileSelect } from '@/lib/profile';

// Stage 1 landing page. Stage 2 replaces it with the server/channel layout.
export default async function HomePage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await db.user.findUnique({ where: { id: userId }, select: publicProfileSelect });
  if (!user) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 text-center">
        <div className="mb-4 flex justify-center">
          <UserAvatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            status={user.status}
            className="h-20 w-20 text-2xl"
          />
        </div>
        <h1 className="text-xl font-bold">{user.username}</h1>
        {user.customStatus && <p className="text-sm text-muted-foreground">{user.customStatus}</p>}
        {user.bio && <p className="mt-3 whitespace-pre-wrap text-sm">{user.bio}</p>}
        <Button asChild className="mt-6 w-full">
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Kullanıcı Ayarları
          </Link>
        </Button>
      </div>
    </main>
  );
}
