'use client';

import { useRouter } from 'next/navigation';

/** "Geri dön": back to wherever you came from (a channel, a DM), or home on a fresh tab. */
export function BackLink({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
    >
      Geri dön
    </button>
  );
}
