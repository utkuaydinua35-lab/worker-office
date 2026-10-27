import { redirect } from 'next/navigation';

import { NavigationSidebar } from '@/components/navigation/navigation-sidebar';
import { SocketProvider } from '@/components/providers/socket-provider';
import { getCurrentUserId } from '@/lib/auth';

export default async function ServersLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  return (
    <SocketProvider>
      <div className="flex h-screen overflow-hidden">
        <NavigationSidebar userId={userId} />
        {children}
      </div>
    </SocketProvider>
  );
}
