import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { ProfileSettingsForm } from '@/components/user/profile-settings-form';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicProfileSelect, toPublicProfile } from '@/lib/profile';

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await db.user.findUnique({ where: { id: userId }, select: publicProfileSelect });
  // A valid JWT for a deleted account: treat it as signed out.
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kullanıcı Ayarları</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Geri dön
          </Link>
          <SignOutButton />
        </div>
      </div>
      <ProfileSettingsForm initialProfile={toPublicProfile(user)} />
    </main>
  );
}
