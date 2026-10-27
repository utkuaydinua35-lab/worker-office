import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

import { getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicProfileSelect } from '@/lib/profile';
import { broadcastPresence, emitUserProfileChanged } from '@/lib/socket/emit';
import { profileUpdateSchema } from '@/lib/validators';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: userId }, select: publicProfileSelect });
  if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz veri', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = { ...parsed.data };
  // An empty string from a cleared input means "remove it".
  if (data.bio === '') data.bio = null;
  if (data.customStatus === '') data.customStatus = null;

  try {
    const user = await db.user.update({
      where: { id: userId },
      data,
      select: publicProfileSelect,
    });
    if (data.status !== undefined) await broadcastPresence(userId);
    // Member lists and profile cards show these; let open server views re-render.
    if (data.username !== undefined || data.bio !== undefined || data.customStatus !== undefined) {
      await emitUserProfileChanged(userId);
    }
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Bu kullanıcı adı alınmış', field: 'username' },
        { status: 409 },
      );
    }
    console.error('[profile:PATCH]', err);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
}
