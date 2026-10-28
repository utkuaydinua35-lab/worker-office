import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { db } from '@/lib/db';

// Not a valid registration username (space, "ü"), so nobody can sign up as it.
export const BOT_USERNAME = 'Müzik Botu';
const BOT_EMAIL = 'music-bot@bot.invalid';

/** The bot's User row (author of its replies), created on first start. */
export async function ensureBotUser(): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true } });
  if (existing) return existing.id;

  // A password nobody knows; sign-in also refuses isBot accounts outright.
  const password = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const bot = await db.user.create({
    data: { username: BOT_USERNAME, email: BOT_EMAIL, password, isBot: true, status: 'ONLINE' },
    select: { id: true },
  });
  return bot.id;
}
