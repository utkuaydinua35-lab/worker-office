import { NextResponse } from 'next/server';
import { z } from 'zod';

import { forbidden, invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeFromVoiceRooms, roomService, voiceRoomName } from '@/lib/livekit';
import { canManageChannels, canServerMute, getMembership } from '@/lib/membership';
import { getMusicService } from '@/lib/music/bridge';
import { emitVoiceMove } from '@/lib/socket/emit';
import { BOT_IDENTITY } from '@/lib/voice-attributes';

export const runtime = 'nodejs';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disconnect'), userId: z.string().min(1) }),
  z.object({ action: z.literal('move'), userId: z.string().uuid(), channelId: z.string().uuid() }),
]);

type Ctx = { params: Promise<{ serverId: string }> };

/** The server's voice channel `identity` is connected to right now, if any. */
async function currentVoiceChannel(identity: string, voiceChannelIds: string[]) {
  const rooms = roomService();
  if (!rooms) return null;
  for (const id of voiceChannelIds) {
    const participants = await rooms.listParticipants(voiceRoomName(id)).catch(() => []);
    if (participants.some((p) => p.identity === identity)) return id;
  }
  return null;
}

/**
 * Discord's "Disconnect" and "Move To" for voice channels.
 * JSON { action: 'disconnect', userId } | { action: 'move', userId, channelId }.
 * People: MODERATOR or above, over members they outrank (like server mute).
 * The music bot: whoever may !stop it (moderators, or anyone in its channel).
 */
export async function POST(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const actorId = await getCurrentUserId();
  if (!actorId) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  const [server, actor, actorUser] = await Promise.all([
    db.server.findUnique({
      where: { id: params.serverId },
      select: {
        ownerId: true,
        channels: { where: { type: 'VOICE' }, select: { id: true, name: true } },
      },
    }),
    getMembership(actorId, params.serverId),
    db.user.findUnique({ where: { id: actorId }, select: { username: true } }),
  ]);
  if (!server || !actor || !actorUser) return notFound('Sunucu');
  const actorIsOwner = server.ownerId === actorId;
  const voiceIds = server.channels.map((c) => c.id);

  if (body.userId === BOT_IDENTITY) {
    if (body.action !== 'disconnect') return jsonError(400, 'Müzik botu taşınamaz; !play ile istediğin kanala çağır.');
    const service = getMusicService();
    const result = await service?.control(
      {
        serverId: params.serverId,
        userId: actorId,
        username: actorUser.username,
        role: actor.role,
        isOwner: actorIsOwner,
      },
      'stop',
    );
    if (result?.ok) return new NextResponse(null, { status: 204 });
    // No player behind it (a leftover connection): moderators can still clear it.
    if (!actorIsOwner && !canManageChannels(actor.role)) {
      return jsonError(409, result && !result.ok ? result.error : 'Müzik botu çalışmıyor');
    }
    await removeFromVoiceRooms(BOT_IDENTITY, voiceIds);
    return new NextResponse(null, { status: 204 });
  }

  const target = await getMembership(body.userId, params.serverId);
  if (!target) return notFound('Üye');
  if (
    !canServerMute(
      { role: actor.role, isOwner: actorIsOwner },
      { role: target.role, isOwner: server.ownerId === body.userId },
    )
  ) {
    return forbidden();
  }

  const from = await currentVoiceChannel(body.userId, voiceIds);
  if (!from) return jsonError(409, 'Bu üye şu an bir ses kanalında değil.');

  if (body.action === 'disconnect') {
    await removeFromVoiceRooms(body.userId, [from]);
    return new NextResponse(null, { status: 204 });
  }

  const to = server.channels.find((c) => c.id === body.channelId);
  if (!to) return notFound('Ses kanalı');
  // Their client rejoins (fresh token, mute flags re-read); nothing to do if already there.
  if (to.id !== from)
    emitVoiceMove(body.userId, {
      serverId: params.serverId,
      channelId: to.id,
      channelName: to.name,
    });
  return new NextResponse(null, { status: 204 });
}
