import { TrackSource } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { forbidden, invalid, notFound, readJson, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  roomService,
  SERVER_MUTED_ATTRIBUTE,
  voicePermission,
  voiceRoomName,
} from '@/lib/livekit';
import { canServerMute, getMembership } from '@/lib/membership';

export const runtime = 'nodejs';

const bodySchema = z.object({ userId: z.string().uuid(), muted: z.boolean() });

/**
 * JSON { userId, muted }. Server-mutes (or unmutes) a member across all of
 * the server's voice channels. MODERATOR or ADMIN, and only members they outrank.
 */
export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  const actorId = await getCurrentUserId();
  if (!actorId) return unauthorized();

  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { userId, muted } = parsed.data;

  const server = await db.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true, channels: { where: { type: 'VOICE' }, select: { id: true } } },
  });
  const [actor, target] = await Promise.all([
    getMembership(actorId, params.serverId),
    getMembership(userId, params.serverId),
  ]);
  if (!server || !actor) return notFound('Sunucu');
  if (!target) return notFound('Üye');
  if (
    !canServerMute(
      { role: actor.role, isOwner: server.ownerId === actorId },
      { role: target.role, isOwner: server.ownerId === userId },
    )
  ) {
    return forbidden();
  }

  // The DB flag is the source of truth: the token endpoint reads it on every
  // (re)join, so leaving and rejoining can't shake off a mute.
  await db.member.update({ where: { id: target.id }, data: { serverMuted: muted } });

  // Apply it right away wherever they are connected now.
  const rooms = roomService();
  if (rooms) {
    await Promise.all(
      server.channels.map(async ({ id }) => {
        const room = voiceRoomName(id);
        try {
          const participant = await rooms.updateParticipant(room, userId, {
            permission: voicePermission(muted),
            attributes: { [SERVER_MUTED_ATTRIBUTE]: muted ? '1' : '0' },
          });
          // Revoking the permission stops new publishing; also mute what's already live.
          const mic = participant.tracks.find((t) => t.source === TrackSource.MICROPHONE);
          if (muted && mic && !mic.muted) await rooms.mutePublishedTrack(room, userId, mic.sid, true);
        } catch {
          // Not in this room (LiveKit answers "participant not found").
        }
      }),
    );
  }

  return NextResponse.json({ userId, serverMuted: muted });
}
