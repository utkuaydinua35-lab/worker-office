import { redirect } from 'next/navigation';

import { db } from '@/lib/db';

/** Opens the server's first text channel. Membership is checked by the layout. */
export default async function ServerPage({ params }: { params: { serverId: string } }) {
  const channel = await db.channel.findFirst({
    where: { serverId: params.serverId, type: 'TEXT' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (channel) redirect(`/servers/${params.serverId}/channels/${channel.id}`);

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
      Bu sunucuda henüz metin kanalı yok.
    </div>
  );
}
