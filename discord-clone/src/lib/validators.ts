import { z } from 'zod';

export const USER_STATUSES = ['ONLINE', 'IDLE', 'DND', 'OFFLINE'] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

export const usernameSchema = z
  .string()
  .trim()
  .min(2, 'Kullanıcı adı en az 2 karakter olmalı')
  .max(32, 'Kullanıcı adı en fazla 32 karakter olabilir')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Yalnızca harf, rakam, "_" ve "." kullanılabilir');

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalı')
    .max(72, 'Şifre en fazla 72 karakter olabilir'), // bcrypt ignores bytes past 72
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const profileUpdateSchema = z
  .object({
    username: usernameSchema,
    bio: z.string().max(190, 'Biyografi en fazla 190 karakter olabilir').nullable(),
    status: z.enum(USER_STATUSES),
    customStatus: z.string().trim().max(128).nullable(),
  })
  .partial()
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
