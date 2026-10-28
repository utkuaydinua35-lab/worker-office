'use client';

import { Edit, Hash, Trash, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ChannelModal } from '@/components/modals/channel-modal';
import { ConfirmModal } from '@/components/modals/confirm-modal';
import { useNavigateFresh } from '@/hooks/use-navigate-fresh';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { ChannelTypeValue } from '@/lib/validators';

interface ServerChannelProps {
  serverId: string;
  channel: { id: string; name: string; type: ChannelTypeValue };
  canManage: boolean;
}

export function ServerChannel({ serverId, channel, canManage }: ServerChannelProps) {
  const params = useParams<{ channelId?: string }>();
  const router = useRouter();
  const navigateFresh = useNavigateFresh();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const active = params.channelId === channel.id;
  const Icon = channel.type === 'VOICE' ? Volume2 : Hash;

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded px-2 py-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground',
        active && 'bg-secondary text-foreground',
      )}
    >
      <Link
        href={`/servers/${serverId}/channels/${channel.id}`}
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate text-sm font-medium">{channel.name}</span>
      </Link>

      {canManage && (
        <div className="hidden items-center gap-1 group-hover:flex">
          <button type="button" title="Kanalı Düzenle" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 hover:text-foreground" />
          </button>
          <button type="button" title="Kanalı Sil" onClick={() => setDeleteOpen(true)}>
            <Trash className="h-4 w-4 hover:text-destructive" />
          </button>
        </div>
      )}

      {canManage && (
        <>
          <ChannelModal
            mode="edit"
            serverId={serverId}
            channel={channel}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <ConfirmModal
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Kanalı Sil"
            description={
              <>
                <b>#{channel.name}</b> kanalını silmek istediğine emin misin? Tüm mesajları da silinecek ve bu
                işlem geri alınamaz.
              </>
            }
            confirmLabel="Kanalı Sil"
            onConfirm={async () => {
              await apiFetch(`/api/channels/${channel.id}`, { method: 'DELETE' });
              if (active) navigateFresh(`/servers/${serverId}`);
              else router.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
