import { NextResponse } from 'next/server';

import { jsonError, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicProfileSelect } from '@/lib/profile';
import { emitUserProfileChanged } from '@/lib/socket/emit';
import { deleteUpload, saveUpload, sniffMime } from '@/lib/storage';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/validators';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return jsonError(400, 'Dosya bulunamadı');
  if (file.size > AVATAR_MAX_BYTES) return jsonError(413, 'Dosya en fazla 2 MB olabilir');

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !(mime in AVATAR_MIME_TYPES)) {
    return jsonError(415, 'Yalnızca PNG, JPEG, WEBP veya GIF yüklenebilir');
  }

  let url: string;
  try {
    url = await saveUpload(buf, mime, 'avatars');
  } catch (err) {
    console.error('[avatar] save failed', err);
    return jsonError(500, 'Dosya kaydedilemedi');
  }
  const previous = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await db.user.update({
    where: { id: userId },
    data: { avatarUrl: url },
    select: publicProfileSelect,
  });
  await deleteUpload(previous?.avatarUrl);
  await emitUserProfileChanged(userId);

  return NextResponse.json(user);
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const previous = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await db.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
    select: publicProfileSelect,
  });
  await deleteUpload(previous?.avatarUrl);
  await emitUserProfileChanged(userId);

  return NextResponse.json(user);
}
