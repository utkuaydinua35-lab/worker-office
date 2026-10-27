'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiFetch, errorMessage } from '@/lib/client-api';

export function JoinInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const { serverId } = await apiFetch<{ serverId: string }>(
        `/api/invite/${encodeURIComponent(code)}`,
        { method: 'POST' },
      );
      router.push(`/servers/${serverId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Button className="w-full" onClick={() => void join()} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Davete Katıl
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
