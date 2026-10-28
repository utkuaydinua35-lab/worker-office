import { NextResponse } from 'next/server';
import { z } from 'zod';

import { forbidden, invalid, jsonError, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  removeFromVoiceRooms,
  roomService,
  SERVER_DEAFENED_ATTRIBUTE,
  voicePermission,
  voiceRoomName,
} from '@/lib/livekit';
import { canManageChannels, canServerMute, getMembership } from '@/lib/membership';
import { getMusicService } from '@/lib/music/bridge';
import { emitVoiceMove } from '@/lib/socket/emit';
import { BOT_IDENTITY } from '@/lib/voice-attributes';

export const runtime = 'nodejs';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disconnect'), userId: z.string().min(1) }),
  z.object({ action: z.literal('move'), userId: z.string().min(1), channelId: z.string().uuid() }),
  z.object({ action: z.literal('deafen'), userId: z.string().uuid(), deafened: z.boolean() }),
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
 * Discord's "Disconnect", "Move To" and "Server Deafen" for voice channels.
 * JSON { action: 'disconnect', userId } | { action: 'move', userId, channelId }
 *    | { action: 'deafen', userId, deafened }.
 * People: MODERATOR or above, over members they outrank (like server mute).
 * The music bot: whoever may !stop it can disconnect it; moderators can move it.
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
    const service = getMusicService();
    const caller = {
      serverId: params.serverId,
      userId: actorId,
      username: actorUser.username,
      role: actor.role,
      isOwner: actorIsOwner,
    };
    if (body.action === 'move') {
      const to = server.channels.find((c) => c.id === body.channelId);
      if (!to) return notFound('Ses kanalı');
      const moved = await service?.move(caller, to);
      if (!moved) return jsonError(503, 'Müzik botu çalışmıyor');
      return moved.ok ? new NextResponse(null, { status: 204 }) : jsonError(409, moved.error);
    }
    if (body.action !== 'disconnect') return jsonError(400, 'Müzik botu sağırlaştırılamaz.');
    const result = await service?.control(caller, 'stop');
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

  if (body.action === 'deafen') {
    // The DB flag is the source of truth (the token endpoint applies it on every join).
    await db.member.update({ where: { id: target.id }, data: { serverDeafened: body.deafened } });
    const room = await currentVoiceChannel(body.userId, voiceIds);
    if (room) {
      await roomService()
        ?.updateParticipant(voiceRoomName(room), body.userId, {
          permission: voicePermission(target.serverMuted, body.deafened),
          attributes: { [SERVER_DEAFENED_ATTRIBUTE]: body.deafened ? '1' : '0' },
        })
        .catch(() => {}); // left meanwhile
    }
    return NextResponse.json({ userId: body.userId, serverDeafened: body.deafened });
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
