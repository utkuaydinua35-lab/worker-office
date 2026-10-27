'use client';

import { Compass, Plus } from 'lucide-react';
import { useState } from 'react';

import { JoinServerModal } from '@/components/modals/join-server-modal';
import { ServerFormModal } from '@/components/modals/server-form-modal';

const actionClass =
  'flex h-12 w-12 items-center justify-center rounded-3xl bg-[#313338] text-status-online transition-all hover:rounded-2xl hover:bg-status-online hover:text-white';

export function NavigationActions() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <button type="button" className={actionClass} title="Sunucu Ekle" onClick={() => setCreateOpen(true)}>
        <Plus className="h-6 w-6" />
      </button>
      <button type="button" className={actionClass} title="Sunucuya Katıl" onClick={() => setJoinOpen(true)}>
        <Compass className="h-6 w-6" />
      </button>
      <ServerFormModal mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      <JoinServerModal open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  );
}
