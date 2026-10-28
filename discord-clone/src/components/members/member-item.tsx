'use client';

import type { MemberRole } from '@prisma/client';
import { Crown, MicOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ProfileCard } from '@/components/members/profile-card';
import { ConfirmModal } from '@/components/modals/confirm-modal';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/user/user-avatar';
import { useAudioPrefs, VOLUME_MAX, VOLUME_MIN } from '@/hooks/use-local-audio-prefs';
import { useOpenDm } from '@/hooks/use-open-dm';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { ROLE_LABEL, type MemberDTO } from '@/lib/member-dto';
import { assignableRoles, canChangeRole, canKick, canServerMute } from '@/lib/roles';
import { cn } from '@/lib/utils';

interface MemberItemProps {
  serverId: string;
  member: MemberDTO;
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/** A row in the member list: click → profile card, right-click → actions. */
export function MemberItem({ serverId, member, currentUser }: MemberItemProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isSelf = member.userId === currentUser.id;
  const audio = useAudioPrefs(isSelf ? null : member.userId);
  const dm = useOpenDm();

  const target = { role: member.role, isOwner: member.isOwner };
  const mayMute = canServerMute(currentUser, target);
  const mayKick = canKick(currentUser, target);
  const mayChangeRole = canChangeRole(currentUser, target);
  const offline = member.status === 'OFFLINE';

  async function act(run: () => Promise<unknown>) {
    setActionError(null);
    try {
      await run();
      router.refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <>
      <Popover open={profileOpen} onOpenChange={setProfileOpen}>
        {/* modal={false}: a modal menu that opens a Dialog leaves pointer-events stuck on <body>. */}
        <ContextMenu modal={false}>
          <ContextMenuTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-member={member.username}
                className={cn(
                  'flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-secondary/60',
                  profileOpen && 'bg-secondary/60',
                  offline && 'opacity-40 hover:opacity-100',
                )}
              >
                <UserAvatar
                  username={member.username}
                  avatarUrl={member.avatarUrl}
                  status={member.status}
                  className="h-8 w-8 text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <span className="truncate">{member.username}</span>
                    {member.isOwner && <Crown className="h-3.5 w-3.5 shrink-0 text-status-idle" aria-label="Sunucu sahibi" />}
                  </span>
                  {member.customStatus && !offline && (
                    <span className="block truncate text-xs text-muted-foreground">{member.customStatus}</span>
                  )}
                </span>
                {member.serverMuted && <MicOff className="h-3.5 w-3.5 text-destructive" aria-label="Sunucuda susturuldu" />}
              </button>
            </PopoverTrigger>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-60" aria-label={`${member.username} menüsü`}>
            <ContextMenuItem onSelect={() => setProfileOpen(true)}>Profil</ContextMenuItem>
            {!isSelf && (
              <ContextMenuItem onSelect={() => void dm.open(member.userId)}>Mesaj Gönder</ContextMenuItem>
            )}

            {!isSelf && (
              <>
                <ContextMenuSeparator />
                <ContextMenuLabel>Kullanıcı Ses Seviyesi — %{audio.prefs.volume}</ContextMenuLabel>
                {/* Not a menu item: keys and pointer go to the slider, not the menu's typeahead. */}
                <div className="px-2 pb-2" onKeyDown={(e) => e.stopPropagation()}>
                  <input
                    type="range"
                    aria-label="Kullanıcı ses seviyesi"
                    min={VOLUME_MIN}
                    max={VOLUME_MAX}
                    step={1}
                    value={audio.prefs.volume}
                    disabled={audio.prefs.muted}
                    onChange={(e) => audio.update({ volume: Number(e.target.value) })}
                    className="w-full accent-primary disabled:opacity-40"
                  />
                </div>
                <ContextMenuCheckboxItem
                  checked={audio.prefs.muted}
                  onCheckedChange={(muted) => audio.update({ muted: muted === true })}
                  onSelect={(e) => e.preventDefault()}
                >
                  Sustur
                </ContextMenuCheckboxItem>
              </>
            )}

            {(mayMute || mayChangeRole || mayKick) && <ContextMenuSeparator />}
            {mayMute && (
              <ContextMenuCheckboxItem
                checked={member.serverMuted}
                onCheckedChange={(muted) =>
                  void act(() =>
                    apiFetch(`/api/servers/${serverId}/voice-mute`, {
                      method: 'POST',
                      body: JSON.stringify({ userId: member.userId, muted: muted === true }),
                    }),
                  )
                }
                className="text-destructive"
              >
                Sunucuda Sustur
              </ContextMenuCheckboxItem>
            )}
            {mayChangeRole && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>Rol</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={member.role}
                    onValueChange={(role) =>
                      void act(() =>
                        apiFetch(`/api/servers/${serverId}/members/${member.userId}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role }),
                        }),
                      )
                    }
                  >
                    {assignableRoles(currentUser).map((role) => (
                      <ContextMenuRadioItem key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </ContextMenuRadioItem>
                    ))}
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {mayKick && (
              <ContextMenuItem className="text-destructive" onSelect={() => setKickOpen(true)}>
                {member.username} adlı kullanıcıyı at
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>

        <PopoverContent side="left" align="start" sideOffset={12} className="p-0">
          <ProfileCard member={member} isSelf={isSelf} />
        </PopoverContent>
      </Popover>

      {(actionError || dm.error) && (
        <p className="px-2 text-xs text-destructive">{actionError ?? dm.error}</p>
      )}

      {mayKick && (
        <ConfirmModal
          open={kickOpen}
          onOpenChange={setKickOpen}
          title={`'${member.username}' adlı kullanıcıyı at`}
          description="Bu kullanıcıyı sunucudan atmak istediğine emin misin? Yeni bir davetle tekrar katılabilir."
          confirmLabel="At"
          onConfirm={async () => {
            await apiFetch(`/api/servers/${serverId}/members/${member.userId}`, { method: 'DELETE' });
            router.refresh();
          }}
        />
      )}
    </>
  );
}
