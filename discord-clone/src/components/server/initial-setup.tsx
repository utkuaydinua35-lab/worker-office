'use client';

import { Compass, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { JoinServerModal } from '@/components/modals/join-server-modal';
import { ServerFormModal } from '@/components/modals/server-form-modal';
import { Button } from '@/components/ui/button';

export function InitialSetup({ username }: { username: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">Hoş geldin, {username}!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Henüz bir sunucuda değilsin. Kendi sunucunu oluştur ya da bir davet bağlantısıyla katıl.
        </p>
        <div className="mt-6 space-y-3">
          <Button className="w-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Sunucu Oluştur
          </Button>
          <Button className="w-full" variant="secondary" onClick={() => setJoinOpen(true)}>
            <Compass className="h-4 w-4" />
            Bir Sunucuya Katıl
          </Button>
          <Button asChild className="w-full" variant="ghost">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              Kullanıcı Ayarları
            </Link>
          </Button>
        </div>
      </div>
      <ServerFormModal mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      <JoinServerModal open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
