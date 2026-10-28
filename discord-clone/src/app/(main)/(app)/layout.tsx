import { redirect } from 'next/navigation';

import { NavigationSidebar } from '@/components/navigation/navigation-sidebar';
import { AppShell } from '@/components/providers/mobile-nav';
import { SocketProvider } from '@/components/providers/socket-provider';
import { UnreadProvider } from '@/components/providers/unread-provider';
import { VoiceProvider } from '@/components/providers/voice-provider';
import { getCurrentUserId } from '@/lib/auth';
import { getUnreadChannels } from '@/lib/unread';

/**
 * Everything behind the server rail: servers, DMs and settings. Layouts don't
 * remount on navigation, so the socket and the voice connection held here
 * survive moving between them.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const unread = await getUnreadChannels(userId);

  return (
    <SocketProvider>
      <UnreadProvider userId={userId} initial={unread}>
        <VoiceProvider>
          <AppShell>
            <NavigationSidebar userId={userId} />
            {children}
          </AppShell>
        </VoiceProvider>
      </UnreadProvider>
    </SocketProvider>
  );
}
