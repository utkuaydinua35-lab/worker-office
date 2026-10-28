// Plain module (no 'use client'): server components import these class lists,
// and a constant exported from a client module reaches them as a reference, not a string.

/**
 * A left drawer on phones, slid in while AppShell's `data-panel` is "nav".
 * Callers add their own `left-*` and the matching hidden translate.
 */
export const LEFT_DRAWER =
  'max-md:fixed max-md:inset-y-0 max-md:z-40 max-md:transition-transform max-md:duration-200 max-md:group-data-[panel=nav]/app:translate-x-0';
