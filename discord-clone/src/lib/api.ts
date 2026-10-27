import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

export const jsonError = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

export const unauthorized = () => jsonError(401, 'Yetkisiz');
export const forbidden = () => jsonError(403, 'Bu işlem için yetkiniz yok');
export const notFound = (what = 'Kayıt') => jsonError(404, `${what} bulunamadı`);

export const invalid = (err: ZodError) =>
  jsonError(400, err.issues[0]?.message ?? 'Geçersiz veri', { issues: err.flatten().fieldErrors });

export const readJson = (req: Request) => req.json().catch(() => null);

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
