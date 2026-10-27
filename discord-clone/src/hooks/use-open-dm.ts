'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { apiFetch, errorMessage } from '@/lib/client-api';

/** Opens (creating on first use) the DM conversation with a user and navigates to it. */
export function useOpenDm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (userId: string) => {
      setPending(true);
      setError(null);
      try {
        const { id } = await apiFetch<{ id: string }>('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
        router.push(`/me/${id}`);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { open, pending, error };
}
