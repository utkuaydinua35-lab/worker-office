'use client';

import { Crown, Loader2, MessageSquare, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { STATUS_OPTIONS } from '@/components/user/status-select';
import { UserAvatar } from '@/components/user/user-avatar';
import { useOpenDm } from '@/hooks/use-open-dm';
import { ROLE_LABEL, type MemberDTO } from '@/lib/member-dto';

const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

/** Discord's user popout: banner, avatar, status, about me, roles, member-since and a DM button. */
export function ProfileCard({ member, isSelf }: { member: MemberDTO; isSelf: boolean }) {
  const dm = useOpenDm();
  // "Görünmez" is how you pick it for yourself; others just see you offline.
  const statusLabel =
    member.status === 'OFFLINE' ? 'Çevrimdışı' : STATUS_OPTIONS.find((o) => o.value === member.status)?.label;

  return (
    <div className="w-72 overflow-hidden rounded-lg bg-[#111214]" data-profile-card={member.username}>
      <div className="h-16 bg-primary" />
      <div className="px-4 pb-4">
        <div className="-mt-9 mb-2 inline-block rounded-full border-[6px] border-[#111214]">
          <UserAvatar
            username={member.username}
            avatarUrl={member.avatarUrl}
            status={member.status}
            className="h-16 w-16 text-xl"
          />
        </div>

        <div className="space-y-3 rounded-lg bg-[#232428] p-3">
          <div>
            <p className="flex items-center gap-1.5 text-lg font-bold">
              {member.username}
              {member.isOwner && <Crown className="h-4 w-4 text-status-idle" aria-label="Sunucu sahibi" />}
            </p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
            {member.customStatus && <p className="mt-1 text-sm">{member.customStatus}</p>}
          </div>

          {member.bio && (
            <section>
              <h4 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Hakkımda</h4>
              <p className="whitespace-pre-wrap break-words text-sm">{member.bio}</p>
            </section>
          )}

          <section>
            <h4 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Üyelik Tarihi</h4>
            <p className="text-sm">
              Discord Clone: {dateFormat.format(new Date(member.accountCreatedAt))}
              <br />
              Bu sunucu: {dateFormat.format(new Date(member.joinedServerAt))}
            </p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Rol</h4>
            <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs">
              <Shield className="h-3 w-3" />
              {ROLE_LABEL[member.role]}
            </span>
          </section>

          {!isSelf && (
            <>
              <Button
                size="sm"
                className="w-full"
                disabled={dm.pending}
                onClick={() => void dm.open(member.userId)}
              >
                {dm.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Mesaj Gönder
              </Button>
              {dm.error && <p className="text-xs text-destructive">{dm.error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
