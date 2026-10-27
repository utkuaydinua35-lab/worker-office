'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/client-api';

// Accepts a bare code or a full invite link (".../invite/<code>").
function extractInviteCode(input: string) {
  const trimmed = input.trim().replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

export function JoinServerModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = extractInviteCode(value);
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const { serverId } = await apiFetch<{ serverId: string }>(
        `/api/invite/${encodeURIComponent(code)}`,
        { method: 'POST' },
      );
      onOpenChange(false);
      router.push(`/servers/${serverId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bir sunucuya katıl</DialogTitle>
          <DialogDescription>Mevcut bir sunucuya katılmak için davet bağlantısını gir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite">Davet Bağlantısı</Label>
            <Input
              id="invite"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="http://localhost:3000/invite/aBc12dEf34"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Sunucuya Katıl
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
