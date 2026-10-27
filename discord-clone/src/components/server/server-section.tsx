'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChannelModal } from '@/components/modals/channel-modal';
import type { ChannelTypeValue } from '@/lib/validators';

interface ServerSectionProps {
  label: string;
  serverId: string;
  channelType: ChannelTypeValue;
  canCreate: boolean;
}

export function ServerSection({ label, serverId, channelType, canCreate }: ServerSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-1 flex items-center justify-between px-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {canCreate && (
        <>
          <button
            type="button"
            title="Kanal Oluştur"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <ChannelModal
            mode="create"
            defaultType={channelType}
            serverId={serverId}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      )}
    </div>
  );
}
