import { NextResponse } from 'next/server';

import { jsonError, unauthorized } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';
import { saveUpload, sniffMime } from '@/lib/storage';
import { ATTACHMENT_MAX_BYTES } from '@/lib/validators';

export const runtime = 'nodejs';

/**
 * Message attachments. The returned URL is then sent with the message body;
 * the messages API only accepts URLs this endpoint produced.
 */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return jsonError(400, 'Dosya bulunamadı');
  if (file.size > ATTACHMENT_MAX_BYTES) return jsonError(413, 'Dosya en fazla 8 MB olabilir');

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) return jsonError(415, 'Yalnızca görsel (PNG, JPEG, WEBP, GIF) veya PDF yüklenebilir');

  const url = await saveUpload(buf, mime, 'attachments');
  return NextResponse.json({ url, kind: mime === 'application/pdf' ? 'pdf' : 'image' }, { status: 201 });
}
