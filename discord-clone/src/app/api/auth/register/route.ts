import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { registrationCodeMatches } from '@/lib/registration';
import { registerSchema } from '@/lib/validators';

const BCRYPT_ROUNDS = 12;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz veri', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { username, email, password, registrationCode } = parsed.data;
  if (!registrationCodeMatches(registrationCode)) {
    return NextResponse.json(
      { error: 'Kayıt kodu hatalı', field: 'registrationCode' },
      { status: 403 },
    );
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await db.user.create({
      data: { username, email, password: passwordHash },
      select: { id: true, username: true, email: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    // Rely on the unique constraints instead of a racy findFirst pre-check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = (err.meta?.target as string[] | undefined)?.[0];
      const message =
        field === 'username' ? 'Bu kullanıcı adı alınmış' : 'Bu e-posta zaten kayıtlı';
      return NextResponse.json({ error: message, field }, { status: 409 });
    }
    console.error('[register]', err);
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
}
