import { NextResponse } from 'next/server';

import { invalid, isUniqueViolation, jsonError, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateInviteCode } from '@/lib/invite';
import { readServerIcon } from '@/lib/server-icon';
import { deleteUpload } from '@/lib/storage';
import { serverNameSchema } from '@/lib/validators';

export const runtime = 'nodejs';

const INVITE_CODE_ATTEMPTS = 3;

/** multipart/form-data: name, icon? (image ≤ 2 MB). Creates the server, an ADMIN membership and #genel. */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, 'Geçersiz form');

  const name = serverNameSchema.safeParse(form.get('name') ?? '');
  if (!name.success) return invalid(name.error);

  const icon = await readServerIcon(form.get('icon'));
  if (icon.error) return icon.error;

  for (let attempt = 1; ; attempt++) {
    try {
      const server = await db.server.create({
        data: {
          name: name.data,
          iconUrl: icon.url,
          inviteCode: generateInviteCode(),
          ownerId: userId,
          members: { create: { userId, role: 'ADMIN' } },
          channels: { create: { name: 'genel', type: 'TEXT' } },
        },
        include: { channels: { select: { id: true } } },
      });
      return NextResponse.json(
        { id: server.id, firstChannelId: server.channels[0].id },
        { status: 201 },
      );
    } catch (err) {
      // 60-bit codes collide essentially never; retry rather than fail if one does.
      if (isUniqueViolation(err) && attempt < INVITE_CODE_ATTEMPTS) continue;
      await deleteUpload(icon.url);
      console.error('[servers:POST]', err);
      return jsonError(500, 'Sunucu oluşturulamadı');
    }
  }
}
