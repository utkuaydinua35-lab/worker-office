'use client';

import type { MemberRole } from '@prisma/client';
import { ChevronDown, LogOut, PlusCircle, Settings, Trash, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ChannelModal } from '@/components/modals/channel-modal';
import { ConfirmModal } from '@/components/modals/confirm-modal';
import { InviteModal } from '@/components/modals/invite-modal';
import { ServerFormModal } from '@/components/modals/server-form-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/client-api';

type ModalKind = 'invite' | 'settings' | 'channel' | 'delete' | 'leave' | null;

interface ServerHeaderProps {
  server: { id: string; name: string; iconUrl: string | null; inviteCode: string };
  role: MemberRole;
  isOwner: boolean;
}

export function ServerHeader({ server, role, isOwner }: ServerHeaderProps) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalKind>(null);
  const isAdmin = role === 'ADMIN';
  const canManageChannels = role === 'ADMIN' || role === 'MODERATOR';

  const modalProps = (kind: Exclude<ModalKind, null>) => ({
    open: modal === kind,
    onOpenChange: (open: boolean) => setModal(open ? kind : null),
  });

  return (
    <>
      {/* modal={false}: a modal dropdown that opens a Dialog leaves pointer-events stuck on <body>. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger className="flex h-12 w-full items-center justify-between border-b border-black/30 px-4 font-semibold transition-colors hover:bg-secondary/40 focus:outline-none">
          <span className="truncate">{server.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem className="text-[#949cf7]" onSelect={() => setModal('invite')}>
            İnsanları Davet Et <UserPlus className="h-4 w-4" />
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onSelect={() => setModal('settings')}>
              Sunucu Ayarları <Settings className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {canManageChannels && (
            <DropdownMenuItem onSelect={() => setModal('channel')}>
              Kanal Oluştur <PlusCircle className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {isOwner ? (
            <DropdownMenuItem className="text-destructive" onSelect={() => setModal('delete')}>
              Sunucuyu Sil <Trash className="h-4 w-4" />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="text-destructive" onSelect={() => setModal('leave')}>
              Sunucudan Ayrıl <LogOut className="h-4 w-4" />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <InviteModal {...modalProps('invite')} server={server} canRegenerate={isAdmin} />
      {isAdmin && <ServerFormModal {...modalProps('settings')} mode="edit" server={server} />}
      {canManageChannels && <ChannelModal {...modalProps('channel')} mode="create" serverId={server.id} />}
      <ConfirmModal
        {...modalProps('delete')}
        title="Sunucuyu Sil"
        description={
          <>
            <b>{server.name}</b> sunucusunu silmek istediğine emin misin? Tüm kanallar ve mesajlar kalıcı olarak
            silinecek.
          </>
        }
        confirmLabel="Sunucuyu Sil"
        onConfirm={async () => {
          await apiFetch(`/api/servers/${server.id}`, { method: 'DELETE' });
          router.push('/');
          router.refresh();
        }}
      />
      <ConfirmModal
        {...modalProps('leave')}
        title="Sunucudan Ayrıl"
        description={
          <>
            <b>{server.name}</b> sunucusundan ayrılmak istediğine emin misin? Tekrar katılmak için davet
            bağlantısı gerekecek.
          </>
        }
        confirmLabel="Ayrıl"
        onConfirm={async () => {
          await apiFetch(`/api/servers/${server.id}/leave`, { method: 'POST' });
          router.push('/');
          router.refresh();
        }}
      />
    </>
  );
}
