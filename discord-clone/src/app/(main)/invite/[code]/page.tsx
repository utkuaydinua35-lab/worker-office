import { redirect } from 'next/navigation';

import { JoinInviteButton } from '@/components/server/join-invite-button';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';

// Joining is a POST behind a button: a GET that changed membership could be
// triggered by any <img src="/invite/..."> on another site.
export default async function InvitePage({ params }: { params: { code: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${params.code}`)}`);

  const server = await db.server.findUnique({
    where: { inviteCode: params.code },
    select: {
      id: true,
      name: true,
      iconUrl: true,
      _count: { select: { members: true } },
      members: { where: { userId }, select: { id: true } },
    },
  });

  if (server?.members.length) redirect(`/servers/${server.id}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary/80 p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-8 text-center">
        {server ? (
          <>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-secondary text-2xl font-bold">
              {server.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={server.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                server.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <p className="text-sm text-muted-foreground">Bir sunucuya katılmaya davet edildin</p>
            <h1 className="mt-1 text-2xl font-bold">{server.name}</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{server._count.members} üye</p>
            <JoinInviteButton code={params.code} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Davet geçersiz</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bu davet bağlantısının süresi dolmuş ya da yenilenmiş olabilir.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
