import type { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { saveUpload, sniffMime } from '@/lib/storage';
import { AVATAR_MAX_BYTES, IMAGE_MIME_TYPES } from '@/lib/validators';

type IconResult = { url: string | null; error?: undefined } | { url?: undefined; error: NextResponse };

/** Validates and stores an optional server-icon form field. No file → `{ url: null }`. */
export async function readServerIcon(value: FormDataEntryValue | null): Promise<IconResult> {
  if (!(value instanceof File) || value.size === 0) return { url: null };
  if (value.size > AVATAR_MAX_BYTES) return { error: jsonError(413, 'Simge en fazla 2 MB olabilir') };

  const buf = Buffer.from(await value.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !(mime in IMAGE_MIME_TYPES)) {
    return { error: jsonError(415, 'Simge PNG, JPEG, WEBP veya GIF olmalı') };
  }
  return { url: await saveUpload(buf, mime, 'icons') };
}
