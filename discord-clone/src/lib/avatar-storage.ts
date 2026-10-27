import path from 'node:path';

// Local-disk storage keeps stage 1 self-contained. Files live outside public/
// because `next start` only serves public/ files that existed at build time;
// src/app/uploads/avatars/[file]/route.ts serves them instead. Stage 2 swaps
// this for Uploadthing/Cloudinary.
export const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
export const AVATAR_URL_PREFIX = '/uploads/avatars/';

// Names are always `<uuid>-<uuid>.<ext>` (chosen by the upload handler), so a
// strict pattern rules out path traversal on the read side.
export const AVATAR_FILENAME = /^[0-9a-f-]{73}\.(png|jpg|webp|gif)$/;
