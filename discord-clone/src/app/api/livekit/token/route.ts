import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

import { jsonError, notFound, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  livekitConfig,
  OWNER_ATTRIBUTE,
  ROLE_ATTRIBUTE,
  SERVER_MUTED_ATTRIBUTE,
  voicePermission,
  voiceRoomName,
} from '@/lib/livekit';
import { getChannelAccess } from '@/lib/membership';

export const runtime = 'nodejs';

const TOKEN_TTL = '6h';

/** GET ?channelId= → { token, url, serverMuted } for joining that voice channel's LiveKit room. */
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const cfg = livekitConfig();
  if (!cfg) {
    return jsonError(503, 'Ses sunucusu yapılandırılmamış (LIVEKIT_* ortam değişkenleri eksik)');
  }

  const channelId = new URL(req.url).searchParams.get('channelId');
  const access = channelId ? await getChannelAccess(userId, channelId) : null;
  if (!access) return notFound('Kanal');
  if (access.channel.type !== 'VOICE') return jsonError(400, 'Bu bir ses kanalı değil');

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, avatarUrl: true },
  });

  // Identity = user id: other clients map participants back to users with it,
  // and the mute API addresses participants by it.
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: userId,
    name: user.username,
    metadata: JSON.stringify({ avatarUrl: user.avatarUrl }),
    // Role attributes let other clients decide whether to offer "server mute".
    attributes: {
      [SERVER_MUTED_ATTRIBUTE]: access.member.serverMuted ? '1' : '0',
      [ROLE_ATTRIBUTE]: access.member.role,
      [OWNER_ATTRIBUTE]: access.channel.server.ownerId === userId ? '1' : '0',
    },
    ttl: TOKEN_TTL,
  });
  token.addGrant({
    roomJoin: true,
    room: voiceRoomName(access.channel.id),
    ...voicePermission(access.member.serverMuted),
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: cfg.wsUrl,
    serverMuted: access.member.serverMuted,
  });
}
