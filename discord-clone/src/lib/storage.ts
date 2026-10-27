import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ATTACHMENT_MIME_TYPES } from '@/lib/validators';

/**
 * File storage for avatars, server icons and message attachments.
 *
 * With CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET set,
 * files go to Cloudinary. Otherwise they land on local disk under uploads/
 * (outside public/, because `next start` only serves public/ files that
 * existed at build time) and src/app/uploads/[folder]/[file]/route.ts serves
 * them. Local disk does not survive a redeploy on serverless hosts.
 */

export const UPLOAD_FOLDERS = ['avatars', 'icons', 'attachments'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export type FileMime = keyof typeof ATTACHMENT_MIME_TYPES;

export const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const LOCAL_URL_PREFIX = '/uploads/';
const CLOUDINARY_FOLDER_ROOT = 'discord-clone';

// Names are server-chosen: `<uuid>.<ext>` (stage 1 avatars were
// `<userId>-<uuid>.<ext>`). A strict pattern rules out path traversal.
export const LOCAL_FILENAME = /^[0-9a-f-]{36}(?:-[0-9a-f-]{36})?\.(png|jpg|webp|gif|pdf)$/;

export function isUploadFolder(value: string): value is UploadFolder {
  return (UPLOAD_FOLDERS as readonly string[]).includes(value);
}

/** The browser-supplied MIME type is only a claim; trust the magic bytes. */
export function sniffMime(buf: Buffer): FileMime | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('ascii');
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

// https://cloudinary.com/documentation/authentication_signatures
function cloudinarySignature(params: Record<string, string>, apiSecret: string) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');
}

/** Stores the file and returns the URL to save in the database. */
export async function saveUpload(buf: Buffer, mime: FileMime, folder: UploadFolder): Promise<string> {
  const id = randomUUID();
  const ext = ATTACHMENT_MIME_TYPES[mime];
  const cfg = cloudinaryConfig();

  if (cfg) {
    const params = {
      public_id: `${CLOUDINARY_FOLDER_ROOT}/${folder}/${id}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }));
    form.append('api_key', cfg.apiKey);
    form.append('signature', cloudinarySignature(params, cfg.apiSecret));
    for (const [k, v] of Object.entries(params)) form.append(k, v);

    // PDFs upload as "image" too, so the delivery URL renders them inline.
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as { secure_url?: string; error?: { message: string } };
    if (!res.ok || !json.secure_url) {
      throw new Error(`Cloudinary upload failed: ${json.error?.message ?? res.status}`);
    }
    return json.secure_url;
  }

  const filename = `${id}.${ext}`;
  const dir = path.join(LOCAL_UPLOAD_ROOT, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return `${LOCAL_URL_PREFIX}${folder}/${filename}`;
}

function cloudinaryPublicId(url: string, cloudName: string, folder: UploadFolder) {
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(prefix)) return null;
  // .../image/upload/v1712345678/discord-clone/<folder>/<uuid>.<ext>
  const match = new RegExp(
    `^(?:v\\d+/)?(${CLOUDINARY_FOLDER_ROOT}/${folder}/[0-9a-f-]{36})\\.[a-z]+$`,
  ).exec(url.slice(prefix.length));
  return match?.[1] ?? null;
}

/**
 * True when `url` is one saveUpload produced for `folder`. Message bodies
 * accept a client-supplied fileUrl, so this keeps arbitrary links (tracking
 * pixels, javascript: URLs) out of the database.
 */
export function isOwnUploadUrl(url: string, folder: UploadFolder): boolean {
  const localPrefix = `${LOCAL_URL_PREFIX}${folder}/`;
  if (url.startsWith(localPrefix)) return LOCAL_FILENAME.test(url.slice(localPrefix.length));
  const cfg = cloudinaryConfig();
  return !!cfg && cloudinaryPublicId(url, cfg.cloudName, folder) !== null;
}

/** Best-effort removal; a missing file is not an error. */
export async function deleteUpload(url: string | null | undefined): Promise<void> {
  if (!url) return;
  for (const folder of UPLOAD_FOLDERS) {
    const localPrefix = `${LOCAL_URL_PREFIX}${folder}/`;
    if (url.startsWith(localPrefix)) {
      const filename = url.slice(localPrefix.length);
      if (LOCAL_FILENAME.test(filename)) {
        await unlink(path.join(LOCAL_UPLOAD_ROOT, folder, filename)).catch(() => {});
      }
      return;
    }

    const cfg = cloudinaryConfig();
    const publicId = cfg && cloudinaryPublicId(url, cfg.cloudName, folder);
    if (cfg && publicId) {
      const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
      const form = new FormData();
      form.append('api_key', cfg.apiKey);
      form.append('signature', cloudinarySignature(params, cfg.apiSecret));
      for (const [k, v] of Object.entries(params)) form.append(k, v);
      await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
        method: 'POST',
        body: form,
      }).catch((err) => console.warn('[storage] Cloudinary delete failed', err));
      return;
    }
  }
}
