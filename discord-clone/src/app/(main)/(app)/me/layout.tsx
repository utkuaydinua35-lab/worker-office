import { redirect } from 'next/navigation';

import { DmSidebar } from '@/components/dm/dm-sidebar';
import { getCurrentUserId } from '@/lib/auth';

export default async function DirectMessagesLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  return (
    <>
      <DmSidebar userId={userId} />
      <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
    </>
  );
}
