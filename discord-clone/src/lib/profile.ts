import type { Prisma } from '@prisma/client';

// Never select the password hash into a response.
export const publicProfileSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  bio: true,
  status: true,
  customStatus: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type PublicProfileRow = Prisma.UserGetPayload<{ select: typeof publicProfileSelect }>;

/** The profile as it crosses the wire (JSON turns Date into an ISO string). */
export type PublicProfile = Omit<PublicProfileRow, 'createdAt'> & { createdAt: string };

export function toPublicProfile(row: PublicProfileRow): PublicProfile {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
