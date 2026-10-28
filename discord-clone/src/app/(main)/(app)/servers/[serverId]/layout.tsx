import { redirect } from 'next/navigation';

import { ServerSidebar } from '@/components/server/server-sidebar';
import { getCurrentUserId } from '@/lib/auth';
import { getMembership } from '@/lib/membership';

export default async function ServerLayout(props: {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}) {
  const { children } = props;
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  // Not a member (left, never joined, or the server was deleted): back home.
  const member = await getMembership(userId, params.serverId);
  if (!member) redirect('/');

  return (
    <>
      <ServerSidebar serverId={params.serverId} userId={userId} role={member.role} />
      <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
    </>
  );
}
