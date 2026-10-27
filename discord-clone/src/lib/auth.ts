import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { db } from '@/lib/db';
import { loginSchema } from '@/lib/validators';

export const authOptions: NextAuthOptions = {
  // Credentials sign-in requires JWT sessions (NextAuth cannot persist a
  // database session for it), so the profile fields ride in the token.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.avatarUrl = user.avatarUrl;
      }
      // The client calls useSession().update() after a profile change; re-read
      // from the DB rather than trusting whatever the client sent.
      if (trigger === 'update' && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id },
          select: { username: true, avatarUrl: true },
        });
        if (fresh) {
          token.username = fresh.username;
          token.avatarUrl = fresh.avatarUrl;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.avatarUrl = token.avatarUrl;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      // Only flip OFFLINE → ONLINE; a user who chose IDLE or DND keeps it.
      await db.user.updateMany({
        where: { id: user.id, status: 'OFFLINE' },
        data: { status: 'ONLINE' },
      });
    },
    async signOut({ token }) {
      if (token?.id) {
        await db.user.update({ where: { id: token.id }, data: { status: 'OFFLINE' } });
      }
    },
  },
};

export const getSession = () => getServerSession(authOptions);

/** The signed-in user's id, or null. Use in Route Handlers and Server Components. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}
