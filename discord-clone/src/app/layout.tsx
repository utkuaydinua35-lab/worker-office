import type { Metadata } from 'next';

import { AuthSessionProvider } from '@/components/providers/session-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'Discord Clone',
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
