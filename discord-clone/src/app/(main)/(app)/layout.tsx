import { redirect } from 'next/navigation';

import { NavigationSidebar } from '@/components/navigation/navigation-sidebar';
import { SocketProvider } from '@/components/providers/socket-provider';
import { VoiceProvider } from '@/components/providers/voice-provider';
import { getCurrentUserId } from '@/lib/auth';

/**
 * Everything behind the server rail: servers, DMs and settings. Layouts don't
 * remount on navigation, so the socket and the voice connection held here
 * survive moving between them.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  return (
    <SocketProvider>
      <VoiceProvider>
        <div className="flex h-screen overflow-hidden">
          <NavigationSidebar userId={userId} />
          {children}
        </div>
      </VoiceProvider>
    </SocketProvider>
  );
}
