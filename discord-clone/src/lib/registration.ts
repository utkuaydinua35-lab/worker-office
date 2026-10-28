import { createHash, timingSafeEqual } from 'node:crypto';

// Set REGISTRATION_CODE to make sign-up invite-only: only people you've told
// the code can create an account. Unset = open registration.
const code = () => process.env.REGISTRATION_CODE?.trim() || null;

export const registrationCodeRequired = () => code() !== null;

const digest = (value: string) => createHash('sha256').update(value).digest();

export function registrationCodeMatches(candidate: string | undefined) {
  const expected = code();
  if (!expected) return true;
  // Hash both sides so the comparison is constant-time whatever the lengths.
  return timingSafeEqual(digest(candidate?.trim() ?? ''), digest(expected));
}
