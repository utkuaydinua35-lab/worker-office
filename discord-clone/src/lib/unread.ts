import { db } from '@/lib/db';

/** channelId → its server and how many unread messages mention you (0 = just unread). */
export type UnreadChannels = Record<string, { serverId: string; mentions: number }>;

/**
 * Text channels with messages from others newer than your last read. Before
 * you first open a channel, "last read" is when you joined the server, so
 * joining doesn't light up the whole history.
 */
export async function getUnreadChannels(userId: string): Promise<UnreadChannels> {
  const rows = await db.$queryRaw<{ channelId: string; serverId: string; unread: boolean; mentions: number }[]>`
    SELECT c.id AS "channelId", c."serverId",
      EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."channelId" = c.id AND m."userId" <> ${userId} AND NOT m.deleted
          AND m."createdAt" > COALESCE(r."lastReadAt", mem."createdAt")
      ) AS unread,
      (
        SELECT count(*)::int FROM "Message" m
        WHERE m."channelId" = c.id AND NOT m.deleted AND ${userId} = ANY (m.mentions)
          AND m."createdAt" > COALESCE(r."lastReadAt", mem."createdAt")
      ) AS mentions
    FROM "Member" mem
    JOIN "Channel" c ON c."serverId" = mem."serverId" AND c.type = 'TEXT'
    LEFT JOIN "ChannelRead" r ON r."channelId" = c.id AND r."userId" = ${userId}
    WHERE mem."userId" = ${userId}
  `;
  const result: UnreadChannels = {};
  for (const r of rows) {
    if (r.unread || r.mentions > 0) result[r.channelId] = { serverId: r.serverId, mentions: r.mentions };
  }
  return result;
}
