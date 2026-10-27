import { PrismaClient } from '@prisma/client';

// Next.js dev mode re-evaluates modules on every hot reload; caching the client
// on globalThis keeps it from opening a new connection pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
