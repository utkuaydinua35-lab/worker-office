'use client';

import type { MemberRole } from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';

import { MemberItem } from '@/components/members/member-item';
import { useSocket } from '@/components/providers/socket-provider';
import type { MemberDTO } from '@/lib/member-dto';
import type { PresencePayload } from '@/lib/socket/events';
import type { UserStatusValue } from '@/lib/validators';

const ROLE_ORDER: MemberRole[] = ['ADMIN', 'MODERATOR', 'GUEST'];
const GROUP_LABEL: Record<MemberRole, string> = {
  ADMIN: 'Yöneticiler',
  MODERATOR: 'Moderatörler',
  GUEST: 'Çevrimiçi',
};

interface MemberListProps {
  serverId: string;
  members: MemberDTO[];
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/** Online members grouped by role (Discord's "hoisted" roles), then everyone offline. */
export function MemberList({ serverId, members, currentUser }: MemberListProps) {
  const { socket } = useSocket();
  // Presence events since the last server render; a re-render brings fresh statuses.
  const [overrides, setOverrides] = useState<Map<string, UserStatusValue>>(new Map());
  useEffect(() => setOverrides(new Map()), [members]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = ({ userId, status }: PresencePayload) =>
      setOverrides((prev) => new Map(prev).set(userId, status));
    socket.on('presence', onPresence);
    return () => {
      socket.off('presence', onPresence);
    };
  }, [socket]);

  const groups = useMemo(() => {
    const live = members
      .map((m) => ({ ...m, status: overrides.get(m.userId) ?? m.status }))
      .sort((a, b) => a.username.localeCompare(b.username, 'tr'));
    const online = live.filter((m) => m.status !== 'OFFLINE');
    return [
      ...ROLE_ORDER.map((role) => ({
        key: role,
        label: GROUP_LABEL[role],
        members: online.filter((m) => m.role === role),
      })),
      { key: 'offline', label: 'Çevrimdışı', members: live.filter((m) => m.status === 'OFFLINE') },
    ].filter((g) => g.members.length > 0);
  }, [members, overrides]);

  return (
    <div className="space-y-5" aria-label="Üye listesi">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label} — {group.members.length}
          </h3>
          <div className="space-y-0.5">
            {group.members.map((member) => (
              <MemberItem key={member.userId} serverId={serverId} member={member} currentUser={currentUser} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
