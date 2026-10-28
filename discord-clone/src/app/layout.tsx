import type { Metadata, Viewport } from 'next';

import { AuthSessionProvider } from '@/components/providers/session-provider';

import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The address bar and the keyboard resize the page instead of covering it.
  interactiveWidget: 'resizes-content',
  themeColor: '#1e1f22',
};

export const metadata: Metadata = {
  title: 'Hasbihal',
  description: 'Sunucular, kanallar ve gerçek zamanlı sohbet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="dark">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
