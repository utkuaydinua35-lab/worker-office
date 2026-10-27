import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { getCurrentUserId } from '@/lib/auth';
import { AVATAR_DIR, AVATAR_URL_PREFIX } from '@/lib/avatar-storage';
import { db } from '@/lib/db';
import { publicProfileSelect } from '@/lib/profile';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/validators';

export const runtime = 'nodejs';

type AvatarMime = keyof typeof AVATAR_MIME_TYPES;

// The browser-supplied MIME type is just a claim; check the file's magic bytes.
function sniffMime(buf: Buffer): AvatarMime | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')
    return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  return null;
}

async function removeOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl?.startsWith(AVATAR_URL_PREFIX)) return;
  const file = path.join(AVATAR_DIR, path.basename(avatarUrl));
  await unlink(file).catch(() => {});
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: 'Dosya en fazla 2 MB olabilir' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) {
    return NextResponse.json(
      { error: 'Yalnızca PNG, JPEG, WEBP veya GIF yüklenebilir' },
      { status: 415 },
    );
  }

  // Server-chosen name: nothing from the client reaches the filesystem path.
  const filename = `${userId}-${randomUUID()}.${AVATAR_MIME_TYPES[mime]}`;
  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, filename), buf);

  const previous = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await db.user.update({
    where: { id: userId },
    data: { avatarUrl: AVATAR_URL_PREFIX + filename },
    select: publicProfileSelect,
  });
  await removeOldAvatar(previous?.avatarUrl ?? null);

  return NextResponse.json(user);
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const previous = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await db.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
    select: publicProfileSelect,
  });
  await removeOldAvatar(previous?.avatarUrl ?? null);

  return NextResponse.json(user);
}
