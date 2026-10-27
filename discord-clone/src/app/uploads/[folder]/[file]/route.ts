import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isUploadFolder, LOCAL_FILENAME, LOCAL_UPLOAD_ROOT } from '@/lib/storage';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

// Serves files saved by lib/storage.ts in local-disk mode.
export async function GET(_req: Request, { params }: { params: { folder: string; file: string } }) {
  const match = LOCAL_FILENAME.exec(params.file);
  if (!isUploadFolder(params.folder) || !match) return new Response('Not found', { status: 404 });

  try {
    const data = await readFile(path.join(LOCAL_UPLOAD_ROOT, params.folder, params.file));
    return new Response(data, {
      headers: {
        'Content-Type': CONTENT_TYPES[match[1]],
        // Every upload gets a fresh name, so a URL's content never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
