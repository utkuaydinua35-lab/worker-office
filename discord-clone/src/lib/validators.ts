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
  // Checked against REGISTRATION_CODE when that's set (see lib/registration.ts).
  registrationCode: z.string().max(200).optional(),
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
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

export const IMAGE_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
export const AVATAR_MIME_TYPES = IMAGE_MIME_TYPES;

export const ATTACHMENT_MIME_TYPES = {
  ...IMAGE_MIME_TYPES,
  'application/pdf': 'pdf',
} as const;

// ─── Servers, channels, messages ────────────────────────────────────────

export const CHANNEL_TYPES = ['TEXT', 'VOICE'] as const;
export type ChannelTypeValue = (typeof CHANNEL_TYPES)[number];

export const serverNameSchema = z
  .string()
  .trim()
  .min(1, 'Sunucu adı gerekli')
  .max(100, 'Sunucu adı en fazla 100 karakter olabilir');

// Discord-style channel names: lower case, whitespace collapsed to dashes.
export const channelNameSchema = z
  .string()
  .trim()
  .transform((s) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-'))
  .pipe(
    z
      .string()
      .min(1, 'Kanal adı gerekli')
      .max(100, 'Kanal adı en fazla 100 karakter olabilir')
      .regex(/^[\p{L}\p{N}_-]+$/u, 'Yalnızca harf, rakam, "-" ve "_" kullanılabilir'),
  );

export const createChannelSchema = z.object({
  name: channelNameSchema,
  type: z.enum(CHANNEL_TYPES),
});

export const updateChannelSchema = z.object({ name: channelNameSchema });

export const MESSAGE_MAX_LENGTH = 2000;

export const createMessageSchema = z
  .object({
    content: z.string().trim().max(MESSAGE_MAX_LENGTH, 'Mesaj en fazla 2000 karakter olabilir'),
    fileUrl: z.string().max(500).nullish(),
  })
  .refine((m) => m.content.length > 0 || !!m.fileUrl, { message: 'Mesaj boş olamaz' });

export const updateMessageSchema = z.object({
  content: z.string().trim().max(MESSAGE_MAX_LENGTH, 'Mesaj en fazla 2000 karakter olabilir'),
});
