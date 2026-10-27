import { randomBytes } from 'node:crypto';

/** 10 url-safe characters (60 bits) — unguessable, short enough to share. */
export function generateInviteCode() {
  return randomBytes(8).toString('base64url').slice(0, 10);
}
