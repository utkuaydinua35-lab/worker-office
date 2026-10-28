import { redirect } from 'next/navigation';

import { MobileNavButton } from '@/components/providers/mobile-nav';
import { db } from '@/lib/db';

/** Opens the server's first text channel. Membership is checked by the layout. */
export default async function ServerPage(props: { params: Promise<{ serverId: string }> }) {
  const params = await props.params;
  const channel = await db.channel.findFirst({
    where: { serverId: params.serverId, type: 'TEXT' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (channel) redirect(`/servers/${params.serverId}/channels/${channel.id}`);

  return (
    <>
      <header className="flex h-12 shrink-0 items-center px-4 md:hidden">
        <MobileNavButton />
      </header>
      <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
        Bu sunucuda henüz metin kanalı yok.
      </div>
    </>
  );
}
